import axios from "axios";
import { useAuthStore } from "../stores";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const state = useAuthStore.getState();
    const accessToken = state?.accessToken;
    
    // Debug logging
    console.log('[API] Request to:', config.url, '| Token exists:', !!accessToken);
    
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log('[API] Response:', response.config.url, response.status);
    return response;
  },
  (error) => {
    console.error('[API] Response error:', error.config?.url, error.code, error.message, error.response?.status, error.response?.data);
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
