import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import cv2
from sqlmodel import Session, select
from backend.app.core.database import engine
from backend.app.models.db_models import AlertModel
from ai.threat.threat_engine import ThreatEngine
from ai.detection.yolo_detection import YOLODetectionService
from backend.app.services.alert_service import AlertService
from backend.app.schemas.canonical import ThermalDetectionObject
from backend.app.schemas.domain import ZoneResponse


# TEST 1: Person -> NORMAL
def test_person_normal():
    engine_inst = ThreatEngine()
    det = ThermalDetectionObject(
        id="d1",
        sensor="thermal",
        class_name="Person",
        confidence=0.92,
        track_id=1,
        bbox=[0.1, 0.1, 0.3, 0.4],
        timestamp="2026-09-02T12:00:00Z"
    )
    evaluated = engine_inst.evaluate([det], [], speed_threshold_kmh=80.0)
    assert len(evaluated) == 1
    assert evaluated[0].threat is False
    assert evaluated[0].threat_level is None
    assert evaluated[0].threat_reason is None


# TEST 2: Vehicle below speed threshold -> NORMAL
def test_vehicle_below_speed_normal():
    engine_inst = ThreatEngine()
    det = ThermalDetectionObject(
        id="d2",
        sensor="thermal",
        class_name="Vehicle",
        confidence=0.95,
        track_id=2,
        bbox=[0.4, 0.4, 0.6, 0.6],
        speed=60.0,
        timestamp="2026-09-02T12:00:00Z"
    )
    evaluated = engine_inst.evaluate([det], [], speed_threshold_kmh=80.0)
    assert len(evaluated) == 1
    assert evaluated[0].threat is False
    assert evaluated[0].threat_level is None
    assert evaluated[0].threat_reason is None


# TEST 3: Vehicle above speed threshold -> THREAT / HIGH
def test_vehicle_above_speed_threat():
    engine_inst = ThreatEngine()
    det = ThermalDetectionObject(
        id="d3",
        sensor="thermal",
        class_name="Vehicle",
        confidence=0.96,
        track_id=3,
        bbox=[0.4, 0.4, 0.6, 0.6],
        speed=95.0,
        timestamp="2026-09-02T12:00:00Z"
    )
    evaluated = engine_inst.evaluate([det], [], speed_threshold_kmh=80.0)
    assert len(evaluated) == 1
    assert evaluated[0].threat is True
    assert evaluated[0].threat_level == "HIGH"
    assert "exceeded configured limit" in (evaluated[0].threat_reason or "")


# TEST 4: Animal -> NORMAL
def test_animal_normal():
    engine_inst = ThreatEngine()
    det = ThermalDetectionObject(
        id="d4",
        sensor="thermal",
        class_name="Animal",
        confidence=0.88,
        track_id=4,
        bbox=[0.7, 0.7, 0.85, 0.85],
        timestamp="2026-09-02T12:00:00Z"
    )
    evaluated = engine_inst.evaluate([det], [], speed_threshold_kmh=80.0)
    assert len(evaluated) == 1
    assert evaluated[0].threat is False
    assert evaluated[0].threat_level is None
    assert evaluated[0].threat_reason is None


# TEST 5: Drone -> THREAT / HIGH / Unauthorized drone detected
def test_drone_threat():
    engine_inst = ThreatEngine()
    det = ThermalDetectionObject(
        id="d5",
        sensor="thermal",
        class_name="Drone",
        confidence=0.91,
        track_id=5,
        bbox=[0.2, 0.1, 0.35, 0.25],
        timestamp="2026-09-02T12:00:00Z"
    )
    evaluated = engine_inst.evaluate([det], [], speed_threshold_kmh=80.0)
    assert len(evaluated) == 1
    assert evaluated[0].threat is True
    assert evaluated[0].threat_level == "HIGH"
    assert evaluated[0].threat_reason == "Unauthorized drone detected"


# TEST 6: Person_With_Bag -> THREAT / HIGH / Person with bag detected
def test_person_with_bag_threat():
    engine_inst = ThreatEngine()
    det = ThermalDetectionObject(
        id="d6",
        sensor="thermal",
        class_name="Person_With_Bag",
        confidence=0.93,
        track_id=6,
        bbox=[0.3, 0.3, 0.45, 0.65],
        timestamp="2026-09-02T12:00:00Z"
    )
    evaluated = engine_inst.evaluate([det], [], speed_threshold_kmh=80.0)
    assert len(evaluated) == 1
    assert evaluated[0].threat is True
    assert evaluated[0].threat_level == "HIGH"
    assert evaluated[0].threat_reason == "Person with bag detected"


# TEST 7: Restricted-zone rule works using the existing ZoneEngine
def test_restricted_zone_rule():
    engine_inst = ThreatEngine()
    zone = ZoneResponse(
        id="z1",
        name="Perimeter Storage Alpha",
        polygon=[[0.0, 0.0], [0.5, 0.0], [0.5, 0.5], [0.0, 0.5]],
        enabled=True
    )
    det = ThermalDetectionObject(
        id="d7",
        sensor="thermal",
        class_name="Person_With_Bag",
        confidence=0.94,
        track_id=7,
        bbox=[0.1, 0.1, 0.2, 0.3],  # Centroid inside zone
        timestamp="2026-09-02T12:00:00Z"
    )
    evaluated = engine_inst.evaluate([det], [zone], speed_threshold_kmh=80.0)
    assert len(evaluated) == 1
    assert evaluated[0].threat is True
    assert evaluated[0].threat_level == "HIGH"
    assert evaluated[0].zone == "Perimeter Storage Alpha"
    assert "Person_With_Bag entered restricted area: Perimeter Storage Alpha" in (evaluated[0].threat_reason or "")


# TEST 8: Real video detection through ThreatEngine
def test_real_video_detection_through_threat_engine():
    model_path = os.path.abspath("models/thermal/best.pt")
    service = YOLODetectionService(model_path)
    img_path = os.path.abspath("tests/fixtures/thermal_frame1.jpg")
    frame = cv2.imread(img_path)
    assert frame is not None, "Failed to load frame fixture"

    raw_dets = service.detect_frame(frame)
    assert len(raw_dets) > 0, "Expected at least one real detection"

    engine_inst = ThreatEngine()
    evaluated = engine_inst.evaluate(raw_dets, [], speed_threshold_kmh=80.0)
    assert len(evaluated) > 0

    drone_det = next((d for d in evaluated if d.class_name == "Drone"), None)
    assert drone_det is not None, "Real drone detection should be present"
    assert drone_det.threat is True
    assert drone_det.threat_level == "HIGH"
    assert drone_det.threat_reason == "Unauthorized drone detected"


# TEST 9: Alert deduplication prevents database row per frame
def test_alert_deduplication():
    with Session(engine) as session:
        AlertService.clear_alert_history(session)

        det = ThermalDetectionObject(
            id="d_stream_1",
            sensor="thermal",
            class_name="Drone",
            confidence=0.92,
            track_id=1,
            bbox=[0.5, 0.5, 0.6, 0.6],
            threat=True,
            threat_level="HIGH",
            threat_reason="Unauthorized drone detected",
            timestamp="2026-09-02T12:00:00Z"
        )

        # Simulate 20 continuous frames of the same Drone Track #1
        recorded_alerts = []
        for _ in range(20):
            alert = AlertService.record_threat(session, det)
            if alert is not None:
                recorded_alerts.append(alert)

        # Verify only 1 alert record was created instead of 20
        assert len(recorded_alerts) == 1, f"Expected 1 debounced alert, got {len(recorded_alerts)}"
        
        # Verify in DB
        db_alerts = session.exec(select(AlertModel).where(AlertModel.track_id == 1)).all()
        assert len(db_alerts) == 1
        assert db_alerts[0].threat_type == "Unauthorized Drone"
        assert db_alerts[0].object_class == "Drone"


# TEST 10: Existing tests compatibility
def test_threat_rule_1_zone_intrusion():
    test_restricted_zone_rule()


def test_threat_rule_2_overspeed_vehicle():
    test_vehicle_above_speed_threat()
