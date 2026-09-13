from typing import List
from fastapi import APIRouter
from sqlmodel import Session, select
from backend.app.core.database import engine
from backend.app.models.db_models import AlertModel
from backend.app.schemas.canonical import ThermalDetectionObject
from backend.app.schemas.domain import AnalyticsResponse, ClassCount
from backend.app.services.video_analysis_service import analysis_manager

router = APIRouter(prefix="/api", tags=["Detections & Analytics"])


@router.get("/detections", response_model=List[ThermalDetectionObject])
def get_current_detections():
    return analysis_manager.latest_frame


@router.get("/tracks", response_model=List[ThermalDetectionObject])
def get_current_tracks():
    return [obj for obj in analysis_manager.latest_frame if obj.track_id is not None]


@router.get("/threats", response_model=List[ThermalDetectionObject])
def get_current_threats():
    return [obj for obj in analysis_manager.latest_frame if obj.threat]


@router.get("/analytics", response_model=AnalyticsResponse)
def get_analytics():
    all_frames = analysis_manager.frame_history
    flattened = [obj for frame in all_frames for obj in frame]

    with Session(engine) as session:
        alerts = session.exec(select(AlertModel)).all()

    total_threats = len(alerts)
    zone_violations = sum(1 for a in alerts if a.threat_type == "Zone Intrusion")
    high_speed_violations = sum(1 for a in alerts if a.threat_type == "Overspeed Violation")

    if flattened:
        total_dets = analysis_manager.total_detections_count or len(flattened)
        active_tracks = len(set(obj.track_id for obj in analysis_manager.latest_frame if obj.track_id is not None))

        vehicle_speeds = [obj.speed for obj in flattened if obj.class_name == "Vehicle" and obj.speed is not None]
        avg_speed = round(sum(vehicle_speeds) / len(vehicle_speeds), 1) if vehicle_speeds else 0.0
        max_speed = round(max(vehicle_speeds), 1) if vehicle_speeds else 0.0

        class_counts = {
            "Person": sum(1 for obj in flattened if obj.class_name == "Person"),
            "Vehicle": sum(1 for obj in flattened if obj.class_name == "Vehicle"),
            "Animal": sum(1 for obj in flattened if obj.class_name == "Animal"),
            "Drone": sum(1 for obj in flattened if obj.class_name == "Drone"),
            "Person_With_Bag": sum(1 for obj in flattened if obj.class_name == "Person_With_Bag"),
        }

        distribution = [
            ClassCount(class_name=cls, count=cnt)
            for cls, cnt in class_counts.items()
        ]

        trend = []
        for idx, frame in enumerate(all_frames[-20:]):
            time_label = None
            if frame and hasattr(frame[0], "timestamp") and frame[0].timestamp:
                try:
                    time_label = str(frame[0].timestamp).split("T")[-1].split(".")[0]
                except Exception:
                    time_label = None
            trend.append({
                "frame": idx * 10,
                "time_label": time_label,
                "detections": len(frame),
                "threats": sum(1 for o in frame if o.threat)
            })

        conf_vals = [obj.confidence for obj in flattened if obj.confidence is not None]
        avg_conf = round(sum(conf_vals) / len(conf_vals), 3) if conf_vals else None
        if conf_vals:
            conf_dist = [
                {"range": "< 50%", "count": sum(1 for c in conf_vals if c < 0.50), "label": "Low Confidence (Filtered)"},
                {"range": "50 – 70%", "count": sum(1 for c in conf_vals if 0.50 <= c < 0.70), "label": "Moderate Confidence"},
                {"range": "70 – 90%", "count": sum(1 for c in conf_vals if 0.70 <= c < 0.90), "label": "High Confidence"},
                {"range": "90 – 100%", "count": sum(1 for c in conf_vals if c >= 0.90), "label": "Optimal Lock"},
            ]
        else:
            conf_dist = None
    else:
        speeds = [a.speed for a in alerts if a.speed is not None]
        avg_speed = round(sum(speeds) / len(speeds), 1) if speeds else 0.0
        max_speed = round(max(speeds), 1) if speeds else 0.0

        class_counts = {
            "Person": 0,
            "Vehicle": 0,
            "Animal": 0,
            "Drone": 0,
            "Person_With_Bag": 0,
        }

        distribution = [
            ClassCount(class_name=cls, count=cnt)
            for cls, cnt in class_counts.items()
        ]

        total_dets = analysis_manager.total_detections_count or 0
        active_tracks = 0
        trend = []
        conf_dist = None
        avg_conf = None

    return AnalyticsResponse(
        total_detections=total_dets,
        total_threats=total_threats,
        zone_violations=zone_violations,
        high_speed_violations=high_speed_violations,
        average_vehicle_speed=avg_speed,
        max_vehicle_speed=max_speed,
        class_distribution=distribution,
        threat_trend=trend,
        active_tracks=active_tracks,
        drone_count=class_counts.get("Drone", 0),
        person_with_bag_count=class_counts.get("Person_With_Bag", 0),
        person_count=class_counts.get("Person", 0),
        vehicle_count=class_counts.get("Vehicle", 0),
        animal_count=class_counts.get("Animal", 0),
        confidence_distribution=conf_dist,
        average_confidence=avg_conf,
    )

