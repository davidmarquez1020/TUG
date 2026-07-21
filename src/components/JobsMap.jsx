import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEMO_CENTER } from "../lib/geo.js";

function pinIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #0a0a0a;box-shadow:0 0 0 2px ${color}66"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const JOB_ICON = pinIcon("#ea580c"); // orange-600
const SELF_ICON = pinIcon("#059669"); // emerald-600

// keeps the map centered on the caller's location if it resolves after
// the map has already mounted (e.g. geolocation permission was slow)
function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], map.getZoom());
  }, [center, map]);
  return null;
}

export default function JobsMap({ jobs, selfLocation, selfLabel = "You", onAccept, acceptDisabled }) {
  const center = selfLocation || DEMO_CENTER;
  const pinned = jobs.filter((j) => j.lat != null && j.lng != null);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-700 h-[440px] isolate relative z-0">
      <MapContainer center={[center.lat, center.lng]} zoom={12} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter center={selfLocation} />

        {selfLocation && (
          <Marker position={[selfLocation.lat, selfLocation.lng]} icon={SELF_ICON}>
            <Popup>{selfLabel}</Popup>
          </Marker>
        )}

        {pinned.map((j) => (
          <Marker key={j.id} position={[j.lat, j.lng]} icon={JOB_ICON}>
            <Popup>
              <div className="text-xs space-y-1 min-w-[140px]">
                <p className="font-semibold text-gray-900">{j.situationLabel}</p>
                <p className="text-gray-600">{j.vehicleLabel} &middot; ${j.payout}</p>
                {j.equipment?.length > 0 && <p className="text-gray-500">{j.equipment.join(", ")}</p>}
                {onAccept && (
                  <button
                    onClick={() => onAccept(j)}
                    disabled={acceptDisabled}
                    className="mt-1 w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-400 text-white text-xs font-semibold"
                  >
                    Accept job
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
