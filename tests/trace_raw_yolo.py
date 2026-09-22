import cv2
import ultralytics
import sys
import os

video_path = r"D:\MAJOR PROJECT DEMO\THERMAL_EXAM_DEMO\VIDEO\thermal_exam_demo_20s.mp4"
if not os.path.exists(video_path):
    print(f"Error: Video not found at {video_path}")
    sys.exit(1)

model_path = r"models/thermal/best.pt"
model = ultralytics.YOLO(model_path)
print("Model loaded. model.names:", model.names)

cap = cv2.VideoCapture(video_path)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps = cap.get(cv2.CAP_PROP_FPS)
print(f"Video total frames: {total_frames}, FPS: {fps}")

seen_tracks = {}
frame_idx = 0

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    
    # Run YOLO track with ByteTrack
    results = model.track(source=frame, conf=0.40, imgsz=640, tracker="bytetrack.yaml", persist=True, verbose=False)
    if results and len(results) > 0:
        res = results[0]
        boxes = res.boxes
        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                track_id = int(box.id[0].item()) if box.id is not None and len(box.id) > 0 else None
                model_class_name = model.names[cls_id]
                
                if track_id is not None:
                    if track_id not in seen_tracks:
                        seen_tracks[track_id] = {
                            "first_frame": frame_idx,
                            "cls_id": cls_id,
                            "class_name": model_class_name,
                            "max_conf": conf,
                            "conf_sum": conf,
                            "count": 1,
                            "classes_seen": {cls_id: 1}
                        }
                    else:
                        st = seen_tracks[track_id]
                        st["count"] += 1
                        st["conf_sum"] += conf
                        if conf > st["max_conf"]:
                            st["max_conf"] = conf
                        st["classes_seen"][cls_id] = st["classes_seen"].get(cls_id, 0) + 1
    frame_idx += 1

cap.release()

print("\n==================================================")
print("RAW YOLO & BYTETRACK DETECTION TRACE SUMMARY")
print("==================================================")
print(f"Total processed frames: {frame_idx}")
print(f"Unique tracks detected: {len(seen_tracks)}")

for tid in sorted(seen_tracks.keys()):
    info = seen_tracks[tid]
    avg_conf = info["conf_sum"] / info["count"]
    classes_str = ", ".join([f"{model.names[cid]}: {cnt}" for cid, cnt in info["classes_seen"].items()])
    print(f"Track T-{tid}: Primary Class={info['class_name']} (ID {info['cls_id']}) | Max Conf={info['max_conf']:.2f} | Avg Conf={avg_conf:.2f} | Detections={info['count']} | Seen Classes=[{classes_str}]")
