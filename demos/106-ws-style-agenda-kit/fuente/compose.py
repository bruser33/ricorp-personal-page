# Arma el video final: escenas + crossfades + subtítulos ASS + voz + música con ducking + loudnorm -14 LUFS.
import json, subprocess, sys, re
FF='/tmp/vv/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2'
fmt=sys.argv[1]; V=fmt=='v'; out=sys.argv[2]
W,H=(1080,1920) if V else (1920,1080)
order=['s0','l1','l2','l3','l4','l5','l6','l7']
dur={'s0':3.2,'l1':8.6,'l2':7.6,'l3':8.1,'l4':8.1,'l5':8.1,'l6':7.1,'l7':6.0}
X=0.35; LEAD=0.55
SUB={'l1':'Así puedes organizar tu agenda y compartir el enlace para reservar en WS Style.',
 'l2':'Desde la portada, toca Reservar para empezar a elegir tu servicio.',
 'l3':'En la agenda del día puedes ver las horas ocupadas y los espacios disponibles.',
 'l4':'En Difusión tienes el enlace de reservas listo para compartir con tus clientes.',
 'l5':'Descarga el cartel con tu código QR para que puedan reservar desde el local.',
 'l6':'En Estadísticas puedes ver desde dónde llegaron las reservas.',
 'l7':'Un producto elaborado por ricorp.cl'}
def adur(f):
    e=subprocess.run([FF,'-i',f],capture_output=True,text=True).stderr
    h,m,s=re.search(r'Duration: (\d+):(\d+):([\d.]+)',e).groups(); return int(h)*3600+int(m)*60+float(s)
start={}; t=0
for k,n in enumerate(order):
    start[n]=t; t+=dur[n]-(X if k<len(order)-1 else 0)
total=t
def ts(x):
    cs=int(round(x*100)); return f"{cs//360000}:{cs//6000%60:02d}:{cs//100%60:02d}.{cs%100:02d}"
fs_sub,mv_sub,fs_wm,mv_wm,ml=(50,330,26,120,80) if V else (46,92,24,26,200)
ass=f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Inter SemiBold,{fs_sub},&H00F2F5FA,&H000000FF,&H40080A0D,&H40080A0D,0,0,0,0,100,100,0,0,3,14,0,2,{ml},{ml},{mv_sub},1
Style: Wm,Inter SemiBold,{fs_wm},&H30DCE8EF,&H000000FF,&H8C080A0D,&H8C080A0D,0,0,0,0,100,100,1,0,3,8,0,2,40,40,{mv_wm},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
voice=[]
for i,n in enumerate(order):
    if n not in SUB: continue
    a=f'/tmp/vid/tts/{n}.mp3'; d=adur(a); vs=start[n]+LEAD
    voice.append((a,vs))
    nxt=start[order[i+1]] if i+1<len(order) else total
    ass+=f"Dialogue: 1,{ts(vs-0.1)},{ts(min(vs+d+0.5,nxt+0.1,total))},Sub,,0,0,0,,{{\\fad(150,150)}}{SUB[n]}\n"
wm='Demo con datos ficticios  ·  Un producto elaborado por ricorp.cl'
ass+=f"Dialogue: 0,{ts(start['l1'])},{ts(start['l7']+0.2)},Wm,,0,0,0,,{{\\fad(400,300)}}{wm}\n"
open(f'/tmp/vid/subs-{fmt}.ass','w').write(ass)
# filtro
inp=[]; fc=[]
for n in order: inp+=['-i',f'/tmp/vid/scenes-{fmt}/{n}.mp4']
prev='[0:v]'; acc=dur[order[0]]
for k in range(1,len(order)):
    off=acc-X; o=f'[x{k}]'
    fc.append(f'{prev}[{k}:v]xfade=transition=fade:duration={X}:offset={off:.3f}{o}'); prev=o; acc=off+dur[order[k]]
fc.append(f"{prev}scale=in_range=pc:out_range=tv,subtitles=/tmp/vid/subs-{fmt}.ass:fontsdir=/tmp/vid/fonts,format=yuv420p[v]")
base=len(order)
for j,(a,vs) in enumerate(voice): inp+=['-i',a]; fc.append(f'[{base+j}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={int(vs*1000)}|{int(vs*1000)}[a{j}]')
inp+=['-i','/tmp/vid/music.wav']; mi=base+len(voice)
fc.append(''.join(f'[a{j}]' for j in range(len(voice)))+f'amix=inputs={len(voice)}:normalize=0,apad=whole_dur={total:.3f}[vo]')
fc.append('[vo]asplit=2[vo1][vo2]')
fc.append(f'[{mi}:a]aresample=48000,atrim=0:{total:.3f},volume=0.32,afade=t=out:st={total-2.5:.3f}:d=2.5[mu]')
fc.append('[mu][vo2]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[mud]')
fc.append('[vo1][mud]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]')
cmd=[FF,'-y','-loglevel','error']+inp+['-filter_complex',';'.join(fc),'-map','[v]','-map','[a]','-t',f'{total:.3f}',
 '-c:v','libx264','-preset','slow','-crf','20','-profile:v','high','-pix_fmt','yuv420p','-r','30','-color_range','tv','-c:a','aac','-b:a','160k','-movflags','+faststart',
 '-metadata','title=WS Style — Agenda y kit de reservas','-metadata','artist=ricorp.cl',out]
subprocess.run(cmd,check=True); print(out, round(total,2),'s')
