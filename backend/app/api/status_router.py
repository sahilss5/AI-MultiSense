import os
from fastapi import APIRouter, Depends
from sqlmodel import Session
from backend.app.core.config import settings
from backend.app.core.database import get_session
from backend.app.models.db_models import SettingsModel
from backend.app.schemas.domain import SystemStatusResponse
from backend.app.services.video_analysis_service import analysis_manager

router = APIRouter(prefix="/api/status", tags=["System Status"])

@router.get("", response_model=SystemStatusResponse)
def get_system_status(session: Session = Depends(get_session)):
    model_exists = os.path.exists(settings.THERMAL_MODEL_PATH)
    is_demo = not model_exists
    analysis_mode = "AI Inference Active" if model_exists else "Demo Mode"
    model_status = "READY" if model_exists else "NOT CONNECTED"

    db_settings = session.get(SettingsModel, 1)
    camera_enabled = db_settings.thermal_camera_enabled if db_settings else True

    is_active_session = analysis_manager.video_status in ("processing", "paused")
    latest_objs = analysis_manager.latest_frame if is_active_session else []
    active_tracks = len(set(obj.track_id for obj in latest_objs if obj.track_id is not None)) if latest_objs else 0
    active_threats = sum(1 for obj in latest_objs if obj.threat) if latest_objs else 0

    device_str = "CUDA (NVIDIA RTX)"
    if analysis_manager.real_detection_service is not None:
        try:
            import torch
            if torch.cuda.is_available():
                device_str = f"CUDA ({torch.cuda.get_device_name(0)})"
            else:
                device_str = "CPU Fallback"
        except Exception:
            device_str = "CUDA"

    return SystemStatusResponse(
        is_demo_mode=is_demo,
        analysis_mode=analysis_mode,
        thermal_model_path=settings.THERMAL_MODEL_PATH,
        model_status=model_status,
        thermal_camera_enabled=camera_enabled,
        active_tracks=active_tracks,
        active_threats=active_threats,
        fps=analysis_manager.current_fps if analysis_manager.video_status == "processing" else 0.0,
        total_detections=analysis_manager.total_detections_count,
        device=device_str,
        confidence_threshold=0.40,
        supported_classes=[
            "Person",
            "Vehicle",
            "Animal",
            "Drone",
            "Person_With_Bag"
        ]
    )
