import axios from 'axios';
import {
  SystemStatusResponse,
  ThermalDetectionObject,
  AnalyticsData,
  Zone,
  SystemSettings,
  VideoUploadResponse,
  VideoStatusResponse,
  AlertRecord,
  SnapshotResponse,
  SnapshotListItem
} from '../types/schema';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  // System Status
  getSystemStatus: async (): Promise<SystemStatusResponse> => {
    const res = await apiClient.get<SystemStatusResponse>('/status');
    return res.data;
  },

  // Live Frame Detections
  getDetections: async (): Promise<ThermalDetectionObject[]> => {
    const res = await apiClient.get<ThermalDetectionObject[]>('/detections');
    return res.data;
  },

  getTracks: async (): Promise<ThermalDetectionObject[]> => {
    const res = await apiClient.get<ThermalDetectionObject[]>('/tracks');
    return res.data;
  },

  getThreats: async (): Promise<ThermalDetectionObject[]> => {
    const res = await apiClient.get<ThermalDetectionObject[]>('/threats');
    return res.data;
  },

  // Analytics
  getAnalytics: async (): Promise<AnalyticsData> => {
    const res = await apiClient.get<AnalyticsData>('/analytics');
    return res.data;
  },

  // Restricted Zones CRUD
  getZones: async (): Promise<Zone[]> => {
    const res = await apiClient.get<Zone[]>('/zones');
    return res.data;
  },

  createZone: async (zone: Omit<Zone, 'id'>): Promise<Zone> => {
    const res = await apiClient.post<Zone>('/zones', zone);
    return res.data;
  },

  updateZone: async (id: string, zone: Partial<Zone>): Promise<Zone> => {
    const res = await apiClient.put<Zone>(`/zones/${id}`, zone);
    return res.data;
  },

  deleteZone: async (id: string): Promise<void> => {
    await apiClient.delete(`/zones/${id}`);
  },

  // Settings
  getSettings: async (): Promise<SystemSettings> => {
    const res = await apiClient.get<SystemSettings>('/settings');
    return res.data;
  },

  updateSettings: async (settings: SystemSettings): Promise<SystemSettings> => {
    const res = await apiClient.put<SystemSettings>('/settings', settings);
    return res.data;
  },

  resetSettings: async (): Promise<SystemSettings> => {
    const res = await apiClient.post<SystemSettings>('/settings/reset');
    return res.data;
  },

  // Alert History
  getAlertHistory: async (params?: { limit?: number; severity?: string; object_class?: string }): Promise<AlertRecord[]> => {
    const res = await apiClient.get<AlertRecord[]>('/alerts/history', { params });
    return res.data;
  },

  updateAlertStatus: async (id: string, status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'): Promise<AlertRecord> => {
    const res = await apiClient.patch<AlertRecord>(`/alerts/${id}`, { status });
    return res.data;
  },

  clearAlertHistory: async (): Promise<{ message: string; deleted_count: number }> => {
    const res = await apiClient.delete<{ message: string; deleted_count: number }>('/alerts/history');
    return res.data;
  },

  // Video Upload & Analysis Control
  uploadVideo: async (file: File): Promise<VideoUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<VideoUploadResponse>('/video/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  startVideoAnalysis: async (videoId: string): Promise<VideoStatusResponse> => {
    const res = await apiClient.post<VideoStatusResponse>('/video/start', { video_id: videoId });
    return res.data;
  },

  pauseVideoAnalysis: async (videoId: string): Promise<VideoStatusResponse> => {
    const res = await apiClient.post<VideoStatusResponse>('/video/pause', { video_id: videoId });
    return res.data;
  },

  resumeVideoAnalysis: async (videoId: string): Promise<VideoStatusResponse> => {
    const res = await apiClient.post<VideoStatusResponse>('/video/resume', { video_id: videoId });
    return res.data;
  },

  stopVideoAnalysis: async (videoId: string): Promise<VideoStatusResponse> => {
    const res = await apiClient.post<VideoStatusResponse>('/video/stop', { video_id: videoId });
    return res.data;
  },

  getVideoStatus: async (): Promise<VideoStatusResponse> => {
    const res = await apiClient.get<VideoStatusResponse>('/video/status');
    return res.data;
  },

  getVideoFileUrl: (videoId: string): string => {
    return `${API_BASE_URL}/video/file/${videoId}`;
  },

  deleteVideo: async (videoId: string): Promise<VideoStatusResponse> => {
    const res = await apiClient.delete<VideoStatusResponse>(`/video/${videoId}`);
    return res.data;
  },

  clearActiveVideo: async (): Promise<VideoStatusResponse> => {
    const res = await apiClient.post<VideoStatusResponse>('/video/clear');
    return res.data;
  },

  // Snapshot Evidence API
  saveSnapshot: async (imageData: string): Promise<SnapshotResponse> => {
    const res = await apiClient.post<SnapshotResponse>('/snapshots', { image_data: imageData });
    return res.data;
  },

  getSnapshots: async (): Promise<SnapshotListItem[]> => {
    const res = await apiClient.get<SnapshotListItem[]>('/snapshots');
    return res.data;
  },
};
