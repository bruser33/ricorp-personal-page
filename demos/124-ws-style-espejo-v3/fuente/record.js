// v3: además registra por frame la posición del cursor y la intención de acercamiento (window.__z),
// para que el montaje acerque la cámara al control que toca Matías.
// Graba UNA vez el Espejo WS sobre la app local (barbero demo Matías, foto real de Joe de frente).
// Truco: la app corre en un iframe de celular de 432 px de ancho pero MUY alto (toda la página cabe sin
// scroll), escalado ×2 dentro de una página de 864 px: el screencast de Chrome entrega frames a 2× (nítidos). Así
// cada frame trae a la vez la foto y los controles; en el montaje (compose.py) se recorta la
// "ventana del celular" (432×768) y, aparte, un acercamiento a la cabeza desde el mismo frame.
// Por frame se registra (rAF): alto del encabezado, rect de la foto (o del par A/B) y el scroll virtual.
// Uso: node record.js   (requiere: npm run seed && npm run seed:pro-demo, server :4000, client :5173)
const {chromium}=require(process.env.PW||'playwright'); const fs=require('fs');
const EXE=process.env.CHROME||'/home/runner/.cache/ms-playwright/chromium-1252/chrome-linux64/chrome';
const F='http://localhost:5173', A='http://localhost:4000';
const PHOTO=process.env.PHOTO||'/tmp/vid/joe-frente.jpg', OUT=process.env.OUT||'/tmp/vid/rec';
const VW=432, VH=2300, DPR=2;
// Contorno del pelo de Joe (coordenadas normalizadas de la foto): la detección automática no separa bien su pelo
// del fondo oscuro, así que se marca con la herramienta real «Marcar zona de pelo».
const ZONA=JSON.parse(fs.readFileSync(require('path').join(__dirname,'zona-joe.json'),'utf8')).zone;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Cursor: punto táctil cobre, chico (11 px), y onda corta al tocar. Persiste su posición entre páginas.
const INIT=`(()=>{ const mk=()=>{ if(!document.body) return setTimeout(mk,20);
 const c=document.createElement('div'); c.id='__cur'; c.style.cssText='position:fixed;z-index:2147483647;left:0;top:0;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;background:#C98A55;border:1.5px solid #F3D9B8;box-shadow:0 1px 5px rgba(0,0,0,.6);pointer-events:none;opacity:0;transition:opacity .3s';
 document.body.appendChild(c); window.__cur=c; const s=JSON.parse(sessionStorage.__cur||'null'); if(s){ c.style.transform='translate('+s[0]+'px,'+s[1]+'px)'; c.style.opacity=1; } }; mk();
 window.__move=(x,y,ms=700)=>{const c=window.__cur; c.style.transition='transform '+ms+'ms cubic-bezier(.3,.7,.2,1),opacity .3s'; c.style.opacity=1; c.style.transform='translate('+x+'px,'+y+'px)'; sessionStorage.__cur=JSON.stringify([x,y]);};
 window.__tap=(x,y)=>{const r=document.createElement('div'); r.style.cssText='position:fixed;z-index:2147483646;left:'+x+'px;top:'+y+'px;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;border:2px solid #C98A55;pointer-events:none;transition:all .45s ease-out;opacity:.9'; document.body.appendChild(r); requestAnimationFrame(()=>{r.style.transform='scale(3.2)';r.style.opacity=0}); setTimeout(()=>r.remove(),500);};
 // scroll virtual del "celular" (lo usa el montaje) + registro por frame
 window.__vs=0; window.__z=1; window.__vsTo=(y,ms=700)=>new Promise(res=>{const s=window.__vs,d=y-s,t0=performance.now(); const st=t=>{const k=Math.min(1,(t-t0)/ms),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2; window.__vs=s+d*e; k<1?requestAnimationFrame(st):res();}; requestAnimationFrame(st);});
 window.__log=[]; const R=e=>{const b=e.getBoundingClientRect(); return [b.x,b.y,b.width,b.height]};
 const loop=()=>{ const h=document.querySelector('.pro-header'); const pair=[...document.querySelectorAll('.mirror-pair canvas')].map(R);
   const cv=document.querySelector('.mirror-image-panel canvas.mirror-photo');
   const cu=window.__cur; let cxy=null; if(cu&&getComputedStyle(cu).opacity>0.05){ const m=new DOMMatrix(getComputedStyle(cu).transform); cxy=[m.e,m.f]; }
   window.__log.push([performance.timeOrigin+performance.now(), h?h.getBoundingClientRect().height:0, window.__vs, cv?R(cv):null, pair.length?pair:null, cxy, window.__z||1]); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
})();`;
// Sin Asistente IA (su clave no está en producción): solo Editor manual; se ocultan el selector y el panel.
const MANUAL=`(()=>{ if(!location.pathname.includes('/espejo/')) return;
 const st=document.createElement('style'); st.textContent='.mirror-modes,.mirror-assistant{display:none!important}';
 const add=()=>document.head? document.head.appendChild(st) : setTimeout(add,10); add();
 const t=setInterval(()=>{ const b=[...document.querySelectorAll('.mirror-modes button')].find(b=>b.textContent.trim()==='Editor manual'); if(b){ if(b.getAttribute('aria-pressed')!=='true') b.click(); clearInterval(t);} },20);
})();`;
const PHONE_H=768, NAV=64;
let p, fr, cdp, frames=[], logs=[], recording=null;
async function Z(z){ await fr.evaluate(z=>{window.__z=z},z); }
async function vs(y,ms=700){ await fr.evaluate(([y,ms])=>window.__vsTo(y,ms),[y,ms]); }
async function vsSel(sel,off=12,ms=700){ const [top,hdr]=await fr.evaluate(s=>{const e=document.querySelector(s); const h=document.querySelector('.pro-header'); return [e.getBoundingClientRect().top, h.getBoundingClientRect().height]},sel); await vs(Math.max(0,top-hdr-off),ms); }
async function box(loc){ return loc.evaluate(e=>{const b=e.getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height}}); }
async function vsShow(loc,ms=650){ // asegura que el elemento quede dentro de la ventana del celular
  const bb=await box(loc); const [cur,hdr]=await fr.evaluate(()=>[window.__vs,document.querySelector('.pro-header').getBoundingClientRect().height]);
  const winH=PHONE_H-hdr-NAV, top=bb.y-hdr-cur; if(top<20 || top+bb.height>winH-20) await vs(Math.max(0,bb.y-hdr-(winH/2-bb.height/2)),ms), await sleep(ms+40); }
async function cursorTo(x,y,ms=650){ await fr.evaluate(([x,y,ms])=>window.__move(x,y,ms),[x,y,ms]); await sleep(ms+80); }
async function tap(loc,{moveMs=650,click=true,show=true}={}){ if(show) await vsShow(loc); const bb=await box(loc); const x=bb.x+bb.width/2,y=bb.y+bb.height/2;
  await cursorTo(x,y,moveMs); await fr.evaluate(([x,y])=>window.__tap(x,y),[x,y]); if(click) await p.mouse.click(2*x,2*y); await sleep(120); }
const CV='.mirror-image-panel canvas.mirror-photo';
async function cpt(nx,ny){ const bb=await box(fr.locator(CV)); return [bb.x+nx*bb.width, bb.y+ny*bb.height]; }
async function drag(pts,stepMs=18){ const [x0,y0]=pts[0]; await cursorTo(x0,y0,450); await p.mouse.move(2*x0,2*y0); await p.mouse.down();
  for(let i=1;i<pts.length;i++){ const [x,y]=pts[i]; await p.mouse.move(2*x,2*y); await fr.evaluate(([x,y])=>window.__move(x,y,0),[x,y]); await sleep(stepMs); } await p.mouse.up(); }
function line(a,b,n=24){ const o=[]; for(let i=0;i<=n;i++){ const t=i/n, e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; o.push([a[0]+(b[0]-a[0])*e,a[1]+(b[1]-a[1])*e]); } return o; }
async function slide(sel,from,to,ms=800){ const r=fr.locator(sel).first(); await vsShow(r); const bb=await box(r); const min=Number(await r.getAttribute('min')), max=Number(await r.getAttribute('max'));
  const X=v=>bb.x+8+(bb.width-16)*(v-min)/(max-min), y=bb.y+bb.height/2; await drag(line([X(from),y],[X(to),y],Math.round(ms/22)),22); }
const btn=name=>fr.locator('.mirror button').filter({hasText:new RegExp('^\\s*'+name+'\\s*$')}).first();

async function startRec(name){ const dir=`${OUT}/${name}`; fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
  frames=[]; marks=[]; let i=0; recording={name,dir,t0:Date.now()/1000};
  await fr.evaluate(()=>{window.__log=[]}).catch(()=>{});
  cdp.removeAllListeners('Page.screencastFrame');
  cdp.on('Page.screencastFrame', f=>{ const fn=`${dir}/${String(i++).padStart(5,'0')}.jpg`; fs.writeFileSync(fn,Buffer.from(f.data,'base64')); frames.push([fn,f.metadata.timestamp]); cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{}); });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:VW*DPR,maxHeight:VH*DPR,everyNthFrame:1}); }
let pending=[], marks=[]; const mark=n=>marks.push([n,Date.now()/1000]);
async function stopRec(){ await sleep(150); await cdp.send('Page.stopScreencast').catch(()=>{});
  const log=await fr.evaluate(()=>window.__log).catch(()=>[]); pending.push(...log);
  fs.writeFileSync(`${recording.dir}/meta.json`,JSON.stringify({t0:recording.t0,end:Date.now()/1000,frames,log:pending,marks}));
  console.log(recording.name, frames.length,'frames', (Date.now()/1000-recording.t0).toFixed(1)+'s', 'log',pending.length); pending=[]; }
async function navSave(){ pending.push(...await fr.evaluate(()=>window.__log).catch(()=>[])); } // antes de navegar, guardar el registro

(async()=>{ const b=await chromium.launch({executablePath:EXE});
 const c=await b.newContext({viewport:{width:VW*2,height:VH*2},deviceScaleFactor:1,locale:'es-CL',timezoneId:'America/Santiago'});
 await c.addInitScript(INIT); await c.addInitScript(MANUAL);
 const r=await c.request.post(A+'/api/auth/login',{data:{email:'matias.demo@wstyle.local',password:'demo12345'}}); if(r.status()!==200) throw new Error('login');
 p=await c.newPage(); p.on('pageerror',e=>console.log('pageerror',e.message));
 // Página contenedora (mismo origen, no es un archivo del sitio): iframe de 432 px escalado ×2.
 await p.route(F+'/__rec',rt=>rt.fulfill({contentType:'text/html',body:`<html><body style="margin:0;background:#0d0b0a;overflow:hidden"><iframe id=f src="/wstyle/pro/espejo/" style="border:0;width:${VW}px;height:${VH}px;transform:scale(2);transform-origin:0 0"></iframe></body></html>`}));
 await p.goto(F+'/__rec'); await sleep(1000); fr=p.frames().find(f=>f!==p.mainFrame());
 cdp=await c.newCDPSession(p);
 // Calentar el modelo de detección (queda en caché) y volver al panel.
 await fr.locator('input[aria-label="Elegir archivo de foto"]').setInputFiles(PHOTO);
 await sleep(400); await fr.waitForFunction(()=>!document.querySelector('.mirror-status')?.textContent,null,{timeout:90000});
 await fr.evaluate(()=>sessionStorage.__cur=JSON.stringify([300,520]));
 await fr.goto(F+'/wstyle/pro/'); await sleep(2500);

 // l2 · Panel del barbero → Espejo WS (barra inferior)
 await startRec('l2'); await sleep(900);
 await cursorTo(220,330,900); await sleep(700);
 const link=fr.locator('.pro-tabs a',{hasText:/Espejo/i}).first(); await navSave();
 await Z(1.6); await tap(link,{moveMs:900,show:false}); await Z(1); await fr.waitForURL(/espejo/); await fr.waitForSelector('.mirror-empty');
 await sleep(1200); await stopRec();

 // l3 · Foto de frente desde la galería + opción de repetirla
 await startRec('l3'); await sleep(400);
 const g=fr.getByRole('button',{name:'Elegir de galería'}).first(); await Z(1.7); await tap(g,{click:false,moveMs:800}); await sleep(250);
 await fr.locator('input[aria-label="Elegir archivo de foto"]').setInputFiles(PHOTO);
 await sleep(300); await fr.waitForFunction(()=>!document.querySelector('.mirror-status')?.textContent,null,{timeout:60000});
 await Z(1); await sleep(700);
 // Marcar la zona de pelo con unos toques (en cámara, rápido)
 await Z(1.6); mark('zona0'); await tap(btn('Marcar zona de pelo'),{moveMs:600}); await Z(1.25); await sleep(100);
 await vsSel(CV,-8,450); await sleep(480);
 for(const [nx,ny] of ZONA){ const [x,y]=await cpt(nx,ny); await cursorTo(x,y,90); await fr.evaluate(([x,y])=>window.__tap(x,y),[x,y]); await p.mouse.click(2*x,2*y); await sleep(25); }
 await Z(1.6); await tap(btn('Aplicar zona'),{moveMs:450}); mark('zona1'); await sleep(700);
 await Z(1); await sleep(300); const sum=fr.locator('.mirror-replace summary').first(); await Z(1.7); await tap(sum,{moveMs:700}); await sleep(400);
 await cursorTo(...await (async()=>{const bb=await box(fr.getByRole('button',{name:'Repetir foto'}).first()); return [bb.x+bb.width/2,bb.y+bb.height/2]})(),600);
 await sleep(1500); await stopRec();
 await fr.locator('.mirror-replace summary').first().click(); await sleep(200);

 // l4 · Bajo → Medio → Alto + Al ras
 await vsSel('.mirror-controls',10,10); await sleep(300);
 await startRec('l4'); await sleep(500); await Z(1.8); await tap(btn('Bajo'),{moveMs:600}); await sleep(900);
 await tap(btn('Medio'),{moveMs:700}); await sleep(1300);
 await tap(btn('Alto'),{moveMs:500}); await sleep(1400);
 await slide('.mirror-controls label:has-text("Al ras") input',70,100,900); await sleep(900);
 await slide('.mirror-controls label:has-text("Al ras") input',100,90,500); await sleep(500); await Z(1);
 { const d=await fr.evaluate(s=>document.querySelector(s).toDataURL('image/png'),CV); fs.writeFileSync(`${OUT}/alto.png`,Buffer.from(d.split(',')[1],'base64')); }
 await sleep(500); await stopRec();

 // l5 · Dibujar una línea en el costado, moverla, engrosarla, ocultar/mostrar
 await startRec('l5'); await sleep(300);
 await Z(1.8); await tap(btn('Dibujar línea'),{moveMs:600}); await sleep(150); await Z(1.7);
 await vsSel(CV,-8,450); await sleep(480);
 await drag(line(await cpt(0.305,0.118),await cpt(0.390,0.080),26),20); await sleep(300);
 await vsSel('.mirror-controls fieldset:nth-of-type(2)',40,450); await sleep(480);
 await Z(1.8); await tap(btn('Mover línea'),{moveMs:500}); await Z(1.7);
 await vsSel(CV,-8,450); await sleep(480);
 const m0=await cpt(0.348,0.099), m1=await cpt(0.348,0.090); await drag(line(m0,m1,14),26); await sleep(300);
 await Z(1.8); await slide('.mirror-controls label:has-text("Grosor") input',1.2,1.9,600); await sleep(400);
 await tap(btn('Ocultar líneas'),{moveMs:400}); await sleep(450);
 await tap(btn('Mostrar líneas'),{moveMs:200}); await sleep(300); await Z(1); await sleep(500);
 { const d=await fr.evaluate(s=>document.querySelector(s).toDataURL('image/png'),CV); fs.writeFileSync(`${OUT}/linea.png`,Buffer.from(d.split(',')[1],'base64')); }
 await stopRec();

 // l6 · Comparar A y B y combinar degradado B con líneas A
 await startRec('l6'); await sleep(300);
 await Z(1.8); await tap(btn('Comparar A y B'),{moveMs:700}); await sleep(200); await Z(1);
 await vsSel('.mirror-pair',10,700); await sleep(2300);
 await Z(1.7); await tap(btn('Usar degradado B con líneas A'),{moveMs:800}); await sleep(300); await Z(1);
 await vsSel(CV,-8,700); await sleep(1600); await stopRec();

 // l7 · Fijar el diseño + autorización + opción de descarga (sin descargar)
 await startRec('l7'); await sleep(300);
 await Z(1.7); await tap(btn('Fijar este diseño'),{moveMs:700}); await sleep(500);
 await vsSel('.mirror-controls',40,700); await sleep(800);
 await tap(fr.getByRole('checkbox',{name:/autoriza guardar/}),{moveMs:600}); await sleep(500);
 await tap(fr.locator('.mirror-controls .mirror-save').first(),{moveMs:600,click:false}); await sleep(1300); await Z(1); await sleep(300);
 const still=await fr.evaluate(s=>document.querySelector(s).toDataURL('image/png'),CV); fs.writeFileSync(`${OUT}/elegido.png`,Buffer.from(still.split(',')[1],'base64'));
 await stopRec();

 // l8 · Terminar la consulta y descartar las fotos
 await startRec('l8'); await sleep(300);
 await vs(0,800); await sleep(900);
 await Z(1.6); await tap(fr.getByRole('button',{name:'Terminar sesión de fotos'}),{moveMs:700}); await sleep(900);
 await tap(fr.getByRole('button',{name:'Sí, descartar'}),{moveMs:600}); await sleep(400); await Z(1); await sleep(1800); await stopRec();
 console.log('fotos tras descartar:', await fr.locator('canvas.mirror-photo').count());
 await b.close(); })();
