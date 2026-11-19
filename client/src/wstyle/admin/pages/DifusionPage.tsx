import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { admin } from '../api';
import {
  addressLine, displayLink, FILES, hoursLine, KIT_TEXTS, kitLink, kitText, POSTER, qrMatrix, qrSvg, siteOrigin, type KitText, type PosterSize,
} from '../difusion';
import { canvasBlob, ensureBrandFonts, renderPoster, renderQrPng, renderStory, saveBlob, shareFile } from '../kitDraw';

// Difusión (SPEC-58): el kit para compartir el link de reservas. Tu link, QR (PNG/SVG), cartel imprimible A4/Carta,
// placa para historia de Instagram y textos listos para copiar. Todo se genera en el navegador (sin servicios
// externos ni el server). Cada pieza lleva su utm_source para contar las reservas por origen en Estadísticas.
const kitBase = () => siteOrigin(import.meta.env.VITE_SITE_URL as string | undefined, location.origin);

type Fonts = 'loading' | 'ready' | 'error';

function Copy({ text, label = 'Copiar', id }: { text: string; label?: string; id: string }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    if (!ok) { setFailed(true); return; }
    setFailed(false);
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 2000);
  }
  return (
    <button type="button" className="btn btn--ghost kit-copy" data-copy={id} onClick={copy}>
      {done ? 'Copiado' : failed ? 'No se pudo copiar' : label}
      <span className="ag-sr" role="status">{done ? 'Copiado' : failed ? 'No se pudo copiar: mantén presionado el texto para copiarlo' : ''}</span>
    </button>
  );
}

export default function DifusionPage() {
  const BASE = kitBase();
  const [utm, setUtm] = useState(true);
  const [size, setSize] = useState<PosterSize>('a4');
  const [fonts, setFonts] = useState<Fonts>('loading');
  const [lines, setLines] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Imagen de la hoja de impresión, marcada con el tamaño y link con que se dibujó (no se imprime una desfasada).
  const [printImg, setPrintImg] = useState<{ src: string; size: PosterSize; url: string } | null>(null);
  const lastSrc = useRef<string | null>(null);
  const storyRef = useRef<HTMLCanvasElement>(null);
  const posterRef = useRef<HTMLCanvasElement>(null);

  const display = displayLink(BASE);
  const qrUrl = kitLink('qr', BASE, utm);
  const storyUrl = kitLink('historia', BASE, utm);
  const posterUrl = kitLink('cartel', BASE, utm);
  const svg = qrSvg(qrMatrix(qrUrl));

  // CB-03: nada se dibuja hasta que las fuentes de la marca estén cargadas.
  const loadFonts = () => {
    setFonts('loading');
    ensureBrandFonts().then(() => setFonts('ready'), () => setFonts('error'));
  };
  useEffect(() => {
    let alive = true;
    ensureBrandFonts().then(() => alive && setFonts('ready'), () => alive && setFonts('error'));
    return () => { alive = false; };
  }, []);

  // RN-06: solo datos reales. Horario desde la BD; dirección de site.json solo fuera del modo demo.
  useEffect(() => {
    let alive = true;
    Promise.all([
      admin.schedule().then((s) => hoursLine(s.week), () => null),
      fetch('/wstyle/content/site.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(addressLine, () => null),
    ]).then(([hours, address]) => { if (alive) setLines([address, hours].filter((x): x is string => Boolean(x))); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (fonts !== 'ready' || !storyRef.current) return;
    renderStory(storyUrl, display, storyRef.current);
  }, [fonts, storyUrl, display]);
  // El cartel dibujado también alimenta la vista de impresión (oculta en pantalla): [Imprimir] solo llama a print().
  useEffect(() => {
    const c = posterRef.current;
    if (fonts !== 'ready' || lines === null || !c) return;
    renderPoster(size, posterUrl, display, lines, c);
    let alive = true;
    canvasBlob(c).then((b) => {
      if (!alive) return;
      const src = URL.createObjectURL(b);
      // La anterior se libera recién cuando la nueva la reemplaza.
      if (lastSrc.current) URL.revokeObjectURL(lastSrc.current);
      lastSrc.current = src;
      setPrintImg({ src, size, url: posterUrl });
    }, () => {});
    return () => { alive = false; };
  }, [fonts, lines, size, posterUrl, display]);

  useEffect(() => () => { if (lastSrc.current) URL.revokeObjectURL(lastSrc.current); }, []);
  const printSrc = printImg && printImg.size === size && printImg.url === posterUrl ? printImg.src : null;

  const ready = fonts === 'ready';
  const posterReady = ready && lines !== null;

  // `needsFonts`: las piezas con texto esperan las fuentes de la marca (CB-03); el QR suelto no las usa.
  async function run(key: string, fn: () => Promise<void>, needsFonts = true) {
    setBusy(key);
    setErr(null);
    try {
      if (needsFonts) await ensureBrandFonts();
      await fn();
    } catch {
      setErr(needsFonts
        ? 'No pudimos generar el archivo. Revisa tu conexión (las fuentes de la marca deben cargar) e inténtalo de nuevo.'
        : 'No pudimos generar el archivo. Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  }

  const downloadQrPng = () => run('qr-png', async () => saveBlob(await canvasBlob(renderQrPng(qrUrl)), FILES.qrPng), false);
  const downloadQrSvg = () => run('qr-svg', async () => saveBlob(new Blob([svg], { type: 'image/svg+xml' }), FILES.qrSvg), false);
  const downloadStory = () => run('story', async () => saveBlob(await canvasBlob(renderStory(storyUrl, display)), FILES.story));
  const shareStory = () => run('story-share', async () => {
    const blob = await canvasBlob(renderStory(storyUrl, display));
    if (!(await shareFile(blob, FILES.story))) saveBlob(blob, FILES.story);
  });
  const downloadPoster = () => run('poster', async () => saveBlob(await canvasBlob(renderPoster(size, posterUrl, display, lines ?? [])), FILES.poster(size)));
  // CB-06: hoja de impresión con @page del tamaño elegido y solo el cartel, en una página.
  const printPoster = () => window.print();

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator;
  const p = POSTER[size];

  return (
    <>
      <h1 className="ag-h1">Difusión</h1>
      <p className="ag-muted kit-lead">Todo lo que necesitas para que tus clientes reserven solos: tu link, el QR, un cartel para el local, una placa para Instagram y textos listos para copiar.</p>

      <section className="adm-section kit-link" aria-labelledby="kit-link">
        <h2 className="ag-h3" id="kit-link">Tu link</h2>
        <div className="ag-card kit-row">
          <code className="kit-url" data-kit-link="">{kitLink('link', BASE)}</code>
          <div className="ag-actions ag-actions--wrap">
            <Copy id="link" text={kitLink('link', BASE)} />
            <a className="btn btn--ghost" href={kitLink('link', BASE)} target="_blank" rel="noopener">Abrir</a>
          </div>
        </div>
        <label className="pro-check kit-utm">
          <input type="checkbox" checked={utm} onChange={(e) => setUtm(e.target.checked)} data-utm-toggle="" />
          <span>Incluir seguimiento (UTM) en el QR, el cartel, la placa y los textos. Así ves en Estadísticas de dónde llegan tus reservas.</span>
        </label>
      </section>

      {fonts === 'error' && (
        <div className="ag-card adm-error" role="alert">
          <p>No cargaron las fuentes de WS Style, así que no podemos dibujar las piezas sin que se vean mal. Revisa tu conexión.</p>
          <button type="button" className="btn btn--primary" onClick={loadFonts}>Reintentar</button>
        </div>
      )}
      {err && <p className="ag-field__error" role="alert">{err}</p>}

      <div className="kit-grid">
        <section className="adm-section ag-card kit-piece" aria-labelledby="kit-qr">
          <h2 className="ag-h3" id="kit-qr">QR</h2>
          <img className="kit-qr" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} width={240} height={240} alt={`Código QR que abre ${display}`} data-qr-url={qrUrl} />
          <p className="ag-muted kit-hint">El SVG es el mejor para mandar a una imprenta.</p>
          <div className="ag-actions ag-actions--wrap">
            <button type="button" className="btn btn--primary" onClick={downloadQrPng} disabled={!!busy}>PNG</button>
            <button type="button" className="btn btn--ghost" onClick={downloadQrSvg} disabled={!!busy}>SVG</button>
          </div>
        </section>

        <section className="adm-section ag-card kit-piece" aria-labelledby="kit-story">
          <h2 className="ag-h3" id="kit-story">Historia de Instagram</h2>
          <div className="kit-preview kit-preview--story">
            <canvas ref={storyRef} width={1080} height={1920} aria-label="Vista previa de la placa para historia" role="img" />
            {!ready && <span className="kit-preview__wait">{fonts === 'error' ? 'Sin fuentes' : 'Cargando…'}</span>}
          </div>
          <p className="ag-muted kit-hint">1080 × 1920. Súbela como historia y agrega el sticker de enlace con el link.</p>
          <div className="ag-actions ag-actions--wrap">
            <button type="button" className="btn btn--primary" onClick={downloadStory} disabled={!ready || !!busy} data-download="story">Descargar</button>
            {canShare && <button type="button" className="btn btn--ghost" onClick={shareStory} disabled={!ready || !!busy}>Compartir</button>}
            <Copy id="story-link" text={storyUrl} label="Copiar link del sticker" />
          </div>
        </section>

        <section className="adm-section ag-card kit-piece kit-piece--poster" aria-labelledby="kit-poster">
          <h2 className="ag-h3" id="kit-poster">Cartel para el local</h2>
          <div className="adm-tabs kit-size" role="radiogroup" aria-label="Tamaño de hoja">
            {(Object.keys(POSTER) as PosterSize[]).map((k) => (
              <label key={k} className={`kit-size__opt${size === k ? ' is-on' : ''}`}>
                <input type="radio" name="kit-size" value={k} checked={size === k} onChange={() => setSize(k)} /> {POSTER[k].label}
              </label>
            ))}
          </div>
          <div className="kit-preview kit-preview--poster" style={{ aspectRatio: `${p.w} / ${p.h}` }}>
            <canvas ref={posterRef} width={p.w} height={p.h} aria-label={`Vista previa del cartel ${p.label}`} role="img" />
            {!posterReady && <span className="kit-preview__wait">{fonts === 'error' ? 'Sin fuentes' : 'Cargando…'}</span>}
          </div>
          <p className="ag-muted kit-hint">Imagen a 300 dpi. Imprímela en tamaño real (100 %) para que el QR mida unos 11 cm.</p>
          <div className="ag-actions ag-actions--wrap">
            <button type="button" className="btn btn--primary" onClick={printPoster} disabled={!posterReady || !printSrc || !!busy} data-print="">Imprimir</button>
            <button type="button" className="btn btn--ghost" onClick={downloadPoster} disabled={!posterReady || !!busy} data-download="poster">Descargar PNG</button>
          </div>
        </section>
      </div>

      <section className="adm-section" aria-labelledby="kit-texts">
        <h2 className="ag-h3" id="kit-texts">Textos listos para copiar</h2>
        <ul className="kit-texts">
          {KIT_TEXTS.map((t) => <TextCard key={t.key} k={t.key} label={t.label} hint={t.hint} utm={utm} base={BASE} />)}
        </ul>
      </section>

      {printSrc && createPortal(
        <div className="kit-print" data-size={size}>
          <style>{`@page { size: ${p.page}; margin: 0; }`}</style>
          <img src={printSrc} alt="" style={{ width: p.printW, height: p.printH }} />
        </div>,
        document.body,
      )}
    </>
  );
}

function TextCard({ k, label, hint, utm, base }: { k: KitText; label: string; hint: string; utm: boolean; base: string }) {
  const text = kitText(k, base, utm);
  return (
    <li className="ag-card kit-text" data-text={k}>
      <h3 className="kit-text__title">{label}</h3>
      <p className="kit-text__body">{text}</p>
      <p className="ag-muted kit-hint">{hint}</p>
      <div className="ag-actions ag-actions--wrap">
        <Copy id={k} text={text} />
        {k === 'post' && <Copy id="post-link" text={kitLink('post', base, utm)} label="Copiar link" />}
      </div>
    </li>
  );
}
