// Salt Lake / Wasatch Front — fallback center used when location access
// isn't available, so the demo still works without granting permission.
export const DEMO_CENTER = { lat: 40.58, lng: -111.63 };

function randomNear(center, spread = 0.08) {
  return {
    lat: center.lat + (Math.random() - 0.5) * spread,
    lng: center.lng + (Math.random() - 0.5) * spread,
  };
}

export function formatCoordLabel(lat, lng) {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)} ${latDir}, ${Math.abs(lng).toFixed(4)} ${lngDir}`;
}

// Resolves with { lat, lng, approx } — approx is true when we fell back to a
// randomized demo location instead of the browser's real geolocation.
export function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ...randomNear(DEMO_CENTER), approx: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, approx: false }),
      () => resolve({ ...randomNear(DEMO_CENTER), approx: true }),
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}
