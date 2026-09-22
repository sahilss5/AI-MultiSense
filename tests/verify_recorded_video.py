import cv2
import numpy as np
import os
import sys

def verify_video(video_path: str):
    print(f"Inspecting recorded video at: {video_path}")
    if not os.path.exists(video_path):
        print(f"Error: File does not exist: {video_path}")
        sys.exit(1)

    file_size = os.path.getsize(video_path)
    print(f"File size: {file_size} bytes ({file_size / (1024*1024):.2f} MB)")
    if file_size <= 0:
        print("Error: Video file is empty (0 bytes).")
        sys.exit(1)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("Error: cv2.VideoCapture failed to open the recorded video file!")
        sys.exit(1)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"Video Properties:")
    print(f"  Resolution: {width} x {height}")
    print(f"  FPS: {fps:.1f}")
    print(f"  Total Frames: {total_frames}")
    print(f"  Duration: {duration:.2f} seconds")

    frames_read = 0
    non_black_frames = 0
    overlay_detected_frames = 0

    saved_frames = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames_read += 1

        # Check if frame is non-black
        mean_intensity = np.mean(frame)
        if mean_intensity > 5.0:
            non_black_frames += 1

        # Check for presence of colored overlay elements (bounding boxes, threat badges, cyan/coral/amber pixels)
        # Convert BGR to HSV
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        
        # Cyan / Blue overlay mask (H: 80-110, S: 50-255, V: 50-255)
        cyan_mask = cv2.inRange(hsv, (80, 50, 50), (110, 255, 255))
        # Coral / Red / Amber threat mask (H: 0-15 or 165-180, S: 70-255, V: 70-255)
        red_mask1 = cv2.inRange(hsv, (0, 70, 70), (15, 255, 255))
        red_mask2 = cv2.inRange(hsv, (165, 70, 70), (180, 255, 255))
        overlay_mask = cyan_mask | red_mask1 | red_mask2

        colored_pixels = np.count_nonzero(overlay_mask)
        if colored_pixels > 50:
            overlay_detected_frames += 1

        # Save frames at 25%, 50%, 75% progress
        if frames_read in [10, 50, 90, 120] and len(saved_frames) < 3:
            out_img = os.path.join(os.path.dirname(video_path), f"recorded_frame_{frames_read}.png")
            cv2.imwrite(out_img, frame)
            saved_frames.append(out_img)

    cap.release()

    print(f"\nAnalysis Results:")
    print(f"  Frames successfully read: {frames_read}")
    print(f"  Non-black thermal frames: {non_black_frames} ({100 * non_black_frames / max(1, frames_read):.1f}%)")
    print(f"  Frames with detection overlays (bounding boxes/threats): {overlay_detected_frames} ({100 * overlay_detected_frames / max(1, frames_read):.1f}%)")
    print(f"  Saved sample frame images: {saved_frames}")

    assert frames_read > 0, "No frames could be read from the recorded video!"
    assert non_black_frames > 0, "Recorded video is completely blank/black!"
    assert overlay_detected_frames > 0, "No detection overlays found in recorded video!"

    print("\nSUCCESS: The recorded video is valid, playable, and contains thermal frames with detection overlays!")

if __name__ == "__main__":
    vid_path = os.path.join(os.path.dirname(__file__), "test_recording_output.webm")
    verify_video(vid_path)
