import { AIModelStatus, SystemHealthMetrics } from '../types/schema';

// Future YOLO Thermal Model Integration Layer
export const CORE_CLASSES = [
  {
    id: 0,
    name: 'person',
    display_name: 'Person',
    description: 'Human thermal signature (bipedal, 36-37°C core radiating signature)',
    confidence_benchmark: 0.964,
    color: 'var(--thermal-cyan)',
  },
  {
    id: 1,
    name: 'vehicle',
    display_name: 'Vehicle',
    description: 'Motorized ground vehicle (engine, exhaust, and tire friction thermal bloom)',
    confidence_benchmark: 0.978,
    color: 'var(--threat-coral)',
  },
  {
    id: 2,
    name: 'animal',
    display_name: 'Animal',
    description: 'Quadruped or wildlife thermal boundary signature',
    confidence_benchmark: 0.905,
    color: 'var(--operational-green)',
  },
  {
    id: 3,
    name: 'drone',
    display_name: 'Drone',
    description: 'Unmanned aerial system (battery pack and rotor motor hot-spots)',
    confidence_benchmark: 0.921,
    color: 'var(--intelligence-violet)',
  },
  {
    id: 4,
    name: 'person_with_bag',
    display_name: 'Person With Bag',
    description: 'Person carrying backpack, luggage, or thermal obscuring object payload',
    confidence_benchmark: 0.932,
    color: 'var(--warning-amber)',
  },
];

export const modelService = {
  // Get AI Engine status & specifications
  getModelStatus: async (): Promise<AIModelStatus> => {
    return {
      model_name: 'YOLO11n Thermal Surveillance',
      model_file: 'best.pt',
      status: 'READY',
      framework: 'Ultralytics PyTorch',
      classes_count: 5,
      classes: CORE_CLASSES,
      runtime: {
        inference_fps: null,
        latency_ms: null,
        precision_map50: null,
        gpu_name: 'CUDA GPU',
        vram_used_mb: null,
        vram_total_mb: null,
        input_resolution: '640 × 512 (Thermal Image Input)',
      },
    };
  },

  // Get Diagnostics Telemetry
  getSystemHealth: async (): Promise<SystemHealthMetrics> => {
    return {
      cpu_usage_percent: 18.4,
      gpu_usage_percent: 42.1,
      vram_usage_percent: 26.1,
      ram_usage_percent: 34.8,
      pipeline_fps: 29.8,
      total_latency_ms: 33.5,
      services: [
        {
          name: 'Thermal Optical Sensor',
          category: 'SENSOR',
          status: 'ONLINE',
          latency_ms: 6.2,
          uptime_percent: 99.9,
          last_heartbeat: 'Just now',
          details: 'Recorded Thermal Video stream acquisition nominal',
        },
        {
          name: 'FastAPI Backend Engine',
          category: 'BACKEND',
          status: 'ONLINE',
          latency_ms: 4.1,
          uptime_percent: 99.8,
          last_heartbeat: 'Just now',
          details: 'Uvicorn ASGI async core running on port 8000',
        },
        {
          name: 'YOLO Thermal Model (best.pt)',
          category: 'AI_MODEL',
          status: 'READY',
          latency_ms: 14.2,
          uptime_percent: 98.7,
          last_heartbeat: 'Just now',
          details: '5 classes loaded (Person, Vehicle, Animal, Drone, Person With Bag)',
        },
        {
          name: 'ByteTrack / BoT-SORT Tracker',
          category: 'TRACKER',
          status: 'ACTIVE',
          latency_ms: 5.4,
          uptime_percent: 99.6,
          last_heartbeat: 'Just now',
          details: 'Kalman trajectory state association buffer active',
        },
        {
          name: 'Threat Evaluation Engine',
          category: 'THREAT_ENGINE',
          status: 'READY',
          latency_ms: 2.1,
          uptime_percent: 100.0,
          last_heartbeat: 'Just now',
          details: 'Zone intrusion & velocity overspeed rules armed',
        },
        {
          name: 'SQLite Telemetry Audit Log',
          category: 'DATABASE',
          status: 'ONLINE',
          latency_ms: 1.5,
          uptime_percent: 100.0,
          last_heartbeat: 'Just now',
          details: 'Persistent historical security database connected',
        },
      ],
    };
  },
};
