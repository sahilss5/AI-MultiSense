import cv2
import ultralytics
import sys

video_path = "data/uploads/vid_b5f10fb4.mp4"
model = ultralytics.YOLO("models/thermal/best.pt")
cap = cv2.VideoCapture(video_path)
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"Tracking {video_path}, total frames={total}")

seen = {}
idx = 0
while cap.isOpened():
    ret, f = cap.read()
    if not ret:
        break
    res = model.track(f, conf=0.40, imgsz=640, tracker="bytetrack.yaml", persist=True, verbose=False)
    if res and len(res) > 0 and res[0].boxes is not None:
        for b in res[0].boxes:
            cid = int(b.cls[0].item())
            tid = int(b.id[0].item()) if b.id is not None and len(b.id) > 0 else None
            conf = float(b.conf[0].item())
            if tid is not None:
                if tid not in seen:
                    seen[tid] = {"cid": cid, "name": model.names[cid], "conf": conf, "count": 1, "classes": {cid: 1}}
                else:
                    seen[tid]["count"] += 1
                    seen[tid]["classes"][cid] = seen[tid]["classes"].get(cid, 0) + 1
                    if conf > seen[tid]["conf"]:
                        seen[tid]["conf"] = conf
    idx += 1
cap.release()

print(f"Unique tracks: {len(seen)}")
for tid in sorted(seen.keys()):
    s = seen[tid]
    c_str = ", ".join([f"{model.names[k]}: {v}" for k, v in s["classes"].items()])
    print(f"Track T-{tid}: Primary={s['name']} (ID {s['cid']}) | max_conf={s['conf']:.2f} | count={s['count']} | seen=[{c_str}]")
