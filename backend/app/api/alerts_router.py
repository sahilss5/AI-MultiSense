from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlmodel import Session
from backend.app.core.database import get_session
from backend.app.services.alert_service import AlertService
from backend.app.models.db_models import AlertModel
from backend.app.schemas.domain import AlertStatusUpdate

router = APIRouter(prefix="/api/alerts", tags=["Alert History"])

@router.get("/history", response_model=List[AlertModel])
def get_alerts_history(
    limit: int = Query(50, ge=1, le=500),
    severity: Optional[str] = None,
    object_class: Optional[str] = None,
    video_id: Optional[str] = None,
    session: Session = Depends(get_session)
):
    return AlertService.get_alert_history(
        session=session,
        limit=limit,
        severity=severity,
        object_class=object_class,
        video_id=video_id
    )

@router.patch("/{alert_id}", response_model=AlertModel)
@router.put("/{alert_id}/status", response_model=AlertModel)
def update_alert_status(
    alert_id: str,
    update_data: AlertStatusUpdate,
    session: Session = Depends(get_session)
):
    alert = AlertService.update_alert_status(session, alert_id, update_data.status)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert with ID '{alert_id}' not found"
        )
    return alert

@router.delete("/history")
def clear_alerts_history(session: Session = Depends(get_session)):
    count = AlertService.clear_alert_history(session=session)
    return {"message": "Alert history cleared successfully", "deleted_count": count}
