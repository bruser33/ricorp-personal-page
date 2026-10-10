import { useEffect, useRef } from 'react';
import type { Renderer3D } from '../experience';

interface Props {
  // Solo se construye el 3D cuando está activo (respaldo de la secuencia o ?mode=3d).
  active: boolean;
  onRenderer: (r: Renderer3D | null) => void;
}

// Respaldo 3D en tiempo real (three.js). Imperativo dentro de useEffect: crea renderer + escena al activarse y lo
// libera todo al desmontar (geometrías, materiales, texturas, espejo y contexto WebGL), así StrictMode no deja fugas.
export default function Scene3D({ active, onRenderer }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    // La escena (y WebGLRenderer) se descargan aparte: en modo secuencia no se bajan.
    void Promise.all([import('three'), import('./scene')]).then(([THREE, { buildScene }]) => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      let mobile = innerWidth <= 768 || innerWidth < innerHeight;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile });
      renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      // Sin capa sobre la silla: el sitio muestra el "trono" vacío.
      const built = buildScene({ cape: false, mirrorSize: mobile ? [512, 256] : [1024, 512] });
      const r: Renderer3D = {
        render: (camera) => renderer.render(built.scene, camera),
        resize: (w, h, compact) => {
          if (compact !== mobile) {
            mobile = compact;
            renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
            if (mobile) built.mirror.getRenderTarget().setSize(512, 256); else built.mirror.getRenderTarget().setSize(1024, 512);
          }
          renderer.setSize(w, h, false);
        },
      };
      onRenderer(r);
      cleanup = () => {
        onRenderer(null);
        built.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      };
    });
    return () => { cancelled = true; cleanup?.(); };
  }, [active, onRenderer]);

  return <canvas id="scene" ref={canvasRef} aria-hidden="true" hidden={!active} />;
}
