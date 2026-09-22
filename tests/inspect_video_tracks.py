import cv2
import ultralytics

video_path = r"D:\MAJOR PROJECT DEMO\THERMAL_EXAM_DEMO\VIDEO\thermal_exam_demo_20s.mp4"
model = ultralytics.YOLO("models/thermal/best.pt")
cap = cv2.VideoCapture(video_path)

frame_idx = 0
track_details = {}

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    
    res = model.track(source=frame, conf=0.40, imgsz=640, tracker="bytetrack.yaml", persist=True, verbose=False)
    if res and len(res) > 0 and res[0].boxes is not None:
        for box in res[0].boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            track_id = int(box.id[0].item()) if box.id is not None and len(box.id) > 0 else None
            xyxy = [round(float(c), 1) for c in box.xyxy[0].tolist()]
            
            if track_id is not None:
                if track_id not in track_details:
                    track_details[track_id] = {
                        "class_id": cls_id,
                        "class_name": model.names[cls_id],
                        "first_frame": frame_idx,
                        "last_frame": frame_idx,
                        "conf_samples": [conf],
                        "bbox_sample": xyxy
                    }
                else:
                    td = track_details[track_id]
                    td["last_frame"] = frame_idx
                    td["conf_samples"].append(conf)
    frame_idx += 1

cap.release()

print("SUMMARY OF ALL TRACKS IN THERMAL EXAM DEMO VIDEO:")
print("-" * 75)
for tid in sorted(track_details.keys()):
    td = track_details[tid]
    avg_conf = sum(td["conf_samples"]) / len(td["conf_samples"])
    print(f"Track T-{tid:3d}: Class={td['class_name']:16s} (ID {td['class_id']}) | Frames {td['first_frame']:3d}-{td['last_frame']:3d} ({len(td['conf_samples']):2d} frames) | Avg Conf={avg_conf:.2f} | BBox={td['bbox_sample']}")
