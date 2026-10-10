// Motor del recorrido ligado al scroll (puerto TS de barberia-3d/site/main.js, SPEC-12/13/15).
// - Cámara: posición/target por interpolación LINEAL entre tomas (una curva S provoca saltos > 1 m en el tramo
//   trono→servicios), "arriba" por slerp de las orientaciones de las tomas (sin el "trompo" de lookAt al entrar a la
//   cenital) y FOV lineal; suavizado exponencial independiente del frame (τ = 0.12 s).
// - Fondo: secuencia de Blender ('seq', SequencePlayer) o 3D en tiempo real ('3d', Scene3D) como respaldo.
//   La matemática de cámara corre siempre: es la trayectoria con la que se renderizó la secuencia.
// - Expone window.__site (contrato que prueba barberia-3d/scripts/verify.mjs).
import * as THREE from 'three';
import { shotsFor, type EffectiveShot } from './scene/shots';
import { SequencePlayer } from './seq/SequencePlayer';
import type { Content } from './content';

const TAU = .12;      // s, constante de tiempo del suavizado
const SETTLE = .005;  // m
const Y = new THREE.Vector3(0, 1, 0);

declare global {
  interface Window { isCompactLayout?: () => boolean; __site?: unknown }
}
// Criterio ÚNICO de layout compacto: lo define el script del <head> de wstyle/index.html (pone <html class="compact">).
export const isCompact = () => (window.isCompactLayout ? window.isCompactLayout() : innerWidth <= 768 || innerWidth < innerHeight);

export interface Renderer3D {
  render(camera: THREE.PerspectiveCamera): void;
  resize(w: number, h: number, compact: boolean): void;
}
export type Mode = 'seq' | '3d';

export interface ExperienceOptions {
  seqCanvas: HTMLCanvasElement;
  sections: HTMLElement[];
  main: HTMLElement;
  reduced: boolean;
  force3d: boolean;
  onProgress: (pct: number) => void;
  onMode: (mode: Mode) => void;
  onReady: () => void;
  onActive: (idx: number) => void;
  onScroll: (y: number, max: number) => void;
}

export class Experience {
  readonly camera = new THREE.PerspectiveCamera(50, 1, .05, 100);
  private readonly target = new THREE.Vector3();
  private readonly dPos = new THREE.Vector3(); private readonly dTgt = new THREE.Vector3(); private readonly dUp = new THREE.Vector3();
  private readonly curUp = new THREE.Vector3(0, 1, 0);
  private readonly lastPos = new THREE.Vector3(NaN); private readonly lastTgt = new THREE.Vector3(NaN); private readonly lastUp = new THREE.Vector3(NaN);
  private readonly probeCam = new THREE.PerspectiveCamera();
  private readonly projCam = new THREE.PerspectiveCamera();
  private readonly qTmp = new THREE.Quaternion();
  private SH: EffectiveShot[] = []; private SHQ: THREE.Quaternion[] = [];
  private baseFov = 50; private curFov = 50; private lastFov = NaN;
  private anchors: number[] = [];
  private mode: Mode | null = null;
  private player: SequencePlayer | null = null;
  private r3d: Renderer3D | null = null;
  private dirty = true; private first = true; private contentDone = false; private ready = false;
  private frame = 0; private lastY = -1; private active = -1; private prevT = performance.now();
  private raf = 0; private disposed = false;
  private compactNow: boolean;
  private lb = -1; private readyAt = 0;
  private content: Content | null = null;
  private readonly ro: ResizeObserver;
  private readonly o: ExperienceOptions;

  constructor(o: ExperienceOptions) {
    this.o = o;
    this.compactNow = isCompact();
    this.installContract();
    addEventListener('resize', this.resize);
    this.ro = new ResizeObserver(() => { this.computeAnchors(); this.dirty = true; });
    this.ro.observe(o.main);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
    void this.chooseBackground();
  }

  // ─── Fondo: secuencia si hay manifest y anclas; si no (o ?mode=3d), 3D.
  private async chooseBackground() {
    const p = this.o.force3d ? null : await SequencePlayer.create({
      canvas: this.o.seqCanvas, fmt: this.compactNow ? 'mobile' : 'desktop', reduced: this.o.reduced,
      // Mientras el render móvil no esté, el layout compacto usa los frames desktop con "cover" (documentado).
      fallbackFmt: 'desktop',
      onProgress: (d, t) => this.o.onProgress(Math.round(d / t * 100)),
    });
    if (this.disposed) { p?.dispose(); return; }
    if (p) { this.player = p; this.setMode('seq'); }
    else { this.setMode('3d'); this.o.onProgress(100); }
    this.resize();
  }
  private setMode(m: Mode) { this.mode = m; this.dirty = true; this.o.onMode(m); }
  setRenderer3D(r: Renderer3D | null) { this.r3d = r; if (r) r.resize(innerWidth, innerHeight, this.compactNow); this.dirty = true; }
  setContent(c: Content | null) { this.content = c; this.contentDone = true; this.computeAnchors(); this.dirty = true; }

  // ─── Geometría de la página
  private readonly resize = () => {
    const w = innerWidth, h = innerHeight, m = isCompact();
    this.player?.resize(w, h, Math.min(devicePixelRatio, 2));
    this.camera.aspect = w / h;
    this.baseFov = m ? 68 : 50;   // en layout compacto se abre el FOV para que el local se lea
    this.camera.updateProjectionMatrix();
    this.rebuildShots(m);
    if (m !== this.compactNow) {
      this.compactNow = m;
      // La secuencia es por formato (desktop/mobile): al cambiar de layout se recarga la página una vez.
      if (this.player && this.player.format !== (m ? 'mobile' : 'desktop')) location.reload();
    }
    this.r3d?.resize(w, h, m);
    this.computeAnchors(); this.dirty = true;
  };
  // Ancla de cada sección = su offsetTop, limitado al scroll máximo.
  private computeAnchors() {
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    this.anchors = this.o.sections.map((s) => Math.min(s.offsetTop, max));
  }
  private rebuildShots(compact: boolean) {
    this.SH = shotsFor(compact);
    this.SHQ = this.SH.map((s) => { this.probeCam.position.copy(s.pos); this.probeCam.up.copy(s.up ?? Y); this.probeCam.lookAt(s.target); return this.probeCam.quaternion.clone(); });
  }
  private fovOf(s: EffectiveShot) { return s.fov ?? this.baseFov; }

  // Segmento de scroll: i = ancla de partida, f = fracción hacia la siguiente (0 en el ancla; en reduced-motion
  // siempre la sección más cercana con f = 0). Lo usan la cámara y la secuencia, así ambas recorren lo mismo.
  private segment(y: number) {
    const a = this.anchors, n = a.length;
    if (this.o.reduced) {
      let best = 0;
      for (let k = 1; k < n; k++) if (Math.abs(y - a[k]) < Math.abs(y - a[best])) best = k;
      return { i: best, f: 0 };
    }
    let i = 0;
    for (let k = 0; k < n; k++) if (y >= a[k]) i = k;
    if (i >= n - 1 || a[i + 1] <= a[i]) return { i, f: 0 };
    return { i, f: Math.min(1, Math.max(0, (y - a[i]) / (a[i + 1] - a[i]))) };
  }
  // Frame (fraccional) de la secuencia para un scroll: lineal entre los frames ancla del segmento.
  private seqWanted(y: number) {
    const AF = this.player!.anchorFrames, { i, f } = this.segment(y);
    return f === 0 ? AF[i] : AF[i] + f * (AF[i + 1] - AF[i]);
  }
  // Pose deseada: posición/target lineal, "arriba" por slerp entre tomas, FOV lineal. Devuelve sección activa y FOV.
  private desired(y: number, outPos = this.dPos, outTgt = this.dTgt, outUp = this.dUp) {
    const { SH, SHQ } = this;
    const at = (k: number) => { outPos.copy(SH[k].pos); outTgt.copy(SH[k].target); outUp.copy(Y).applyQuaternion(SHQ[k]); return { idx: k, fov: this.fovOf(SH[k]) }; };
    const { i, f } = this.segment(y);
    if (f === 0) return at(i);
    outPos.lerpVectors(SH[i].pos, SH[i + 1].pos, f);
    outTgt.lerpVectors(SH[i].target, SH[i + 1].target, f);
    outUp.copy(Y).applyQuaternion(this.qTmp.slerpQuaternions(SHQ[i], SHQ[i + 1], f));
    return { idx: f < .5 ? i : i + 1, fov: this.fovOf(SH[i]) + (this.fovOf(SH[i + 1]) - this.fovOf(SH[i])) * f };
  }
  private orient(cam: THREE.PerspectiveCamera, pos: THREE.Vector3, tgt: THREE.Vector3, up: THREE.Vector3) { cam.position.copy(pos); cam.up.copy(up); cam.lookAt(tgt); }
  private axes(cam: THREE.Camera) {
    return { up: new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).toArray(), forward: new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).toArray() };
  }

  // ─── Loop
  private readonly tick = (now: number) => {
    if (this.disposed) return;
    const dt = Math.max(0, (now - this.prevT) / 1000); this.prevT = now;
    const y = scrollY, cam = this.camera, k = 1 - Math.exp(-dt / TAU);
    const { idx, fov: dFov } = this.desired(y);
    if (this.o.reduced || this.first) { cam.position.copy(this.dPos); this.target.copy(this.dTgt); this.curUp.copy(this.dUp); this.curFov = dFov; this.first = false; }
    else { cam.position.lerp(this.dPos, k); this.target.lerp(this.dTgt, k); this.curUp.lerp(this.dUp, k).normalize(); this.curFov += (dFov - this.curFov) * k; }
    if (cam.position.distanceTo(this.dPos) < SETTLE && this.target.distanceTo(this.dTgt) < SETTLE && this.curUp.angleTo(this.dUp) < .01 && Math.abs(this.curFov - dFov) < .05) {
      cam.position.copy(this.dPos); this.target.copy(this.dTgt); this.curUp.copy(this.dUp); this.curFov = dFov;
    }
    const moved = !cam.position.equals(this.lastPos) || !this.target.equals(this.lastTgt) || !this.curUp.equals(this.lastUp) || this.curFov !== this.lastFov;
    if (this.mode && (this.dirty || moved) && (this.mode === 'seq' || this.r3d)) {
      if (cam.fov !== this.curFov) { cam.fov = this.curFov; cam.updateProjectionMatrix(); }
      this.orient(cam, cam.position, this.target, this.curUp);
      cam.updateMatrixWorld();
      if (this.mode === '3d') { this.r3d!.render(cam); this.dirty = false; this.frame++; }
      this.lastPos.copy(cam.position); this.lastTgt.copy(this.target); this.lastUp.copy(this.curUp); this.lastFov = this.curFov;
    }
    // Secuencia: frame según el segmento de scroll, suavizado con la misma constante de tiempo que la cámara.
    if (this.mode === 'seq' && (this.player!.update(this.seqWanted(y), k) || this.dirty)) { this.dirty = false; this.frame++; }
    if (this.mode && this.contentDone && !this.ready && this.frame > 0) { this.ready = true; this.readyAt = now; this.o.onReady(); }
    // Letterbox 2.39:1 ("película"): cerrado al aparecer el hero y se abre; entre tomas se cierra un poco y en
    // cada toma (ancla) queda a pantalla completa. Sin movimiento con reduced-motion.
    if (!this.o.reduced) {
      const { f } = this.segment(y);
      const intro = this.ready ? Math.max(0, 1 - (now - this.readyAt) / 1400) : 1;
      const lb = Math.max(intro * intro, .7 * Math.sin(Math.PI * f));
      if (Math.abs(lb - this.lb) > .002) { this.lb = lb; document.documentElement.style.setProperty('--letterbox', lb.toFixed(3)); }
    }
    if (y !== this.lastY) { this.o.onScroll(y, Math.max(1, document.documentElement.scrollHeight - innerHeight)); this.lastY = y; }
    if (idx !== this.active) { this.active = idx; this.o.onActive(idx); }
    this.raf = requestAnimationFrame(this.tick);
  };

  // ─── Contrato window.__site (lo prueba barberia-3d/scripts/verify.mjs)
  private installContract() {
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias
    const chkPos = new THREE.Vector3(), chkTgt = new THREE.Vector3(), chkUp = new THREE.Vector3();
    window.__site = {
      get ready() { return self.ready; },
      get mode() { return self.mode; },
      get gl() { return !!self.r3d; },
      get seqFrame() { return self.player ? self.player.shown : null; },
      get seq() { const p = self.player; return p ? { count: p.count, total: p.total, loaded: p.loaded, anchorFrames: p.anchorFrames, size: p.size, wanted: p.wanted, format: p.format } : null; },
      get shots() { return self.SH.map((s) => ({ id: s.id, pos: s.pos.toArray(), target: s.target.toArray() })); },
      // up/forward = ejes reales de la cámara (para medir el giro sobre el eje de visión).
      get camera() { return { pos: self.camera.position.toArray(), target: self.target.toArray(), ...self.axes(self.camera) }; },
      // Pose para un scroll dado sin mover la cámara. fov = FOV vertical (grados), idx = sección activa.
      poseAt(y: number) {
        const p = new THREE.Vector3(), t = new THREE.Vector3(), u = new THREE.Vector3();
        const { idx, fov } = self.desired(y, p, t, u); self.orient(self.probeCam, p, t, u);
        return { pos: p.toArray(), target: t.toArray(), ...self.axes(self.probeCam), fov, idx };
      },
      get anchors() { return self.anchors; },
      get content() { return self.content; },
      reducedMotion: this.o.reduced,
      get frame() { return self.frame; },
      // Proyección a pantalla: [px, py, zNDC]. En modo seq con la cámara del render (aspecto del frame) + "cover".
      project(pts: [number, number, number][]) {
        self.camera.updateMatrixWorld();
        if (self.mode !== 'seq') return pts.map((p) => { const v = new THREE.Vector3(...p).project(self.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z]; });
        const [fw, fh] = self.player!.size, s = Math.max(innerWidth / fw, innerHeight / fh), pc = self.projCam;
        pc.copy(self.camera); pc.aspect = fw / fh; pc.updateProjectionMatrix(); pc.updateMatrixWorld();
        return pts.map((p) => { const v = new THREE.Vector3(...p).project(pc); return [(innerWidth - fw * s) / 2 + (v.x + 1) / 2 * fw * s, (innerHeight - fh * s) / 2 + (1 - v.y) / 2 * fh * s, v.z]; });
      },
      get compact() { return isCompact(); },
      // Quieta = lo dibujado coincide con lo deseado para el scroll ACTUAL (se calcula al leer: un scrollTo recién
      // hecho da false aunque el loop todavía no haya corrido).
      get settled() {
        const { fov } = self.desired(scrollY, chkPos, chkTgt, chkUp);
        return self.camera.position.equals(self.lastPos) && self.target.equals(self.lastTgt) && self.curUp.equals(self.lastUp) && self.curFov === self.lastFov
          && self.camera.position.distanceTo(chkPos) < SETTLE && self.target.distanceTo(chkTgt) < SETTLE
          && self.curUp.angleTo(chkUp) < 1e-3 && Math.abs(self.curFov - fov) < .01
          && (self.mode !== 'seq' || (self.player!.wanted === self.seqWanted(scrollY) && self.player!.settled));
      },
    };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    this.ro.disconnect();
    this.player?.dispose();
    if (window.__site) delete window.__site;
  }
}
