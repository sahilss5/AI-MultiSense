import time
import json
import urllib.request
import urllib.parse
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000/api"
VIDEO_PATH = r"D:\MAJOR PROJECT DEMO\THERMAL_EXAM_DEMO\VIDEO\thermal_exam_demo_20s.mp4"

def post_json(endpoint, data):
    req = urllib.request.Request(
        f"{BASE_URL}/{endpoint}",
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def get_json(endpoint):
    with urllib.request.urlopen(f"{BASE_URL}/{endpoint}") as resp:
        return json.loads(resp.read().decode())

def upload_video(file_path):
    import requests
    with open(file_path, "rb") as f:
        resp = requests.post(f"{BASE_URL}/video/upload", files={"file": f})
        return resp.json()

def main():
    print("=== Starting Universal Session E2E Test ===")
    assert Path(VIDEO_PATH).exists(), f"Video file not found at {VIDEO_PATH}"

    # 1. Upload video
    print("[1] Uploading test video...")
    upload_res = upload_video(VIDEO_PATH)
    video_id = upload_res["video_id"]
    print(f"Video uploaded successfully. video_id: {video_id}")

    # 2. Start analysis
    print("[2] Starting video analysis...")
    start_res = post_json("video/start", {"video_id": video_id})
    print(f"Analysis started: {start_res}")

    # 3. Wait for video processing to complete
    print("[3] Waiting for video processing to complete...")
    start_time = time.time()
    while time.time() - start_time < 90:
        status_res = get_json("video/status")
        status = status_res.get("status")
        print(f"Status: {status} ({time.time() - start_time:.1f}s elapsed)")
        if status == "completed":
            break
        time.sleep(2)
    
    assert status == "completed", f"Expected completed status but got {status}"
    print("Video processing completed successfully!")

    # 4. Fetch Session Summary
    print("[4] Fetching session summary...")
    summary = get_json(f"video/session-summary?video_id={video_id}")
    print("\n--- SESSION SUMMARY ---")
    print(f"Session ID: {summary.get('session_id')}")
    print(f"Status: {summary.get('status')}")
    print(f"Total Detections: {summary.get('total_detections')}")
    print(f"Unique Tracks: {summary.get('unique_tracks')}")
    print(f"Total Threats: {summary.get('total_threats')}")
    print(f"High Threats: {summary.get('high_threats')}")
    print(f"Frames Processed: {summary.get('frames_processed')}")
    print(f"Average Confidence: {summary.get('average_confidence'):.4f}")
    print(f"Video Duration: {summary.get('video_duration'):.1f}s")
    print(f"Class Counts: {json.dumps(summary.get('class_counts'), indent=2)}")

    # 5. Validate Core Assertions
    total_det = summary["total_detections"]
    uniq_tracks = summary["unique_tracks"]
    assert total_det > uniq_tracks, f"Total detections ({total_det}) must be strictly greater than unique tracks ({uniq_tracks})"
    assert uniq_tracks > 0, "Unique tracks must be greater than 0"
    assert summary["frames_processed"] > 0, "Frames processed must be greater than 0"
    assert summary["video_duration"] > 0, "Video duration must be greater than 0"

    tracks = summary.get("tracks", [])
    assert len(tracks) == uniq_tracks, f"Tracks list length ({len(tracks)}) must equal unique_tracks count ({uniq_tracks})"

    # Inspect individual tracks
    print(f"\n[5] Validating {len(tracks)} recorded tracks...")
    threat_tracks = [t for t in tracks if t.get("threat")]
    print(f"Recorded Threat Tracks: {len(threat_tracks)}")
    for tt in threat_tracks:
        print(f"  Threat Track: T-{tt['track_id']} | {tt['class_name']} | Level: {tt['threat_level']} | Reason: {tt['threat_reason']} | Points: {len(tt['movement_points'])}")
        assert len(tt["movement_points"]) > 0, f"Threat track T-{tt['track_id']} must have recorded movement points"
        assert tt["direction"] is not None, f"Threat track T-{tt['track_id']} must have calculated direction"

    # Sample tracks
    sample = tracks[0]
    required_keys = [
        "track_id", "class_name", "detection_count", "average_confidence",
        "minimum_confidence", "maximum_confidence", "direction", "movement_points",
        "last_position"
    ]
    for k in required_keys:
        assert k in sample, f"Missing required key '{k}' in track"

    print("\n=== ALL UNIVERSAL SESSION API ASSERTIONS PASSED! ===")

if __name__ == "__main__":
    main()
