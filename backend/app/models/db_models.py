import json
from typing import Optional, List, ClassVar
from sqlmodel import SQLModel, Field

class ZoneModel(SQLModel, table=True):
    __tablename__: ClassVar[str] = "zones"
    
    id: str = Field(default="", primary_key=True)
    name: str = Field(default="")
    polygon_json: str = Field(default="[]")
    enabled: bool = Field(default=True)

    @property
    def polygon(self) -> List[List[float]]:
        try:
            return json.loads(self.polygon_json)
        except Exception:
            return []

    @polygon.setter
    def polygon(self, value: List[List[float]]):
        self.polygon_json = json.dumps(value)


class SettingsModel(SQLModel, table=True):
    __tablename__: ClassVar[str] = "settings"

    id: int = Field(default=1, primary_key=True)
    speed_threshold_kmh: float = Field(default=80.0)
    confidence_threshold: float = Field(default=0.5)
    tracking_iou_threshold: float = Field(default=0.3)
    thermal_camera_enabled: bool = Field(default=True)
    alert_sound_enabled: bool = Field(default=True)


class AlertModel(SQLModel, table=True):
    __tablename__: ClassVar[str] = "alerts"

    id: str = Field(default="", primary_key=True)
    timestamp: str = Field(default="")
    object_class: str = Field(default="")
    track_id: int = Field(default=0)
    threat_type: str = Field(default="")
    reason: str = Field(default="")
    speed: Optional[float] = Field(default=None)
    zone: Optional[str] = Field(default=None)
    severity: str = Field(default="HIGH")
    status: str = Field(default="ACTIVE")
    confidence: Optional[float] = Field(default=None)


class VideoRecordModel(SQLModel, table=True):
    __tablename__: ClassVar[str] = "video_records"

    id: str = Field(default="", primary_key=True)
    filename: str = Field(default="")
    filepath: str = Field(default="")
    file_size: int = Field(default=0)
    status: str = Field(default="ready")
    uploaded_at: str = Field(default="")
