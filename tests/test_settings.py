from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import init_db

def test_get_and_update_settings():
    init_db()
    with TestClient(app) as client:
        # GET settings
        res = client.get("/api/settings")
        assert res.status_code == 200
        data = res.json()
        assert "speed_threshold_kmh" in data

        # PUT settings update speed threshold to 65
        update_payload = {
            "speed_threshold_kmh": 65.0,
            "confidence_threshold": 0.6,
            "tracking_iou_threshold": 0.3,
            "thermal_camera_enabled": True,
            "alert_sound_enabled": False
        }
        res_put = client.put("/api/settings", json=update_payload)
        assert res_put.status_code == 200
        updated_data = res_put.json()
        assert updated_data["speed_threshold_kmh"] == 65.0
        assert updated_data["alert_sound_enabled"] is False

        # POST /api/settings/reset
        res_reset = client.post("/api/settings/reset")
        assert res_reset.status_code == 200
        reset_data = res_reset.json()
        assert reset_data["speed_threshold_kmh"] == 80.0
        assert reset_data["confidence_threshold"] == 0.50
        assert reset_data["tracking_iou_threshold"] == 0.45
        assert reset_data["alert_sound_enabled"] is True
