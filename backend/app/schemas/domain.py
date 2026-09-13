from pydantic import BaseModel, Field
from typing import List, Optional, Literal

# Zone Schemas
class ZoneBase(BaseModel):
    name: str
    polygon: List[List[float]] = Field(..., description="List of [x, y] normalized coordinates [0.0 - 1.0]")
    enabled: bool = True

class ZoneCreate(ZoneBase):
    pass

class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    polygon: Optional[List[List[float]]] = None
    enabled: Optional[bool] = None

class ZoneResponse(ZoneBase):
    id: str

# Settings Schemas
class SystemSettings(BaseModel):
    speed_threshold_kmh: float = 80.0
    confidence_threshold: float = 0.5
    tracking_iou_threshold: float = 0.3
    thermal_camera_enabled: bool = True
    alert_sound_enabled: bool = True

# Video Status & Analysis Schemas
VideoStatusType = Literal["no_video_selected", "uploaded", "ready", "processing", "paused", "stopped", "completed", "error"]
AnalysisModeType = Literal["Demo Mode", "AI Inference Active"]

class VideoUploadResponse(BaseModel):
    video_id: str
    filename: str
    status: VideoStatusType

class VideoControlRequest(BaseModel):
    video_id: str

class VideoStatusResponse(BaseModel):
    video_id: Optional[str] = None
    filename: Optional[str] = None
    status: VideoStatusType = "no_video_selected"
    analysis_mode: AnalysisModeType = "Demo Mode"
    session_start_time: Optional[str] = None

# System Status Response
class SystemStatusResponse(BaseModel):
    is_demo_mode: bool
    analysis_mode: AnalysisModeType
    thermal_model_path: str
    model_status: Literal["READY", "NOT CONNECTED"]
    thermal_camera_enabled: bool
    active_tracks: int
    active_threats: int
    fps: float
    total_detections: int
    device: Optional[str] = "CUDA"
    confidence_threshold: Optional[float] = 0.40
    supported_classes: Optional[List[str]] = [
        "Person",
        "Vehicle",
        "Animal",
        "Drone",
        "Person_With_Bag"
    ]

# Analytics Response
class ClassCount(BaseModel):
    class_name: str
    count: int

class AnalyticsResponse(BaseModel):
    total_detections: int
    total_threats: int
    zone_violations: int
    high_speed_violations: int
    average_vehicle_speed: float
    max_vehicle_speed: float
    class_distribution: List[ClassCount]
    threat_trend: List[dict]
    active_tracks: Optional[int] = 0
    drone_count: Optional[int] = 0
    person_with_bag_count: Optional[int] = 0
    person_count: Optional[int] = 0
    vehicle_count: Optional[int] = 0
    animal_count: Optional[int] = 0
    confidence_distribution: Optional[List[dict]] = None
    average_confidence: Optional[float] = None

# Snapshot Schemas
class SnapshotCreateRequest(BaseModel):
    image_data: str = Field(..., description="Base64 encoded PNG image data (with or without data URL prefix)")

class SnapshotResponse(BaseModel):
    success: bool
    filename: str
    filepath: str
    timestamp: str
    size_bytes: int

class SnapshotListItem(BaseModel):
    filename: str
    filepath: str
    timestamp: str
    size_bytes: int

# Alert Status Schemas
class AlertStatusUpdate(BaseModel):
    status: Literal["ACTIVE", "ACKNOWLEDGED", "RESOLVED"]
