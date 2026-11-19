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
  
  // Log the value for debugging (will appear in browser console)
  console.log('[API] VITE_API_URL from env:', raw || '(not set, using default)');
  
  // No env var -> same-origin relative "/api" (works for SPA + dev proxy)
  if (!raw) {
    console.warn('[API] No VITE_API_URL found, using relative /api (dev/proxy mode)');
    return "/api";
  }
  
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
    console.log('[API] Request to:', config.url, '| BaseURL:', config.baseURL, '| Token exists:', !!accessToken, '| Token preview:', accessToken ? accessToken.slice(0, 20) + '...' : 'none');
    
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    } else {
      console.warn('[API] No access token found for request to:', config.url);
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
    console.error('[API] Response error:', {
      url: error.config?.url,
      code: error.code,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      baseURL: error.config?.baseURL,
      isNetworkError: !error.response && error.code !== 'ECONNABORTED'
    });
    
    // Handle network errors (no response from server)
    if (!error.response && error.code !== 'ECONNABORTED') {
      console.error('[API] Network error - server unreachable. Check CORS, backend status, or internet connection.');
    }
    
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
