# AI-MULTISENSE — AI-Based Thermal Surveillance and Object Detection System

AI-MULTISENSE is an end-to-end intelligent thermal surveillance platform designed for 24/7 boundary protection, security monitoring, and automated threat detection. The system integrates deep learning object detection, multi-object tracking, custom polygon restricted zone monitoring, and a rule-based threat assessment engine with a modern web dashboard.

---

## 1. Project Overview

Thermal imaging captures heat signatures emitted by objects rather than reflected light. This makes it effective in low-light, nighttime, foggy, or obscured environments where standard optical (RGB) cameras degrade.

**Operational Context for Demonstrated System:**
The demonstrated application processes **recorded thermal video frame-by-frame in real time** through an OpenCV video analysis pipeline. The system performs automated YOLO11n detection, ByteTrack tracking, threat evaluation, and alert dispatch on the active video stream.

> **Note:** The current project demonstration operates on uploaded thermal video footage. It does not claim a physically attached live FLIR or optical thermal hardware camera; live camera streaming is planned under future scope.

---

## 2. Main Features

- **Thermal Video Input:** Direct upload and automated frame-by-frame decoding of thermal video recordings (`.mp4`, `.avi`, `.mov`).
- **YOLO11n Object Detection:** Real-time deep learning inference using trained thermal model weights (`models/thermal/best.pt`).
- **5-Class Target Recognition:** Trained specifically to recognize people, vehicles, animals, drones, and persons carrying bags.
- **ByteTrack Multi-Object Tracking:** Assigns and maintains consistent numerical Track IDs across sequential video frames.
- **Threat Engine Rule Evaluation:** Real-time security rules that evaluate target class, zone boundaries, and speed metrics.
- **Interactive Restricted Zones:** Canvas-based geofence drawing with normalized polygon coordinates and SQLite persistence.
- **Alert Generation & Deduplication:** Automatic threat alert logging into SQLite with 10-second debounce deduplication per tracked target.
- **Live WebSocket Streaming:** Push-based broadcast (`/ws/live`) delivering detection coordinates, track IDs, and threat metadata at ~10 FPS.
- **Surveillance Snapshots:** One-click frame capture saved directly as timestamped PNG images on the backend.
- **Real-Time Analytics:** Interactive charts for class distribution, threat trends, speed metrics, and active session statistics.
- **Automated Incident Reports:** Exportable security summaries detailing monitored events, severity breakdowns, and zone activity.
- **Full Video Playback Controls:** Start, pause, resume, stop, and clear active video sessions directly from the web interface.
- **Isolated Demo Mode:** Built-in simulation mode that enables offline review and demonstration without requiring active model inference.
- **System Health & Telemetry:** Real-time monitoring of inference device, backend connectivity, active tracking counts, and processing FPS.

---

## 3. Object Classes

The YOLO11n thermal model is trained to detect 5 distinct security-relevant classes:

| Class ID | Class Label | Description |
| :--- | :--- | :--- |
| `0` | `person` | Unarmed individual or pedestrian |
| `1` | `vehicle` | Automobile, patrol car, truck, or industrial vehicle |
| `2` | `animal` | Wildlife, stray animal, or livestock (filters out false security alarms) |
| `3` | `drone` | Unmanned aerial vehicle (UAV) |
| `4` | `person_with_bag` | Individual carrying a backpack, luggage, or concealed item |

---

## 4. Complete System Workflow

```
[ Recorded Thermal Video (.mp4) ]
               │
               ▼
   [ OpenCV VideoCapture ] ── Decodes frame by frame at native video frame rate
               │
               ▼
      [ YOLO11n Inference ] ── Deep CNN feature extraction on models/thermal/best.pt
               │
               ▼
   [ Confidence Filtering ] ── Filters predictions below confidence threshold (default 0.50)
               │
               ▼
     [ ByteTrack Tracking ] ── Associates bounding boxes across frames & assigns Track IDs
               │
               ▼
    [ Threat Engine Rules ] ── Evaluates class type, overspeed, and ray-cast zone intrusion
               │
               ▼
     [ Alert Service ] ── Debounces alerts (10s window per track) & saves to SQLite
               │
         ┌─────┴───────────────────────┐
         ▼                             ▼
[ WebSocket Broadcast (/ws/live) ]   [ SQLite Database (surveillance.db) ]
         │                             │
         └─────────────┬───────────────┘
                       ▼
            [ React Web Dashboard ] ── 12 integrated security surveillance modules
                       │
                       ▼
          [ Analytics & Reports ] ── Real-time situation map, KPI cards, and incident audit log
```

---

## 5. AI / Machine Learning Pipeline

### YOLO11n (You Only Look Once - Version 11 Nano)
- **Why we use it:** YOLO11n provides high detection accuracy while maintaining a lightweight footprint, making it suitable for real-time edge processing and low-latency surveillance.
- **Architecture:** Utilizes a Convolutional Neural Network (CNN) backbone with C3k2 building blocks, SPPF (Spatial Pyramid Pooling - Fast), and a decoupled anchor-free detection head.
- **Deep Feature Learning:** Learns thermal contrast gradients, heat dissipation patterns, and structural silhouettes directly from grayscale thermal imagery.
- **Training vs. Inference:**
  - *Training:* Performed offline using backpropagation, loss optimization (CIoU + DFL + BCE), and stochastic gradient descent on an NVIDIA GPU.
  - *Inference:* Executed live in forward-pass mode during surveillance, taking ~10–25 ms per frame.

### ByteTrack Multi-Object Tracker
- **Why we use it:** Object detectors alone do not track entities across time; an object detected in frame 10 and frame 11 would look like two unrelated detections.
- **How it works:** ByteTrack associates bounding boxes frame-to-frame by matching high-confidence detections first, then matching low-confidence detections with remaining tracklets. This preserves persistent Track IDs even during temporary occlusions or thermal blooming.

### Threat Engine
- **Why we use it:** Separates computer vision perception from security decision logic. The ML model identifies *what* an object is; the Threat Engine decides *whether* it represents an operational security risk based on configurable operational policies.

---

## 6. Dataset Specifications

The thermal detection model was trained and evaluated on a curated thermal dataset annotated in standard YOLO format (`class_id center_x center_y width height` normalized to `[0, 1]`):

| Dataset Split | Image Count | Percentage | Purpose |
| :--- | :--- | :--- | :--- |
| **Training Set** | 12,692 | 80.6% | Model parameter optimization and weight learning |
| **Validation Set** | 1,314 | 8.3% | Hyperparameter tuning and model checkpoint selection |
| **Independent Test Set** | 1,745 | 11.1% | Final unbiased benchmark evaluation |
| **Total Dataset** | **15,751** | **100.0%** | Full verified thermal dataset |

---

## 7. Model Architecture & Specifications

- **Architecture:** YOLO11n (Ultralytics Nano)
- **Model File:** `models/thermal/best.pt`
- **Model File Size:** 5.46 MB (5,460,762 bytes)
- **Parameter Count:** Approximately 2.58 Million parameters
- **Computational Complexity:** Approximately 6.3 GFLOPs (at 640×640 input resolution)
- **Input Dimension:** 640 × 640 pixels (RGB/Grayscale converted 3-channel tensor)

---

## 8. Training Configuration

The final deployed model was trained using the verified settings:

| Parameter | Configuration Value | Description |
| :--- | :--- | :--- |
| **Epochs** | 100 max | Training duration with early stopping |
| **Image Size (`imgsz`)** | 640 | Standard square input resolution |
| **Batch Size** | 8 | Minibatch size optimized for GPU memory |
| **Device** | GPU (CUDA) | Accelerated hardware execution |
| **Workers** | 0 | PyTorch DataLoader worker count |
| **Cache** | False | On-disk image loading |
| **Patience** | 20 | Early stopping threshold based on validation fitness |
| **AMP** | True | Automatic Mixed Precision (FP16/FP32) |
| **Random Seed** | 42 | Deterministic seed for reproducible splits |
| **Augmentation** | Built-in YOLO | Flipping, scaling, translation, and mosaic |
| **Checkpoints** | Enabled | Best weights saved based on peak validation mAP@50 |

---

## 9. Model Evaluation Results

### Validation Set Results (1,314 Images)
- **Precision:** 89.5%
- **Recall:** 86.7%
- **mAP@50:** 92.5%
- **mAP@50–95:** 59.4%

### Independent Test Set Results (1,745 Images)
- **Precision:** 90.22%
- **Recall:** 86.58%
- **mAP@50:** 92.29%
- **mAP@50–95:** 58.14%

*Validation results reflect validation performance during training; independent test results confirm high generalization on unseen thermal footage.*

---

## 10. Threat Engine Rules

The Threat Engine evaluates every detected entity on every frame using deterministic security rules:

1. **Drone (Class 3):**
   - **Severity:** `HIGH`
   - **Reason:** `"Unauthorized drone detected"`
   - *If inside an active restricted zone:* `"Unauthorized drone detected in restricted area: [Zone Name]"`

2. **Person With Bag (Class 4):**
   - **Severity:** `HIGH`
   - **Reason:** `"Person with bag detected"`
   - *If inside an active restricted zone:* `"Person_With_Bag entered restricted area: [Zone Name]"`

3. **Vehicle (Class 1):**
   - **Severity:** `NORMAL` (Safe) under regular conditions.
   - **Severity:** `HIGH` if estimated speed exceeds `speed_threshold_kmh` (configured in Settings, default 80 km/h):
     - **Reason:** `"Vehicle speed ([speed] km/h) exceeded configured limit ([threshold] km/h)"`

4. **Person (Class 0):**
   - **Severity:** `NORMAL` (Standard pedestrian movement).

5. **Animal (Class 2):**
   - **Severity:** `NORMAL` (Stray or wildlife activity; filtered to avoid false security alerts).

6. **Restricted Zone Intrusions:**
   - Evaluates object centroid coordinates using a ray-casting point-in-polygon algorithm against all enabled restricted zones from the database. Zone intrusion metadata is appended to the threat record.

---

## 11. Multi-Object Tracking (ByteTrack)

### Why Tracking is Necessary
A pure object detector operates on single images in isolation. In video surveillance:
- Without tracking, a person visible across 100 consecutive frames would trigger 100 separate alert entries.
- Without tracking, direction of motion, vehicle speed, and zone dwell time cannot be calculated.

### How ByteTrack Solves This
ByteTrack associates detections across time and assigns a persistent numerical `track_id`:
- Handles track initiation, confirmation, and termination.
- Maintains identity through temporary thermal blooming or brief object occlusion.
- Resets cleanly when a new video session starts.

---

## 12. Backend Architecture

Built with **FastAPI** (Python 3.11), the backend provides asynchronous REST API endpoints, real-time WebSocket communication, and background video processing threads.

### Key Backend Components
- **Video Analysis Manager (`video_analysis_service.py`):** Coordinates OpenCV frame capture, real-time pacing, YOLO inference, ByteTrack association, and live broadcast.
- **Threat Engine (`ai/threat/threat_engine.py`):** Decoupled business rule evaluation logic.
- **Alert Service (`alert_service.py`):** Handles alert creation, SQLite persistence, and 10-second window deduplication.
- **Zone Engine (`ai/zones/zone_engine.py`):** Ray-casting point-in-polygon calculations.
- **WebSocket Broadcast (`/ws/live`):** Streams canonical thermal detection payloads to connected frontend clients.

### Primary API Endpoint Groups
- `GET /api/status`: Overall system health, model readiness, device information, and active counts.
- `GET /api/video/status`: Active video state (`no_video_selected`, `ready`, `processing`, `paused`, `stopped`, `completed`), active video ID, and session start time.
- `POST /api/video/upload`: Multipart video file upload (`.mp4`, `.avi`, `.mov`).
- `POST /api/video/start`, `POST /api/video/pause`, `POST /api/video/resume`, `POST /api/video/stop`, `POST /api/video/clear`: Full video playback lifecycle control.
- `GET /api/zones`, `POST /api/zones`, `PUT /api/zones/{id}`, `DELETE /api/zones/{id}`: Geofence CRUD operations.
- `GET /api/alerts/history`, `DELETE /api/alerts/history`: Paginated alert query with filtering and history reset.
- `GET /api/analytics`: Aggregated statistical metrics (threat trends, class distribution, confidence).
- `GET /api/settings`, `PUT /api/settings`: Application preferences (speed threshold, confidence threshold, audio alerts).
- `POST /api/snapshots`, `GET /api/snapshots`, `GET /api/snapshots/{filename}`: Thermal snapshot capture and retrieval.
- `WS /ws/live`: Real-time WebSocket feed for live detection and threat streaming.

---

## 13. Frontend Architecture

Built with **React 18**, **TypeScript**, **Vite**, and **Tailwind CSS v4**, the frontend provides a dark-themed responsive command center with smooth page transitions and real-time state synchronization.

### The 12 Integrated Modules
1. **Command Overview (`Dashboard.tsx`):** Central security summary featuring real-time KPI cards, system status, active alerts, and recent surveillance events.
2. **Live Surveillance (`LiveSurveillance.tsx`):** Real-time video player with HTML5 canvas bounding box overlays, track ID labels, live threat banners, and full video playback controls.
3. **Target Tracking (`TargetTracking.tsx`):** Dedicated tracking monitor displaying active track IDs, motion vectors, centroid coordinates, and class breakdowns.
4. **Threat Monitoring (`ThreatMonitoring.tsx`):** Incident response dashboard with dynamic threat queue, severity counters, and a simplified Surveillance Zone Map displaying active targets and restricted zones.
5. **Restricted Zones (`RestrictedZones.tsx`):** Interactive canvas geofencing tool enabling security operators to draw, save, toggle, and delete polygon zones.
6. **Sensor Management (`SensorManagement.tsx`):** Status monitoring for optical and thermal sensor channels, stream resolution, and FPS telemetry.
7. **AI Engine (`AIEngine.tsx`):** Technical model monitor showing YOLO11n weights status, loaded classes, inference device, and global confidence threshold configuration.
8. **Analytics (`Analytics.tsx`):** Historical surveillance trends, detection counts, threat distributions, and average confidence charts.
9. **Alert History (`AlertHistory.tsx`):** Comprehensive searchable and filterable SQLite incident table with severity filters and a "Clear History" action.
10. **Reports (`Reports.tsx`):** Audit report generator detailing session metrics, threat summaries, and system operational statistics.
11. **System Health (`SystemHealth.tsx`):** Diagnostics monitor displaying API latency, memory utilization, WebSocket connectivity, and service states.
12. **Settings (`Settings.tsx`):** User preferences for vehicle speed threshold, detection confidence, alert sounds, and UI options.

---

## 14. Database Architecture (SQLite)

The system utilizes **SQLite** via **SQLModel** (SQLAlchemy ORM + Pydantic) located at `data/surveillance.db`.

### Stored Database Tables
- **`alerts` (`AlertModel`):**
  - Columns: `id`, `timestamp`, `object_class`, `track_id`, `threat_type`, `reason`, `speed`, `zone`, `severity`, `status`, `confidence`.
- **`zones` (`ZoneModel`):**
  - Columns: `id`, `name`, `polygon_json`, `enabled`.
- **`settings` (`SettingsModel`):**
  - Columns: `id`, `speed_threshold_kmh`, `confidence_threshold`, `tracking_iou_threshold`, `thermal_camera_enabled`, `alert_sound_enabled`.
- **`video_records` (`VideoRecordModel`):**
  - Columns: `id`, `filename`, `filepath`, `file_size`, `status`, `uploaded_at`.

### Alert Deduplication Logic
To prevent thousands of identical alerts while an object remains in view:
- The system groups threats by `(track_id, class_name)`.
- If a threat for that specific tracked target was recorded within the last **10.0 seconds** (`COOLDOWN_SECONDS = 10.0`), database insertion is debounced.
- This ensures only meaningful, distinct incidents are stored in `Alert History`.

---

## 15. Surveillance Snapshots

- **Storage Location:** `data/snapshots/`
- **File Naming Pattern:** `thermal_snapshot_YYYYMMDD_HHMMSS.png`
- **Validation:** Uploaded base64 payloads are verified for valid PNG magic bytes (`\x89PNG\r\n\x1a\n`) before being written to disk.
- **Access:** Snapshots can be viewed in the dashboard or retrieved via `GET /api/snapshots/{filename}`.

---

## 16. Video Playback & Lifecycle Controls

The video analysis pipeline supports interactive video control via REST APIs and the Live Surveillance UI:
- **Upload:** Accepts video files up to 100 MB and stages them in `data/uploads/`.
- **Start:** Initializes OpenCV VideoCapture, loads YOLO11n weights, resets tracker, and starts processing.
- **Pause:** Halts frame advancement while maintaining session state and active socket connections.
- **Resume:** Resumes frame processing from the paused timestamp.
- **Stop:** Terminates processing loop, releases OpenCV capture handle, and resets active tracks.
- **Clear Video:** Removes uploaded video and resets system to idle standby.
- **Pacing / Normal Speed:** Processes frames according to the video file's native FPS (e.g. 10–30 FPS) without event-loop blocking.

---

## 17. Project Structure

```
MAJOR_WEB - Copy/
├── ai/
│   ├── detection/
│   │   ├── base.py                   # Detection interface definition
│   │   ├── mock_detection.py         # Demo mode simulated detections
│   │   └── yolo_detection.py         # Real YOLO11n + ByteTrack service
│   ├── speed/
│   │   └── speed_engine.py           # Pixel displacement speed calculation
│   ├── threat/
│   │   └── threat_engine.py          # Deterministic threat evaluation rules
│   ├── tracking/
│   │   ├── base.py                   # Tracker interface definition
│   │   └── mock_tracking.py          # Demo mode tracking simulation
│   └── zones/
│       └── zone_engine.py            # Ray-casting point-in-polygon engine
├── backend/
│   ├── app/
│   │   ├── api/                      # REST & WebSocket route handlers
│   │   │   ├── alerts_router.py
│   │   │   ├── detections_router.py
│   │   │   ├── settings_router.py
│   │   │   ├── snapshots_router.py
│   │   │   ├── status_router.py
│   │   │   ├── video_router.py
│   │   │   ├── ws_router.py
│   │   │   └── zones_router.py
│   │   ├── core/
│   │   │   ├── config.py             # Settings & environment variables
│   │   │   └── database.py           # SQLModel SQLite engine initialization
│   │   ├── models/
│   │   │   └── db_models.py          # Database schema models
│   │   ├── schemas/
│   │   │   ├── canonical.py          # Canonical ThermalDetectionObject schema
│   │   │   └── domain.py             # Request & response validation schemas
│   │   ├── services/
│   │   │   ├── alert_service.py      # Alert persistence & deduplication
│   │   │   ├── video_analysis_service.py # OpenCV + YOLO + ByteTrack loop
│   │   │   └── video_upload_service.py   # File upload handling
│   │   └── main.py                   # FastAPI application entry point
│   └── requirements.txt              # Python package dependencies
├── data/
│   ├── combined_thermal_test.mp4     # Sample thermal test video (100 frames)
│   ├── snapshots/                    # Saved thermal snapshot images
│   ├── surveillance.db               # SQLite database file
│   └── uploads/                      # Uploaded surveillance video files
├── frontend/
│   ├── src/
│   │   ├── components/               # Reusable UI cards, tables, maps, canvas
│   │   ├── hooks/                    # Custom hooks (useLiveFeed, useVideoStatus)
│   │   ├── pages/                    # The 12 surveillance page modules
│   │   ├── services/                 # Axios API client
│   │   ├── types/                    # TypeScript interfaces & domain schemas
│   │   ├── utils/                    # Formatting & coordinate helpers
│   │   ├── App.tsx                   # Main layout & routing controller
│   │   └── main.tsx                  # React entry point
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── models/
│   └── thermal/
│       └── best.pt                   # Trained YOLO11n weights (5.46 MB)
├── tests/                            # Automated test suite (Python + Node.js E2E)
├── .env.example
├── pyproject.toml
└── README.md
```

---

## 18. Setup and Running

### Prerequisites
- Python 3.11 installed
- Node.js 18+ installed
- NVIDIA GPU with CUDA drivers (optional, runs on CPU if CUDA is unavailable)

### Step 1: Clone or Navigate to Project
```bash
cd "D:\MAJOR_WEB - Copy"
```

### Step 2: Set Up Backend
```bash
# Create and activate virtual environment (if not already present)
python -m venv venv
.\venv\Scripts\activate

# Install Python dependencies
pip install -r backend/requirements.txt
```

### Step 3: Set Up Frontend
```bash
cd frontend
npm install
cd ..
```

### Step 4: Run the Application

**Terminal 1 — Start Backend Server:**
```powershell
.\venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```
- FastAPI Backend: `http://127.0.0.1:8000`
- Interactive API Docs (Swagger): `http://127.0.0.1:8000/docs`

**Terminal 2 — Start Frontend Server:**
```powershell
cd frontend
npm run dev
```
- Frontend Dashboard: `http://127.0.0.1:5173`

---

## 19. Hardware & Software Requirements

### Training Environment
- **GPU:** NVIDIA GeForce RTX 3060 (12 GB VRAM)
- **CPU:** AMD Ryzen 5 5600 (6 Cores, 12 Threads)
- **RAM:** 32 GB DDR4
- **OS:** Windows 11 (64-bit)

### Web Demonstration Runtime
- **GPU:** NVIDIA GeForce RTX 3050 Laptop GPU (CUDA verified) or CPU fallback
- **RAM:** 8 GB minimum (16 GB recommended)
- **Display Resolution:** 1920 × 1080 recommended

### Software Stack
- **Languages:** Python 3.11, TypeScript 5.6
- **ML / Computer Vision:** PyTorch, Ultralytics YOLO11, OpenCV (cv2), ByteTrack
- **Backend:** FastAPI, Uvicorn, SQLModel, Pydantic V2, SQLite
- **Frontend:** React 18, Vite, Tailwind CSS v4, Lucide React, Framer Motion, Axios

---

## 20. Testing & Verification Status

The system has undergone thorough automated testing across both backend and frontend layers:

- **Backend Health:** Verified HTTP 200 responses on all core REST endpoints (`/api/status`, `/api/video/status`, `/api/zones`, `/api/alerts/history`, `/api/analytics`).
- **Real YOLO11n Inference:** Verified detection of all 5 classes on real thermal frames.
- **ByteTrack Tracking:** Verified consistent Track ID assignment across sequential frames.
- **Threat Engine Evaluation:** Verified automated classification of Drone and Person With Bag as HIGH threats.
- **Video Controls:** Verified upload, start, pause, resume, stop, and clear operations.
- **Restricted Zones Persistence:** Verified canvas creation, saving, and permanent deletion in SQLite across page reloads.
- **Alert History:** Verified SQLite alert logging, 10-second deduplication, and "Clear History" functionality.
- **Frontend Production Build:** `npm run build` completed with **0 errors**.
- **Pytest Suite:** **26/26 tests passing** (`pytest tests/ -v`).
- **Browser Console:** **0 unhandled errors** across all 12 modules.

---

## 21. Limitations

1. **Recorded Video Input:** The current implementation processes uploaded or staged thermal video recordings. It does not interface directly with physical, live-streaming FLIR hardware cameras.
2. **2D Coordinate Representation:** Bounding boxes and speeds are estimated from 2D pixel coordinates and camera perspective rather than calibrated 3D LiDAR/radar depth sensors.
3. **Environmental Variations:** Extreme ambient temperature saturation (where ambient background matches body temperature) can reduce thermal contrast.

---

## 22. Future Scope

1. **Live Camera Streaming:** Integration of RTSP/GigE Vision drivers for direct input from physical thermal imaging cameras.
2. **Edge Hardware Acceleration:** Model quantization to TensorRT FP16 / INT8 for deployment on NVIDIA Jetson or edge computing modules.
3. **Multi-Camera Fusion:** Cross-camera tracking and homography mapping to combine multiple surveillance views into a single unified situational coordinate grid.
4. **Expanded Thermal Datasets:** Addition of specialized aerial drone classes, watercraft, and adverse weather thermal training sets.

---

## 23. Viva / Presentation Quick Reference

| Technology / Component | Why We Use It |
| :--- | :--- |
| **YOLO11n** | High-speed, lightweight deep learning object detector optimized for real-time thermal edge inference. |
| **ByteTrack** | Associates detections across consecutive frames to maintain persistent Track IDs and enable trajectory monitoring. |
| **OpenCV** | Provides reliable frame extraction, image decoding, and video stream pacing. |
| **FastAPI** | Asynchronous, high-performance Python web framework with native WebSocket support and automatic Swagger OpenAPI documentation. |
| **WebSocket (`/ws/live`)** | Delivers low-latency, push-based detection updates to the dashboard without polling overhead. |
| **SQLite + SQLModel** | Lightweight, file-based database for persistence of alerts, geofence zones, and system settings. |
| **React 18 + Vite** | Component-driven, responsive user interface with rapid development compilation and optimized production builds. |
| **TypeScript** | Static typing across all frontend models to eliminate runtime schema mismatch bugs. |
| **Threat Engine** | Decouples security assessment logic from computer vision perception, allowing customizable rules. |
| **Ray-Casting Algorithm** | Mathematically determines whether an object's centroid falls inside an arbitrary user-drawn polygon geofence. |
