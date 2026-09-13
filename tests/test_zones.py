from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import init_db
from ai.zones.zone_engine import ZoneEngine
from backend.app.schemas.domain import ZoneResponse

def test_ray_casting_point_in_polygon():
    square = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]
    assert ZoneEngine.is_point_in_polygon((0.5, 0.5), square) is True
    assert ZoneEngine.is_point_in_polygon((1.5, 0.5), square) is False

def test_check_object_zone():
    zones = [
        ZoneResponse(id="z1", name="North Zone", polygon=[[0.0, 0.0], [0.5, 0.0], [0.5, 0.5], [0.0, 0.5]], enabled=True),
        ZoneResponse(id="z2", name="Disabled Zone", polygon=[[0.5, 0.5], [1.0, 0.5], [1.0, 1.0], [0.5, 1.0]], enabled=False)
    ]

    # Inside North Zone
    assert ZoneEngine.check_object_zone([0.1, 0.1, 0.3, 0.3], zones) == "North Zone"
    # Inside Disabled Zone -> should return None
    assert ZoneEngine.check_object_zone([0.6, 0.6, 0.8, 0.8], zones) is None

def test_zone_crud_persistence():
    init_db()
    with TestClient(app) as client:
        # 1. Baseline GET
        res_initial = client.get("/api/zones")
        assert res_initial.status_code == 200
        initial_zones = res_initial.json()
        initial_count = len(initial_zones)
        initial_ids = {z["id"] for z in initial_zones}

        # 2. CREATE a new zone
        create_payload = {
            "name": "Automated Test Zone Delta",
            "polygon": [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4]],
            "enabled": True
        }
        res_create = client.post("/api/zones", json=create_payload)
        assert res_create.status_code == 201
        created_zone = res_create.json()
        created_id = created_zone["id"]
        assert created_id.startswith("zone_")
        assert created_zone["name"] == "Automated Test Zone Delta"
        assert created_zone["enabled"] is True

        # 3. GET after CREATE - verify it persists
        res_after_create = client.get("/api/zones")
        assert res_after_create.status_code == 200
        zones_after_create = res_after_create.json()
        assert len(zones_after_create) == initial_count + 1
        ids_after_create = {z["id"] for z in zones_after_create}
        assert created_id in ids_after_create

        # 4. UPDATE / DEACTIVATE zone
        res_deactivate = client.put(f"/api/zones/{created_id}", json={"enabled": False})
        assert res_deactivate.status_code == 200
        assert res_deactivate.json()["enabled"] is False

        # Verify deactivation persisted in GET
        res_get_deactivated = client.get("/api/zones")
        deactivated_zone = next(z for z in res_get_deactivated.json() if z["id"] == created_id)
        assert deactivated_zone["enabled"] is False

        # 5. DELETE the created zone
        res_delete = client.delete(f"/api/zones/{created_id}")
        assert res_delete.status_code == 204

        # 6. GET after DELETE - must confirm created zone is ABSENT
        res_after_delete = client.get("/api/zones")
        assert res_after_delete.status_code == 200
        zones_after_delete = res_after_delete.json()
        assert len(zones_after_delete) == initial_count
        remaining_ids = {z["id"] for z in zones_after_delete}
        assert created_id not in remaining_ids

        # 7. Confirm original baseline zones remain untouched
        for orig_id in initial_ids:
            assert orig_id in remaining_ids

        # 8. Deleting again should return 404
        res_delete_again = client.delete(f"/api/zones/{created_id}")
        assert res_delete_again.status_code == 404
