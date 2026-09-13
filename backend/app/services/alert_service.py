import time
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from sqlmodel import Session, select, col
from sqlalchemy import desc
from backend.app.models.db_models import AlertModel
from backend.app.schemas.canonical import ThermalDetectionObject


class AlertService:
    """
    Persists threat alerts to SQLite database and exposes history queries.
    Includes time-window deduplication so continuous video frames of the same
    tracked threat do not flood the database.
    """

    # Debounce cache: (track_id or "untracked", class_name) -> timestamp
    _recent_alerts: Dict[Any, float] = {}
    COOLDOWN_SECONDS: float = 10.0

    @classmethod
    def reset_dedup(cls):
        """Clears deduplication tracking cache."""
        cls._recent_alerts.clear()

    @classmethod
    def record_threat(cls, session: Session, det: ThermalDetectionObject) -> Optional[AlertModel]:
        if not det.threat:
            return None

        now = time.time()
        # Group by tracked entity: (track_id, class_name)
        if det.track_id is not None:
            dedup_key = (det.track_id, det.class_name)
        else:
            dedup_key = ("untracked", det.class_name)

        # Check if threat for this track was recorded within cooldown window
        last_recorded = cls._recent_alerts.get(dedup_key)
        if last_recorded is not None and (now - last_recorded) < cls.COOLDOWN_SECONDS:
            return None

        # Determine semantic threat type
        if det.class_name == "Drone":
            threat_type = "Unauthorized Drone"
        elif "entered restricted" in (det.threat_reason or "").lower():
            threat_type = "Zone Intrusion"
        elif "speed" in (det.threat_reason or "").lower():
            threat_type = "Overspeed Violation"
        elif det.class_name == "Person_With_Bag":
            threat_type = "Suspicious Person"
        else:
            threat_type = "Security Threat"

        alert_id = f"alt_{uuid.uuid4().hex[:8]}"
        alert = AlertModel(
            id=alert_id,
            timestamp=det.timestamp,
            object_class=det.class_name,
            track_id=det.track_id if det.track_id is not None else 0,
            threat_type=threat_type,
            reason=det.threat_reason or "Threat detected",
            speed=det.speed,
            zone=det.zone,
            severity=det.threat_level or "HIGH",
            status="ACTIVE",
            confidence=round(float(det.confidence), 4) if det.confidence is not None else None,
        )
        session.add(alert)
        session.commit()
        session.refresh(alert)

        # Update deduplication cache
        cls._recent_alerts[dedup_key] = now
        return alert

    @staticmethod
    def update_alert_status(session: Session, alert_id: str, status: str) -> Optional[AlertModel]:
        alert = session.get(AlertModel, alert_id)
        if not alert:
            return None
        alert.status = status
        session.add(alert)
        session.commit()
        session.refresh(alert)
        return alert

    @staticmethod
    def get_alert_history(
        session: Session,
        limit: int = 50,
        severity: Optional[str] = None,
        object_class: Optional[str] = None
    ) -> List[AlertModel]:
        statement = select(AlertModel).order_by(desc(col(AlertModel.timestamp)))
        if severity:
            statement = statement.where(AlertModel.severity == severity)
        if object_class:
            statement = statement.where(AlertModel.object_class == object_class)
        statement = statement.limit(limit)
        results = session.exec(statement).all()
        return list(results)

    @classmethod
    def clear_alert_history(cls, session: Session) -> int:
        statement = select(AlertModel)
        alerts = session.exec(statement).all()
        count = len(alerts)
        for alert in alerts:
            session.delete(alert)
        session.commit()
        cls.reset_dedup()
        return count
