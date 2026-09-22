import os
import sys
import json
import time
import asyncio
import httpx
import websockets

API_BASE = "http://127.0.0.1:8000/api"
WS_URL = "ws://127.0.0.1:8000/ws/live"
TEST_VIDEO_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "combined_thermal_test.mp4"))


async def run_pipeline_tests():
    print("=" * 65)
    print("STEP 3 VERIFICATION: REAL VIDEO PIPELINE TEST")
    print("=" * 65)

    assert os.path.exists(TEST_VIDEO_PATH), f"Test video not found at: {TEST_VIDEO_PATH}"
    file_size_mb = os.path.getsize(TEST_VIDEO_PATH) / (1024 * 1024)
    print(f"\n[TEST 1] Testing Video Upload: {TEST_VIDEO_PATH} ({file_size_mb:.2f} MB)")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Upload Video
        with open(TEST_VIDEO_PATH, "rb") as f:
            files = {"file": ("combined_thermal_test.mp4", f, "video/mp4")}
            upload_res = await client.post(f"{API_BASE}/video/upload", files=files)

        assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
        upload_data = upload_res.json()
        video_id = upload_data["video_id"]
        print(f"  -> Upload successful! Assigned video_id: {video_id}")
        print(f"  -> Initial status: {upload_data['status']}")

        # 2. Check System Status
        status_res = await client.get(f"{API_BASE}/status")
        status_data = status_res.json()
        print(f"\n[STATUS] System status mode: {status_data['analysis_mode']}")
        print(f"  -> Model status: {status_data['model_status']}")
        print(f"  -> Model path: {status_data['thermal_model_path']}")
        assert status_data["analysis_mode"] == "AI Inference Active"

        # 3. Connect WebSocket Listener before starting
        print(f"\n[TEST 5 & 6] Connecting to live WebSocket: {WS_URL}")
        received_frames = []

        async def listen_ws():
            try:
                async with websockets.connect(WS_URL) as ws:
                    print("  -> WebSocket connection established.")
                    while len(received_frames) < 15:
                        msg = await asyncio.wait_for(ws.recv(), timeout=10.0)
                        data = json.loads(msg)
                        received_frames.append(data)
            except asyncio.TimeoutError:
                print("  -> WebSocket listener timed out.")
            except Exception as e:
                print(f"  -> WebSocket listener notice: {e}")

        # Start WebSocket listener in background
        ws_task = asyncio.create_task(listen_ws())

        # Give socket 300ms to register
        await asyncio.sleep(0.3)

        # 4. Start Video Analysis
        print(f"\n[TEST 2 & 3 & 4] Starting Real Video Analysis (POST /api/video/start)")
        start_res = await client.post(f"{API_BASE}/video/start", json={"video_id": video_id})
        assert start_res.status_code == 200, f"Start failed: {start_res.text}"
        start_data = start_res.json()
        print(f"  -> Start response status: {start_data['status']}")
        assert start_data["status"] == "processing"

        # Wait for WebSocket listener to capture frames
        print("  -> Streaming and collecting live frames over WebSocket...")
        try:
            await asyncio.wait_for(ws_task, timeout=12.0)
        except asyncio.TimeoutError:
            pass

        print(f"\n[TEST 5 RESULT] Received {len(received_frames)} frame payloads over WebSocket!")
        assert len(received_frames) > 0, "No frames received over WebSocket!"

        # Inspect real detections
        real_detections_found = 0
        real_tracks_found = set()
        classes_found = set()
        sample_det = None

        for frame_objs in received_frames:
            for obj in frame_objs:
                real_detections_found += 1
                cls = obj.get("class")
                classes_found.add(cls)
                tid = obj.get("track_id")
                if tid is not None:
                    real_tracks_found.add(tid)
                if sample_det is None:
                    sample_det = obj

        print(f"  -> Total detection objects collected: {real_detections_found}")
        print(f"  -> Unique classes detected in real video: {classes_found}")
        print(f"  -> Unique Track IDs assigned by ByteTrack: {real_tracks_found}")
        print(f"\n[TEST 4 & 6 RESULT] Example Real Detection Object:")
        print(json.dumps(sample_det, indent=2))

        assert sample_det is not None, "Did not get any real detection objects"
        assert sample_det["sensor"] == "thermal"
        assert 0.0 <= sample_det["confidence"] <= 1.0
        assert len(sample_det["bbox"]) == 4

        # 5. Check video status during / after processing
        cur_status_res = await client.get(f"{API_BASE}/video/status")
        cur_status = cur_status_res.json()["status"]
        print(f"\n[TEST 7] Current video status: {cur_status}")

        # 6. Test STOP functionality (TEST 8)
        print(f"\n[TEST 8] Testing STOP functionality (POST /api/video/stop)")
        stop_res = await client.post(f"{API_BASE}/video/stop", json={"video_id": video_id})
        assert stop_res.status_code == 200, f"Stop failed: {stop_res.text}"
        stop_data = stop_res.json()
        print(f"  -> Stop response status: {stop_data['status']}")
        assert stop_data["status"] == "stopped"

        # Verify status endpoint reflects stopped
        final_status_res = await client.get(f"{API_BASE}/video/status")
        assert final_status_res.json()["status"] == "stopped"
        print(f"  -> Verified GET /api/video/status is 'stopped'")

    print("\n" + "=" * 65)
    print(">>> ALL STEP 3 TESTS PASSED: REAL VIDEO PIPELINE VERIFIED! <<<")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(run_pipeline_tests())
