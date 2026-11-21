import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Portrait, { type Tool } from './Portrait';
import { referenceImage } from './export';
import { manualMask, newDesign, readPhoto, sampleTone, viewLabels, views, type Design, type Height, type Photo, type Point, type Stroke, type View } from './photo';
import MirrorAssistant from './MirrorAssistant';
import './mirror.css';

type Option = 'A' | 'B';
const initialOptions = () => ({ A: newDesign('Bajo'), B: newDesign('Medio') });
const levels: Height[] = ['Bajo', 'Medio', 'Alto'];
const options: Option[] = ['A', 'B'];
const tools: [Tool, string][] = [['ver', 'Ver'], ['dibujar', 'Dibujar línea'], ['mover', 'Mover línea']];
const hints: Record<Tool, string> = {
  ver: '', dibujar: 'Traza con el dedo sobre la foto.', mover: 'Toca una línea y arrástrala a su nueva posición.',
  zona: 'Toca al menos tres puntos alrededor del pelo que quieres rebajar. Luego aplica la zona.',
  tono: 'Toca un punto de piel cerca de la sien, con luz parecida a la del cabello.',
};
export default function MirrorPage() {
  const [assistant, setAssistant] = useState(true);
  const [consultation, setConsultation] = useState(0);
  const [photos, setPhotos] = useState<Partial<Record<View, Photo>>>({});
  const [view, setView] = useState<View>('front');
  const [styles, setStyles] = useState(initialOptions);
  const [option, setOption] = useState<Option>('A');
  const [mode, setMode] = useState<'edit' | 'compare' | 'fixed'>('edit');
  const [tool, setTool] = useState<Tool>('ver');
  const [thickness, setThickness] = useState(1.2);
  const [outline, setOutline] = useState<Point[]>([]);
  const [hideLines, setHideLines] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [permission, setPermission] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState<Partial<Record<View, string>>>({});
  const [notices, setNotices] = useState<Partial<Record<View, string>>>({});
  const sequence = useRef({ front: 0, left: 0, right: 0 });
  const release = useRef<(() => void) | undefined>(undefined);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const photo = photos[view], design = styles[option], lines = design.lines[view];
  const present = views.filter(v => photos[v]);
  const fixed = mode === 'fixed', comparing = mode === 'compare';
  const downloadUrl = useMemo(() => fixed && permission ? referenceImage(photos, design) : null, [fixed, permission, photos, design]);
  const canFix = present.length > 0 && !views.some(v => busy[v]) && present.every(v => photos[v]?.tone && photos[v]?.mask);

  function clear() {
    release.current?.();
    for (const v of views) sequence.current[v]++;
    setConsultation(n => n + 1); setAssistant(true);
    setPhotos({}); setStyles(initialOptions()); setView('front'); setOption('A'); setTool('ver');
    setMode('edit'); setBusy({}); setNotices({}); setOutline([]); setHideLines(false);
    setPermission(false); setConfirmEnd(false); setZoom(false); setThickness(1.2);
  }
  useEffect(() => {
    const seq = sequence.current;
    const restored = (event: PageTransitionEvent) => { if (event.persisted) clear(); };
    window.addEventListener('pageshow', restored);
    return () => {
      window.removeEventListener('pageshow', restored);
      release.current?.();
      for (const v of views) seq[v]++;
    };
  }, []);
  function selectView(v: View) {
    setView(v); setTool('ver'); setOutline([]); setZoom(false); setHideLines(false);
  }
  function resetEditor() { setTool('ver'); setOutline([]); setZoom(false); setHideLines(false); }
  function patchStyle(patch: Partial<Design>) {
    setStyles(prev => ({ ...prev, [option]: { ...prev[option], ...patch } }));
  }
  function changeLines(next: Stroke[]) {
    setStyles(prev => ({ ...prev, [option]: { ...prev[option], lines: { ...prev[option].lines, [view]: next } } }));
  }
  async function load(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const target = view, id = ++sequence.current[target];
    const current = () => sequence.current[target] === id;
    setBusy(prev => ({ ...prev, [target]: 'Abriendo foto…' }));
    setNotices(prev => ({ ...prev, [target]: '' }));
    resetEditor();
    try {
      const next = await readPhoto(file);
      if (!current()) return;
      if (photos[target]) setConsultation(n => n + 1);
      setPhotos(prev => ({ ...prev, [target]: next }));
      setStyles(prev => {
        const clean = (s: Design) => ({ ...s, lines: { ...s.lines, [target]: [] } });
        return { A: clean(prev.A), B: clean(prev.B) };
      });
      setBusy(prev => ({ ...prev, [target]: 'Detectando el cabello…' }));
      try {
        const { detectHair, releaseDetector } = await import('./segment');
        if (!current()) return;
        release.current = releaseDetector;
        const result = await detectHair(next);
        if (!current()) return;
        setPhotos(prev => {
          const active = prev[target];
          if (!active || active.image !== next.image) return prev;
          return { ...prev, [target]: { ...active, mask: active.mask ?? result.mask, tone: active.tone ?? result.tone } };
        });
      } catch {
        if (current()) setNotices(prev => ({ ...prev, [target]: 'La detección automática no está disponible. Puedes marcar el pelo y tomar el tono de piel en la foto.' }));
      }
    } catch (err) {
      if (current()) setNotices(prev => ({ ...prev, [target]: err instanceof Error && err.message.includes('30 MB') ? err.message : 'No pudimos abrir esa foto. Prueba con una imagen JPG o PNG.' }));
    } finally { if (current()) setBusy(prev => ({ ...prev, [target]: '' })); }
  }
  function setCorrection(point: Point) {
    if (!photo) return;
    if (tool === 'zona') { setOutline(prev => [...prev, point]); return; }
    if (tool === 'tono') {
      setPhotos(prev => ({ ...prev, [view]: { ...photo, tone: sampleTone(photo, point) } }));
      setTool('ver');
    }
  }
  function applyZone() {
    if (!photo) return;
    const mask = manualMask(photo, outline);
    if (!mask) { setNotices(prev => ({ ...prev, [view]: 'Amplía el contorno y vuelve a aplicar la zona.' })); return; }
    setPhotos(prev => ({ ...prev, [view]: { ...photo, mask } })); setNotices(prev => ({ ...prev, [view]: '' }));
    setTool(photo.tone ? 'ver' : 'tono'); setOutline([]);
  }
  function choose(o: Option) {
    setOption(o); setMode('fixed'); resetEditor(); setPermission(false);
  }
  const capture = <div className="mirror-actions"><button type="button" className="mirror-primary" onClick={() => camera.current?.click()}>{photo ? 'Repetir foto' : 'Tomar foto'}</button><button type="button" onClick={() => gallery.current?.click()}>Elegir de galería</button></div>;
  return <section className="mirror">
    <header className="mirror-heading"><div><h1 className="ag-h1">Espejo WS</h1><p>{assistant ? 'Fotografía al cliente de frente y de ambos lados para probar un corte.' : fixed ? 'Referencia elegida para este corte.' : 'Prueba el degradado y dibuja el diseño sobre las fotos del cliente.'}</p></div>
      {(present.length > 0 || views.some(v => busy[v])) && <button onClick={() => setConfirmEnd(true)}>Terminar sesión de fotos</button>}</header>
    {confirmEnd && <div className="mirror-alert" role="group" aria-label="Descartar sesión"><strong>¿Descartar las fotos y los diseños de esta consulta?</strong><div className="mirror-actions"><button className="mirror-primary" onClick={clear}>Sí, descartar</button><button onClick={() => setConfirmEnd(false)}>Seguir con el cliente</button></div></div>}
    <div className="mirror-actions mirror-modes" role="group" aria-label="Herramienta de consulta">
      <button aria-pressed={assistant} onClick={() => setAssistant(true)}>Asistente IA</button>
      <button aria-pressed={!assistant} onClick={() => setAssistant(false)}>Editor manual</button>
    </div>
    <input ref={camera} hidden type="file" accept="image/*" capture="environment" aria-label="Tomar foto con cámara" onChange={load} />
    <input ref={gallery} hidden type="file" accept="image/*" aria-label="Elegir archivo de foto" onChange={load} />
    <div className="mirror-tabs" role="group" aria-label="Vista del cliente">{views.map(v => <button key={v} aria-pressed={v === view} disabled={!assistant && fixed && !photos[v]} onClick={() => selectView(v)}>{viewLabels[v]}{photos[v] && <span aria-label="Foto lista"> ✓</span>}</button>)}</div>
    <div className="mirror-status" aria-live="polite">{busy[view] || notices[view] || ''}</div>
    {!photo ? <div className="mirror-empty"><div className="mirror-frame" aria-hidden="true"><svg viewBox="0 0 170 150" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 42V15h28m94 0h28v27M10 109v26h28m94 0h28v-26"/>{view === 'front' ? <path d="M59 63c0-39 52-39 52 0 0 19-8 36-26 36S59 82 59 63zm-17 58c8-18 23-20 29-23m57 23c-8-18-23-20-29-23"/> : <g transform={view === 'right' ? 'translate(170 0) scale(-1 1)' : undefined}><path d="M60 112l6-29c-11-10-15-26-10-38 5-18 24-25 40-20 12 4 18 15 18 30l8 13-8 4c-2 13-5 19-15 19l-2 19"/><path d="M78 61c-7-4-10 8-3 13"/></g>}</svg></div>
      <h2>{viewLabels[view]}</h2><p>{view === 'front' ? 'Centra la cara y deja visible todo el cabello.' : 'Encuadra la sien, la oreja y la coronilla de este lado.'}</p>{capture}<small>Pide permiso para tomar las fotos. Se preparan en este dispositivo.</small></div> :
      assistant ? <details className="mirror-replace"><summary>Cambiar foto de esta vista</summary><p>Al reemplazar una foto se reinicia el diseño con IA.</p>{capture}</details> :
      <><div className={'mirror-workspace' + (comparing ? ' is-comparing' : '')}>
        {comparing ? <div className="mirror-pair">{options.map(o => <div key={o}><h2>Opción {o} · {styles[o].height}</h2><Portrait photo={photo} view={view} design={styles[o]} label={'Comparación ' + o} /><button className="mirror-primary" disabled={!canFix} onClick={() => choose(o)}>Elegir {o}</button></div>)}</div> :
        <div className="mirror-image-panel"><div className={'mirror-scroll' + (zoom ? ' is-zoomed' : '')}><Portrait key={view + option + mode + tool} photo={photo} view={view} design={design} label={viewLabels[view] + ' · opción ' + option} tool={fixed ? 'ver' : tool}
          width={thickness / 100} hideLines={hideLines} outline={outline} onPoint={setCorrection} onLines={changeLines} /></div>
          <div className="mirror-caption"><span>{viewLabels[view]} · Opción {option}</span><button onClick={() => setZoom(!zoom)} aria-pressed={zoom}>{zoom ? 'Reducir' : 'Ampliar'}</button></div>
          {hints[tool] && <p role="status">{hints[tool]}</p>}
          {tool === 'zona' && <div className="mirror-actions"><button onClick={() => setOutline(prev => prev.slice(0, -1))} disabled={!outline.length}>Quitar punto</button><button className="mirror-primary" disabled={outline.length < 3} onClick={applyZone}>Aplicar zona</button></div>}
        </div>}
        <div className="mirror-controls">
          {fixed ? <><h2>Diseño elegido</h2><p>Opción {option} · Degradado {design.height.toLowerCase()}</p><button onClick={() => { setMode('edit'); setPermission(false); }}>Volver a editar</button>
            <label className="mirror-permission"><input type="checkbox" checked={permission} onChange={e => setPermission(e.target.checked)} /> El cliente autoriza guardar la referencia en este dispositivo.</label>
            {downloadUrl ? <a className="mirror-save mirror-primary" href={downloadUrl} download="espejo-ws-referencia.jpg">Descargar referencia</a> : <button className="mirror-primary" disabled>Descargar referencia</button>}</> :
          comparing ? <><h2>Comparar opciones</h2><p>Puedes elegir una opción completa o probar el degradado de una con las líneas de la otra.</p>
            {options.map(o => { const other = o === 'A' ? 'B' : 'A'; return <button key={o} onClick={() => { setStyles(prev => ({ ...prev, [o]: { ...prev[o], lines: prev[other].lines } })); setOption(o); setMode('edit'); resetEditor(); }}>Usar degradado {o} con líneas {other}</button>; })}
            <button onClick={() => setMode('edit')}>Seguir editando</button></> :
          <><h2>Prueba de corte</h2>
            <div className="mirror-options" role="group" aria-label="Diseño en edición">{options.map(o => <button key={o} aria-pressed={o === option} onClick={() => { setOption(o); resetEditor(); }}>Opción {o}</button>)}</div>
            <fieldset><legend>Altura del degradado</legend><div className="mirror-options">{levels.map(height => <button key={height} aria-pressed={design.height === height} onClick={() => patchStyle({ height })}>{height}</button>)}</div></fieldset>
            <label>Al ras <input type="range" min="0" max="100" value={Math.round(design.closeness * 100)} onChange={e => patchStyle({ closeness: Number(e.target.value) / 100 })} /></label>
            {(!photo.mask || !photo.tone) && !busy[view] && <p className="mirror-warn">{!photo.mask ? 'Marca el contorno del pelo para ver el degradado.' : 'Toma el tono de piel para ver el degradado.'}</p>}
            <div className="mirror-actions"><button aria-pressed={tool === 'zona'} onClick={() => { setTool('zona'); setOutline([]); }}>Marcar zona de pelo</button><button aria-pressed={tool === 'tono'} onClick={() => setTool('tono')}>Tomar tono de piel</button></div>
            <fieldset><legend>Líneas de diseño</legend><div className="mirror-options">{tools.map(([value, label]) => <button key={value} disabled={value === 'mover' && !lines.length} aria-pressed={tool === value} onClick={() => { setTool(value); if (value !== 'ver') setHideLines(false); }}>{label}</button>)}</div></fieldset>
            <label>Grosor de línea <input type="range" min=".4" max="4" step=".1" value={thickness} onChange={e => { const w = Number(e.target.value); setThickness(w); if (lines.length) changeLines(lines.map((s, i) => i === lines.length - 1 ? { ...s, width: w / 100 } : s)); }} /></label>
            <div className="mirror-actions"><button disabled={!lines.length} onClick={() => changeLines(lines.slice(0, -1))}>Deshacer trazo</button><button disabled={!lines.length} aria-pressed={hideLines} onClick={() => { setHideLines(!hideLines); setTool('ver'); }}>{hideLines ? 'Mostrar líneas' : 'Ocultar líneas'}</button></div>
            <button className="mirror-primary" onClick={() => { setMode('compare'); resetEditor(); }}>Comparar A y B</button><button disabled={!canFix} onClick={() => choose(option)}>Fijar este diseño</button>
          </>}
        </div></div>{!fixed && !comparing && <details className="mirror-replace"><summary>Cambiar foto de esta vista</summary><p>Al cambiarla se eliminan las líneas dibujadas sobre ella en A y B.</p>{capture}</details>}</>}
    <div hidden={!assistant}>
      <MirrorAssistant key={consultation} photos={photos} view={view} reading={views.some(v => !!busy[v])}
        onMask={(v, corrected) => setPhotos(prev => ({ ...prev, [v]: corrected }))} />
    </div>
    <p className="mirror-foot">Vista previa orientativa. Al terminar la consulta se borran las fotos de esta pantalla.</p>
  </section>;
}
