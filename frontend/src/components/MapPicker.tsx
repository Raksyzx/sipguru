import { useState, useRef, useEffect, useCallback } from "react";
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
function MapController({ 
  position, 
  onMapMove,
  onBoundsChange 
}: { 
  position: [number, number]; 
  onMapMove: (lat: number, lng: number) => void;
  onBoundsChange: (bounds: [[number, number], [number, number]]) => void;
}) {
  const map = useMap();
  const movedBySearch = useRef(false);

  // Update map center when position changes from search
  useEffect(() => {
    if (movedBySearch.current) {
      map.flyTo(position as LatLngExpression, 17, { duration: 1.5 });
      movedBySearch.current = false;
    }
  }, [position, map]);

  // Update bounds on moveend
  useMapEvents({
    moveend(e) {
      const mapInstance = e.target;
      if (!movedBySearch.current) {
        const center = mapInstance.getCenter();
        onMapMove(center.lat, center.lng);
      }
      // Update bounds for search bias
      const b = mapInstance.getBounds();
      onBoundsChange([[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]);
      movedBySearch.current = false;
    },
  });

  return null;
}

function MapEvents({ 
  onMapClick,
  onRightClick 
}: { 
  onMapClick: (lat: number, lng: number) => void;
  onRightClick?: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e: any) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
    contextmenu(e: any) {
      onRightClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface SearchResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
  importance?: number;
  address?: Record<string, string>;
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
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [mapBounds, setMapBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [reverseGeocode, setReverseGeocode] = useState<string>("");
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setPosition([lat, lng]);
    onLocationSelect(lat, lng);
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    setSelectedIndex(-1);
    // Trigger reverse geocoding for clicked location
    reverseGeocodeLocation(lat, lng);
  }, [onLocationSelect]);

  // Reverse geocoding - get address from coordinates
  const reverseGeocodeLocation = useCallback(async (lat: number, lng: number) => {
    setIsReverseGeocoding(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      const data = await response.json();
      if (data.display_name) {
        setReverseGeocode(data.display_name);
      }
    } catch (error) {
      console.error("Reverse geocode error:", error);
    } finally {
      setIsReverseGeocoding(false);
    }
  }, []);

  // Search location using Nominatim with map bounds bias
  const searchLocation = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      setSelectedIndex(-1);
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsSearching(true);
    setSelectedIndex(-1);
    
    try {
      // Build URL with bounds bias for better local results
      const params = new URLSearchParams({
        format: "json",
        q: query,
        countrycodes: "id",
        limit: "8",
        addressdetails: "1",
      });

      // Add viewbox bias if map bounds available
      if (mapBounds) {
        const [[south, west], [north, east]] = mapBounds;
        params.append("viewbox", `${west},${south},${east},${north}`);
        params.append("bounded", "0"); // 0 = prefer but not restrict
      }

      const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
      console.log("[MapPicker] Searching:", query, "URL:", url);
      
      const response = await fetch(
        url,
        { 
          signal: abortControllerRef.current.signal,
          headers: {
            "Accept-Language": "id,en",
            "User-Agent": "SIPGURU-App/1.0 (https://sipguru.vercel.app)"
          }
        }
      );
      
      console.log("[MapPicker] Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[MapPicker] Search failed:", response.status, errorText);
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data: SearchResult[] = await response.json();
      console.log("[MapPicker] Results count:", data.length, "Data:", data.slice(0, 3));
      
      // Sort by importance and type priority
      const typePriority: Record<string, number> = {
        building: 1, amenity: 2, shop: 3, office: 4, 
        tourism: 5, highway: 6, place: 7, natural: 8
      };
      
      data.sort((a, b) => {
        const aPriority = typePriority[a.type || ""] || 99;
        const bPriority = typePriority[b.type || ""] || 99;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return (b.importance || 0) - (a.importance || 0);
      });
      
      setSearchResults(data);
      setShowResults(data.length > 0);
      console.log("[MapPicker] State updated - results:", data.length, "showResults:", data.length > 0);
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("[MapPicker] Search error:", error);
        setSearchResults([]);
        setShowResults(false);
      }
    } finally {
      setIsSearching(false);
    }
  }, [mapBounds]);

  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    console.log("[MapPicker] Input changed:", value);
    setSearchQuery(value);
    setSelectedIndex(-1);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Clear results when input is empty
    if (value.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      console.log("[MapPicker] Debounced search:", value);
      searchLocation(value);
    }, 400);
  }, [searchLocation]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showResults || searchResults.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0) {
          selectSearchResult(searchResults[selectedIndex]);
        }
        break;
      case "Escape":
        setShowResults(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  }, [showResults, searchResults, selectedIndex]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
        setShowResults(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSearchResult = useCallback((result: SearchResult) => {
    const newPos: [number, number] = [parseFloat(result.lat), parseFloat(result.lon)];
    setPosition(newPos);
    onLocationSelect(newPos[0], newPos[1]);
    setSearchQuery(result.display_name.split(',')[0]);
    setSearchResults([]);
    setShowResults(false);
    setSelectedIndex(-1);
    // Also reverse geocode for full address
    reverseGeocodeLocation(newPos[0], newPos[1]);
  }, [onLocationSelect, reverseGeocodeLocation]);

  // Get current location
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocation tidak didukung browser ini");
      return;
    }
    setIsSearching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPosition(newPos);
        onLocationSelect(newPos[0], newPos[1]);
        setSearchQuery("Lokasi saya");
        reverseGeocodeLocation(newPos[0], newPos[1]);
        setIsSearching(false);
      },
      (err) => {
        console.error("Geolocation error:", err);
        alert("Tidak bisa mendapatkan lokasi: " + err.message);
        setIsSearching(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [onLocationSelect, reverseGeocodeLocation]);

  // Format address for display
  const formatAddress = (result: SearchResult) => {
    const parts: string[] = [];
    if (result.address) {
      const { road, house_number, neighbourhood, village, suburb, city, county, state, postcode } = result.address;
      if (road) parts.push(`${road}${house_number ? ` ${house_number}` : ""}`);
      if (neighbourhood) parts.push(neighbourhood);
      else if (village) parts.push(village);
      else if (suburb) parts.push(suburb);
      if (city) parts.push(city);
      else if (county) parts.push(county);
      else if (state) parts.push(state);
      if (postcode) parts.push(postcode);
    }
    return parts.length > 0 ? parts.join(", ") : result.display_name;
  };

  return (
    <div className="space-y-3">
      {/* Search Box */}
      <div className="relative" ref={resultsRef}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={handleSearchInput}
              onKeyDown={handleKeyDown}
              onFocus={() => {
              console.log("[MapPicker] Focus - query:", searchQuery, "results:", searchResults.length, "showResults:", showResults);
              if (searchQuery.length >= 2 && searchResults.length > 0) {
                setShowResults(true);
              } else if (searchQuery.length >= 2) {
                searchLocation(searchQuery);
              }
            }}
              placeholder="Cari lokasi, alamat, atau tempat (contoh: SMKN 7 Serang, Monas, Jalan Sudirman)"
              className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none pr-10"
              autoComplete="off"
            />
            {(isSearching || isReverseGeocoding) && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Mencari...</span>
              </div>
            )}
            {!isSearching && searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setSearchResults([]); setShowResults(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            )}
          </div>
          
          {/* Current Location Button */}
          <button
            type="button"
            onClick={getCurrentLocation}
            disabled={isSearching}
            className="px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            title="Gunakan lokasi saya (GPS)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="hidden sm:inline">Lokasi Saya</span>
          </button>
        </div>

        {/* Search Results Dropdown */}
        {showResults && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-stone-900 rounded-lg shadow-xl border border-gray-200 dark:border-stone-700 max-h-80 overflow-y-auto z-50 animate-in slide-in-from-top-2 duration-150">
                    {searchResults.map((result, idx) => (
                      <button
                        key={result.place_id || idx}
                        onClick={() => selectSearchResult(result)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full px-4 py-3 text-left text-sm transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0 flex items-start gap-3 ${
                          idx === selectedIndex
                            ? "bg-emerald-50 dark:bg-emerald-950/30"
                            : "hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        }`}
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                          <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">{result.display_name.split(',')[0]}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{formatAddress(result)}</p>
                          {result.type && (
                            <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full capitalize">
                              {result.type.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                    {(searchResults.length === 0 && !isSearching && searchQuery.length >= 2) && (
                      <div className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                        Tidak ditemukan hasil untuk "{searchQuery}"
                      </div>
                    )}
                  </div>
                )}
      </div>

      {/* Reverse Geocode Address Display */}
      {reverseGeocode && !isReverseGeocoding && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.895L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-xs text-emerald-800 dark:text-emerald-300 flex-1">{reverseGeocode}</p>
            <button
              onClick={() => { setReverseGeocode(""); setSearchQuery(""); }}
              className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-medium flex-shrink-0"
            >
              Hapus
            </button>
          </div>
        </div>
      )}

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
          <MapController 
            position={position} 
            onMapMove={(lat, lng) => {
              setPosition([lat, lng]);
              onLocationSelect(lat, lng);
            }}
            onBoundsChange={setMapBounds}
          />
          <MapEvents onMapClick={handleMapClick} />
        </MapContainer>
        
        {/* Info overlay */}
        <div className="absolute bottom-4 left-4 right-4 bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-stone-700">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Klik peta</span> untuk set lokasi, atau gunakan pencarian di atas
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 flex flex-wrap gap-4">
            <span>Lat: {position[0].toFixed(6)}</span>
            <span>Lng: {position[1].toFixed(6)}</span>
            <span>Zoom: 17</span>
            <span>Radius: {radius}m</span>
          </p>
        </div>
      </div>
    </div>
  );
}