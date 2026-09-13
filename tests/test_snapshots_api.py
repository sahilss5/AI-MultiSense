import os
import io
import base64
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.config import settings

client = TestClient(app)

# 1x1 transparent PNG bytes
TINY_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)

def test_snapshot_upload_valid():
    b64_str = "data:image/png;base64," + base64.b64encode(TINY_PNG_BYTES).decode("utf-8")
    response = client.post("/api/snapshots", json={"image_data": b64_str})
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["filename"].startswith("thermal_snapshot_")
    assert data["filename"].endswith(".png")
    assert os.path.exists(data["filepath"])
    assert data["size_bytes"] == len(TINY_PNG_BYTES)

    # Clean up test file
    if os.path.exists(data["filepath"]):
        os.remove(data["filepath"])

def test_snapshot_upload_raw_base64():
    raw_b64 = base64.b64encode(TINY_PNG_BYTES).decode("utf-8")
    response = client.post("/api/snapshots", json={"image_data": raw_b64})
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert os.path.exists(data["filepath"])

    # Clean up
    if os.path.exists(data["filepath"]):
        os.remove(data["filepath"])

def test_snapshot_empty_rejected():
    response = client.post("/api/snapshots", json={"image_data": ""})
    assert response.status_code == 400

def test_snapshot_invalid_base64_rejected():
    response = client.post("/api/snapshots", json={"image_data": "not-valid-base64!!"})
    assert response.status_code == 400

def test_snapshot_non_png_rejected():
    fake_data = base64.b64encode(b"THIS_IS_NOT_A_PNG_FILE_CONTENT").decode("utf-8")
    response = client.post("/api/snapshots", json={"image_data": fake_data})
    assert response.status_code == 400
    assert "PNG" in response.json()["detail"]

def test_list_snapshots():
    # Upload one
    b64_str = "data:image/png;base64," + base64.b64encode(TINY_PNG_BYTES).decode("utf-8")
    post_res = client.post("/api/snapshots", json={"image_data": b64_str})
    assert post_res.status_code == 201
    saved_fn = post_res.json()["filename"]

    # List
    list_res = client.get("/api/snapshots")
    assert list_res.status_code == 200
    items = list_res.json()
    assert any(item["filename"] == saved_fn for item in items)

    # Clean up
    target = os.path.join(settings.SNAPSHOTS_DIR, saved_fn)
    if os.path.exists(target):
        os.remove(target)
