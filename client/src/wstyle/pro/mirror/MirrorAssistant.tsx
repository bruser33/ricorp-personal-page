import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { API_BASE, api } from '../../agenda/api';
import { manualMask, newDesign, viewLabels, views, type Photo, type Point, type View } from './photo';
import Portrait from './Portrait';
import { prepareSheet, unpackSheet, type Result, type Scope, type Sources } from './aiSheet';

const design = newDesign('Bajo');
type Props = {
  photos: Partial<Sources>; view: View; reading: boolean;
  onMask: (view: View, photo: Photo) => void;
};

function Preview({ source, label }: { source: HTMLCanvasElement; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => { canvas.current!.getContext('2d')!.drawImage(source, 0, 0); }, [source]);
  return <canvas ref={canvas} width={source.width} height={source.height} className="mirror-photo" role="img" aria-label={label} />;
}

export default function MirrorAssistant({ photos, view, reading, onMask }: Props) {
  const [prompt, setPrompt] = useState('');
  const [consent, setConsent] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [check, setCheck] = useState(0);
  const [configError, setConfigError] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [previous, setPrevious] = useState<Result | null>(null);
  const [before, setBefore] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outline, setOutline] = useState<{ view: View; points: Point[] } | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    api<{ enabled: boolean }>('/api/pro/mirror/status').then(s => {
      if (active) { setEnabled(s.enabled); setConfigError(false); }
    }, () => { if (active) setConfigError(true); });
    return () => { active = false; };
  }, [check]);
  useEffect(() => () => pending.current?.abort(), []);
  const photo = photos[view];
  const marking = outline?.view === view;
  const ready = views.every(v => photos[v]?.mask);
  const count = views.filter(v => photos[v]).length;
  async function generate() {
    if (!ready || !enabled || !consent || !prompt.trim() || pending.current || outline || reading) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError('');
    try {
      const sources = photos as Sources;
      const [image, mask] = await prepareSheet(sources, result, scope);
      const body = new FormData();
      body.set('image', image, 'views.png'); body.set('mask', mask, 'mask.png');
      body.set('consent', 'yes'); body.set('prompt', prompt.trim());
      const res = await fetch(API_BASE + '/api/pro/mirror/edit', {
        credentials: 'include', method: 'POST', headers: { 'X-WS-Mirror': '1' },
        body, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(195000)]),
      });
      if (!res.ok) throw Error((await res.json().catch(() => ({}))).message || 'No pudimos generar el corte.');
      const next = await unpackSheet(await res.blob(), sources, result, scope);
      if (!controller.signal.aborted) {
        setPrevious(result); setResult(next); setBefore(false); setPrompt('');
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error && e.name === 'Error' ? e.message : 'La edición se interrumpió. Conservamos la versión anterior.');
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <section className="mirror-assistant mirror-controls" aria-label="Asistente de corte con IA">
    <h2>Asistente de corte con IA</h2>
    {photo && (marking ? <><p>Toca puntos alrededor del cabello. Deja fuera la cara y la oreja.</p>
      <Portrait photo={photo} view={view} label={viewLabels[view]} design={design} tool="zona" outline={outline.points}
        onPoint={point => setOutline({ view, points: [...outline.points, point] })} />
      <div className="mirror-actions"><button onClick={() => {
        const mask = manualMask(photo, outline.points);
        if (!mask) { setError('Marca una zona más amplia alrededor del pelo.'); return; }
        onMask(view, { ...photo, mask }); setOutline(null); setError('');
      }} disabled={outline.points.length < 3}>Aplicar zona</button><button onClick={() => setOutline(null)}>Cancelar</button></div></> :
      <><Preview source={result && !before ? result[view] : photo.image} label={viewLabels[view] + (result && !before ? ' después' : ' antes')} />
        {result ? <div className="mirror-actions">
          <button aria-pressed={before} onClick={() => setBefore(true)}>Antes</button>
          <button aria-pressed={!before} onClick={() => setBefore(false)}>Después</button>
          {previous && <button disabled={busy} onClick={() => { setResult(previous); setPrevious(null); setBefore(false); }}>Deshacer ajuste</button>}
        </div> : <button disabled={busy || reading} onClick={() => setOutline({ view, points: [] })}>{photo.mask ? 'Corregir zona de cabello' : 'Marcar zona de cabello'}</button>}
      </>)}
    {count < 3 && <p>{count} de 3 fotos. Elige las vistas de frente y ambos laterales para preparar el corte.</p>}
    {count === 3 && !ready && !reading && <p>Marca la zona de cabello en {views.filter(v => !photos[v]?.mask).map(v => viewLabels[v]).join(', ')}.</p>}
    <label>{result ? '¿Qué quieres ajustar?' : '¿Qué corte quieres probar?'}
      <textarea value={prompt} disabled={busy} maxLength={700} rows={3} onChange={e => setPrompt(e.target.value)}
        placeholder={result ? 'Agrégale una línea curva sobre la sien derecha' : 'Degradado medio, al ras cerca de las orejas. Conserva el largo de arriba.'} />
    </label>
    {result && <label>Aplicar ajuste a <select value={scope} disabled={busy} onChange={e => setScope(e.target.value as Scope)}>
      <option value="all">Las tres vistas</option>{views.map(v => <option key={v} value={v}>{viewLabels[v]}</option>)}</select></label>}
    <label className="mirror-permission"><input type="checkbox" checked={consent} disabled={busy || count !== 3} onChange={e => setConsent(e.target.checked)} />
      El cliente autoriza enviar sus tres fotos y la instrucción a OpenAI para esta consulta.</label>
    {configError ? <p role="status">No pudimos consultar la disponibilidad. <button onClick={() => setCheck(c => c + 1)}>Reintentar</button></p> :
      enabled === false && <p role="status">La barbería aún no ha activado la generación con IA. Puedes usar el editor manual.</p>}
    <button className="mirror-primary" disabled={!enabled || !ready || !consent || !prompt.trim() || busy || reading || !!outline}
      onClick={generate}>{busy ? 'Generando…' : result ? 'Aplicar ajuste con IA' : 'Generar corte con IA'}</button>
    {busy && <p role="status">Creando la vista previa de tu cliente. Puede tardar unos minutos.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
