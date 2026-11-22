// Graba el recorrido del Espejo WS sobre la app local, con screencast CDP (frames JPEG con timestamp)
// y convierte cada escena a MP4 CFR 30 fps. Uso: node record.js h|v
// Todo ocurre en UNA sola página (las fotos de la consulta viven en memoria): entre escenas se prepara
// el estado sin grabar. Requiere el barbero demo matias.demo@wstyle.local y las fotos del maniquí.
const {chromium}=require('playwright'); const fs=require('fs'); const {execFileSync}=require('child_process');
const EXE=process.env.CHROME||'/home/runner/.cache/ms-playwright/chromium-1252/chrome-linux64/chrome';
const FF=process.env.FFMPEG||'/tmp/vv/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2';
const F='http://localhost:5173', A='http://localhost:4000', PH='/tmp/vid/photos';
const Z=JSON.parse(fs.readFileSync('/tmp/vid/zones.json','utf8'));
const FMT=process.argv[2]; const V=FMT==='v';
const OUT=`/tmp/vid/scenes-${FMT}`; fs.mkdirSync(OUT,{recursive:true});
const VP=V?{width:432,height:768}:{width:1280,height:720}; const DPR=V?2.5:1.5; const W=V?1080:1920,H=V?1920:1080;
const DUR={s0:3.2,l1:10.0,l2:10.5,lz:9.6,l3:8.6,l4:8.6,l5:9.0,l6:7.2,l7:7.0};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CURSOR=`(()=>{ if(window.__cur) return; const mk=()=>{ if(!document.body) return setTimeout(mk,30);
 const c=document.createElement('div'); c.id='__cur'; c.style.cssText='position:fixed;z-index:2147483647;left:0;top:0;width:${V?28:22}px;height:${V?28:22}px;margin:-${V?14:11}px 0 0 -${V?14:11}px;border-radius:50%;background:rgba(239,232,220,.85);border:2px solid #B8875A;box-shadow:0 2px 10px rgba(0,0,0,.5);pointer-events:none;opacity:0;transition:transform .9s cubic-bezier(.3,.7,.2,1),opacity .4s';
 document.body.appendChild(c); window.__cur=c; }; mk();
 window.__move=(x,y,ms=900)=>{const c=window.__cur; c.style.transition='transform '+ms+'ms cubic-bezier(.3,.7,.2,1),opacity .4s'; c.style.opacity=1; c.style.transform='translate('+x+'px,'+y+'px)';};
 window.__tap=(x,y)=>{const r=document.createElement('div'); r.style.cssText='position:fixed;z-index:2147483646;left:'+x+'px;top:'+y+'px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #B8875A;pointer-events:none;transition:all .6s ease-out;opacity:1'; document.body.appendChild(r); requestAnimationFrame(()=>{r.style.transform='scale(5)';r.style.opacity=0}); setTimeout(()=>r.remove(),700);};
 window.__scrollTo=(y,ms=1600)=>new Promise(res=>{const el=document.scrollingElement; const s=el.scrollTop, d=y-s, t0=performance.now(); const st=t=>{const k=Math.min(1,(t-t0)/ms); const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2; el.scrollTop=s+d*e; k<1?requestAnimationFrame(st):res();}; requestAnimationFrame(st);});
})();`;
// El Asistente IA necesita una clave que aún no está en producción: en el video se usa solo el
// Editor manual (se elige al abrir y se ocultan el selector y el panel del asistente).
const MANUAL=`(()=>{ if(!location.pathname.includes('/wstyle/pro/espejo/')) return;
 const st=document.createElement('style'); st.textContent='.mirror-modes,.mirror-assistant{display:none!important}';
 const add=()=>document.head? document.head.appendChild(st) : setTimeout(add,10); add();
 const t=setInterval(()=>{ const b=[...document.querySelectorAll('.mirror-modes button')].find(b=>b.textContent.trim()==='Editor manual'); if(b){ if(b.getAttribute('aria-pressed')!=='true') b.click(); clearInterval(t);} },30);
})();`;
const TOP=84, BOT=V?66:20; // margen bajo el encabezado fijo (y sobre la barra inferior en móvil)
async function visible(p,loc){ let bb=await loc.boundingBox(); if(!bb){ await loc.scrollIntoViewIfNeeded().catch(()=>{}); bb=await loc.boundingBox(); }
  const vh=VP.height; if(bb.y<TOP || bb.y+bb.height>vh-BOT){ const cur=await p.evaluate(()=>document.scrollingElement.scrollTop); await scrollY(p,cur+bb.y-(TOP+(vh-TOP-BOT)/2-bb.height/2),600); await sleep(650); bb=await loc.boundingBox(); } return bb; }
async function center(loc,p){ const bb=p? await visible(p,loc) : (await loc.scrollIntoViewIfNeeded().catch(()=>{}), await loc.boundingBox()); return [bb.x+bb.width/2, bb.y+bb.height/2]; }
async function cursorTo(p,x,y,ms=900){ await p.evaluate(([x,y,ms])=>window.__move(x,y,ms),[x,y,ms]); await sleep(ms+120); }
async function tapAt(p,x,y,{moveMs=700}={}){ await cursorTo(p,x,y,moveMs); await p.evaluate(([x,y])=>window.__tap(x,y),[x,y]); await p.mouse.click(x,y); }
async function moveTap(p, loc, {click=true, moveMs=900}={}){ const [x,y]=await center(loc,p); await cursorTo(p,x,y,moveMs); const [x2,y2]=await center(loc,p); if(Math.hypot(x2-x,y2-y)>2) await cursorTo(p,x2,y2,200); await p.evaluate(([x,y])=>window.__tap(x,y),[x2,y2]); if(click) await p.mouse.click(x2,y2); } // clic en coordenadas: el clic de locator se reintenta tras navegar
async function scrollY(p,y,ms){ await p.evaluate(([y,ms])=>window.__scrollTo(y,ms),[y,ms]); }
async function pageTop(p,sel){ return p.evaluate(s=>{const e=document.querySelector(s); return e? e.getBoundingClientRect().top+document.scrollingElement.scrollTop : 0},sel); }
async function scrollToSel(p,sel,off,ms=900){ await scrollY(p,(await pageTop(p,sel))-off,ms); await sleep(60); }
const btn=(p,name)=>p.locator('.mirror button',{hasText:name}).filter({hasText:new RegExp('^\\s*'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*(✓)?$')}).first();
const tab=(p,name)=>p.locator('.mirror-tabs button',{hasText:name}).first();
async function canvasPt(p,nx,ny){ const bb=await p.locator('canvas.mirror-photo').first().boundingBox(); return [bb.x+nx*bb.width, bb.y+ny*bb.height]; }
async function upload(p,file,moveMs=800){ const g=p.getByRole('button',{name:'Elegir de galería'}).first(); const [x,y]=await center(g,p); await cursorTo(p,x,y,moveMs); await p.evaluate(([x,y])=>window.__tap(x,y),[x,y]);
  // El toque se ve sobre "Elegir de galería"; la foto se entrega directo al campo de archivo (sin diálogo del sistema).
  await p.locator('input[aria-label="Elegir archivo de foto"]').setInputFiles(file); }
async function settled(p){ await sleep(250); await p.waitForFunction(()=>!document.querySelector('.mirror-status')?.textContent,null,{timeout:60000}); }
async function drag(p,pts,stepMs=16){ // traza con el "dedo" moviendo también el cursor visible
  const [x0,y0]=pts[0]; await cursorTo(p,x0,y0,600); await p.mouse.move(x0,y0); await p.mouse.down();
  for(let i=1;i<pts.length;i++){ const [x,y]=pts[i]; await p.mouse.move(x,y); await p.evaluate(([x,y])=>window.__move(x,y,0),[x,y]); await sleep(stepMs); }
  await p.mouse.up(); }
function curve(a,b,c,n=28){ const out=[]; for(let i=0;i<=n;i++){ const t=i/n; out.push([(1-t)*(1-t)*a[0]+2*(1-t)*t*b[0]+t*t*c[0],(1-t)*(1-t)*a[1]+2*(1-t)*t*b[1]+t*t*c[1]]); } return out; }
async function slide(p,sel,from,to,ms=900){ const r=p.locator(sel).first(); const bb=await visible(p,r); const min=Number(await r.getAttribute('min')), max=Number(await r.getAttribute('max'));
  const X=v=>bb.x+8+(bb.width-16)*(v-min)/(max-min), y=bb.y+bb.height/2; const n=Math.round(ms/20); const pts=[]; for(let i=0;i<=n;i++){ const t=i/n, e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; pts.push([X(from+(to-from)*e),y]); } await drag(p,pts,20); }

async function record(p, name, actions){
  const dur=DUR[name]; const cdp=await p.context().newCDPSession(p); const frames=[]; let i=0;
  const dir=`${OUT}/${name}`; fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir);
  cdp.on('Page.screencastFrame', async f=>{ const fn=`${dir}/${String(i++).padStart(5,'0')}.jpg`; fs.writeFileSync(fn,Buffer.from(f.data,'base64')); frames.push([fn,f.metadata.timestamp]); cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{}); });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:W,maxHeight:H,everyNthFrame:1});
  const t0=Date.now()/1000; await p.evaluate(()=>{document.body.style.transform='translateZ(0)'; setTimeout(()=>document.body.style.transform='',50)}).catch(()=>{});
  const run=actions().catch(e=>console.log(name,'acción falló:',e.message));
  await sleep(dur*1000); await run; await cdp.send('Page.stopScreencast').catch(()=>{}); await cdp.detach().catch(()=>{}); await sleep(200);
  let txt='ffconcat version 1.0\n'; const fr=frames.filter(f=>f[1]-t0<dur);
  if(!fr.length) throw new Error(name+': sin frames');
  for(let k=0;k<fr.length;k++){ const start=k===0?0:fr[k][1]-t0; const end=k+1<fr.length?fr[k+1][1]-t0:dur; txt+=`file '${fr[k][0]}'\nduration ${Math.max(0.001,end-start).toFixed(4)}\n`; }
  txt+=`file '${fr[fr.length-1][0]}'\n`; fs.writeFileSync(`${dir}/list.txt`,txt);
  execFileSync(FF,['-y','-loglevel','error','-f','concat','-safe','0','-i',`${dir}/list.txt`,'-vf',`scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0d0b0a,fps=30,format=yuv420p`,'-t',String(dur),'-c:v','libx264','-crf','14','-preset','medium',`${OUT}/${name}.mp4`]);
  console.log(name, fr.length,'frames', dur+'s');
}
async function card(b,t,name){ const c=await b.newContext({viewport:VP,deviceScaleFactor:DPR}); const p=await c.newPage(); await p.goto(`file:///tmp/vid/cards/card.html?t=${t}&v=${V?1:0}`); await p.waitForFunction(()=>window.__ready); await sleep(300);
  await record(p,name,async()=>{ await sleep(150); await p.evaluate(()=>document.body.classList.add('on')); }); await c.close(); }

(async()=>{ const b=await chromium.launch({executablePath:EXE,args:['--enable-gpu-rasterization','--ignore-gpu-blocklist']});
 await card(b,'intro','s0');
 const c=await b.newContext({viewport:VP,deviceScaleFactor:DPR,isMobile:V,hasTouch:V,locale:'es-CL',timezoneId:'America/Santiago'});
 await c.addInitScript(CURSOR); await c.addInitScript(MANUAL);
 const r=await c.request.post(A+'/api/auth/login',{data:{email:'matias.demo@wstyle.local',password:'demo12345'}}); if(r.status()!==200) throw new Error('login');
 const p=await c.newPage(); p.on('pageerror',e=>console.log('pageerror',e.message));
 // Calienta el modelo de detección (queda en la caché HTTP) y vuelve a la consulta vacía.
 await p.goto(F+'/wstyle/pro/espejo/'); await sleep(1500); await p.locator('input[aria-label="Elegir archivo de foto"]').setInputFiles(`${PH}/maniqui-front.jpg`); await settled(p);
 await p.goto(F+'/wstyle/pro/'); await sleep(3500);

 // l1 · gancho sobre el panel del barbero → abrir Espejo WS
 await record(p,'l1',async()=>{ await sleep(700);
   const card=p.getByText('Degradado bajo').first(); const [x,y]=await center(card); await cursorTo(p,x,y,1200); await sleep(900);
   if(V) await scrollY(p,180,1400), await sleep(600), await scrollY(p,0,1000); else await sleep(1600);
   await sleep(700); await moveTap(p,p.getByRole('link',{name:/Espejo WS/i}).first(),{moveMs:900});
   await p.waitForURL(/espejo/); await p.waitForSelector('.mirror-empty'); });

 // l2 · fotos de frente y de ambos perfiles
 await scrollToSel(p,'.mirror-tabs',TOP,10); await sleep(400);
 await record(p,'l2',async()=>{ await sleep(500);
   await upload(p,`${PH}/maniqui-front.jpg`); await settled(p); await scrollToSel(p,'.mirror-tabs',TOP,500); await sleep(500);
   await moveTap(p,tab(p,'Lateral izquierdo'),{moveMs:700}); await sleep(350); await upload(p,`${PH}/maniqui-left.jpg`,600); await settled(p); await scrollToSel(p,'.mirror-tabs',TOP,400); await sleep(400);
   await moveTap(p,tab(p,'Lateral derecho'),{moveMs:700}); await sleep(350); await upload(p,`${PH}/maniqui-right.jpg`,600); await settled(p); await scrollToSel(p,'.mirror-tabs',TOP,400); });

 // Fuera de cámara: delimitar el pelo del perfil derecho (la detección automática no reconoce el maniquí de perfil).
 async function zone(view,{onCam=false}={}){ const pts=Z[view].zone, tone=Z[view].tone, ms=k=>onCam?k:10;
   const photoView=async()=>{ if(V) await scrollToSel(p,'canvas.mirror-photo',TOP,ms(600)); else await scrollToSel(p,'.mirror-tabs',TOP,ms(600)); await sleep(ms(150)); };
   await moveTap(p,btn(p,'Marcar zona de pelo'),{moveMs:ms(700)}); await sleep(ms(300));
   await photoView();
   for(const [nx,ny] of pts){ const [x,y]=await canvasPt(p,nx,ny); await tapAt(p,x,y,{moveMs:onCam?140:5}); await sleep(onCam?40:10); }
   await moveTap(p,btn(p,'Aplicar zona'),{moveMs:ms(600)}); await sleep(ms(400));
   await photoView();
   const [x,y]=await canvasPt(p,tone[0],tone[1]); await tapAt(p,x,y,{moveMs:ms(700)}); await sleep(ms(300)); }
 await zone('right'); await sleep(300);
 await tab(p,'Lateral izquierdo').click(); await sleep(300); await scrollToSel(p,'.mirror-tabs',TOP,10); await sleep(300);
 if(V) await scrollToSel(p,'canvas.mirror-photo',TOP,10);

 // lz · si no reconoce el pelo, se marca con unos toques y se toma el tono de piel (perfil izquierdo, en cámara)
 await record(p,'lz',async()=>{ await sleep(400); await zone('left',{onCam:true}); });
 console.log('Fijar habilitado:', await p.getByRole('button',{name:'Fijar este diseño'}).isEnabled());

 // l3 · degradado bajo, medio y alto + qué tan al ras
 if(V) await scrollToSel(p,'canvas.mirror-photo',58,10); else await scrollToSel(p,'.mirror-tabs',TOP,10);
 await record(p,'l3',async()=>{ await sleep(450);
   await moveTap(p,btn(p,'Medio'),{moveMs:800}); await sleep(1100);
   await moveTap(p,btn(p,'Alto'),{moveMs:500}); await sleep(1100);
   await slide(p,'.mirror-controls label:has-text("Al ras") input',70,100,1300); await sleep(400);
   await slide(p,'.mirror-controls label:has-text("Al ras") input',100,85,700); });

 // l4 · dibujar líneas, moverlas y cambiar su grosor
 await record(p,'l4',async()=>{ await sleep(300);
   if(V) await scrollToSel(p,'.mirror-controls fieldset:nth-of-type(2)',300,700), await sleep(150);
   await moveTap(p,btn(p,'Dibujar línea'),{moveMs:600}); await sleep(250);
   if(V) await scrollToSel(p,'canvas.mirror-photo',TOP,600), await sleep(120);
   const a=await canvasPt(p,0.47,0.27), m=await canvasPt(p,0.62,0.235), e=await canvasPt(p,0.80,0.30); await drag(p,curve(a,m,e,34),18); await sleep(350);
   if(V) await scrollToSel(p,'.mirror-controls fieldset:nth-of-type(2)',300,600), await sleep(120);
   await moveTap(p,btn(p,'Mover línea'),{moveMs:500}); await sleep(200);
   if(V) await scrollToSel(p,'canvas.mirror-photo',TOP,600), await sleep(120);
   const s0=await canvasPt(p,0.62,0.237), s1=await canvasPt(p,0.62,0.27); const mv=[]; for(let i=0;i<=16;i++) mv.push([s0[0],s0[1]+(s1[1]-s0[1])*i/16]); await drag(p,mv,28); await sleep(200);
   await slide(p,'.mirror-controls label:has-text("Grosor") input',1.2,2.4,800); if(V) await sleep(100), await scrollToSel(p,'canvas.mirror-photo',TOP,600); });

 // l5 · comparar A y B y combinar el degradado de B con las líneas de A
 await record(p,'l5',async()=>{ await sleep(300);
   await moveTap(p,btn(p,'Comparar A y B'),{moveMs:800}); await sleep(250);
   await scrollToSel(p,'.mirror-tabs',TOP,V?10:600); if(V) await scrollToSel(p,'.mirror-pair',20,700); await sleep(V?1700:1900);
   if(V) await scrollToSel(p,'.mirror-controls',120,800), await sleep(200);
   await moveTap(p,btn(p,'Usar degradado B con líneas A'),{moveMs:800}); await sleep(450);
   if(V) await scrollToSel(p,'canvas.mirror-photo',TOP,800); else await scrollToSel(p,'.mirror-tabs',TOP,600); });

 // l6 · fijar el diseño elegido
 await record(p,'l6',async()=>{ await sleep(300);
   if(V) await scrollToSel(p,'.mirror-controls .mirror-primary',260,800), await sleep(150);
   await moveTap(p,btn(p,'Fijar este diseño'),{moveMs:800}); await sleep(500);
   if(V) await scrollToSel(p,'canvas.mirror-photo',TOP,900); else await scrollToSel(p,'.mirror-tabs',TOP,600);
   await sleep(500); await moveTap(p,tab(p,'Frente'),{moveMs:800}); await sleep(900); await moveTap(p,tab(p,'Lateral derecho'),{moveMs:700}); });
 await c.close();
 await card(b,'end','l7');
 await b.close(); })();
