// Escena 3D del local WS Style (blockout v0). Puerto TS de barberia-3d/shared/scene.js (SPEC-15): misma geometría y
// mismas medidas supuestas (L, en shots.ts). Solo lo que usa el sitio (sin etiquetas ni exportador GLB). Se importa
// dinámicamente: solo se descarga y construye en modo 3D. Cambios intencionales respecto del blockout original
// documentados en barberia-3d/docs/blockout-supuestos.md.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { L } from './shots';

export interface BuiltScene { scene: THREE.Scene; mirror: Reflector; dispose: () => void }

// Renderer WebGL del respaldo 3D (vive en este chunk diferido junto con la escena).
export function createRenderer(canvas: HTMLCanvasElement, antialias: boolean) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

// Arma la escena completa. mirrorSize: resolución del Reflector; cape: capa negra sobre la silla (cliente sentado).
export function buildScene({ mirrorSize = [1024, 512] as [number, number], cape: withCape = true } = {}): BuiltScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0e11);

  // ─── Texturas procedurales
  function rng(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  }
  const marble = (base: string, vein: string, seed: number) => canvasTex(1024, 1024, (g, w) => {
    const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(255,255,255,${r() * .05})`; g.beginPath(); g.arc(r() * w, r() * w, r() * w * .35, 0, 7); g.fill(); }
    g.strokeStyle = vein; g.lineCap = g.lineJoin = 'round';
    for (let i = 0; i < 16; i++) {
      let x = r() * w, y = r() * w; g.globalAlpha = .15 + r() * .45; g.lineWidth = .5 + r() * 2; g.beginPath(); g.moveTo(x, y);
      let a = r() * Math.PI * 2;
      for (let k = 0; k < 10; k++) { a += (r() - .5) * .7; const nx = x + Math.cos(a) * w * .09, ny = y + Math.sin(a) * w * .09; g.quadraticCurveTo(x + (r() - .5) * w * .05, y + (r() - .5) * w * .05, nx, ny); x = nx; y = ny; } g.stroke();
    }
    g.globalAlpha = 1;
  });
  const woodFloor = (base: [number, number, number], spread: number, seed: number) => canvasTex(1024, 1024, (g, w) => {
    const r = rng(seed), rows = 8, rh = w / rows;
    for (let row = 0; row < rows; row++) {
      let x = -r() * w * .5;
      while (x < w) {
        const len = w * (.35 + r() * .4), v = (r() - .5) * spread;
        g.fillStyle = `hsl(${base[0]},${base[1]}%,${base[2] + v}%)`; g.fillRect(x, row * rh, len, rh - 2);
        for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(255,255,255,${r() * .07})`; g.lineWidth = 1; g.beginPath(); const yy = row * rh + r() * rh; g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy + (r() - .5) * 6, x + len * .7, yy + (r() - .5) * 6, x + len, yy); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + len - 1, row * rh, 2, rh); x += len;
      }
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, row * rh + rh - 2, w, 2);
    }
  });
  const stripes = (fg: string, bg: string, n: number) => canvasTex(512, 64, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; const s = w / n; for (let i = 0; i < n; i++) g.fillRect(i * s + s * .2, 0, s * .6, h); });
  const woodDoor = canvasTex(256, 512, (g, w, h) => {
    const r = rng(7); g.fillStyle = '#8f3a22'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${r() > .5 ? '60,20,10' : '190,100,60'},${r() * .35})`; g.lineWidth = 1 + r() * 2; const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - .5) * 30, h * .3, x + (r() - .5) * 30, h * .7, x + (r() - .5) * 20, h); g.stroke(); }
    g.strokeStyle = 'rgba(40,12,5,.6)'; g.lineWidth = 6; g.strokeRect(w * .14, h * .08, w * .72, h * .36); g.strokeRect(w * .14, h * .52, w * .72, h * .4);
  });

  const TEX = {
    grayMarble: marble('#9ea2a6', '#6f7378', 11),
    whiteMarble: marble('#e9e9e7', '#7b7f84', 23),
    darkFloor: woodFloor([210, 4, 33], 10, 3),
    lightFloor: woodFloor([30, 28, 64], 10, 5),
    slatStripe: stripes('#5d6167', '#1b1d20', 12),
    ceiling: marble('#8d9196', '#7a7e83', 31),
  };
  function rep(tex: THREE.Texture, rx: number, ry: number) { const t = tex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t; }
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);

  const M = {
    black: std({ color: 0x141518, roughness: .55 }),
    leather: std({ color: 0x111113, roughness: .35 }),
    chrome: std({ color: 0xd8dde2, metalness: 1, roughness: .18 }),
    white: std({ color: 0xf2f2f0, roughness: .45 }),
    counterTop: std({ color: 0xb9bcc0, roughness: .3 }),
    frame: std({ color: 0xa7abaf, roughness: .4, metalness: .3 }),
    glass: std({ color: 0x0b1118, roughness: .08, metalness: .6 }),
    purple: std({ color: 0x7b4fc9, roughness: .3 }),
    shelfWood: std({ color: 0xc89a6a, roughness: .7 }),
    softbox: std({ color: 0xf5f5f5, roughness: .9, emissive: 0xffffff, emissiveIntensity: .25 }),
    led: std({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.2 }),
    slatBack: std({ color: 0x17181b, roughness: .8 }),
    slat: std({ color: 0x62666c, roughness: .55 }),
    beam: std({ map: rep(TEX.slatStripe, 10, 1), roughness: .6 }),
    door: std({ map: woodDoor, roughness: .55 }),
  };

  const world = new THREE.Group(); scene.add(world);
  type Mat = THREE.Material | THREE.Material[];
  function box(sx: number, sy: number, sz: number, mat: Mat, cx: number, cy: number, cz: number, parent: THREE.Object3D = world) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(cx, cy, cz); parent.add(m); return m;
  }
  function cyl(rt: number, rb: number, h: number, mat: Mat, cx: number, cy: number, cz: number, seg = 24, parent: THREE.Object3D = world) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(cx, cy, cz); parent.add(m); return m;
  }
  // Plano que solo se ve desde el interior (efecto "casa de muñecas" al orbitar desde afuera).
  function wall(w: number, h: number, mat: Mat, cx: number, cy: number, cz: number, rotY: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(cx, cy, cz); m.rotation.y = rotY; world.add(m); return m;
  }
  const marbleMat = (tex: THREE.Texture, w: number, h: number) => std({ map: rep(tex, w / 1.2, h / 1.2), roughness: .12, metalness: .05 });

  // ─── Piso y cielo
  const floorDark = new THREE.Mesh(new THREE.PlaneGeometry(L.vigaX, L.ancho), std({ map: rep(TEX.darkFloor, L.vigaX / 2, L.ancho / 2), roughness: .6 }));
  floorDark.rotation.x = -Math.PI / 2; floorDark.position.set(L.vigaX / 2, 0, L.ancho / 2); world.add(floorDark);
  const wE = L.largo - L.vigaX;
  const floorLight = new THREE.Mesh(new THREE.PlaneGeometry(wE, L.ancho), std({ map: rep(TEX.lightFloor, wE / 2, L.ancho / 2), roughness: .55 }));
  floorLight.rotation.x = -Math.PI / 2; floorLight.position.set(L.vigaX + wE / 2, 0, L.ancho / 2); world.add(floorLight);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(L.largo, L.ancho), std({ map: rep(TEX.ceiling, 3, 1.5), roughness: .12, metalness: .15 }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.set(L.largo / 2, L.alto, L.ancho / 2); world.add(ceiling);

  // ─── Muro norte: listones verticales (identidad del local) + mármol gris en la zona de espera
  wall(L.vigaX, L.alto, M.slatBack, L.vigaX / 2, L.alto / 2, 0, 0);
  {
    const step = .055, n = Math.floor(L.vigaX / step);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(.03, L.alto, .025), M.slat, n);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { mtx.makeTranslation(step / 2 + i * step, L.alto / 2, .0125); inst.setMatrixAt(i, mtx); }
    world.add(inst);
  }
  wall(wE, L.alto, marbleMat(TEX.grayMarble, wE, L.alto), L.vigaX + wE / 2, L.alto / 2, 0, 0);

  // Espejo real (Reflector) + marco
  const ew = L.espejo.x1 - L.espejo.x0, eh = L.espejo.y1 - L.espejo.y0, ex = (L.espejo.x0 + L.espejo.x1) / 2, ey = (L.espejo.y0 + L.espejo.y1) / 2;
  box(ew + .14, eh + .14, .03, M.frame, ex, ey, .04);
  const mirror = new Reflector(new THREE.PlaneGeometry(ew, eh), { textureWidth: mirrorSize[0], textureHeight: mirrorSize[1], color: 0xaab2b6, clipBias: .003 });
  mirror.position.set(ex, ey, .058); world.add(mirror);

  // Mesón con frente ranurado
  {
    const { x0, x1, alto, fondo } = L.meson, w = x1 - x0;
    box(w, alto, fondo, std({ map: rep(TEX.slatStripe, w / .6, 1), roughness: .6 }), (x0 + x1) / 2, alto / 2, fondo / 2 + .03);
    box(w + .04, .04, fondo + .04, M.counterTop, (x0 + x1) / 2, alto + .02, fondo / 2 + .03);
    // productos sobre el mesón
    const r = rng(99), colors = [0x2f7fe0, 0xe8e8e8, 0xd6e64a, 0xe23a3a, 0x1d1d1d];
    for (let i = 0; i < 9; i++) cyl(.025, .025, .08 + r() * .12, std({ color: colors[i % colors.length], roughness: .4 }), 2.9 + i * .07, alto + .1, .2 + r() * .12);
  }

  // Silla de barbero hidráulica (hero). Frente local = -z → mira al espejo (norte), respaldo hacia el sur.
  {
    const g = new THREE.Group(); g.position.set(L.silla.x, 0, L.silla.z); world.add(g);
    cyl(.3, .32, .04, M.chrome, 0, .02, 0, 40, g);
    cyl(.045, .05, .48, M.chrome, 0, .28, 0, 20, g);
    box(.52, .12, .5, M.leather, 0, .58, 0, g);   // asiento
    box(.52, .62, .09, M.leather, 0, .94, .22, g);
    box(.34, .14, .07, M.leather, 0, 1.33, .24, g);                                   // cabecero
    for (const x of [-.3, .3]) {                                                     // apoyabrazos cromados
      box(.07, .05, .46, M.leather, x, .8, -.02, g);
      cyl(.012, .012, .2, M.chrome, x, .69, -.18, 8, g); cyl(.012, .012, .2, M.chrome, x, .69, .16, 8, g);
    }
    box(.4, .03, .16, M.chrome, 0, .22, -.42, g);                                     // posapiés
    cyl(.01, .01, .32, M.chrome, 0, .4, -.34, 8, g).rotation.x = -.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.2, .012, 8, 32), M.chrome); ring.rotation.x = Math.PI / 2; ring.position.set(0, .33, -.05); g.add(ring);
    // capa negra (volumen simple que sugiere un cliente sentado); el sitio la oculta para mostrar la silla vacía
    if (withCape) {
      const cape = new THREE.Mesh(new THREE.CylinderGeometry(.26, .36, .7, 18, 1, true), std({ color: 0x0c0c0e, roughness: .9, side: THREE.DoubleSide }));
      cape.position.set(0, .95, .12); cape.scale.z = .7; g.add(cape);
    }
  }

  // Carro organizador
  {
    const g = new THREE.Group(); g.position.set(3.75, 0, .45); world.add(g);
    box(.42, .9, .36, M.black, 0, .5, 0, g);
    for (let i = 0; i < 3; i++) box(.36, .01, .005, M.frame, 0, .25 + i * .22, .182, g);
    for (const [x, z] of [[-.17, -.14], [.17, -.14], [-.17, .14], [.17, .14]]) cyl(.025, .025, .05, M.black, x, .025, z, 12, g);
  }

  // Panel negro grande (¿TV?) — supuesto
  box(1.3, .75, .05, std({ color: 0x050506, roughness: .05, metalness: .3 }), 5.05, .5, .3).rotation.y = -.08;
  box(.6, .12, .25, M.black, 5.05, .06, .3);

  // ─── Muro sur: gris | lavado (blanco) | gris
  const { x0: lx0, x1: lx1, z0: lz0 } = L.lavado, lw = lx1 - lx0, ld = L.ancho - lz0;
  wall(lx0, L.alto, marbleMat(TEX.grayMarble, lx0, L.alto), lx0 / 2, L.alto / 2, L.ancho, Math.PI);
  wall(lw, L.alto, marbleMat(TEX.whiteMarble, lw, L.alto), lx0 + lw / 2, L.alto / 2, L.ancho, Math.PI);
  wall(L.largo - lx1, L.alto, marbleMat(TEX.grayMarble, L.largo - lx1, L.alto), (lx1 + L.largo) / 2, L.alto / 2, L.ancho, Math.PI);

  // Cubículo de lavado: tabiques con cara interior blanca y exterior gris
  {
    const t = .08, white = marbleMat(TEX.whiteMarble, ld, L.alto), gray = marbleMat(TEX.grayMarble, ld, L.alto), edge = M.black;
    // BoxGeometry materiales: [+x, -x, +y, -y, +z, -z]
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(t, L.alto, ld), [white, gray, edge, edge, edge, edge]);
    w1.position.set(lx0 - t / 2, L.alto / 2, lz0 + ld / 2); world.add(w1);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(t, L.alto, ld), [gray, white, edge, edge, edge, edge]);
    w2.position.set(lx1 + t / 2, L.alto / 2, lz0 + ld / 2); world.add(w2);
    for (const x of [lx0 - t / 2, lx1 + t / 2]) box(t + .01, .08, ld, M.black, x, .04, lz0 + ld / 2); // zócalo
    // Lavacabezas: sillón + lavatorio contra el muro sur
    const g = new THREE.Group(); g.position.set(lx0 + lw / 2, 0, L.ancho); world.add(g);
    box(.62, .42, 1.05, M.leather, 0, .21, -.95, g);
    box(.62, .32, .55, M.leather, 0, .55, -.62, g).rotation.x = -.35;
    box(.5, .18, .35, M.leather, 0, .09, -1.6, g);               // escalón para pies
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(.26, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std({ color: 0x0c0c0e, roughness: .15, side: THREE.DoubleSide }));
    bowl.position.set(0, .88, -.28); bowl.scale.set(1.1, .7, 1); g.add(bowl);
    box(.55, .48, .4, M.black, 0, .4, -.22, g);
    cyl(.012, .012, .2, M.chrome, 0, 1.0, -.08, 8, g).rotation.x = .9;
  }

  // ─── Muro oeste: servicio (puerta de madera, ventana, panel ranurado, lavadora)
  wall(L.ancho, L.alto, marbleMat(TEX.grayMarble, L.ancho, L.alto), 0, L.alto / 2, L.ancho / 2, Math.PI / 2);
  {
    const { z0, z1, alto } = L.puerta, w = z1 - z0;
    box(.05, alto, w, M.door, .03, alto / 2, (z0 + z1) / 2);
    cyl(.02, .02, .05, M.chrome, .07, 1.0, z0 + .1, 12).rotation.z = Math.PI / 2;
    const v = L.ventana, vw = v.z1 - v.z0, vh = v.y1 - v.y0;
    box(.04, vh, vw, M.glass, .02, (v.y0 + v.y1) / 2, (v.z0 + v.z1) / 2);
    box(.05, .04, vw + .06, M.black, .03, v.y0, (v.z0 + v.z1) / 2);
    box(.05, .04, vw + .06, M.black, .03, v.y1, (v.z0 + v.z1) / 2);
    box(.05, vh, .03, M.black, .03, (v.y0 + v.y1) / 2, (v.z0 + v.z1) / 2);
    box(.04, 1.7, .75, std({ map: rep(TEX.slatStripe, 1.4, 1), roughness: .6 }), .02, 1.3, .75);   // panel ranurado con enchufes
    // lavadora
    const g = new THREE.Group(); g.position.set(.34, 0, 2.95); world.add(g);
    box(.6, .85, .6, M.white, 0, .425, 0, g);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .02, 32), std({ color: 0x9aa4ad, metalness: .6, roughness: .2 }));
    door.rotation.z = Math.PI / 2; door.position.set(.31, .45, 0); g.add(door);
  }

  // Repisa de productos (entre muro oeste y cubículo)
  {
    const g = new THREE.Group(); g.position.set(.92, 0, 2.2); world.add(g);
    const W = .6, D = .32, H = 1.5;
    for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) box(.02, H, .02, M.white, x, H / 2, z, g);
    const r = rng(5), palette = [0xe8433b, 0x2d8be6, 0xd9c42b, 0x8b3fd1, 0x22b07d, 0xf2f2f2, 0x111111, 0xef7d2a];
    for (let s = 0; s < 4; s++) {
      const y = .25 + s * .38; box(W, .02, D, M.shelfWood, 0, y, 0, g);
      for (let i = 0; i < 6; i++) { const h = .06 + r() * .14; cyl(.035, .035, h, std({ color: palette[(i + s * 3) % palette.length], roughness: .35 }), -W / 2 + .06 + i * .095, y + .01 + h / 2, (r() - .5) * .12, 16, g); }
    }
  }

  // Vaporizador facial + softbox (esquina noroeste)
  {
    const g = new THREE.Group(); g.position.set(.5, 0, .7); world.add(g);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const leg = box(.3, .025, .03, M.white, Math.cos(a) * .15, .05, Math.sin(a) * .15, g); leg.rotation.y = -a; }
    cyl(.018, .018, 1.2, M.white, 0, .65, 0, 10, g);
    const tank = new THREE.Mesh(new THREE.SphereGeometry(.12, 20, 14), M.purple); tank.scale.y = 1.2; tank.position.set(0, 1.3, 0); g.add(tank);
    box(.3, .03, .03, M.white, .15, 1.48, .1, g).rotation.y = -.6;
    const sb = new THREE.Group(); sb.position.set(1.05, 0, .55); world.add(sb);
    cyl(.012, .012, 1.6, M.black, 0, .8, 0, 8, sb);
    const head = box(.55, .75, .28, M.softbox, 0, 1.75, 0, sb); head.rotation.y = .5;
  }

  // ─── Zona este (espera / acceso) — SUPUESTA
  wall(L.ancho, L.alto, marbleMat(TEX.grayMarble, L.ancho, L.alto), L.largo, L.alto / 2, L.ancho / 2, -Math.PI / 2);
  {
    const { z0, z1 } = L.acceso, w = z1 - z0;
    // Puerta vidriada a la calle (SUPUESTA): vidrio esmerilado claro con luz de día, marco de aluminio y tirador.
    const zc = (z0 + z1) / 2;
    const street = std({ color: 0xb7c6cf, roughness: .18, metalness: .1, emissive: 0x9fb3c2, emissiveIntensity: .55 });
    box(.03, 2.05, w - .06, street, L.largo - .02, 1.05, zc);
    for (const z of [z0 + .03, z1 - .03]) box(.06, 2.1, .06, M.frame, L.largo - .03, 1.05, z);   // jambas
    box(.06, .06, w + .06, M.frame, L.largo - .03, 2.1, zc);                                       // dintel
    box(.06, .05, w, M.frame, L.largo - .03, .025, zc);                                            // umbral
    cyl(.012, .012, .9, M.chrome, L.largo - .07, 1.05, z0 + .14, 10);                              // tirador
    const sofa = new THREE.Group(); sofa.position.set(6.15, 0, 3.22); world.add(sofa);
    const fabric = std({ color: 0x2a2b2f, roughness: .9 });
    box(1.5, .42, .62, fabric, 0, .21, 0, sofa); box(1.5, .45, .16, fabric, 0, .64, .23, sofa);
    for (const x of [-.78, .78]) box(.12, .58, .62, fabric, x, .29, 0, sofa);
    cyl(.25, .25, .04, M.counterTop, 6.15, .42, 2.45); cyl(.03, .03, .4, M.chrome, 6.15, .2, 2.45, 10);
  }

  // Viga de listones que separa zonas
  box(.32, .28, L.ancho, M.beam, L.vigaX, L.alto - .14, L.ancho / 2);

  // ─── Iluminación: paneles LED 60×60 + focos
  scene.add(new THREE.HemisphereLight(0xe3e9f0, 0x2a2926, .55));
  function ledPanel(x: number, z: number) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(.6, .6), M.led); p.rotation.x = Math.PI / 2; p.position.set(x, L.alto - .005, z); world.add(p);
    const l = new THREE.PointLight(0xf2f6ff, 5.5, 7, 1.6); l.position.set(x, L.alto - .25, z); scene.add(l);
  }
  ledPanel(1.6, 1.35); ledPanel(3.4, 1.35); ledPanel(6.1, 1.8);
  const spot = new THREE.PointLight(0xfff1dc, 3.2, 4, 1.7); spot.position.set(lx0 + lw / 2, L.alto - .3, 2.8); scene.add(spot);
  const dl = new THREE.Mesh(new THREE.CircleGeometry(.07, 24), M.led); dl.rotation.x = Math.PI / 2; dl.position.set(lx0 + lw / 2, L.alto - .005, 2.8); world.add(dl);

  // Libera GPU/memoria al desmontar (StrictMode monta/desmonta dos veces en desarrollo).
  function dispose() {
    const seen = new Set<unknown>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats) {
        if (seen.has(mat)) continue; seen.add(mat);
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture && !seen.has(v)) { seen.add(v); v.dispose(); }
        mat.dispose();
      }
    });
    mirror.dispose();
  }

  return { scene, mirror, dispose };
}
