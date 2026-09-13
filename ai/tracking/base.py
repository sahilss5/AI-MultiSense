from abc import ABC, abstractmethod
from typing import List
from backend.app.schemas.canonical import ThermalDetectionObject

class TrackingInterface(ABC):
    """
    Abstract interface for Multi-Object Tracking (ByteTrack / BoT-SORT).
    Maintains persistent track IDs and updates movement vectors across frames.
    """

    @abstractmethod
    def update_tracks(self, detections: List[ThermalDetectionObject]) -> List[ThermalDetectionObject]:
        """
        Assign persistent track IDs and estimated trajectory values to detection objects.
        """
        pass
