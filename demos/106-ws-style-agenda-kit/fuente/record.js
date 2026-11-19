// Graba cada escena con CDP screencast (frames JPEG con timestamp) y la convierte a MP4 CFR 30 fps.
const {chromium}=require('playwright'); const fs=require('fs'); const {execFileSync}=require('child_process');
const EXE='/home/runner/.cache/ms-playwright/chromium-1252/chrome-linux64/chrome';
const FF='/tmp/vv/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2';
const F='http://localhost:5173', A='http://localhost:4000';
const FMT=process.argv[2]; const V=FMT==='v'; const ONLY=process.argv[3];
const OUT=`/tmp/vid/scenes-${FMT}`; fs.mkdirSync(OUT,{recursive:true});
const VP=V?{width:432,height:768}:{width:1280,height:720}; const DPR=V?2.5:1.5; const W=V?1080:1920,H=V?1920:1080;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CURSOR=`(()=>{ if(window.__cur) return; const mk=()=>{ if(!document.body) return setTimeout(mk,30);
 const c=document.createElement('div'); c.id='__cur'; c.style.cssText='position:fixed;z-index:2147483647;left:0;top:0;width:${V?28:22}px;height:${V?28:22}px;margin:-${V?14:11}px 0 0 -${V?14:11}px;border-radius:50%;background:rgba(239,232,220,.85);border:2px solid #B8875A;box-shadow:0 2px 10px rgba(0,0,0,.5);pointer-events:none;opacity:0;transition:transform .9s cubic-bezier(.3,.7,.2,1),opacity .4s';
 document.body.appendChild(c); window.__cur=c; }; mk();
 window.__move=(x,y,ms=900)=>{const c=window.__cur; c.style.transition='transform '+ms+'ms cubic-bezier(.3,.7,.2,1),opacity .4s'; c.style.opacity=1; c.style.transform='translate('+x+'px,'+y+'px)';};
 window.__tap=(x,y)=>{const r=document.createElement('div'); r.style.cssText='position:fixed;z-index:2147483646;left:'+x+'px;top:'+y+'px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #B8875A;pointer-events:none;transition:all .6s ease-out;opacity:1'; document.body.appendChild(r); requestAnimationFrame(()=>{r.style.transform='scale(5)';r.style.opacity=0}); setTimeout(()=>r.remove(),700);};
 window.__scrollTo=(y,ms=1600)=>new Promise(res=>{const el=document.scrollingElement; const s=el.scrollTop, d=y-s, t0=performance.now(); const st=t=>{const k=Math.min(1,(t-t0)/ms); const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2; el.scrollTop=s+d*e; k<1?requestAnimationFrame(st):res();}; requestAnimationFrame(st);});
})();`;
async function ctx(b, email){ const c=await b.newContext({viewport:VP,deviceScaleFactor:DPR,isMobile:V,hasTouch:V,locale:'es-CL',timezoneId:'America/Santiago',acceptDownloads:true,permissions:['clipboard-read','clipboard-write']}); await c.addInitScript(CURSOR);
  if(email){ const r=await c.request.post(A+'/api/auth/login',{data:{email,password:'demo12345'}}); if(r.status()!==200) throw new Error('login '+email);} return c; }
async function center(p, loc){ await loc.scrollIntoViewIfNeeded().catch(()=>{}); const bb=await loc.boundingBox(); return [bb.x+bb.width/2, bb.y+bb.height/2]; }
async function moveTap(p, loc, {click=true, moveMs=900}={}){ const [x,y]=await center(p,loc); await p.evaluate(([x,y,ms])=>window.__move(x,y,ms),[x,y,moveMs]); await sleep(moveMs+150); await p.evaluate(([x,y])=>window.__tap(x,y),[x,y]); if(click) await loc.click({force:true}).catch(e=>console.log('click',e.message)); }
async function scrollToSel(p, sel, off, ms){ const y=await p.evaluate(([s,o])=>{const e=document.querySelector(s); return e? e.getBoundingClientRect().top+document.scrollingElement.scrollTop-o : 0},[sel,off]); await p.evaluate(([y,ms])=>window.__scrollTo(y,ms),[y,ms]); }

async function record(p, name, dur, actions){
  const cdp=await p.context().newCDPSession(p); const frames=[]; let i=0;
  const dir=`${OUT}/${name}`; fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir);
  cdp.on('Page.screencastFrame', async f=>{ const fn=`${dir}/${String(i++).padStart(5,'0')}.jpg`; fs.writeFileSync(fn,Buffer.from(f.data,'base64')); frames.push([fn,f.metadata.timestamp]); cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{}); });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:W,maxHeight:H,everyNthFrame:1});
  const t0=Date.now()/1000; await p.evaluate(()=>{document.body.style.transform='translateZ(0)'; setTimeout(()=>document.body.style.transform='',50)}).catch(()=>{});
  const run=actions().catch(e=>console.log(name,'acción falló:',e.message));
  await sleep(dur*1000); await run; await cdp.send('Page.stopScreencast'); await sleep(200);
  // ffconcat con duraciones reales
  let txt='ffconcat version 1.0\n'; const fr=frames.filter(f=>f[1]-t0<dur);
  if(!fr.length) throw new Error(name+': sin frames');
  for(let k=0;k<fr.length;k++){ const start=k===0?0:fr[k][1]-t0; const end=k+1<fr.length?fr[k+1][1]-t0:dur; txt+=`file '${fr[k][0]}'\nduration ${Math.max(0.001,end-start).toFixed(4)}\n`; }
  txt+=`file '${fr[fr.length-1][0]}'\n`; fs.writeFileSync(`${dir}/list.txt`,txt);
  execFileSync(FF,['-y','-loglevel','error','-f','concat','-safe','0','-i',`${dir}/list.txt`,'-vf',`scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0d0b0a,fps=30,format=yuv420p`,'-t',String(dur),'-c:v','libx264','-crf','14','-preset','medium',`${OUT}/${name}.mp4`]);
  console.log(name, fr.length,'frames', dur+'s');
}
const want=n=>!ONLY||ONLY.split(',').includes(n);
(async()=>{ const b=await chromium.launch({executablePath:EXE,args:['--enable-gpu-rasterization','--ignore-gpu-blocklist']});
 // Intro
 if(want('s0')){ const c=await ctx(b); const p=await c.newPage(); await p.goto(`file:///tmp/vid/cards/card.html?t=intro&v=${V?1:0}`); await p.waitForFunction(()=>window.__ready); await sleep(300);
   await record(p,'s0',3.2,async()=>{ await sleep(150); await p.evaluate(()=>document.body.classList.add('on')); }); await c.close(); }
 // l1: portada, avanzar una vista
 if(want('l1')){ const c=await ctx(b); const p=await c.newPage(); await p.goto(F+'/wstyle/'); await sleep(5000);
   await record(p,'l1',8.6,async()=>{ await sleep(3300); const nx=p.locator('button[aria-label="Pantalla siguiente"]').first(); await moveTap(p,nx); await sleep(1500); }); await c.close(); }
 // l2: tocar Reservar y elegir servicio (cliente demo)
 if(want('l2')){ const c=await ctx(b,'cliente.demo@wstyle.local'); const p=await c.newPage(); await p.goto(F+'/wstyle/'); await sleep(5000);
   await record(p,'l2',7.6,async()=>{ await sleep(500); const r=V? p.locator('a.btn.btn--primary:not(.nav-cta)').first() : p.locator('a,button').filter({hasText:/^reservar$/i}).nth(1);
     await moveTap(p,r,{moveMs:800}); await p.waitForURL(/reservar/,{timeout:5000}).catch(()=>{}); await p.waitForSelector('text=Corte',{timeout:5000}); await sleep(900);
     const corte=p.locator('label,button,[role=radio]').filter({hasText:/^Corte\s*\$12/}).first(); await moveTap(p, (await corte.count())?corte:p.getByText('Corte',{exact:true}).first()); }); await c.close(); }
 // l3: agenda del barbero, vista Día
 if(want('l3')){ const c=await ctx(b,'matias.demo@wstyle.local'); const p=await c.newPage(); await p.goto(F+'/wstyle/pro/agenda/'); await sleep(3000);
   await record(p,'l3',8.1,async()=>{ await sleep(600); await moveTap(p,p.getByRole('button',{name:'Día',exact:true})); await sleep(1500); await p.evaluate(()=>window.__move(innerWidth*0.6,innerHeight*0.7,700)); await scrollToSel(p,'body',-(V?520:330),2600); }); await c.close(); }
 // l4: Difusión → tu link → Copiar
 if(want('l4')){ const c=await ctx(b,'dueno.demo@wstyle.local'); const p=await c.newPage(); await p.goto(F+'/wstyle/admin/'); await sleep(2500);
   await record(p,'l4',8.1,async()=>{ await sleep(500); const d=p.getByRole('link',{name:/^Difusión$/i}).first(); await moveTap(p,d); await p.waitForURL(/difusion/); await sleep(1300);
     if(V) await scrollToSel(p,'body',-140,900); await sleep(300); await moveTap(p,p.getByRole('button',{name:/^Copiar$/i}).first()); }); await c.close(); }
 // l5: QR y cartel → Descargar PNG
 if(want('l5')){ const c=await ctx(b,'dueno.demo@wstyle.local'); const p=await c.newPage(); await p.goto(F+'/wstyle/admin/difusion/'); await sleep(3000);
   await record(p,'l5',8.1,async()=>{ await sleep(400); if(V){ await scrollToSel(p,'body',-470,1800); await sleep(1200); await scrollToSel(p,'body',-1450,2000);} else { await scrollToSel(p,'body',-465,1700); await sleep(1700); await scrollToSel(p,'body',-545,700); }
     await sleep(500); const btn=p.getByRole('button',{name:/Descargar PNG/i}).first(); await moveTap(p,btn); }); await c.close(); }
 // l6: Estadísticas → Reservas por origen
 if(want('l6')){ const c=await ctx(b,'dueno.demo@wstyle.local'); const p=await c.newPage(); await p.goto(F+'/wstyle/admin/estadisticas/'); await sleep(3000);
   await record(p,'l6',7.1,async()=>{ await sleep(700); await scrollToSel(p,'#st-origin',V?90:120,2600); await sleep(300); const row=p.locator('text=WhatsApp').first(); await moveTap(p,row,{click:false}); }); await c.close(); }
 // l7: cierre Ricorp
 if(want('l7')){ const c=await ctx(b); const p=await c.newPage(); await p.goto(`file:///tmp/vid/cards/card.html?t=end&v=${V?1:0}`); await p.waitForFunction(()=>window.__ready); await sleep(300);
   await record(p,'l7',6.0,async()=>{ await sleep(150); await p.evaluate(()=>document.body.classList.add('on')); }); await c.close(); }
 await b.close(); })();
