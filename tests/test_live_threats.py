import asyncio
import httpx
import websockets
import json
import os

API_BASE = "http://127.0.0.1:8000/api"
WS_URL = "ws://127.0.0.1:8000/ws/live"
VIDEO_PATH = r"D:\2ND TRAINED\2ND TRAINED IMP\VIDEO TESTING\combined_thermal_test.mp4"
if not os.path.exists(VIDEO_PATH):
    VIDEO_PATH = r"D:\MAJOR PROJECT DEMO\THERMAL_EXAM_DEMO\VIDEO\thermal_exam_demo_20s.mp4"


async def _run_test_live_threats_and_alerts():
    print("=" * 65)
    print("TEST: LIVE THREAT ENGINE & ALERT PERSISTENCE")
    print("=" * 65)

    assert os.path.exists(VIDEO_PATH), f"Video not found at: {VIDEO_PATH}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Clear previous alerts
        clear_res = await client.delete(f"{API_BASE}/alerts/history")
        print(f"[1] Cleared alert history: {clear_res.json()}")

        # 2. Upload video
        print(f"[2] Uploading video: {VIDEO_PATH}")
        with open(VIDEO_PATH, "rb") as f:
            upload_res = await client.post(f"{API_BASE}/video/upload", files={"file": ("thermal_test.mp4", f, "video/mp4")})
        assert upload_res.status_code == 200
        vid_id = upload_res.json()["video_id"]
        print(f"    Assigned video_id: {vid_id}")

        # 3. Connect to WebSocket
        print(f"[3] Connecting to live WebSocket: {WS_URL}")
        received_threats = []

        async def read_ws():
            async with websockets.connect(WS_URL) as ws:
                while len(received_threats) < 15:
                    msg = await asyncio.wait_for(ws.recv(), timeout=10.0)
                    data = json.loads(msg)
                    for obj in data:
                        if obj.get("threat"):
                            received_threats.append(obj)

        ws_task = asyncio.create_task(read_ws())
        await asyncio.sleep(0.3)

        # 4. Start analysis
        print("[4] Starting video analysis...")
        start_res = await client.post(f"{API_BASE}/video/start", json={"video_id": vid_id})
        assert start_res.status_code == 200

        try:
            await asyncio.wait_for(ws_task, timeout=12.0)
        except asyncio.TimeoutError:
            pass

        print(f"\n[5] WebSocket Threat Inspection:")
        print(f"    Received {len(received_threats)} threat objects over WebSocket stream.")
        assert len(received_threats) > 0, "Expected threat objects over WebSocket!"

        sample = received_threats[0]
        print("\n    Example Real Threat Object on /ws/live:")
        print(json.dumps(sample, indent=2))

        assert sample["class"] == "Drone"
        assert sample["threat"] is True
        assert sample["threat_level"] == "HIGH"
        assert "unauthorized drone detected" in sample["threat_reason"].lower()

        # Stop analysis
        await client.post(f"{API_BASE}/video/stop", json={"video_id": vid_id})
        print("\n[6] Stopped video analysis.")

        # 5. Check SQLite Alerts & Deduplication
        alerts_res = await client.get(f"{API_BASE}/alerts/history")
        assert alerts_res.status_code == 200
        alerts = alerts_res.json()
        print(f"\n[7] SQLite Alert Database Records:")
        print(f"    Total recorded alerts: {len(alerts)}")

        for a in alerts:
            print(f"    -> Alert ID: {a['id']} | Object: {a['object_class']} | Track: {a['track_id']} | Type: {a['threat_type']} | Severity: {a['severity']} | Reason: {a['reason']}")

        assert len(alerts) >= 1, "At least 1 alert should be recorded in SQLite"
        # Deduplication check: 15+ threat frames were processed, but only 1-3 debounced alerts should exist
        assert len(alerts) <= 3, f"Deduplication failed! Too many rows ({len(alerts)}) in database."
        print(f"    Deduplication verified: {len(received_threats)} frames produced only {len(alerts)} database alert(s).")

    print("\n" + "=" * 65)
    print(">>> ALL TESTS PASSED: THREAT RULES & ALERTS FULLY VERIFIED! <<<")
    print("=" * 65)


def test_live_threats():
    asyncio.run(_run_test_live_threats_and_alerts())


if __name__ == "__main__":
    test_live_threats()
