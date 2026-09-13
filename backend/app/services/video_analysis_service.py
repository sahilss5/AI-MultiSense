import os
import asyncio
import json
import logging
from typing import Dict, List, Set, Optional
from datetime import datetime, timezone
import cv2
from fastapi import WebSocket
from sqlmodel import Session, select
from backend.app.schemas.domain import VideoStatusType, AnalysisModeType
from backend.app.core.config import settings
from backend.app.core.database import engine
from backend.app.models.db_models import VideoRecordModel, SettingsModel, ZoneModel
from backend.app.schemas.domain import ZoneResponse
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
        self.session_start_time = None
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

        # Query video FPS for pacing
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0 or fps > 120 or not fps:
            fps = 30.0
        frame_delay = 1.0 / fps
        self.current_fps = fps

        # Reset ByteTrack tracker state for fresh video tracking
        if self.real_detection_service:
            self.real_detection_service.reset_tracker()

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
                    raw_dets = self.real_detection_service.detect_frame(
                        frame_input=frame,
                        timestamp=timestamp,
                        persist=True
                    )

                    # Pass real detections through Threat Engine
                    evaluated_objs = self.threat_engine.evaluate(
                        objects=raw_dets,
                        zones=active_zones,
                        speed_threshold_kmh=speed_limit
                    )

                    # Persist threats to SQLite
                    for obj in evaluated_objs:
                        if obj.threat:
                            AlertService.record_threat(session, obj)

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

            # Mark completed if video finished naturally
            if self.video_status == "processing":
                self.video_status = "completed"
                self.session_start_time = None
                self.current_fps = 0.0
                with Session(engine) as session:
                    rec = session.get(VideoRecordModel, video_id)
                    if rec:
                        rec.status = "completed"
                        session.add(rec)
                        session.commit()
                logger.info(f"Real video analysis completed successfully for {video_id} ({frame_index} frames processed)")

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

                    for obj in evaluated_objs:
                        if obj.threat:
                            AlertService.record_threat(session, obj)

                self.latest_frame = evaluated_objs
                self.frame_history.append(evaluated_objs)
                if len(self.frame_history) > self.max_history:
                    self.frame_history.pop(0)
                self.total_detections_count += len(evaluated_objs)

                await self.broadcast_frame(evaluated_objs)

                tick_count += 1
                await asyncio.sleep(0.1)

            if self.video_status == "processing":
                self.video_status = "completed"
                with Session(engine) as session:
                    rec = session.get(VideoRecordModel, video_id)
                    if rec:
                        rec.status = "completed"
                        session.add(rec)
                        session.commit()

        except asyncio.CancelledError:
            self.video_status = "stopped"
        except Exception as e:
            logger.error(f"Error in mock simulation loop: {e}", exc_info=True)
            self.video_status = "error"


analysis_manager = VideoAnalysisManager()
