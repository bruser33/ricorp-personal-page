// Página inmersiva v0 (SPEC-12): contenido desde JSON + cámara 3D ligada al scroll.
// Sin librerías de scroll: interpolación LINEAL entre tomas (una curva S provoca saltos > 1 m
// en el tramo trono→servicios) + suavizado exponencial independiente del frame.
import * as THREE from 'three';
import { buildScene, shotsFor } from './shared/scene.js';
import { clPhone, toCLP, toMinutes } from './lib.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Criterio único de layout compacto: lo define el script del <head> (también pone <html class="compact"> para el CSS).
const compact = () => window.isCompactLayout();
let mobile = compact();
const TAU = .12;                // s, constante de tiempo del suavizado
const SETTLE = .005;            // m

// ─── Contenido
const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

async function loadContent() {
  const load = (n) => fetch(`./content/${n}.json`, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`content/${n}.json: HTTP ${r.status}`);
    return r.json();
  });
  // config.json es de Ricorp (no del dueño); si falta, valores por defecto.
  const config = fetch('./config.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const [site, services, cfg] = await Promise.all([load('site'), load('services'), config]);
  return { site, services, config: cfg };
}

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

// El JSON lo edita a mano el dueño: cualquier campo puede faltar. Se renderiza lo que haya y lo faltante se
// omite (nunca "undefined"); si falta un bloque entero (p. ej. hours) se oculta en vez de dejar el placeholder.
const str = (v) => (typeof v === 'string' && v.trim() ? v : null);
const hoursText = (h) => (h.opens && h.closes ? `${h.opens} – ${h.closes}` : h.opens ? `desde ${h.opens}` : h.closes ? `hasta ${h.closes}` : 'Cerrado');
// openingHours de schema.org se deriva de las mismas filas (única fuente): solo las que tienen dayCodes, apertura y cierre.
const openingHours = (hours) => hours.filter((h) => h && str(h.dayCodes) && str(h.opens) && str(h.closes)).map((h) => `${h.dayCodes} ${h.opens}-${h.closes}`);

function render({ site, services, config = {} }) {
  const c = site.contact ?? {}, ad = c.address ?? {};
  // Campos simples: primero en la raíz del JSON y luego en contact (p. ej. "phone").
  // Si falta el dato se oculta el elemento: nunca queda visible el placeholder del HTML.
  for (const e of $$('[data-field]')) {
    const f = e.dataset.field;
    if (f === 'hours' || f === 'address') continue;
    const v = str(get(site, f)) ?? str(get(c, f));
    if (v) e.textContent = v;
    (e.closest('[data-field-line]') ?? e).hidden = !v;
  }

  const hours = $('[data-field="hours"]');
  const rows = Array.isArray(site.hours) ? site.hours.filter((h) => h && str(h.days)) : [];
  if (hours) {
    hours.replaceChildren(...rows.map((h) => { const li = el('li'); li.append(el('span', {}, h.days), el('span', {}, hoursText(h))); return li; }));
    hours.parentElement.hidden = rows.length === 0;
  }
  const addr = $('[data-field="address"]');
  if (addr) {
    const line2 = [str(ad.city), str(ad.region)].filter(Boolean).join(', ');
    const parts = [str(ad.street), line2].filter(Boolean);
    addr.replaceChildren(...parts.flatMap((t, i) => (i ? [el('br'), document.createTextNode(t)] : [document.createTextNode(t)])));
    addr.parentElement.hidden = parts.length === 0 && !str(c.phone);
  }

  // CTA: si el dato falta o no se reconoce, el botón se oculta (y se le quita el href del placeholder).
  const cta = (kind, href) => $$(`[data-cta="${kind}"]`).forEach((a) => {
    if (href) { a.href = href; a.hidden = false; } else { a.removeAttribute('href'); a.hidden = true; }
  });
  const wa = clPhone(c.whatsapp), tel = clPhone(c.phone);
  cta('whatsapp', wa && `https://wa.me/${wa}` + (str(c.whatsappText) ? `?text=${encodeURIComponent(c.whatsappText)}` : ''));
  cta('tel', tel && `tel:+${tel}`);
  cta('maps', str(c.mapsUrl));

  const list = $('[data-list="services"]');
  if (list && Array.isArray(services)) list.replaceChildren(...services.filter((s) => s && str(s.name)).map((s) => {
    const card = el('article', { class: 'card', 'data-service': s.id ?? '' });
    const meta = el('p', { class: 'card__meta' });
    // Si falta el precio o la duración no se inventa nada: "Consultar" y sin duración.
    const price = toCLP(s.priceCLP);
    meta.append(el('span', { 'data-svc': 'price' }, Number.isFinite(price) ? clp.format(price) : 'Consultar'));
    const mins = toMinutes(s.durationMin);
    if (Number.isFinite(mins)) meta.append(el('span', { 'data-svc': 'duration' }, `${mins} min`));
    card.append(el('h3', { 'data-svc': 'name' }, s.name));
    if (str(s.description)) card.append(el('p', { 'data-svc': 'description' }, s.description));
    card.append(meta);
    return card;
  }));

  // <title>, description y og:title siguen al nombre del JSON
  const name = str(site.name), slogan = str(site.slogan);
  if (name) {
    document.title = [name, slogan].filter(Boolean).join(' — ');
    $('meta[name="description"]')?.setAttribute('content', [name, slogan].filter(Boolean).join(': '));
    $('meta[property="og:title"]')?.setAttribute('content', name);
  }

  // Marca de agua: el flag es de Ricorp (site/config.json), no del contenido; solo se apaga con el literal false.
  if (config.poweredBy === false) $$('.ricorp-badge, [data-powered]').forEach((e) => e.remove());

  // SEO local: JSON-LD BarberShop generado desde site.json (se omiten los campos que falten)
  const address = Object.fromEntries(Object.entries({ streetAddress: str(ad.street), addressLocality: str(ad.city), addressRegion: str(ad.region) }).filter(([, v]) => v));
  const ld = { '@context': 'https://schema.org', '@type': 'BarberShop', name, description: slogan, telephone: str(c.phone),
    address: Object.keys(address).length ? { '@type': 'PostalAddress', ...address, addressCountry: 'CL' } : null,
    openingHours: openingHours(rows), url: location.origin + location.pathname, hasMap: str(c.mapsUrl) };
  for (const k of Object.keys(ld)) if (ld[k] == null) delete ld[k];
  $('script[type="application/ld+json"]')?.remove();
  document.head.append(el('script', { type: 'application/ld+json' }, JSON.stringify(ld)));
}

// ─── Entrada de texto
let io = null;
function setupReveal() {
  const items = $$('.reveal');
  if (reduced || !('IntersectionObserver' in window)) { items.forEach((e) => e.classList.add('in')); return; }
  io ??= new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { threshold: .15 });
  for (const sec of $$('section[data-shot]')) $$('.reveal', sec).forEach((e, i) => {
    e.style.setProperty('--d', `${Math.min(i, 6) * .08}s`);
    if (!e.classList.contains('in')) io.observe(e);
  });
}

// ─── Nav móvil
const nav = $('.nav'), toggle = $('.nav-toggle');
function setMenu(open) { nav.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú'); }
toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
$$('.nav-links a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

// ─── Escena
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
// Sin capa sobre la silla: el sitio muestra el "trono" vacío.
const { scene, mirror } = buildScene({ labels: false, cape: false, mirrorSize: mobile ? [512, 256] : [1024, 512] });
const camera = new THREE.PerspectiveCamera(50, 1, .05, 100);
const target = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const dPos = new THREE.Vector3(), dTgt = new THREE.Vector3(), dUp = new THREE.Vector3();
const curUp = new THREE.Vector3(0, 1, 0);
const lastPos = new THREE.Vector3(NaN), lastTgt = new THREE.Vector3(NaN), lastUp = new THREE.Vector3(NaN);
const chkPos = new THREE.Vector3(), chkTgt = new THREE.Vector3(), chkUp = new THREE.Vector3();
const qTmp = new THREE.Quaternion();
let SH = [], SHQ = [], baseFov = 50, curFov = 50, lastFov = NaN;   // tomas efectivas y su orientación

const sections = $$('section[data-shot]');
const dots = $$('.dots a');
const bar = $('.progress__bar');

const site = window.__site = {
  ready: false,
  get shots() { return SH.map((s) => ({ id: s.id, pos: s.pos.toArray(), target: s.target.toArray() })); },
  // up/forward = ejes reales de la cámara renderizada (para medir el giro sobre el eje de visión).
  get camera() { return { pos: camera.position.toArray(), target: target.toArray(), ...axes(camera) }; },
  // Pose que tendría la cámara para un scroll dado, sin moverla (mismo cálculo que el render).
  poseAt(y) { const p = new THREE.Vector3(), t = new THREE.Vector3(), u = new THREE.Vector3(); desired(y, p, t, u); orient(probeCam, p, t, u); return { pos: p.toArray(), target: t.toArray(), ...axes(probeCam) }; },
  anchors: [],
  content: null,
  reducedMotion: reduced,
  frame: 0,
  // Proyección a pantalla (px CSS) de puntos del mundo con la cámara actual: [[x,y,z], …] → [[px,py], …]
  // Proyección a pantalla: [px, py, zNDC]; zNDC fuera de (-1, 1) = detrás de la cámara o fuera del frustum.
  project(pts) { return pts.map((p) => { const v = new THREE.Vector3(...p).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z]; }); },
  get compact() { return compact(); },
  // Quieta = la pose renderizada coincide con la deseada para el scroll ACTUAL (se calcula al leer, así
  // un scrollTo recién hecho da false aunque el loop todavía no haya corrido).
  get settled() {
    const { fov } = desired(scrollY, chkPos, chkTgt, chkUp);
    return camera.position.equals(lastPos) && target.equals(lastTgt) && curUp.equals(lastUp) && curFov === lastFov
      && camera.position.distanceTo(chkPos) < SETTLE && target.distanceTo(chkTgt) < SETTLE
      && curUp.angleTo(chkUp) < 1e-3 && Math.abs(curFov - fov) < .01;
  },
};

const probeCam = new THREE.PerspectiveCamera();
function axes(cam) {
  return { up: new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).toArray(), forward: new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).toArray() };
}
// Orienta una cámara en pos mirando a target con "arriba" = up. El up NO es siempre +y: se interpola por slerp
// entre las orientaciones de las tomas, así el giro al entrar/salir de la cenital es suave y nunca degenera.
function orient(cam, pos, tgt, up) { cam.position.copy(pos); cam.up.copy(up); cam.lookAt(tgt); }
function rebuildShots() {
  SH = shotsFor(compact());
  SHQ = SH.map((s) => { probeCam.position.copy(s.pos); probeCam.up.copy(s.up ?? Y); probeCam.lookAt(s.target); return probeCam.quaternion.clone(); });
}
const fovOf = (s) => s.fov ?? baseFov;

let dirty = true;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  baseFov = compact() ? 68 : 50;   // en layout compacto se abre el FOV para que el local se lea
  camera.updateProjectionMatrix();
  rebuildShots();
  // Calidad según el mismo criterio de layout: se ajustan pixelRatio y resolución del espejo.
  const m = compact();
  if (m !== mobile) {
    mobile = m;
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    renderer.setSize(w, h, false);
    mirror.getRenderTarget().setSize(...(mobile ? [512, 256] : [1024, 512]));
  }
  computeAnchors(); dirty = true;
}
// Ancla de cada sección = su offsetTop, limitado al scroll máximo.
function computeAnchors() {
  const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  site.anchors = sections.map((s) => Math.min(s.offsetTop, max));
}

// Pose deseada para un scroll dado: posición y target por interpolación lineal, "arriba" por slerp de las
// orientaciones de las tomas y FOV lineal. Devuelve { idx: sección activa, fov }.
function desired(y, outPos = dPos, outTgt = dTgt, outUp = dUp) {
  const a = site.anchors, n = a.length;
  const at = (k) => { outPos.copy(SH[k].pos); outTgt.copy(SH[k].target); outUp.copy(Y).applyQuaternion(SHQ[k]); return { idx: k, fov: fovOf(SH[k]) }; };
  if (reduced) {
    let best = 0;
    for (let k = 1; k < n; k++) if (Math.abs(y - a[k]) < Math.abs(y - a[best])) best = k;
    return at(best);
  }
  let i = 0;
  for (let k = 0; k < n; k++) if (y >= a[k]) i = k;
  if (i >= n - 1 || a[i + 1] <= a[i]) return at(i);
  const f = Math.min(1, Math.max(0, (y - a[i]) / (a[i + 1] - a[i])));
  outPos.lerpVectors(SH[i].pos, SH[i + 1].pos, f);
  outTgt.lerpVectors(SH[i].target, SH[i + 1].target, f);
  outUp.copy(Y).applyQuaternion(qTmp.slerpQuaternions(SHQ[i], SHQ[i + 1], f));
  return { idx: f < .5 ? i : i + 1, fov: fovOf(SH[i]) + (fovOf(SH[i + 1]) - fovOf(SH[i])) * f };
}

let lastY = -1, active = -1, prevT = performance.now(), first = true, contentDone = false;
function tick(now) {
  const dt = Math.max(0, (now - prevT) / 1000); prevT = now;
  const y = scrollY;
  const { idx, fov: dFov } = desired(y);
  if (reduced || first) { camera.position.copy(dPos); target.copy(dTgt); curUp.copy(dUp); curFov = dFov; first = false; }
  else {
    const k = 1 - Math.exp(-dt / TAU);
    camera.position.lerp(dPos, k); target.lerp(dTgt, k); curUp.lerp(dUp, k).normalize(); curFov += (dFov - curFov) * k;
  }
  if (camera.position.distanceTo(dPos) < SETTLE && target.distanceTo(dTgt) < SETTLE && curUp.angleTo(dUp) < .01 && Math.abs(curFov - dFov) < .05) {
    camera.position.copy(dPos); target.copy(dTgt); curUp.copy(dUp); curFov = dFov;
  }

  if (dirty || !camera.position.equals(lastPos) || !target.equals(lastTgt) || !curUp.equals(lastUp) || curFov !== lastFov) {
    if (camera.fov !== curFov) { camera.fov = curFov; camera.updateProjectionMatrix(); }
    orient(camera, camera.position, target, curUp);
    renderer.render(scene, camera);
    lastPos.copy(camera.position); lastTgt.copy(target); lastUp.copy(curUp); lastFov = curFov; dirty = false;
    site.frame++;
    if (contentDone && !site.ready) site.ready = true;
  }
  if (y !== lastY) {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    bar.style.transform = `scaleX(${Math.min(1, y / max)})`;
    nav.classList.toggle('is-scrolled', y > 24);
    lastY = y;
  }
  if (idx !== active) { dots.forEach((d, k) => d.classList.toggle('is-active', k === idx)); active = idx; }
  requestAnimationFrame(tick);
}

addEventListener('resize', resize);
// Las alturas cambian al cargar fuentes y tarjetas: recalcular anclas.
new ResizeObserver(() => { computeAnchors(); dirty = true; }).observe($('main'));
resize();
setupReveal();
requestAnimationFrame(tick);

try {
  site.content = await loadContent();
  render(site.content);
} catch (e) {
  console.error('No se pudo cargar el contenido; queda el HTML estático.', e);
}
setupReveal();
computeAnchors();
contentDone = true; dirty = true;
