/* Ubicar direcciones (asunción 14: Nominatim/OpenStreetMap desde el server). Es un
   servicio externo: los tests inyectan su propio geocodificador (la BD sigue siendo
   real). Política de Nominatim: User-Agent identificable y ≤ 1 req/s (uso bajo). */
export function createNominatimGeocoder({ fetchImpl = fetch, userAgent = 'ws-style-agenda/1.0 (ricorp.cl)', logger = console } = {}) {
  return async function geocode({ street, commune }) {
    const q = `${street}, ${commune}, Chile`;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cl&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, 'Accept-Language': 'es' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const [hit] = await res.json();
      if (!hit) return null;
      return { lat: Number(hit.lat), lng: Number(hit.lon), formatted: hit.display_name };
    } catch (err) {
      logger.error('[geocoder] error:', err.message);
      return null;
    }
  };
}
