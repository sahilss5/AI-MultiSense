from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from backend.app.core.database import get_session
from backend.app.models.db_models import SettingsModel
from backend.app.schemas.domain import SystemSettings

router = APIRouter(prefix="/api/settings", tags=["System Settings"])

@router.get("", response_model=SystemSettings)
def get_settings(session: Session = Depends(get_session)):
    db_settings = session.get(SettingsModel, 1)
    if not db_settings:
        db_settings = SettingsModel(id=1)
        session.add(db_settings)
        session.commit()
        session.refresh(db_settings)

    return SystemSettings(
        speed_threshold_kmh=db_settings.speed_threshold_kmh,
        confidence_threshold=db_settings.confidence_threshold,
        tracking_iou_threshold=db_settings.tracking_iou_threshold,
        thermal_camera_enabled=db_settings.thermal_camera_enabled,
        alert_sound_enabled=db_settings.alert_sound_enabled
    )

@router.put("", response_model=SystemSettings)
def update_settings(settings_in: SystemSettings, session: Session = Depends(get_session)):
    db_settings = session.get(SettingsModel, 1)
    if not db_settings:
        db_settings = SettingsModel(id=1)

    db_settings.speed_threshold_kmh = settings_in.speed_threshold_kmh
    db_settings.confidence_threshold = settings_in.confidence_threshold
    db_settings.tracking_iou_threshold = settings_in.tracking_iou_threshold
    db_settings.thermal_camera_enabled = settings_in.thermal_camera_enabled
    db_settings.alert_sound_enabled = settings_in.alert_sound_enabled

    session.add(db_settings)
    session.commit()
    session.refresh(db_settings)

    return SystemSettings(
        speed_threshold_kmh=db_settings.speed_threshold_kmh,
        confidence_threshold=db_settings.confidence_threshold,
        tracking_iou_threshold=db_settings.tracking_iou_threshold,
        thermal_camera_enabled=db_settings.thermal_camera_enabled,
        alert_sound_enabled=db_settings.alert_sound_enabled
    )


@router.post("/reset", response_model=SystemSettings)
def reset_settings(session: Session = Depends(get_session)):
    db_settings = session.get(SettingsModel, 1)
    if not db_settings:
        db_settings = SettingsModel(id=1)

    db_settings.speed_threshold_kmh = 80.0
    db_settings.confidence_threshold = 0.50
    db_settings.tracking_iou_threshold = 0.45
    db_settings.thermal_camera_enabled = True
    db_settings.alert_sound_enabled = True

    session.add(db_settings)
    session.commit()
    session.refresh(db_settings)

    return SystemSettings(
        speed_threshold_kmh=db_settings.speed_threshold_kmh,
        confidence_threshold=db_settings.confidence_threshold,
        tracking_iou_threshold=db_settings.tracking_iou_threshold,
        thermal_camera_enabled=db_settings.thermal_camera_enabled,
        alert_sound_enabled=db_settings.alert_sound_enabled
    )
