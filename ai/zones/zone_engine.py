from typing import List, Tuple, Optional
from backend.app.schemas.domain import ZoneResponse

class ZoneEngine:
    """
    Zone Engine implementing Ray-Casting algorithm for 2D Point-in-Polygon validation.
    Handles normalized [0.0, 1.0] relative coordinates across resolution changes.
    """

    @staticmethod
    def is_point_in_polygon(point: Tuple[float, float], polygon: List[List[float]]) -> bool:
        """
        Ray-casting algorithm to test if point (x, y) lies inside polygon.
        """
        if not polygon or len(polygon) < 3:
            return False

        x, y = point
        n = len(polygon)
        inside = False

        p1x, p1y = polygon[0]
        for i in range(n + 1):
            p2x, p2y = polygon[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y

        return inside

    @classmethod
    def check_object_zone(cls, bbox: List[float], zones: List[ZoneResponse]) -> Optional[str]:
        """
        Checks if object centroid lies within any enabled restricted zone.
        Returns the zone name if violated, else None.
        """
        if not bbox or len(bbox) < 4:
            return None

        # Compute centroid of bounding box [x1, y1, x2, y2]
        cx = (bbox[0] + bbox[2]) / 2.0
        cy = (bbox[1] + bbox[3]) / 2.0

        for zone in zones:
            if zone.enabled and cls.is_point_in_polygon((cx, cy), zone.polygon):
                return zone.name

        return None
