import { useState, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from "react-leaflet";
import { Icon, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon issue in React
const markerIcon = new Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface MapPickerProps {
  initialLat?: number;
  initialLng?: number;
  radius?: number;
  onLocationSelect: (lat: number, lng: number) => void;
}

// Component to handle map movement
function MapController({ position, onMapMove }: { position: [number, number]; onMapMove: (lat: number, lng: number) => void }) {
  const map = useMap();
  const movedBySearch = useRef(false);

  // Update map center when position changes from search
  useEffect(() => {
    if (movedBySearch.current) {
      map.flyTo(position as LatLngExpression, 17, { duration: 1.5 });
      movedBySearch.current = false;
    }
  }, [position, map]);

  useMapEvents({
    moveend(e) {
      if (!movedBySearch.current) {
        const center = e.target.getCenter();
        onMapMove(center.lat, center.lng);
      }
      movedBySearch.current = false;
    },
  });

  return null;
}

function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e: any) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function MapPicker({ 
  initialLat = -6.2088, 
  initialLng = 106.8456, 
  radius = 150,
  onLocationSelect 
}: MapPickerProps) {
  const [position, setPosition] = useState<[number, number]>([initialLat, initialLng]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ lat: string; lon: string; display_name: string }>>([]);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMapClick = (lat: number, lng: number) => {
    setPosition([lat, lng]);
    onLocationSelect(lat, lng);
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
  };

  // Search location using Nominatim (OpenStreetMap)
  const searchLocation = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=id&limit=5`
      );
      const data = await response.json();
      setSearchResults(data);
      setShowResults(true);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchLocation(value);
    }, 500);
  };

  const selectSearchResult = (result: { lat: string; lon: string; display_name: string }) => {
    const newPos: [number, number] = [parseFloat(result.lat), parseFloat(result.lon)];
    setPosition(newPos);
    onLocationSelect(newPos[0], newPos[1]);
    setSearchQuery(result.display_name.split(',')[0]); // Show short name
    setSearchResults([]);
    setShowResults(false);
  };

  return (
    <div className="space-y-3">
      {/* Search Box */}
      <div className="relative">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchInput}
            onFocus={() => searchQuery.length >= 3 && setShowResults(true)}
            placeholder="Cari lokasi (contoh: Monas, Jakarta)"
            className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          {isSearching && (
            <div className="flex items-center px-3">
              <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-stone-900 rounded-lg shadow-xl border border-gray-200 dark:border-stone-700 max-h-60 overflow-y-auto z-50">
            {searchResults.map((result, idx) => (
              <button
                key={idx}
                onClick={() => selectSearchResult(result)}
                className="w-full px-4 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0"
              >
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300 line-clamp-2">{result.display_name}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative w-full h-80 rounded-xl overflow-hidden border-2 border-gray-200 dark:border-stone-700">
        <MapContainer
          center={position}
          zoom={17}
          scrollWheelZoom={true}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={position} icon={markerIcon} />
          <Circle
            center={position}
            radius={radius}
            pathOptions={{ 
              color: "#10B981", 
              fillColor: "#10B981", 
              fillOpacity: 0.2,
              weight: 2
            }}
          />
          <MapController position={position} onMapMove={(lat, lng) => {
            setPosition([lat, lng]);
            onLocationSelect(lat, lng);
          }} />
          <MapEvents onMapClick={handleMapClick} />
        </MapContainer>
        
        {/* Info overlay */}
        <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-stone-700">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Klik peta</span> atau cari lokasi
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            Lat: {position[0].toFixed(6)}, Lng: {position[1].toFixed(6)}
          </p>
        </div>
      </div>
    </div>
  );
}