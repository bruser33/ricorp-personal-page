import json, numpy as np
from PIL import Image, ImageDraw
R='/home/runner/work/ricorp-personal-page/ricorp-personal-page/demos/'
im=Image.open(R+'124-ws-style-espejo-v2/fotos/joe-frente.jpg').convert('RGB')
s=min(1,960/max(im.size)); W,H=max(1,round(im.width*s)),max(1,round(im.height*s)); im=im.resize((W,H),Image.LANCZOS)
z=json.load(open(R+'124-ws-style-espejo-v3/fuente/zona-joe.json'))
m=Image.new('L',(W*4,H*4),0); ImageDraw.Draw(m).polygon([(x*W*4,y*H*4) for x,y in z['zone']],fill=255); m=m.resize((W,H),Image.BOX)
im.save('base.png'); m.save('mask.png'); open('size.json','w').write(json.dumps([W,H]))
a=np.asarray(im).astype(int)
# tono: mediana de piel (mejilla/frente) como hace la detección
sk=a[int(H*.30):int(H*.36), int(W*.44):int(W*.56)].reshape(-1,3); print(W,H,np.median(sk,0))
json.dump([int(v) for v in np.median(sk,0)],open('tone.json','w'))
np.asarray(im.convert('RGBA')).tofile('base.rgba'); np.asarray(m).tofile('mask.u8')
