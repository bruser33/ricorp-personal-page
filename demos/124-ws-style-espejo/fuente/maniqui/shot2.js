// Saca las fotos del maniquí: node shot2.js 'front:v=front' 'left:v=left' 'right:v=right' 'ML:v=left,mask=1' 'MR:v=right,mask=1'
// (necesita three.module.js de three@0.170.0 junto a scene.html)
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const srv=http.createServer((q,s)=>{const f=path.join(__dirname,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);return s.end()}s.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});s.end(d)})}).listen(8123);
(async()=>{const b=await chromium.launch({executablePath:'/home/runner/.cache/ms-playwright/chromium-1252/chrome-linux64/chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:960,height:960}});
for(const spec of process.argv.slice(2)){ const name=spec.split(':')[0], qs=spec.split(':')[1]; await p.goto('http://127.0.0.1:8123/scene.html?'+qs.replace(/,/g,'&')); await p.waitForFunction(()=>window.__done,{timeout:120000}); await p.screenshot({path:`/tmp/mq/${name}.jpg`,quality:92,type:'jpeg'}); console.log(name); }
await b.close(); srv.close();})();
