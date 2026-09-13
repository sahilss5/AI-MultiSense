import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from backend.app.main import app
from backend.app.core.database import engine
from backend.app.models.db_models import AlertModel
from backend.app.schemas.canonical import ThermalDetectionObject
from backend.app.services.alert_service import AlertService


def test_alert_confidence_and_status_lifecycle():
    client = TestClient(app)

    # 1. Create an alert directly with real confidence
    from datetime import datetime, timezone
    det = ThermalDetectionObject(
        id="det-42",
        timestamp=datetime.now(timezone.utc).isoformat(),
        track_id=42,
        class_name="Drone",
        confidence=0.924,
        speed=15.0,
        direction="NW",
        bbox=[0.1, 0.2, 0.3, 0.4],
        threat=True,
        threat_level="HIGH",
        threat_reason="Low-altitude unauthorized aerial intrusion.",
        zone="Sector Alpha-4",
    )

    AlertService.reset_dedup()
    with Session(engine) as session:
        created = AlertService.record_threat(
            session=session,
            det=det,
        )
        assert created is not None
        alert_id = created.id

    # 2. Query through API and verify REAL confidence and default status
    res = client.get("/api/alerts/history")
    assert res.status_code == 200
    alerts = res.json()
    matched = next((a for a in alerts if a["id"] == alert_id), None)
    assert matched is not None
    assert matched["confidence"] == 0.924
    assert matched["status"] == "ACTIVE"

    # 3. Test PATCH status lifecycle to ACKNOWLEDGED
    patch_res = client.patch(f"/api/alerts/{alert_id}", json={"status": "ACKNOWLEDGED"})
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["id"] == alert_id
    assert updated["status"] == "ACKNOWLEDGED"

    # Verify directly in SQLite database
    with Session(engine) as session:
        db_alert = session.exec(select(AlertModel).where(AlertModel.id == alert_id)).first()
        assert db_alert is not None
        assert db_alert.status == "ACKNOWLEDGED"
        assert db_alert.confidence == 0.924

    # 4. Test PATCH status lifecycle to RESOLVED
    resolve_res = client.patch(f"/api/alerts/{alert_id}", json={"status": "RESOLVED"})
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "RESOLVED"

    # Verify query again returns RESOLVED
    res2 = client.get("/api/alerts/history")
    matched2 = next((a for a in res2.json() if a["id"] == alert_id), None)
    assert matched2 is not None
    assert matched2["status"] == "RESOLVED"
    assert matched2["confidence"] == 0.924

    # Cleanup
    with Session(engine) as session:
        alert = session.exec(select(AlertModel).where(AlertModel.id == alert_id)).first()
        if alert:
            session.delete(alert)
            session.commit()


def test_clear_alert_history_lifecycle():
    client = TestClient(app)
    from datetime import datetime, timezone

    # 1. Seed two test alerts
    det1 = ThermalDetectionObject(
        id="det-clear-1",
        timestamp=datetime.now(timezone.utc).isoformat(),
        track_id=101,
        class_name="Drone",
        confidence=0.95,
        bbox=[0.1, 0.2, 0.3, 0.4],
        threat=True,
        threat_level="HIGH",
        threat_reason="Unauthorized drone",
    )
    det2 = ThermalDetectionObject(
        id="det-clear-2",
        timestamp=datetime.now(timezone.utc).isoformat(),
        track_id=102,
        class_name="Person_With_Bag",
        confidence=0.91,
        bbox=[0.2, 0.3, 0.4, 0.5],
        threat=True,
        threat_level="HIGH",
        threat_reason="Suspicious person with bag",
    )

    AlertService.reset_dedup()
    with Session(engine) as session:
        AlertService.record_threat(session, det1)
        AlertService.record_threat(session, det2)

    # Verify alerts exist
    res = client.get("/api/alerts/history")
    assert res.status_code == 200
    assert len(res.json()) >= 2

    # 2. Call DELETE /api/alerts/history
    delete_res = client.delete("/api/alerts/history")
    assert delete_res.status_code == 200
    data = delete_res.json()
    assert "deleted_count" in data
    assert data["deleted_count"] >= 2
    assert data["message"] == "Alert history cleared successfully"

    # 3. Verify database contains 0 alerts
    with Session(engine) as session:
        remaining = session.exec(select(AlertModel)).all()
        assert len(remaining) == 0

    # 4. Verify GET /api/alerts/history returns empty list
    res_after = client.get("/api/alerts/history")
    assert res_after.status_code == 200
    assert len(res_after.json()) == 0

    # 5. Verify creating a new threat after clear succeeds normally
    det_new = ThermalDetectionObject(
        id="det-new-1",
        timestamp=datetime.now(timezone.utc).isoformat(),
        track_id=103,
        class_name="Drone",
        confidence=0.96,
        bbox=[0.3, 0.4, 0.5, 0.6],
        threat=True,
        threat_level="HIGH",
        threat_reason="New drone detected",
    )
    with Session(engine) as session:
        new_alert = AlertService.record_threat(session, det_new)
        assert new_alert is not None

    res_new = client.get("/api/alerts/history")
    assert res_new.status_code == 200
    assert len(res_new.json()) == 1
    assert res_new.json()[0]["object_class"] == "Drone"

    # Clean up
    with Session(engine) as session:
        AlertService.clear_alert_history(session)
