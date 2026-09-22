import os
import cv2
import numpy as np

def analyze_snapshot(image_path, expected_w, expected_h, label):
    print(f"\n============================================================")
    print(f"INSPECTING SNAPSHOT: {label}")
    print(f"File: {image_path}")
    print(f"============================================================")
    if not os.path.exists(image_path):
        print(f"ERROR: File not found: {image_path}")
        return False

    img = cv2.imread(image_path)
    if img is None:
        print(f"ERROR: Failed to decode PNG image {image_path}")
        return False

    h, w, c = img.shape
    aspect = w / h
    file_size = os.path.getsize(image_path)

    print(f"Resolution: {w} x {h} (Expected: {expected_w} x {expected_h})")
    print(f"Aspect ratio: {aspect:.3f}")
    print(f"Channels: {c}, File size: {file_size:,} bytes")

    # Verify dimensions match source video
    dim_match = (w == expected_w and h == expected_h)
    print(f"Resolution Match: {'PASS' if dim_match else 'FAIL'}")

    # Check thermal background (non-black pixels)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mean_intensity = np.mean(gray)
    std_intensity = np.std(gray)
    print(f"Mean pixel intensity: {mean_intensity:.2f} (std: {std_intensity:.2f})")

    # Check for AI overlay colors (Threat coral #F27786 -> BGR: [134, 119, 242] or Cyan #55D9F5 -> BGR: [245, 217, 85])
    # Also check for colored text / pill borders
    # Convert to HSV to detect vibrant saturated overlay pixels that wouldn't be in a grayscale thermal image
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1]
    colored_pixels = np.sum(saturation > 50)
    total_pixels = w * h
    colored_ratio = colored_pixels / total_pixels
    print(f"Colored/Overlay pixels (S > 50): {colored_pixels:,} ({colored_ratio*100:.2f}%)")

    has_thermal_content = mean_intensity > 15
    has_overlays = colored_pixels > 200

    print(f"Thermal content visible: {'PASS' if has_thermal_content else 'FAIL'}")
    print(f"AI Overlays detected: {'PASS' if has_overlays else 'FAIL'}")

    success = dim_match and has_thermal_content and has_overlays
    print(f"Overall Result: {'SUCCESS - Valid Clean Thermal AI Snapshot!' if success else 'WARNING: Check details above'}")
    return success

if __name__ == "__main__":
    portrait_path = os.path.join(os.path.dirname(__file__), "output_snapshot_portrait.png")
    landscape_path = os.path.join(os.path.dirname(__file__), "output_snapshot_landscape.png")

    p_ok = analyze_snapshot(portrait_path, 480, 640, "PORTRAIT (IMG_3394_grayscale.mp4)")
    l_ok = analyze_snapshot(landscape_path, 640, 512, "LANDSCAPE (thermal_exam_demo_20s.mp4)")

    if p_ok and l_ok:
        print("\n>>> ALL SNAPSHOT VALIDATIONS PASSED PERFECTLY! <<<")
    else:
        print("\n>>> ONE OR MORE CHECKS FAILED! <<<")
