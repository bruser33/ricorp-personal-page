// GET /api/wstyle/points/program para la landing (SPEC-57 §10): tope de 4 s y sin cookies, como el catálogo.
// Cualquier falla → false (el bloque simplemente no aparece).
export async function loadProgram(apiBase: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const r = await fetch(`${apiBase}/api/wstyle/points/program`, { signal: AbortSignal.timeout(timeoutMs), credentials: 'omit' });
    if (!r.ok) return false;
    const d = await r.json();
    return d?.enabled === true;
  } catch {
    return false;
  }
}
