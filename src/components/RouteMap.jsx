import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function pinIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #0a0a0a;box-shadow:0 0 0 2px ${color}66"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const OPERATOR_ICON = pinIcon("#059669"); // emerald-600 — recovery unit, always
const STRANDED_ICON = pinIcon("#ea580c"); // orange-600 — stuck driver, always

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  }, [points, map]);
  return null;
}

// OSRM's public demo routing server — free, no API key, fine for demo
// traffic. Swap for a paid routing provider before relying on this at
// production scale (same caveat as the direct OSM tile server already
// in use for map tiles).
async function fetchRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("routing request failed");
  const data = await res.json();
  const coords = data.routes?.[0]?.geometry?.coordinates;
  if (!coords?.length) throw new Error("no route found");
  return coords.map(([lng, lat]) => [lat, lng]);
}

export default function RouteMap({ operatorLocation, operatorLabel, strandedLocation, strandedLabel }) {
  const [routeLine, setRouteLine] = useState(null);
  const [routeFailed, setRouteFailed] = useState(false);

  const opLat = operatorLocation?.lat;
  const opLng = operatorLocation?.lng;
  const stLat = strandedLocation?.lat;
  const stLng = strandedLocation?.lng;

  useEffect(() => {
    if (opLat == null || opLng == null || stLat == null || stLng == null) return;
    let cancelled = false;
    fetchRoute({ lat: opLat, lng: opLng }, { lat: stLat, lng: stLng })
      .then((line) => {
        if (!cancelled) {
          setRouteLine(line);
          setRouteFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRouteLine(null);
          setRouteFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [opLat, opLng, stLat, stLng]);

  if (opLat == null || opLng == null || stLat == null || stLng == null) {
    const waitingOn = opLat == null ? operatorLabel || "the recovery unit" : strandedLabel || "the stranded driver";
    return (
      <div className="h-[320px] flex items-center justify-center text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl">
        Waiting for {waitingOn}'s location...
      </div>
    );
  }

  const opPoint = [opLat, opLng];
  const stPoint = [stLat, stLng];
  const points = [opPoint, stPoint];

  return (
    <div className="rounded-xl overflow-hidden border border-gray-700 h-[320px] isolate relative z-0">
      <MapContainer center={opPoint} zoom={12} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />

        <Marker position={opPoint} icon={OPERATOR_ICON}>
          <Popup>{operatorLabel}</Popup>
        </Marker>
        <Marker position={stPoint} icon={STRANDED_ICON}>
          <Popup>{strandedLabel}</Popup>
        </Marker>

        {routeLine && <Polyline positions={routeLine} pathOptions={{ color: "#f97316", weight: 4, opacity: 0.85 }} />}
        {routeFailed && (
          <Polyline positions={points} pathOptions={{ color: "#f97316", weight: 3, opacity: 0.6, dashArray: "6 8" }} />
        )}
      </MapContainer>
    </div>
  );
}
