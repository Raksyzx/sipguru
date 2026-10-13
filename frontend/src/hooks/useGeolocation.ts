import { useState, useEffect } from "react";

interface GeolocationState {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export const useGeolocation = (enabled: boolean = true) => {
  const [location, setLocation] = useState<GeolocationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
        setLoading(false);
      },
      (err) => {
        let errorMessage = "Gagal mendapatkan lokasi";
        
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = "Izin lokasi ditolak. Silakan izinkan akses lokasi.";
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = "Lokasi tidak dapat ditentukan.";
            break;
          case err.TIMEOUT:
            errorMessage = "Permintaan lokasi timeout.";
            break;
          default:
            errorMessage = "Terjadi kesalahan saat mengambil lokasi.";
        }
        
        setError(errorMessage);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [enabled]);

  const reload = () => {
    if (!enabled || !navigator.geolocation) return;
    setLoading(true);
    setError(null);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
        setLoading(false);
      },
      () => {
        setError("Gagal memuat ulang lokasi");
        setLoading(false);
      }
    );
  };

  return {
    location,
    loading,
    error,
    reload,
  };
};
