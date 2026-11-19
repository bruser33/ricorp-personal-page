# Música original (sintetizada aquí, sin licencias de terceros): pad suave + arpegio tenue, Am–F–C–G, 84 bpm.
import numpy as np, wave, sys
SR=44100; DUR=float(sys.argv[2]) if len(sys.argv)>2 else 62
t=np.arange(int(SR*DUR))/SR
def hz(m): return 440*2**((m-69)/12)
chords=[[57,60,64,69],[53,57,60,65],[48,55,60,64],[55,59,62,67]]  # Am F C G
bar=60/84*4
L=np.zeros_like(t); R=np.zeros_like(t)
for k in range(int(DUR/bar)+2):
    ch=chords[k%4]; s=k*bar; e=s+bar*1.15
    idx=(t>=s)&(t<e); tt=t[idx]-s
    env=np.minimum(1,tt/1.2)*np.minimum(1,np.maximum(0,(e-s-tt))/0.9)
    for j,m in enumerate(ch):
        f=hz(m); det=1.003
        v=(np.sin(2*np.pi*f*tt)+0.5*np.sin(2*np.pi*f*det*tt+1)+0.15*np.sin(2*np.pi*2*f*tt))*env*0.05
        pan=0.35+0.1*j
        L[idx]+=v*(1-pan); R[idx]+=v*pan
    # bajo
    f=hz(ch[0]-12); L[idx]+=np.sin(2*np.pi*f*tt)*env*0.06; R[idx]+=np.sin(2*np.pi*f*tt)*env*0.06
    # arpegio suave (corcheas)
    step=bar/8
    for n in range(8):
        a=s+n*step; m=ch[[0,1,2,3,2,1,2,3][n]]+12
        idx2=(t>=a)&(t<a+step*2.5); ta=t[idx2]-a
        v=np.sin(2*np.pi*hz(m)*ta)*np.exp(-ta*3.2)*0.035*np.minimum(1,ta/0.01)
        p=0.3 if n%2 else 0.7
        L[idx2]+=v*(1-p); R[idx2]+=v*p
# eco simple
for d,g in [(0.33,0.35),(0.66,0.18)]:
    n=int(d*SR); L[n:]+=R[:-n]*g; R[n:]+=L[:-n]*g*0.9
fade=np.minimum(1,np.minimum(t/2.0,(DUR-t)/3.0))
x=np.stack([L*fade,R*fade],1); x/=np.abs(x).max()*1.12
w=wave.open(sys.argv[1],'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((x*32767).astype('<i2').tobytes()); w.close()
