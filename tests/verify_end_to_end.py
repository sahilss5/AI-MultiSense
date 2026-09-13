import time
import json
import io
import asyncio
import websockets
import urllib.request
import urllib.parse

BASE_URL = "http://127.0.0.1:8000/api"
WS_URL = "ws://127.0.0.1:8000/ws/live"

def test_http_get(endpoint):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        return json.loads(resp.read().decode())

def test_http_post_json(endpoint, payload):
    url = f"{BASE_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        return json.loads(resp.read().decode())

def test_video_upload():
    url = f"{BASE_URL}/video/upload"
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="test_thermal_clip.mp4"\r\n'
        "Content-Type: video/mp4\r\n\r\n"
        "FAKE THERMAL VIDEO CONTENT BYTES FOR TESTING\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        return json.loads(resp.read().decode())

async def test_websocket_stream():
    async with websockets.connect(WS_URL) as ws:
        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(msg)
        assert isinstance(data, list)
        print(f"  [OK] WebSocket frame received: {len(data)} objects stream frame")

def run_all_verifications():
    print("\n--- RUNNING SYSTEM END-TO-END VERIFICATION ---")

    # 1. Status
    status = test_http_get("/status")
    print(f"  [OK] GET /api/status: Mode={status['analysis_mode']}, Demo={status['is_demo_mode']}")

    # 2. Upload Video
    upload_res = test_video_upload()
    video_id = upload_res["video_id"]
    assert upload_res["status"] == "ready"
    print(f"  [OK] POST /api/video/upload: video_id={video_id}, status={upload_res['status']}")

    # 3. Start Analysis
    start_res = test_http_post_json("/video/start", {"video_id": video_id})
    assert start_res["status"] == "processing"
    print(f"  [OK] POST /api/video/start: status={start_res['status']}")

    # 4. WebSocket stream test
    time.sleep(0.5)
    asyncio.run(test_websocket_stream())

    # 5. Detections & Threats REST
    dets = test_http_get("/detections")
    print(f"  [OK] GET /api/detections: {len(dets)} detection objects on stream")

    # 6. Settings GET & PUT
    settings_data = test_http_get("/settings")
    assert "speed_threshold_kmh" in settings_data
    print(f"  [OK] GET /api/settings: Speed threshold = {settings_data['speed_threshold_kmh']} km/h")

    # 7. Stop Analysis
    stop_res = test_http_post_json("/video/stop", {"video_id": video_id})
    assert stop_res["status"] == "stopped"
    print(f"  [OK] POST /api/video/stop: status={stop_res['status']}")

    # 8. Check Video status
    vid_stat = test_http_get("/video/status")
    assert vid_stat["status"] == "stopped"
    print(f"  [OK] GET /api/video/status: final status={vid_stat['status']}")

    print("\n[SUCCESS] All end-to-end verification checks passed flawlessly!\n")

if __name__ == "__main__":
    run_all_verifications()
