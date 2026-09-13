from typing import List
from backend.app.schemas.canonical import ThermalDetectionObject
from backend.app.schemas.domain import ZoneResponse
from ai.zones.zone_engine import ZoneEngine

class ThreatEngine:
    """
    Decoupled Threat Analysis Engine.
    Consumes canonical Section 6 schema objects + active zone configs + system settings.
    Applies explicit threat rules independent of detection/tracking internals.
    """

    def evaluate(
        self,
        objects: List[ThermalDetectionObject],
        zones: List[ZoneResponse],
        speed_threshold_kmh: float = 80.0
    ) -> List[ThermalDetectionObject]:
        evaluated_objects = []

        for obj in objects:
            # Check zone occupancy for all objects using ZoneEngine
            violated_zone = ZoneEngine.check_object_zone(obj.bbox, zones)
            obj.zone = violated_zone if violated_zone else None

            # Rule: Drone (Class 3) — Immediate Threat
            if obj.class_name == "Drone":
                obj.threat = True
                obj.threat_level = "HIGH"
                if violated_zone:
                    obj.threat_reason = f"Unauthorized drone detected in restricted area: {violated_zone}"
                else:
                    obj.threat_reason = "Unauthorized drone detected"

            # Rule: Person_With_Bag (Class 4) — Immediate Threat (+ Zone Violation Detail)
            elif obj.class_name == "Person_With_Bag":
                obj.threat = True
                obj.threat_level = "HIGH"
                if violated_zone:
                    obj.threat_reason = f"Person_With_Bag entered restricted area: {violated_zone}"
                else:
                    obj.threat_reason = "Person with bag detected"

            # Rule: Vehicle (Class 1) — Threat only if speed exceeds threshold
            elif obj.class_name == "Vehicle":
                if obj.speed is not None and obj.speed > speed_threshold_kmh:
                    obj.threat = True
                    obj.threat_level = "HIGH"
                    obj.threat_reason = f"Vehicle speed ({obj.speed} km/h) exceeded configured limit ({speed_threshold_kmh} km/h)"
                else:
                    obj.threat = False
                    obj.threat_level = None
                    obj.threat_reason = None

            # Rule: Person (Class 0) — Default Normal
            elif obj.class_name == "Person":
                obj.threat = False
                obj.threat_level = None
                obj.threat_reason = None

            # Rule: Animal (Class 2) — Default Normal
            elif obj.class_name == "Animal":
                obj.threat = False
                obj.threat_level = None
                obj.threat_reason = None

            # Fallback for any unknown class
            else:
                obj.threat = False
                obj.threat_level = None
                obj.threat_reason = None

            evaluated_objects.append(obj)

        return evaluated_objects
