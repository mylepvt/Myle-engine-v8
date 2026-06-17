async function reverseGeocode(lat: number, lon: number): Promise<{ city?: string; state?: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } },
    )
    if (!res.ok) return {}
    const data = await res.json() as { address?: Record<string, string> }
    const addr = data.address ?? {}
    return {
      city: addr.city || addr.town || addr.village || addr.county || undefined,
      state: addr.state || undefined,
    }
  } catch {
    return {}
  }
}

export type GpsPayload = {
  latitude?: number
  longitude?: number
  accuracy_meters?: number
  city?: string
  state?: string
}

export async function getGps(): Promise<GpsPayload> {
  if (!('geolocation' in navigator)) return {}
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const base: GpsPayload = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_meters: pos.coords.accuracy,
        }
        const geo = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        resolve({ ...base, ...geo })
      },
      () => resolve({}),
      { timeout: 5000, maximumAge: 60_000 },
    )
  })
}
