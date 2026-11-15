import axios from "axios";
import { useAuthStore } from "../stores";

/**
 * Normalize the API base URL so it ALWAYS ends with "/api".
 *
 * Why: every frontend call uses paths WITHOUT the "/api" prefix
 * (e.g. api.get("/auth/login")), while all backend routes live under
 * "/api/..." (e.g. /api/auth/login). If VITE_API_URL is empty (the default
 * in a fresh clone, since .env files are gitignored) or points at the host
 * root without "/api", requests resolve to /auth/login and FastAPI returns
 * a 404 "Not Found" — the exact login failure reported.
 *
 * This helper makes the app resilient in every deployment mode:
 *  - Same-origin (SPA served by the backend): baseURL "/api" -> /api/auth/login
 *  - Vite dev proxy: "/api" is proxied to the backend target
 *  - Explicit absolute URL with or without "/api": normalized correctly
 */
function resolveApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

  // No env var -> same-origin relative "/api" (works for SPA + dev proxy)
  if (!raw) return "/api";

  // Already ends with /api -> use as-is
  if (/(^|\/)api$/.test(raw)) return raw;

  // Otherwise append /api
  return `${raw}/api`;
}

const API_URL = resolveApiBaseUrl();

const api = axios.create({
  baseURL: API_URL,
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
