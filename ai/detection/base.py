from abc import ABC, abstractmethod
from typing import List, Any, Optional
from backend.app.schemas.canonical import ThermalDetectionObject

class YOLODetectionInterface(ABC):
    """
    Abstract interface for Thermal YOLO Detection Services.
    Integrates raw camera/video frame input and outputs standardized Section 6 Canonical Schema.
    """

    @abstractmethod
    def detect_frame(self, frame_input: Any = None, timestamp: Optional[str] = None) -> List[ThermalDetectionObject]:
        """
        Process a single frame and return a list of standardized ThermalDetectionObject.
        """
        pass
