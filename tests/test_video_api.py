import io
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import init_db

def test_video_upload_validation():
    init_db()
    with TestClient(app) as client:
        # Test invalid file format (.txt)
        files = {"file": ("test.txt", io.BytesIO(b"fake text content"), "text/plain")}
        res = client.post("/api/video/upload", files=files)
        assert res.status_code == 400
        assert "Invalid video format" in res.json()["detail"]

        # Test valid file format (.mp4)
        valid_files = {"file": ("sample.mp4", io.BytesIO(b"fake mp4 video stream bytes"), "video/mp4")}
        res_valid = client.post("/api/video/upload", files=valid_files)
        assert res_valid.status_code == 200
        data = res_valid.json()
        assert data["status"] == "ready"
        assert "video_id" in data
        video_id = data["video_id"]

        # Test Start analysis
        res_start = client.post("/api/video/start", json={"video_id": video_id})
        assert res_start.status_code == 200
        assert res_start.json()["status"] == "processing"

        # Test Stop analysis
        res_stop = client.post("/api/video/stop", json={"video_id": video_id})
        assert res_stop.status_code == 200
        assert res_stop.json()["status"] == "stopped"

        # Test Status endpoint
        res_status = client.get("/api/video/status")
        assert res_status.status_code == 200
        assert res_status.json()["status"] == "stopped"

        # Test DELETE /api/video/{video_id}
        res_del = client.delete(f"/api/video/{video_id}")
        assert res_del.status_code == 200
        del_data = res_del.json()
        assert del_data["status"] == "no_video_selected"
        assert del_data["video_id"] is None

        # Verify status is now no_video_selected
        res_status_after = client.get("/api/video/status")
        assert res_status_after.status_code == 200
        assert res_status_after.json()["status"] == "no_video_selected"

        # Test POST /api/video/clear
        res_clear = client.post("/api/video/clear")
        assert res_clear.status_code == 200
        assert res_clear.json()["status"] == "no_video_selected"
