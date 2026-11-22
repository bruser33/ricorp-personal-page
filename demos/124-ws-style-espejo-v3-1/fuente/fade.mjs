import fs from 'node:fs';
import { makeMask, blendFade } from '/home/runner/work/ricorp-personal-page/ricorp-personal-page/client/src/wstyle/pro/mirror/photo.ts';
const [W,H]=JSON.parse(fs.readFileSync('size.json')); const tone=JSON.parse(fs.readFileSync('tone.json'));
const mask=makeMask(new Uint8Array(fs.readFileSync('mask.u8')),W,H);
for (const [name,level,cl] of [['alto','Alto',0.9],['medio','Medio',0.7],['bajo','Bajo',0.7]]){
  const px=new Uint8ClampedArray(fs.readFileSync('base.rgba')); blendFade(px,W,mask,tone,'front',level,cl); fs.writeFileSync(name+'.rgba',px); }
console.log('ok',mask.left,mask.right,mask.top,mask.bottom);
