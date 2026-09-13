import time
import random
import uuid
from datetime import datetime, timezone
from typing import List, Any, Optional
from ai.detection.base import YOLODetectionInterface
from backend.app.schemas.canonical import ThermalDetectionObject, ObjectClass

# INTEGRATION POINT: Replace MockDetectionService with real YOLODetectionService (ultralytics YOLO(model_path))
# Output MUST strictly adhere to Section 6 ThermalDetectionObject schema.

class MockDetectionService(YOLODetectionInterface):
    """
    Mock implementation of Thermal YOLODetectionInterface.
    Generates realistic synthetic thermal bounding boxes and object classes.
    """

    def __init__(self):
        self.classes: List[ObjectClass] = ["Person", "Person_With_Bag", "Vehicle", "Animal", "Drone"]

    def detect_frame(self, frame_input: Any = None, timestamp: Optional[str] = None) -> List[ThermalDetectionObject]:
        if not timestamp:
            timestamp = datetime.now(timezone.utc).isoformat()

        # Simulate frame-by-frame object detections with high confidence
        raw_objects = []
        
        # Generator seed based on current epoch time to create pseudo-continuous motion
        now = time.time()
        
        # Entity 1: Person_With_Bag moving towards zone
        x1 = (0.2 + (now * 0.05) % 0.6)
        y1 = (0.2 + (now * 0.03) % 0.5)
        raw_objects.append({
            "temp_id": "raw_1",
            "class": "Person_With_Bag",
            "confidence": round(random.uniform(0.88, 0.97), 2),
            "bbox": [round(x1, 3), round(y1, 3), round(min(x1 + 0.12, 0.98), 3), round(min(y1 + 0.25, 0.98), 3)],
            "track_id_hint": 101
        })

        # Entity 2: Vehicle moving at high speed
        vx1 = (0.1 + (now * 0.15) % 0.7)
        vy1 = 0.65
        raw_objects.append({
            "temp_id": "raw_2",
            "class": "Vehicle",
            "confidence": round(random.uniform(0.90, 0.99), 2),
            "bbox": [round(vx1, 3), round(vy1, 3), round(min(vx1 + 0.22, 0.98), 3), round(min(vy1 + 0.18, 0.98), 3)],
            "track_id_hint": 202
        })

        # Entity 3: Regular Person
        px1 = (0.7 - (now * 0.02) % 0.3)
        py1 = 0.15
        raw_objects.append({
            "temp_id": "raw_3",
            "class": "Person",
            "confidence": round(random.uniform(0.85, 0.94), 2),
            "bbox": [round(px1, 3), round(py1, 3), round(min(px1 + 0.10, 0.98), 3), round(min(py1 + 0.22, 0.98), 3)],
            "track_id_hint": 303
        })

        # Occasional drone or animal
        if int(now) % 4 == 0:
            dx1 = 0.4 + (now * 0.08) % 0.4
            raw_objects.append({
                "temp_id": "raw_4",
                "class": "Drone",
                "confidence": round(random.uniform(0.82, 0.93), 2),
                "bbox": [round(dx1, 3), 0.05, round(min(dx1 + 0.08, 0.98), 3), 0.12],
                "track_id_hint": 404
            })

        detections = []
        for obj in raw_objects:
            det = ThermalDetectionObject(
                id=f"det_{uuid.uuid4().hex[:8]}",
                sensor="thermal",
                class_name=obj["class"],
                confidence=obj["confidence"],
                track_id=obj["track_id_hint"],
                bbox=obj["bbox"],
                speed=None,
                zone=None,
                threat=False,
                threat_level=None,
                threat_reason=None,
                timestamp=timestamp
            )
            detections.append(det)

        return detections
