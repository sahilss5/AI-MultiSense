export type ObjectClass = "Person" | "Vehicle" | "Animal" | "Drone" | "Person_With_Bag" | "Person With Bag";
export type ThreatLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AIModelStatus {
  model_name: string;
  model_file: string;
  status: "READY" | "LOADING" | "UNAVAILABLE" | "NOT CONNECTED";
  framework: string;
  classes_count: number;
  classes: Array<{
    id: number;
    name: string;
    display_name: string;
    description: string;
    confidence_benchmark: number;
    color: string;
  }>;
  runtime?: {
    inference_fps?: number | null;
    latency_ms?: number | null;
    precision_map50?: number | null;
    gpu_name?: string | null;
    vram_used_mb?: number | null;
    vram_total_mb?: number | null;
    input_resolution?: string | null;
  } | null;
}

export interface ServiceHealthItem {
  name: string;
  category: "SENSOR" | "BACKEND" | "AI_MODEL" | "TRACKER" | "THREAT_ENGINE" | "DATABASE";
  status: "ONLINE" | "READY" | "ACTIVE" | "INITIALIZING" | "OFFLINE" | "ERROR";
  latency_ms: number;
  uptime_percent: number;
  last_heartbeat: string;
  details: string;
}

export interface SystemHealthMetrics {
  cpu_usage_percent: number;
  gpu_usage_percent: number;
  vram_usage_percent: number;
  ram_usage_percent: number;
  pipeline_fps: number;
  total_latency_ms: number;
  services: ServiceHealthItem[];
}

export interface ThermalDetectionObject {
  id: string;
  sensor: "thermal" | "rgb";
  class: ObjectClass;
  class_name?: ObjectClass;
  class_id?: number | null;
  confidence: number;
  track_id: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0-1
  speed?: number | null;
  zone?: string | null;
  direction?: string | null;
  altitude?: string | null;
  duration_seconds?: number | null;
  trajectory?: [number, number][];
  threat: boolean;
  threat_level?: ThreatLevel | null;
  threat_reason?: string | null;
  timestamp: string;
}

export interface Zone {
  id: string;
  name: string;
  zone_type?: "RESTRICTED" | "WARNING" | "MONITORED" | "PERIMETER";
  polygon: [number, number][]; // Array of [x, y] normalized 0-1
  enabled: boolean;
  severity?: ThreatLevel;
  allowed_classes?: string[];
  speed_limit_kmh?: number;
  detection_rules?: string[];
}

export interface SystemSettings {
  speed_threshold_kmh: number;
  confidence_threshold: number;
  tracking_iou_threshold: number;
  thermal_camera_enabled: boolean;
  alert_sound_enabled: boolean;
  timezone?: string;
  theme?: "dark" | "light";
  units?: "metric" | "imperial";
  tracker_algorithm?: "bytetrack" | "botsort";
  track_persistence_frames?: number;
  rule_zone_intrusion?: boolean;
  rule_overspeed?: boolean;
  backend_endpoint?: string;
  logging_level?: "DEBUG" | "INFO" | "WARNING" | "ERROR";
  data_retention_days?: number;
}

export type VideoStatusType = "no_video_selected" | "uploaded" | "ready" | "processing" | "paused" | "stopped" | "completed" | "error";
export type AnalysisModeType = "Demo Mode" | "AI Inference Active" | "Thermal Camera Active";

export interface VideoUploadResponse {
  video_id: string;
  filename: string;
  status: VideoStatusType;
}

export interface VideoStatusResponse {
  video_id?: string | null;
  filename?: string | null;
  status: VideoStatusType;
  analysis_mode: AnalysisModeType;
  session_start_time?: string | null;
}

export interface SystemStatusResponse {
  is_demo_mode: boolean;
  analysis_mode: AnalysisModeType;
  thermal_model_path: string;
  model_status: "READY" | "NOT CONNECTED" | "UNAVAILABLE" | "LOADING";
  thermal_camera_enabled: boolean;
  active_tracks: number;
  active_threats: number;
  fps: number;
  total_detections: number;
  confidence_avg?: number;
  latency_ms?: number;
  device?: string;
  confidence_threshold?: number;
  supported_classes?: string[];
}

export interface ClassCount {
  class_name: string;
  count: number;
}

export interface AnalyticsData {
  total_detections: number;
  total_threats: number;
  zone_violations: number;
  high_speed_violations: number;
  average_vehicle_speed: number;
  max_vehicle_speed: number;
  class_distribution: ClassCount[];
  threat_trend: Array<{ frame: number; time_label?: string | null; detections: number; threats: number }>;
  active_tracks?: number;
  drone_count?: number;
  person_with_bag_count?: number;
  person_count?: number;
  vehicle_count?: number;
  animal_count?: number;
  confidence_distribution?: Array<{ range: string; count: number; label: string }> | null;
  average_confidence?: number | null;
}

export interface AlertRecord {
  id: string;
  timestamp: string;
  object_class: string;
  track_id: number;
  threat_type: string;
  reason: string;
  speed?: number | null;
  zone?: string | null;
  severity: ThreatLevel;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | string;
  confidence?: number | null;
  video_id?: string | null;
}

export interface SnapshotResponse {
  success: boolean;
  filename: string;
  filepath: string;
  timestamp: string;
  size_bytes: number;
}

export interface SnapshotListItem {
  filename: string;
  filepath: string;
  timestamp: string;
  size_bytes: number;
}
export interface PositionCoord {
  x: number;
  y: number;
}

export interface MovementPoint {
  x: number;
  y: number;
  timestamp?: string;
}

export interface SessionTrack {
  session_id: string;
  video_id?: string;
  track_id: number;
  class_name: string;
  class?: string;
  class_id?: number | null;
  first_seen: string | null;
  last_seen: string | null;
  detection_count: number;
  average_confidence: number;
  minimum_confidence: number;
  maximum_confidence: number;
  confidence?: number;
  threat: boolean;
  threat_level: ThreatLevel;
  threat_reason: string | null;
  zone: string | null;
  direction: string | null;
  speed: number | null;
  duration_seconds?: number;
  bbox?: [number, number, number, number];
  last_position: PositionCoord | null;
  movement_points: MovementPoint[];
  trajectory?: [number, number][];
}

export interface SessionSummary {
  session_id: string;
  video_id: string;
  filename?: string;
  status: VideoStatusType;
  total_detections: number;
  unique_tracks: number;
  total_threats: number;
  high_threats: number;
  frames_processed: number;
  total_video_frames: number;
  average_confidence: number;
  video_duration: number;
  first_seen: string | null;
  last_seen: string | null;
  class_counts: {
    Person?: number;
    Vehicle?: number;
    Animal?: number;
    Drone?: number;
    'Person With Bag'?: number;
    [key: string]: number | undefined;
  };
  tracks: SessionTrack[];
}
