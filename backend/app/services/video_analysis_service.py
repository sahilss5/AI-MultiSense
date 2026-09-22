import os
import asyncio
import json
import logging
from typing import List, Set, Optional, Dict, Any
from datetime import datetime, timezone
import cv2
from fastapi import WebSocket
from sqlmodel import Session, select
from backend.app.schemas.domain import VideoStatusType, AnalysisModeType, ZoneResponse
from backend.app.core.config import settings
from backend.app.core.database import engine
from backend.app.models.db_models import VideoRecordModel, SettingsModel, ZoneModel, SessionSummaryModel
from backend.app.schemas.canonical import ThermalDetectionObject
from ai.detection.mock_detection import MockDetectionService
from ai.tracking.mock_tracking import MockTrackingService
from ai.threat.threat_engine import ThreatEngine
from ai.detection.yolo_detection import YOLODetectionService
from backend.app.services.alert_service import AlertService

logger = logging.getLogger("analysis_service")


class VideoAnalysisManager:
    def __init__(self):
        self.active_video_id: Optional[str] = None
        self.video_status: VideoStatusType = "no_video_selected"
        self.session_start_time: Optional[str] = None
        self.active_task: Optional[asyncio.Task] = None
        self.active_websockets: Set[WebSocket] = set()

        # Shared pipeline components
        self.threat_engine = ThreatEngine()
        self.mock_detection_service = MockDetectionService()
        self.mock_tracking_service = MockTrackingService()

        # Real YOLO + ByteTrack detection service (loaded once when model file exists)
        self.real_detection_service: Optional[YOLODetectionService] = None
        if os.path.exists(settings.THERMAL_MODEL_PATH):
            try:
                self.real_detection_service = YOLODetectionService(settings.THERMAL_MODEL_PATH)
                logger.info(f"YOLODetectionService loaded successfully from: {settings.THERMAL_MODEL_PATH}")
            except Exception as e:
                logger.error(f"Failed to load real YOLO model from {settings.THERMAL_MODEL_PATH}: {e}")
                self.real_detection_service = None

        # Real ByteTrack track position history, confidences, detection counts, and directions
        self.track_positions: Dict[int, List[Dict[str, Any]]] = {}
        self.track_directions: Dict[int, str] = {}
        self.track_start_times: Dict[int, float] = {}
        self.track_confidences: Dict[int, List[float]] = {}
        self.track_detection_counts: Dict[int, int] = {}

        # In-memory session threat records and track directory for the active video
        self.session_threats: Dict[int, Dict[str, Any]] = {}
        self.session_tracks: Dict[int, Dict[str, Any]] = {}

        # Universal Session Statistics
        self.class_detection_counts: Dict[str, int] = {
            "Person": 0, "Vehicle": 0, "Animal": 0, "Drone": 0, "Person_With_Bag": 0
        }
        self.first_detection_time: Optional[str] = None
        self.last_detection_time: Optional[str] = None
        self.video_duration: float = 0.0
        self.video_fps: float = 30.0
        self.total_video_frames: int = 0

        # In-memory frame ring buffer & statistics
        self.latest_frame: List[ThermalDetectionObject] = []
        self.frame_history: List[List[ThermalDetectionObject]] = []
        self.max_history: int = 100
        self.total_detections_count: int = 0
        self.processed_frames_count: int = 0
        self.current_fps: float = 0.0

    def get_analysis_mode(self) -> AnalysisModeType:
        """
        Dynamically checks whether real trained model exists at THERMAL_MODEL_PATH.
        """
        if os.path.exists(settings.THERMAL_MODEL_PATH) and self.real_detection_service is not None:
            return "AI Inference Active"
        return "Demo Mode"

    def register_websocket(self, websocket: WebSocket):
        self.active_websockets.add(websocket)

    def unregister_websocket(self, websocket: WebSocket):
        self.active_websockets.discard(websocket)

    async def broadcast_frame(self, frame: List[ThermalDetectionObject]):
        if not self.active_websockets:
            return

        # Serialize list of Pydantic models to dict/JSON
        payload = [obj.model_dump(by_alias=True) for obj in frame]
        json_data = json.dumps(payload)

        dead_sockets = set()
        for ws in self.active_websockets:
            try:
                await ws.send_text(json_data)
            except Exception:
                dead_sockets.add(ws)

        for ws in dead_sockets:
            self.active_websockets.discard(ws)

    def set_video_ready(self, video_id: str):
        self.active_video_id = video_id
        self.video_status = "ready"

    async def start_analysis(self, video_id: str) -> VideoStatusType:
        if self.active_task and not self.active_task.done():
            self.active_task.cancel()
            try:
                await self.active_task
            except asyncio.CancelledError:
                pass

        self.session_threats.clear()
        self.session_tracks.clear()
        self.track_positions.clear()
        self.track_directions.clear()
        self.track_start_times.clear()
        self.track_confidences.clear()
        self.track_detection_counts.clear()
        self.class_detection_counts = {
            "Person": 0, "Vehicle": 0, "Animal": 0, "Drone": 0, "Person_With_Bag": 0
        }
        self.total_detections_count = 0
        self.processed_frames_count = 0
        self.first_detection_time = None
        self.last_detection_time = None
        self.video_duration = 0.0
        AlertService.reset_dedup()

        self.active_video_id = video_id
        self.video_status = "processing"
        self.session_start_time = datetime.now(timezone.utc).isoformat()

        # Update DB record status
        with Session(engine) as session:
            record = session.get(VideoRecordModel, video_id)
            if record:
                record.status = "processing"
                session.add(record)
                session.commit()

        # Launch processing task
        self.active_task = asyncio.create_task(self._run_analysis_loop(video_id))
        return self.video_status

    async def pause_analysis(self, video_id: str) -> VideoStatusType:
        self.active_video_id = video_id
        self.video_status = "paused"
        with Session(engine) as session:
            record = session.get(VideoRecordModel, video_id)
            if record:
                record.status = "paused"
                session.add(record)
                session.commit()
        return self.video_status

    async def resume_analysis(self, video_id: str) -> VideoStatusType:
        self.active_video_id = video_id
        self.video_status = "processing"
        with Session(engine) as session:
            record = session.get(VideoRecordModel, video_id)
            if record:
                record.status = "processing"
                session.add(record)
                session.commit()
        return self.video_status

    async def stop_analysis(self, video_id: str) -> VideoStatusType:
        if self.active_task and not self.active_task.done():
            self.active_task.cancel()
            try:
                await self.active_task
            except asyncio.CancelledError:
                pass

        self.active_video_id = video_id
        self.video_status = "stopped"
        self.current_fps = 0.0
        self.latest_frame = []
        await self.broadcast_frame([])

        with Session(engine) as session:
            record = session.get(VideoRecordModel, video_id)
            if record:
                record.status = "stopped"
                session.add(record)
                session.commit()

        return self.video_status

    async def clear_active_video(self, video_id: Optional[str] = None) -> VideoStatusType:
        if self.active_task and not self.active_task.done():
            self.active_task.cancel()
            try:
                await self.active_task
            except asyncio.CancelledError:
                pass

        self.active_video_id = None
        self.video_status = "no_video_selected"
        self.session_start_time = None
        self.current_fps = 0.0
        self.latest_frame = []
        self.total_detections_count = 0
        self.session_threats.clear()
        self.session_tracks.clear()
        self.track_positions.clear()
        self.track_directions.clear()
        self.track_start_times.clear()

        # Broadcast empty frame to clear frontend overlays immediately
        await self.broadcast_frame([])
        return self.video_status

    async def _run_analysis_loop(self, video_id: str):
        """
        Processes video frames. Uses OpenCV + real YOLODetectionService + ByteTrack
        when a real video file and model are available, otherwise falls back to Demo Mode.
        """
        video_path = None
        with Session(engine) as session:
            record = session.get(VideoRecordModel, video_id)
            if record and record.filepath:
                video_path = record.filepath

        # Route to Real Video Pipeline if video exists and real model is loaded
        if video_path and os.path.exists(video_path) and self.real_detection_service is not None:
            await self._run_real_video_loop(video_id, video_path)
        else:
            await self._run_mock_simulation_loop(video_id)

    async def _run_real_video_loop(self, video_id: str, video_path: str):
        """
        Real OpenCV VideoCapture + YOLODetectionService (with ByteTrack) + ThreatEngine.
        """
        logger.info(f"Starting real video analysis on: {video_path} (video_id={video_id})")
        detector = self.real_detection_service
        if detector is None:
            logger.error(f"Real detection service is not initialized for {video_path}")
            self.video_status = "error"
            with Session(engine) as session:
                rec = session.get(VideoRecordModel, video_id)
                if rec:
                    rec.status = "error"
                    session.add(rec)
                    session.commit()
            return

        cap = cv2.VideoCapture(video_path)

        if not cap.isOpened():
            logger.error(f"OpenCV failed to open video file: {video_path}")
            self.video_status = "error"
            with Session(engine) as session:
                rec = session.get(VideoRecordModel, video_id)
                if rec:
                    rec.status = "error"
                    session.add(rec)
                    session.commit()
            return

        # Query video FPS and frame count for real duration and pacing
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0 or fps > 120 or not fps:
            fps = 30.0
        frame_delay = 1.0 / fps
        self.current_fps = fps
        total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        self.total_video_frames = total_video_frames
        self.video_fps = fps
        self.video_duration = round(total_video_frames / fps, 2) if (total_video_frames > 0 and fps > 0) else 0.0

        # Reset ByteTrack tracker state for fresh video tracking
        detector.reset_tracker()
        self.track_positions.clear()
        self.track_directions.clear()
        self.track_start_times.clear()
        self.track_confidences.clear()
        self.track_detection_counts.clear()
        self.class_detection_counts = {
            "Person": 0, "Vehicle": 0, "Animal": 0, "Drone": 0, "Person_With_Bag": 0
        }

        frame_index = 0
        try:
            while self.video_status in ("processing", "paused"):
                if self.video_status == "paused":
                    await asyncio.sleep(0.05)
                    continue

                loop_start = asyncio.get_event_loop().time()

                # Read frame using OpenCV
                ret, frame = cap.read()
                if not ret or frame is None:
                    logger.info(f"End of video stream reached for {video_id}")
                    break

                frame_index += 1
                self.processed_frames_count += 1
                timestamp = datetime.now(timezone.utc).isoformat()

                # Fetch active zones & settings from DB for rule evaluation
                with Session(engine) as session:
                    db_settings = session.get(SettingsModel, 1)
                    speed_limit = db_settings.speed_threshold_kmh if db_settings else 80.0

                    db_zones = session.exec(select(ZoneModel)).all()
                    active_zones = [
                        ZoneResponse(
                            id=z.id,
                            name=z.name,
                            polygon=z.polygon,
                            enabled=z.enabled
                        )
                        for z in db_zones if z.enabled
                    ]

                    # Real YOLO Detection + ByteTrack tracking
                    raw_dets = detector.detect_frame(
                        frame_input=frame,
                        timestamp=timestamp,
                        persist=True
                    )

                    # Calculate real image-based center, direction, and track duration
                    for obj in raw_dets:
                        tid = obj.track_id
                        if tid is not None and tid > 0:
                            cx = round((obj.bbox[0] + obj.bbox[2]) / 2.0, 4)
                            cy = round((obj.bbox[1] + obj.bbox[3]) / 2.0, 4)

                            if tid not in self.track_positions:
                                self.track_positions[tid] = []
                                self.track_start_times[tid] = loop_start
                                self.track_confidences[tid] = []
                                self.track_detection_counts[tid] = 0
                                direction = "STATIONARY"
                            else:
                                prev = self.track_positions[tid][-1]
                                dx = cx - prev["cx"]
                                dy = cy - prev["cy"]
                                threshold = 0.004
                                if abs(dx) < threshold and abs(dy) < threshold:
                                    direction = self.track_directions.get(tid, "STATIONARY")
                                else:
                                    h_dir = "RIGHT" if dx > threshold else ("LEFT" if dx < -threshold else "")
                                    v_dir = "DOWN" if dy > threshold else ("UP" if dy < -threshold else "")
                                    if h_dir and v_dir:
                                        direction = f"MOVING {v_dir}-{h_dir}"
                                    elif h_dir:
                                        direction = f"MOVING {h_dir}"
                                    elif v_dir:
                                        direction = f"MOVING {v_dir}"
                                    else:
                                        direction = "STATIONARY"

                            self.track_directions[tid] = direction
                            self.track_positions[tid].append({
                                "cx": cx,
                                "cy": cy,
                                "timestamp": timestamp,
                                "frame": frame_index
                            })
                            if len(self.track_positions[tid]) > 100:
                                self.track_positions[tid].pop(0)

                            self.track_confidences[tid].append(float(obj.confidence))
                            self.track_detection_counts[tid] += 1

                            obj.direction = direction
                            first_t = self.track_start_times.get(tid, loop_start)
                            obj.duration_seconds = max(1, int(loop_start - first_t))
                            obj.trajectory = [[p["cx"], p["cy"]] for p in self.track_positions[tid]]

                    # Pass real detections through Threat Engine
                    evaluated_objs = self.threat_engine.evaluate(
                        objects=raw_dets,
                        zones=active_zones,
                        speed_threshold_kmh=speed_limit
                    )

                    # Update timestamps & class detection counts
                    if evaluated_objs:
                        if self.first_detection_time is None:
                            self.first_detection_time = timestamp
                        self.last_detection_time = timestamp

                    # Persist threats to SQLite and track in memory
                    for obj in evaluated_objs:
                        cls_name = obj.class_name
                        self.class_detection_counts[cls_name] = self.class_detection_counts.get(cls_name, 0) + 1

                        tid = obj.track_id
                        if tid is not None and tid > 0:
                            pos_list = self.track_positions.get(tid, [])
                            traj = obj.trajectory or [[p["cx"], p["cy"]] for p in pos_list]
                            last_pos = {"x": pos_list[-1]["cx"], "y": pos_list[-1]["cy"]} if pos_list else (
                                {"x": round((obj.bbox[0] + obj.bbox[2]) / 2.0, 4), "y": round((obj.bbox[1] + obj.bbox[3]) / 2.0, 4)} if obj.bbox else None
                            )
                            confs = self.track_confidences.get(tid, [float(obj.confidence)])
                            avg_conf = round(sum(confs) / max(1, len(confs)), 4)
                            min_conf = round(min(confs), 4)
                            max_conf = round(max(confs), 4)
                            det_count = self.track_detection_counts.get(tid, len(pos_list))
                            first_seen_time = pos_list[0].get("timestamp", timestamp) if pos_list else timestamp
                            last_seen_time = pos_list[-1].get("timestamp", timestamp) if pos_list else timestamp

                            track_info = {
                                "track_id": tid,
                                "class": obj.class_name,
                                "class_name": obj.class_name,
                                "class_id": getattr(obj, "class_id", None),
                                "confidence": round(float(obj.confidence), 4),
                                "average_confidence": avg_conf,
                                "minimum_confidence": min_conf,
                                "maximum_confidence": max_conf,
                                "detection_count": det_count,
                                "bbox": obj.bbox,
                                "speed": obj.speed,
                                "direction": obj.direction or "STATIONARY",
                                "zone": obj.zone,
                                "threat": obj.threat,
                                "threat_level": obj.threat_level,
                                "threat_reason": obj.threat_reason,
                                "duration_seconds": obj.duration_seconds,
                                "first_seen": first_seen_time,
                                "last_seen": last_seen_time,
                                "timestamp": obj.timestamp,
                                "trajectory": traj,
                                "points": [{"x": p["cx"], "y": p["cy"], "timestamp": p.get("timestamp", obj.timestamp)} for p in pos_list],
                                "movement_points": [{"x": p["cx"], "y": p["cy"], "timestamp": p.get("timestamp", obj.timestamp)} for p in pos_list],
                                "last_position": last_pos,
                                "session_id": video_id,
                                "video_id": video_id,
                            }
                            self.session_tracks[tid] = track_info
                            if obj.threat:
                                self.session_threats[tid] = track_info

                        if obj.threat:
                            AlertService.record_threat(session, obj, video_id=video_id)

                # Store in ring buffer & update metrics
                self.latest_frame = evaluated_objs
                self.frame_history.append(evaluated_objs)
                if len(self.frame_history) > self.max_history:
                    self.frame_history.pop(0)
                self.total_detections_count += len(evaluated_objs)

                # Broadcast real detections to all connected WebSockets (/ws/live)
                await self.broadcast_frame(evaluated_objs)

                # Maintain realistic playback pace matching video FPS without blocking event loop
                elapsed = asyncio.get_event_loop().time() - loop_start
                sleep_time = max(0.001, frame_delay - elapsed)
                await asyncio.sleep(sleep_time)

                # Track actual processing/playback FPS
                total_loop_time = asyncio.get_event_loop().time() - loop_start
                self.current_fps = round(1.0 / max(0.001, total_loop_time), 1)

            # Mark completed if video finished naturally
            if self.video_status == "processing":
                self.video_status = "completed"
                self.current_fps = 0.0
                self.latest_frame = []

                # Finalize all tracks and threat trajectories with complete recorded points
                for tid, track_data in self.session_tracks.items():
                    pos_list = self.track_positions.get(tid, [])
                    if pos_list:
                        track_data["trajectory"] = [[p["cx"], p["cy"]] for p in pos_list]
                        pts = [{"x": p["cx"], "y": p["cy"], "timestamp": p.get("timestamp", "")} for p in pos_list]
                        track_data["points"] = pts
                        track_data["movement_points"] = pts
                        track_data["last_position"] = {"x": pos_list[-1]["cx"], "y": pos_list[-1]["cy"]}
                    if tid in self.track_directions:
                        track_data["direction"] = self.track_directions[tid]
                    confs = self.track_confidences.get(tid, [track_data.get("confidence", 0.9)])
                    track_data["average_confidence"] = round(sum(confs) / max(1, len(confs)), 4)
                    track_data["minimum_confidence"] = round(min(confs), 4)
                    track_data["maximum_confidence"] = round(max(confs), 4)
                    track_data["detection_count"] = self.track_detection_counts.get(tid, len(pos_list) if pos_list else 1)

                for tid, threat_data in self.session_threats.items():
                    if tid in self.session_tracks:
                        threat_data.update(self.session_tracks[tid])

                await self.broadcast_frame([])

                # Calculate class counts (unique tracks per class)
                class_counts = {
                    "Person": 0, "Vehicle": 0, "Animal": 0, "Drone": 0, "Person With Bag": 0, "Person_With_Bag": 0
                }
                for trk in self.session_tracks.values():
                    c_name = trk.get("class_name") or trk.get("class") or "Person"
                    if "BAG" in c_name.upper():
                        class_counts["Person With Bag"] += 1
                        class_counts["Person_With_Bag"] += 1
                    elif "DRONE" in c_name.upper():
                        class_counts["Drone"] += 1
                    elif "VEHICLE" in c_name.upper():
                        class_counts["Vehicle"] += 1
                    elif "ANIMAL" in c_name.upper():
                        class_counts["Animal"] += 1
                    else:
                        class_counts["Person"] += 1

                unique_tracks_count = len(self.session_tracks)
                threat_count = len(self.session_threats)
                high_threat_count = sum(1 for t in self.session_threats.values() if (t.get("threat_level") or "HIGH") in ("HIGH", "CRITICAL"))

                all_confs = [c for clist in self.track_confidences.values() for c in clist]
                avg_confidence = round(sum(all_confs) / max(1, len(all_confs)), 4) if all_confs else 0.0
                actual_duration = round(frame_index / fps, 2) if fps > 0 else self.video_duration

                with Session(engine) as session:
                    rec = session.get(VideoRecordModel, video_id)
                    if rec:
                        rec.status = "completed"
                        session.add(rec)

                    # Persist or update SessionSummaryModel in SQLite
                    ses_id = f"ses_{video_id}"
                    summary_rec = session.get(SessionSummaryModel, ses_id)
                    if not summary_rec:
                        summary_rec = SessionSummaryModel(
                            id=ses_id,
                            video_id=video_id,
                            session_id=video_id,
                            filename=rec.filename if rec else video_id,
                            status="completed",
                            total_frames=frame_index,
                            total_detections=self.total_detections_count,
                            unique_tracks=unique_tracks_count,
                            threat_count=threat_count,
                            high_threat_count=high_threat_count,
                            average_confidence=avg_confidence,
                            video_duration=actual_duration,
                            first_detection_time=self.first_detection_time,
                            last_detection_time=self.last_detection_time,
                            class_counts_json=json.dumps(class_counts),
                            class_detection_counts_json=json.dumps(self.class_detection_counts),
                            tracks_json=json.dumps(list(self.session_tracks.values())),
                            created_at=datetime.now(timezone.utc).isoformat(),
                            updated_at=datetime.now(timezone.utc).isoformat(),
                        )
                    else:
                        summary_rec.status = "completed"
                        summary_rec.total_frames = frame_index
                        summary_rec.total_detections = self.total_detections_count
                        summary_rec.unique_tracks = unique_tracks_count
                        summary_rec.threat_count = threat_count
                        summary_rec.high_threat_count = high_threat_count
                        summary_rec.average_confidence = avg_confidence
                        summary_rec.video_duration = actual_duration
                        summary_rec.first_detection_time = self.first_detection_time
                        summary_rec.last_detection_time = self.last_detection_time
                        summary_rec.class_counts_json = json.dumps(class_counts)
                        summary_rec.class_detection_counts_json = json.dumps(self.class_detection_counts)
                        summary_rec.tracks_json = json.dumps(list(self.session_tracks.values()))
                        summary_rec.updated_at = datetime.now(timezone.utc).isoformat()

                    session.add(summary_rec)
                    session.commit()
                logger.info(f"Real video analysis completed successfully for {video_id} ({frame_index} frames processed, {self.total_detections_count} detections, {unique_tracks_count} unique tracks)")

        except asyncio.CancelledError:
            logger.info(f"Video analysis cancelled (STOP) for {video_id}")
            self.video_status = "stopped"
            self.current_fps = 0.0
            with Session(engine) as session:
                rec = session.get(VideoRecordModel, video_id)
                if rec:
                    rec.status = "stopped"
                    session.add(rec)
                    session.commit()
            raise

        except Exception as e:
            logger.error(f"Error in real video analysis loop: {e}", exc_info=True)
            self.video_status = "error"
            self.current_fps = 0.0
            with Session(engine) as session:
                rec = session.get(VideoRecordModel, video_id)
                if rec:
                    rec.status = "error"
                    session.add(rec)
                    session.commit()

        finally:
            if cap is not None and cap.isOpened():
                cap.release()
                logger.info(f"Released cv2.VideoCapture for {video_path}")

    async def _run_mock_simulation_loop(self, video_id: str):
        """
        Preserved Demo Mode fallback loop for simulation when model or video file is absent.
        """
        logger.info(f"Starting Demo Mode simulation loop (video_id={video_id})")
        try:
            tick_count = 0
            max_ticks = 300

            while tick_count < max_ticks and self.video_status == "processing":
                timestamp = datetime.now(timezone.utc).isoformat()

                with Session(engine) as session:
                    db_settings = session.get(SettingsModel, 1)
                    speed_limit = db_settings.speed_threshold_kmh if db_settings else 80.0

                    db_zones = session.exec(select(ZoneModel)).all()
                    active_zones = [
                        ZoneResponse(
                            id=z.id,
                            name=z.name,
                            polygon=z.polygon,
                            enabled=z.enabled
                        )
                        for z in db_zones if z.enabled
                    ]

                    raw_dets = self.mock_detection_service.detect_frame(timestamp=timestamp)
                    tracked_objs = self.mock_tracking_service.update_tracks(raw_dets)
                    evaluated_objs = self.threat_engine.evaluate(
                        objects=tracked_objs,
                        zones=active_zones,
                        speed_threshold_kmh=speed_limit
                    )

                    if evaluated_objs:
                        if self.first_detection_time is None:
                            self.first_detection_time = timestamp
                        self.last_detection_time = timestamp

                    for obj in evaluated_objs:
                        cls_name = obj.class_name
                        self.class_detection_counts[cls_name] = self.class_detection_counts.get(cls_name, 0) + 1

                        tid = obj.track_id
                        traj = obj.trajectory or []
                        pts = [{"x": p[0], "y": p[1], "timestamp": obj.timestamp} for p in traj] if traj else []
                        last_pos = (
                            {"x": traj[-1][0], "y": traj[-1][1]}
                            if traj
                            else (
                                {"x": round((obj.bbox[0] + obj.bbox[2]) / 2.0, 4), "y": round((obj.bbox[1] + obj.bbox[3]) / 2.0, 4)}
                                if obj.bbox
                                else None
                            )
                        )
                        conf = round(float(obj.confidence), 4)

                        if tid is not None and tid > 0:
                            if tid not in self.track_confidences:
                                self.track_confidences[tid] = []
                            self.track_confidences[tid].append(conf)
                            self.track_detection_counts[tid] = self.track_detection_counts.get(tid, 0) + 1
                            if traj:
                                self.track_positions[tid] = [{"cx": p[0], "cy": p[1], "timestamp": obj.timestamp} for p in traj]
                            if obj.direction:
                                self.track_directions[tid] = obj.direction

                            confs = self.track_confidences[tid]
                            track_info = {
                                "track_id": tid,
                                "class": obj.class_name,
                                "class_name": obj.class_name,
                                "class_id": getattr(obj, "class_id", None),
                                "confidence": conf,
                                "average_confidence": round(sum(confs) / max(1, len(confs)), 4),
                                "minimum_confidence": round(min(confs), 4),
                                "maximum_confidence": round(max(confs), 4),
                                "detection_count": self.track_detection_counts[tid],
                                "bbox": obj.bbox,
                                "speed": obj.speed,
                                "direction": obj.direction or "STATIONARY",
                                "zone": obj.zone,
                                "threat": obj.threat,
                                "threat_level": obj.threat_level,
                                "threat_reason": obj.threat_reason,
                                "duration_seconds": obj.duration_seconds,
                                "first_seen": self.session_tracks.get(tid, {}).get("first_seen", timestamp),
                                "last_seen": timestamp,
                                "timestamp": obj.timestamp,
                                "trajectory": traj,
                                "points": pts,
                                "movement_points": pts,
                                "last_position": last_pos,
                                "session_id": video_id,
                                "video_id": video_id,
                            }
                            self.session_tracks[tid] = track_info
                            if obj.threat:
                                self.session_threats[tid] = track_info

                        if obj.threat:
                            AlertService.record_threat(session, obj, video_id=video_id)

                self.latest_frame = evaluated_objs
                self.frame_history.append(evaluated_objs)
                if len(self.frame_history) > self.max_history:
                    self.frame_history.pop(0)
                self.total_detections_count += len(evaluated_objs)

                await self.broadcast_frame(evaluated_objs)

                tick_count += 1
                self.processed_frames_count += 1
                self.current_fps = 10.0
                await asyncio.sleep(0.1)

            if self.video_status == "processing":
                self.video_status = "completed"
                self.current_fps = 0.0
                self.latest_frame = []
                await self.broadcast_frame([])

                # Calculate class counts (unique tracks per class)
                class_counts = {
                    "Person": 0, "Vehicle": 0, "Animal": 0, "Drone": 0, "Person With Bag": 0, "Person_With_Bag": 0
                }
                for trk in self.session_tracks.values():
                    c_name = trk.get("class_name") or trk.get("class") or "Person"
                    if "BAG" in c_name.upper():
                        class_counts["Person With Bag"] += 1
                        class_counts["Person_With_Bag"] += 1
                    elif "DRONE" in c_name.upper():
                        class_counts["Drone"] += 1
                    elif "VEHICLE" in c_name.upper():
                        class_counts["Vehicle"] += 1
                    elif "ANIMAL" in c_name.upper():
                        class_counts["Animal"] += 1
                    else:
                        class_counts["Person"] += 1

                unique_tracks_count = len(self.session_tracks)
                threat_count = len(self.session_threats)
                high_threat_count = sum(1 for t in self.session_threats.values() if (t.get("threat_level") or "HIGH") in ("HIGH", "CRITICAL"))

                all_confs = [c for clist in self.track_confidences.values() for c in clist]
                avg_confidence = round(sum(all_confs) / max(1, len(all_confs)), 4) if all_confs else 0.0
                actual_duration = round(tick_count * 0.1, 2)

                with Session(engine) as session:
                    rec = session.get(VideoRecordModel, video_id)
                    if rec:
                        rec.status = "completed"
                        session.add(rec)

                    ses_id = f"ses_{video_id}"
                    summary_rec = session.get(SessionSummaryModel, ses_id)
                    if not summary_rec:
                        summary_rec = SessionSummaryModel(
                            id=ses_id,
                            video_id=video_id,
                            session_id=video_id,
                            filename=rec.filename if rec else video_id,
                            status="completed",
                            total_frames=tick_count,
                            total_detections=self.total_detections_count,
                            unique_tracks=unique_tracks_count,
                            threat_count=threat_count,
                            high_threat_count=high_threat_count,
                            average_confidence=avg_confidence,
                            video_duration=actual_duration,
                            first_detection_time=self.first_detection_time,
                            last_detection_time=self.last_detection_time,
                            class_counts_json=json.dumps(class_counts),
                            class_detection_counts_json=json.dumps(self.class_detection_counts),
                            tracks_json=json.dumps(list(self.session_tracks.values())),
                            created_at=datetime.now(timezone.utc).isoformat(),
                            updated_at=datetime.now(timezone.utc).isoformat(),
                        )
                    else:
                        summary_rec.status = "completed"
                        summary_rec.total_frames = tick_count
                        summary_rec.total_detections = self.total_detections_count
                        summary_rec.unique_tracks = unique_tracks_count
                        summary_rec.threat_count = threat_count
                        summary_rec.high_threat_count = high_threat_count
                        summary_rec.average_confidence = avg_confidence
                        summary_rec.video_duration = actual_duration
                        summary_rec.first_detection_time = self.first_detection_time
                        summary_rec.last_detection_time = self.last_detection_time
                        summary_rec.class_counts_json = json.dumps(class_counts)
                        summary_rec.class_detection_counts_json = json.dumps(self.class_detection_counts)
                        summary_rec.tracks_json = json.dumps(list(self.session_tracks.values()))
                        summary_rec.updated_at = datetime.now(timezone.utc).isoformat()

                    session.add(summary_rec)
                    session.commit()
                logger.info(f"Mock video analysis completed successfully for {video_id} ({tick_count} ticks, {self.total_detections_count} detections, {unique_tracks_count} unique tracks)")

        except asyncio.CancelledError:
            self.video_status = "stopped"
            self.current_fps = 0.0
            self.latest_frame = []
            await self.broadcast_frame([])
        except Exception as e:
            logger.error(f"Error in mock simulation loop: {e}", exc_info=True)
            self.video_status = "error"
            self.current_fps = 0.0
            self.latest_frame = []
            await self.broadcast_frame([])


    def get_session_summary(self, video_id: Optional[str] = None) -> Dict[str, Any]:
        target_vid = video_id or self.active_video_id
        if not target_vid:
            return {
                "session_id": None,
                "video_id": None,
                "filename": None,
                "status": "no_video_selected",
                "total_frames": 0,
                "frames_processed": 0,
                "total_video_frames": 0,
                "total_detections": 0,
                "unique_tracks": 0,
                "total_threats": 0,
                "threat_count": 0,
                "high_threats": 0,
                "high_threat_count": 0,
                "average_confidence": 0.0,
                "video_duration": 0.0,
                "first_seen": None,
                "last_seen": None,
                "first_detection_time": None,
                "last_detection_time": None,
                "class_counts": {"Person": 0, "Vehicle": 0, "Animal": 0, "Drone": 0, "Person With Bag": 0, "Person_With_Bag": 0},
                "class_detection_counts": {"Person": 0, "Vehicle": 0, "Animal": 0, "Drone": 0, "Person With Bag": 0, "Person_With_Bag": 0},
                "tracks": [],
            }

        # If memory matches requested video_id:
        if target_vid == self.active_video_id and (self.session_tracks or self.video_status == "completed"):
            class_counts = {"Person": 0, "Vehicle": 0, "Animal": 0, "Drone": 0, "Person With Bag": 0, "Person_With_Bag": 0}
            for trk in self.session_tracks.values():
                c_name = trk.get("class_name") or trk.get("class") or "Person"
                if "BAG" in c_name.upper():
                    class_counts["Person With Bag"] += 1
                    class_counts["Person_With_Bag"] += 1
                elif "DRONE" in c_name.upper():
                    class_counts["Drone"] += 1
                elif "VEHICLE" in c_name.upper():
                    class_counts["Vehicle"] += 1
                elif "ANIMAL" in c_name.upper():
                    class_counts["Animal"] += 1
                else:
                    class_counts["Person"] += 1

            all_confs = [c for clist in self.track_confidences.values() for c in clist]
            avg_conf = round(sum(all_confs) / max(1, len(all_confs)), 4) if all_confs else 0.0

            with Session(engine) as session:
                rec = session.get(VideoRecordModel, target_vid)
                fname = rec.filename if rec else target_vid

            total_thr = len(self.session_threats)
            high_thr = sum(1 for t in self.session_threats.values() if (t.get("threat_level") or "HIGH") in ("HIGH", "CRITICAL"))

            return {
                "session_id": target_vid,
                "video_id": target_vid,
                "filename": fname,
                "status": self.video_status,
                "total_frames": self.processed_frames_count,
                "frames_processed": self.processed_frames_count,
                "total_video_frames": self.total_video_frames or self.processed_frames_count,
                "total_detections": self.total_detections_count,
                "unique_tracks": len(self.session_tracks),
                "total_threats": total_thr,
                "threat_count": total_thr,
                "high_threats": high_thr,
                "high_threat_count": high_thr,
                "average_confidence": avg_conf,
                "video_duration": self.video_duration,
                "first_seen": self.first_detection_time,
                "last_seen": self.last_detection_time,
                "first_detection_time": self.first_detection_time,
                "last_detection_time": self.last_detection_time,
                "class_counts": class_counts,
                "class_detection_counts": self.class_detection_counts,
                "tracks": list(self.session_tracks.values()),
            }

        # Fallback to SQLite SessionSummaryModel
        with Session(engine) as session:
            ses_id = f"ses_{target_vid}"
            summary_rec = session.get(SessionSummaryModel, ses_id)
            if not summary_rec:
                summary_rec = session.exec(select(SessionSummaryModel).where(SessionSummaryModel.video_id == target_vid)).first()

            if summary_rec:
                try:
                    c_counts = json.loads(summary_rec.class_counts_json)
                except Exception:
                    c_counts = {}
                try:
                    cd_counts = json.loads(summary_rec.class_detection_counts_json)
                except Exception:
                    cd_counts = {}
                try:
                    trks = json.loads(summary_rec.tracks_json)
                except Exception:
                    trks = []

                if "Person_With_Bag" in c_counts and "Person With Bag" not in c_counts:
                    c_counts["Person With Bag"] = c_counts["Person_With_Bag"]
                if "Person With Bag" in c_counts and "Person_With_Bag" not in c_counts:
                    c_counts["Person_With_Bag"] = c_counts["Person With Bag"]

                return {
                    "session_id": summary_rec.session_id,
                    "video_id": summary_rec.video_id,
                    "filename": summary_rec.filename,
                    "status": summary_rec.status,
                    "total_frames": summary_rec.total_frames,
                    "frames_processed": summary_rec.total_frames,
                    "total_video_frames": summary_rec.total_frames,
                    "total_detections": summary_rec.total_detections,
                    "unique_tracks": summary_rec.unique_tracks,
                    "total_threats": summary_rec.threat_count,
                    "threat_count": summary_rec.threat_count,
                    "high_threats": summary_rec.high_threat_count,
                    "high_threat_count": summary_rec.high_threat_count,
                    "average_confidence": summary_rec.average_confidence,
                    "video_duration": summary_rec.video_duration,
                    "first_seen": summary_rec.first_detection_time,
                    "last_seen": summary_rec.last_detection_time,
                    "first_detection_time": summary_rec.first_detection_time,
                    "last_detection_time": summary_rec.last_detection_time,
                    "class_counts": c_counts,
                    "class_detection_counts": cd_counts,
                    "tracks": trks,
                }

            rec = session.get(VideoRecordModel, target_vid)
            fname = rec.filename if rec else target_vid

        return {
            "session_id": target_vid,
            "video_id": target_vid,
            "filename": fname,
            "status": "ready",
            "total_frames": 0,
            "frames_processed": 0,
            "total_video_frames": 0,
            "total_detections": 0,
            "unique_tracks": 0,
            "total_threats": 0,
            "threat_count": 0,
            "high_threats": 0,
            "high_threat_count": 0,
            "average_confidence": 0.0,
            "video_duration": 0.0,
            "first_seen": None,
            "last_seen": None,
            "first_detection_time": None,
            "last_detection_time": None,
            "class_counts": {"Person": 0, "Vehicle": 0, "Animal": 0, "Drone": 0, "Person With Bag": 0, "Person_With_Bag": 0},
            "class_detection_counts": {"Person": 0, "Vehicle": 0, "Animal": 0, "Drone": 0, "Person With Bag": 0, "Person_With_Bag": 0},
            "tracks": [],
        }


analysis_manager = VideoAnalysisManager()
