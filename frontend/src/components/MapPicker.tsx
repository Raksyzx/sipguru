import { useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from "react-leaflet";
import { Icon } from "leaflet";
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

  const handleMapClick = (lat: number, lng: number) => {
    setPosition([lat, lng]);
    onLocationSelect(lat, lng);
  };

  return (
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
        <MapEvents onMapClick={handleMapClick} />
      </MapContainer>
      
      {/* Info overlay */}
      <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-stone-700">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">Klik peta</span> untuk set lokasi
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          Lat: {position[0].toFixed(6)}, Lng: {position[1].toFixed(6)}
        </p>
      </div>
    </div>
  );
}