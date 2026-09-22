import cv2
import numpy as np
import os
import sys

def verify_clean_video(video_path: str, expected_w: int, expected_h: int, label: str):
    print(f"\n=======================================================")
    print(f"VERIFYING {label.upper()}: {os.path.basename(video_path)}")
    print(f"=======================================================")
    if not os.path.exists(video_path):
        print(f"ERROR: Video file does not exist: {video_path}")
        sys.exit(1)

    file_size = os.path.getsize(video_path)
    print(f"File size: {file_size} bytes ({file_size / 1024:.1f} KB)")
    assert file_size > 0, "File size must be greater than 0!"

    cap = cv2.VideoCapture(video_path)
    assert cap.isOpened(), f"cv2.VideoCapture failed to open {video_path}!"

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)

    print(f"Resolution: {w} x {h} (Expected: {expected_w} x {expected_h})")
    assert w == expected_w and h == expected_h, f"Resolution mismatch! Got {w}x{h}, expected {expected_w}x{expected_h}"

    frames_read = 0
    non_black = 0
    overlay_count = 0
    saved_frames = []

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            break
        frames_read += 1

        # Intensity check
        if np.mean(frame) > 5.0:
            non_black += 1

        # Check for overlay colored pixels (cyan/sky-blue/coral/amber)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        # Cyan / Blue
        c_mask = cv2.inRange(hsv, (80, 50, 50), (110, 255, 255))
        # Coral / Red / Amber
        r_mask1 = cv2.inRange(hsv, (0, 70, 70), (15, 255, 255))
        r_mask2 = cv2.inRange(hsv, (165, 70, 70), (180, 255, 255))
        mask = c_mask | r_mask1 | r_mask2
        if np.count_nonzero(mask) > 30:
            overlay_count += 1

        # Save 2 sample frames
        if frames_read in [15, 60] and len(saved_frames) < 2:
            out_name = os.path.join(os.path.dirname(video_path), f"clean_{label}_frame_{frames_read}.png")
            cv2.imwrite(out_name, frame)
            saved_frames.append(out_name)

    cap.release()

    print(f"Frames read: {frames_read}")
    print(f"Non-black frames: {non_black}/{frames_read} ({100*non_black/max(1, frames_read):.1f}%)")
    print(f"Frames with overlays: {overlay_count}/{frames_read} ({100*overlay_count/max(1, frames_read):.1f}%)")
    print(f"Saved sample frames: {saved_frames}")

    assert frames_read > 0, "No frames could be read!"
    assert non_black > 0, "Video frames are completely black!"
    assert overlay_count > 0, "No overlays detected!"
    print(f"SUCCESS: {label} recording is clean, valid, playable, and matches expected aspect ratio!")

if __name__ == "__main__":
    base = os.path.dirname(__file__)
    portrait_vid = os.path.join(base, "output_clean_portrait.webm")
    landscape_vid = os.path.join(base, "output_clean_landscape.webm")

    verify_clean_video(portrait_vid, 480, 640, "portrait")
    verify_clean_video(landscape_vid, 640, 512, "landscape")
    print("\nALL VERIFICATIONS PASSED WITH ZERO ERRORS!")
