import os
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Any, Optional
import torch
from ultralytics import YOLO

from ai.detection.base import YOLODetectionInterface
from backend.app.schemas.canonical import ThermalDetectionObject, ObjectClass
from backend.app.core.config import settings

logger = logging.getLogger("yolo_detection")

# Exact class mapping defined for the 5-class thermal model
CLASS_MAPPING: dict[int, ObjectClass] = {
    0: "Person",
    1: "Vehicle",
    2: "Animal",
    3: "Drone",
    4: "Person_With_Bag",
}


class YOLODetectionService(YOLODetectionInterface):
    """
    Real Thermal YOLO Detection + ByteTrack tracking service.
    Loads models/thermal/best.pt once and runs frame-by-frame inference.
    Adheres to YOLODetectionInterface and outputs canonical ThermalDetectionObject instances.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or settings.THERMAL_MODEL_PATH
        if not os.path.isabs(self.model_path):
            self.model_path = os.path.abspath(self.model_path)

        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Trained thermal model not found at: {self.model_path}")

        # CUDA check with CPU fallback
        if torch.cuda.is_available():
            self.device: Any = 0
            device_name = torch.cuda.get_device_name(0)
            logger.info(f"YOLODetectionService: Initialized on CUDA device 0 ({device_name})")
        else:
            self.device = "cpu"
            logger.info("YOLODetectionService: CUDA not available. Initialized on CPU fallback.")

        # Load real YOLO model once
        logger.info(f"Loading YOLO model from: {self.model_path}")
        self.model = YOLO(self.model_path)
        logger.info(f"YOLO model loaded successfully. Classes: {self.model.names}")

        # Tracking configuration
        self.conf_threshold: float = 0.40
        self.imgsz: int = 640
        self.tracker_config: str = "bytetrack.yaml"

    def detect_frame(
        self,
        frame_input: Any = None,
        timestamp: Optional[str] = None,
        persist: bool = True
    ) -> List[ThermalDetectionObject]:
        """
        Process a single OpenCV BGR frame or image and return canonical ThermalDetectionObject list.
        Uses ByteTrack with persist=True for inter-frame tracking association.
        """
        if frame_input is None:
            return []

        if timestamp is None:
            timestamp = datetime.now(timezone.utc).isoformat()

        # Run real YOLO inference with ByteTrack
        results = self.model.track(
            source=frame_input,
            conf=self.conf_threshold,
            imgsz=self.imgsz,
            device=self.device,
            tracker=self.tracker_config,
            persist=persist,
            verbose=False
        )

        detections: List[ThermalDetectionObject] = []
        if not results or len(results) == 0:
            return detections

        res = results[0]
        boxes = res.boxes
        if boxes is None or len(boxes) == 0:
            return detections

        for box in boxes:
            cls_id = int(box.cls[0].item())
            class_name: ObjectClass = CLASS_MAPPING.get(cls_id, "Person")
            confidence = float(box.conf[0].item())

            # Track ID extraction from ByteTrack; safe None if not yet assigned
            track_id: Optional[int] = None
            if box.id is not None and len(box.id) > 0:
                track_id = int(box.id[0].item())

            # Normalized bounding box coordinates [x1, y1, x2, y2]
            xyxyn = box.xyxyn[0].tolist()
            norm_bbox = [
                round(max(0.0, min(1.0, float(coord))), 4)
                for coord in xyxyn
            ]

            det = ThermalDetectionObject(
                id=f"det_{uuid.uuid4().hex[:8]}",
                sensor="thermal",
                class_name=class_name,
                class_id=cls_id,
                confidence=round(confidence, 4),
                track_id=track_id,
                bbox=norm_bbox,
                speed=None,
                zone=None,
                threat=False,
                threat_level=None,
                threat_reason=None,
                timestamp=timestamp
            )
            detections.append(det)

        return detections

    def reset_tracker(self):
        """
        Resets ByteTrack state for a new video or sequence.
        """
        if hasattr(self.model, "predictor") and self.model.predictor is not None:
            if hasattr(self.model.predictor, "trackers"):
                del self.model.predictor.trackers
