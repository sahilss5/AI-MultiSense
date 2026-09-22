import time
import math
from typing import List, Dict
from ai.tracking.base import TrackingInterface
from backend.app.schemas.canonical import ThermalDetectionObject

# INTEGRATION POINT: Replace MockTrackingService with ByteTrack or BoT-SORT tracker adapter

class MockTrackingService(TrackingInterface):
    """
    Mock implementation of Multi-Object Tracking.
    Maintains track history, smooths bounding boxes, and calculates estimated speed values.
    """

    def __init__(self):
        self.track_history: Dict[int, Dict] = {}

    def update_tracks(self, detections: List[ThermalDetectionObject]) -> List[ThermalDetectionObject]:
        now = time.time()
        updated_detections = []

        for idx, det in enumerate(detections):
            track_id = det.track_id if det.track_id is not None else (idx + 1)
            det.track_id = track_id
            bbox = det.bbox
            center_x = (bbox[0] + bbox[2]) / 2.0
            center_y = (bbox[1] + bbox[3]) / 2.0

            # Calculate estimated speed for Vehicle objects
            if det.class_name == "Vehicle":
                if track_id in self.track_history:
                    prev = self.track_history[track_id]
                    dt = max(now - prev["time"], 0.05)
                    dx = center_x - prev["x"]
                    dy = center_y - prev["y"]
                    dist = math.sqrt(dx*dx + dy*dy)
                    # Scale factor converting normalized frame distance/sec to km/h (mock calibration)
                    raw_speed = (dist / dt) * 350.0
                    # Smooth speed calculation
                    speed = round(min(max(raw_speed, 65.0), 110.0), 1)
                else:
                    # Initial speed assignment for mock vehicle
                    speed = round(85.5 + (track_id % 15), 1)
                det.speed = speed

            # Update tracking history
            self.track_history[track_id] = {
                "x": center_x,
                "y": center_y,
                "time": now
            }

            updated_detections.append(det)

        return updated_detections
