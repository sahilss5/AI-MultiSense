import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import cv2
from ai.detection.yolo_detection import YOLODetectionService
from backend.app.schemas.canonical import ThermalDetectionObject


def main():
    print("=" * 65)
    print("STEP 2 VERIFICATION: YOLODetectionService + ByteTrack")
    print("=" * 65)

    model_path = os.path.abspath("models/thermal/best.pt")
    print(f"\n[1] Initializing YOLODetectionService with: {model_path}")
    service = YOLODetectionService(model_path=model_path)
    print(f"    Inference device:        {service.device}")
    print(f"    Confidence threshold:    {service.conf_threshold}")
    print(f"    Inference image size:    {service.imgsz}")
    print(f"    Tracker configuration:   {service.tracker_config}")
    print(f"    Model task:              {service.model.task}")
    print(f"    Model classes count:     {len(service.model.names)}")
    print(f"    Model classes mapping:   {service.model.names}")

    # -------------------------------------------------------------
    # PART A: Single Existing Thermal Image Detection Test
    # -------------------------------------------------------------
    single_img_path = r"D:\2ND TRAINED\2ND TRAINED IMP\FOR TESTING\person_with_bag_1490.jpg"
    print(f"\n[2] Reading single thermal image with OpenCV: {single_img_path}")
    assert os.path.exists(single_img_path), f"File not found: {single_img_path}"

    bgr_image = cv2.imread(single_img_path)
    assert bgr_image is not None, "Failed to decode image with cv2.imread"
    print(f"    Image dimensions: {bgr_image.shape[1]}x{bgr_image.shape[0]} (W x H)")

    print("\n[3] Running detection on single thermal image...")
    detections = service.detect_frame(bgr_image)
    print(f"    Total detected objects: {len(detections)}")

    for idx, det in enumerate(detections):
        assert isinstance(det, ThermalDetectionObject), "Object does not match ThermalDetectionObject"
        assert len(det.bbox) == 4, "BBox must have 4 coordinates"
        for coord in det.bbox:
            assert 0.0 <= coord <= 1.0, f"BBox coordinate {coord} outside normalized [0.0, 1.0]"

        print(f"\n    Detection #{idx + 1}:")
        print(f"      Class:           {det.class_name}")
        print(f"      Confidence:      {det.confidence}")
        print(f"      Normalized BBox: {det.bbox}")
        print(f"      Track ID:        {det.track_id}")
        print(f"      Sensor:          {det.sensor}")
        print(f"      Timestamp:       {det.timestamp}")

    # -------------------------------------------------------------
    # PART B: Two-Frame Sequential ByteTrack Tracking Test
    # -------------------------------------------------------------
    print("\n" + "=" * 65)
    print("[4] Performing Two-Frame Sequential Tracking Test with ByteTrack")
    print("=" * 65)

    frame1_path = os.path.join(os.path.dirname(__file__), "fixtures", "thermal_frame1.jpg")
    frame2_path = os.path.join(os.path.dirname(__file__), "fixtures", "thermal_frame2.jpg")

    if os.path.exists(frame1_path) and os.path.exists(frame2_path):
        frame1 = cv2.imread(frame1_path)
        frame2 = cv2.imread(frame2_path)
    else:
        video_path = r"D:\2ND TRAINED\2ND TRAINED IMP\VIDEO TESTING\thermal_test.mp4"
        cap = cv2.VideoCapture(video_path)
        assert cap.isOpened(), f"Could not open {video_path}"
        ret1, frame1 = cap.read()
        ret2, frame2 = cap.read()
        cap.release()

    assert frame1 is not None and frame2 is not None, "Failed to load consecutive test frames"
    print(f"    Frame 1 resolution: {frame1.shape[1]}x{frame1.shape[0]}")
    print(f"    Frame 2 resolution: {frame2.shape[1]}x{frame2.shape[0]}")

    # Reset tracker before starting fresh sequence
    service.reset_tracker()

    print("\n--- Frame 1 Processing ---")
    f1_detections = service.detect_frame(frame1, persist=True)
    print(f"    Frame 1 detections count: {len(f1_detections)}")
    f1_tracks = []
    for d in f1_detections:
        f1_tracks.append((d.track_id, d.class_name, d.confidence, d.bbox))
        print(f"      [F1] Track ID: {d.track_id} | Class: {d.class_name} | Conf: {d.confidence:.4f} | BBox: {d.bbox}")

    print("\n--- Frame 2 Processing (Sequential with persist=True) ---")
    f2_detections = service.detect_frame(frame2, persist=True)
    print(f"    Frame 2 detections count: {len(f2_detections)}")
    f2_tracks = []
    for d in f2_detections:
        f2_tracks.append((d.track_id, d.class_name, d.confidence, d.bbox))
        print(f"      [F2] Track ID: {d.track_id} | Class: {d.class_name} | Conf: {d.confidence:.4f} | BBox: {d.bbox}")

    f1_ids = {t[0] for t in f1_tracks if t[0] is not None}
    f2_ids = {t[0] for t in f2_tracks if t[0] is not None}
    common_ids = f1_ids.intersection(f2_ids)

    print(f"\n[5] ByteTrack Association Evaluation:")
    print(f"    Frame 1 Track IDs: {f1_ids}")
    print(f"    Frame 2 Track IDs: {f2_ids}")
    print(f"    Persistent Track IDs across frames: {common_ids}")

    has_valid_tracks = len(f1_ids) > 0 and len(f2_ids) > 0
    has_continuity = len(common_ids) > 0
    print(f"    ByteTrack active: {has_valid_tracks}")
    print(f"    Track ID persistence across consecutive frames: {has_continuity}")

    assert has_valid_tracks, "ByteTrack did not produce track IDs!"
    assert has_continuity, "ByteTrack did not persist track IDs across consecutive frames!"
    print("\n>>> ALL TESTS PASSED SUCCESSFULLY! ByteTrack verified working. <<<")


def test_yolo_detection_and_bytetrack():
    main()


if __name__ == "__main__":
    main()
