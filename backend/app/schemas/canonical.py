from pydantic import BaseModel, Field, ConfigDict
from typing import Literal, Optional, List

ObjectClass = Literal["Person", "Person_With_Bag", "Vehicle", "Animal", "Drone"]
ThreatLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]

class ThermalDetectionObject(BaseModel):
    id: str = Field(..., description="Unique detection identifier")
    sensor: Literal["thermal", "rgb"] = Field(default="thermal", description="Sensor type (always thermal in this build)")
    class_name: ObjectClass = Field(..., serialization_alias="class", validation_alias="class", description="Detected object class")
    class_id: Optional[int] = Field(default=None, description="Raw YOLO class ID (0: person, 1: vehicle, 2: animal, 3: drone, 4: person_with_bag)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detection confidence score")
    track_id: Optional[int] = Field(default=None, description="Unique tracking identifier")
    bbox: List[float] = Field(..., description="Bounding box [x1, y1, x2, y2] normalized 0-1")
    speed: Optional[float] = Field(default=None, description="Estimated vehicle speed in km/h")
    direction: Optional[str] = Field(default=None, description="Heading/direction string (e.g. NW, SE)")
    zone: Optional[str] = Field(default=None, description="Name of occupied restricted zone")
    threat: bool = Field(default=False, description="Threat flag")
    threat_level: Optional[ThreatLevel] = Field(default=None, description="Severity level of threat")
    threat_reason: Optional[str] = Field(default=None, description="Human-readable threat reason")
    duration_seconds: Optional[int] = Field(default=None, description="Tracking duration in seconds")
    trajectory: Optional[List[List[float]]] = Field(default=None, description="Recent image-based trajectory coordinates [[cx, cy], ...]")
    timestamp: str = Field(..., description="ISO-8601 timestamp string")

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "id": "det_1001",
                "sensor": "thermal",
                "class": "Person_With_Bag",
                "confidence": 0.92,
                "track_id": 42,
                "bbox": [0.25, 0.35, 0.40, 0.65],
                "speed": None,
                "zone": "Restricted Zone A",
                "threat": True,
                "threat_level": "HIGH",
                "threat_reason": "Person_With_Bag entered restricted area",
                "timestamp": "2026-08-08T23:45:00Z"
            }
        }
    )
