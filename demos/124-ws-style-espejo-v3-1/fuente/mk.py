import json, numpy as np
from PIL import Image, ImageDraw
W,H=json.load(open('size.json')); tone=tuple(json.load(open('tone.json')))
def ld(n): return Image.fromarray(np.fromfile(n+'.rgba',np.uint8).reshape(H,W,4)).convert('RGB')
def line(img):
    S=4; big=img.resize((W*S,H*S),Image.BICUBIC); d=ImageDraw.Draw(big)
    p=[(0.305,0.118-0.009),(0.390,0.080-0.009)]; w=0.019*min(W,H)*S
    pts=[(x*W*S,y*H*S) for x,y in p]; d.line(pts,fill=tone,width=int(w))
    for x,y in pts: d.ellipse((x-w/2,y-w/2,x+w/2,y+w/2),fill=tone)
    return big.resize((W,H),Image.LANCZOS)
base=Image.open('base.png').convert('RGB')
A=line(ld('alto')); B=ld('medio'); C=line(ld('medio'))
for n,i in [('orig',base),('A',A),('B',B),('C',C),('alto',ld('alto'))]: i.save(n+'.png')
box=(int(W*.22),0,int(W*.50),int(H*.32))
s=Image.new('RGB',((box[2]-box[0])*4,box[3]))
for k,i in enumerate([base,A,B,C]): s.paste(i.crop(box),(k*(box[2]-box[0]),0))
s.resize((s.width*2,s.height*2)).save('cmp.png')
