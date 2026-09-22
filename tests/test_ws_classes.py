import asyncio
import json
import websockets
import httpx

async def run_ws_check():
    # 1. Start video analysis on active video
    async with httpx.AsyncClient() as client:
        status_res = await client.get("http://127.0.0.1:8000/api/video/status")
        video_id = status_res.json().get("video_id")
        print("Active video_id:", video_id)
        if not video_id:
            print("No active video. Exiting.")
            return

        # Start analysis
        await client.post("http://127.0.0.1:8000/api/video/start", json={"video_id": video_id})
        print("Started video analysis for:", video_id)

    # 2. Connect to WebSocket
    ws_url = "ws://127.0.0.1:8000/ws/live"
    classes_received = set()
    track_class_map = {}

    print(f"Connecting to {ws_url}...")
    async with websockets.connect(ws_url) as ws:
        # Listen for 22 seconds
        start_time = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start_time < 22:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                dets = json.loads(msg)
                for d in dets:
                    cls_name = d.get("class")
                    cls_id = d.get("class_id")
                    tid = d.get("track_id")
                    conf = d.get("confidence")
                    threat = d.get("threat")
                    if cls_name:
                        classes_received.add(cls_name)
                    if tid is not None and tid not in track_class_map:
                        track_class_map[tid] = {
                            "class": cls_name,
                            "class_id": cls_id,
                            "confidence": conf,
                            "threat": threat
                        }
            except asyncio.TimeoutError:
                pass
            except Exception as e:
                print("WS exception:", e)
                break

    print("\n==================================================")
    print("WEBSOCKET CLASSES RECEIVED DIRECTLY FROM BACKEND")
    print("==================================================")
    print("Unique classes received:", classes_received)
    print("\nUnique Tracks Sample:")
    for tid, info in sorted(track_class_map.items()):
        print(f"Track T-{tid:3d}: class={info['class']:16s} | class_id={str(info['class_id']):4s} | conf={info['confidence']} | threat={info['threat']}")

if __name__ == "__main__":
    asyncio.run(run_ws_check())
