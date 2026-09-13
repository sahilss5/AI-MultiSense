from abc import ABC, abstractmethod
from typing import List, Optional

class SpeedEstimationInterface(ABC):
    """
    Interface stub for future scene-calibrated Speed Estimation Service.
    Will utilize camera extrinsic/intrinsic matrix + pixel displacement over time.
    """

    @abstractmethod
    def estimate_speed(self, track_id: int, bbox_history: List[List[float]], fps: float = 30.0) -> Optional[float]:
        pass

class MockSpeedEstimationService(SpeedEstimationInterface):
    """
    Mock implementation of speed estimation.
    """

    def estimate_speed(self, track_id: int, bbox_history: List[List[float]], fps: float = 30.0) -> Optional[float]:
        # Deferred: real point-in-polygon & camera speed calibration pending live tracking scene depth coordinates
        if not bbox_history or len(bbox_history) < 2:
            return None
        # Mock calculation placeholder
        return round(75.0 + (track_id % 20), 1)
