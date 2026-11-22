# Arma el video v2 del Espejo WS cuadro a cuadro (Pillow → ffmpeg), con composición propia por formato.
#   9:16  → acercamiento a la cabeza arriba + celular abajo (o celular grande si no hay foto), subtítulos entre ambos.
#   16:9  → celular a la izquierda + acercamiento ampliado a la derecha, subtítulos bajo el acercamiento.
# Entradas: /tmp/vid/rec/<escena>/meta.json + frames (record.js), /tmp/vid/tts/<id>.mp3 (edge-tts),
#           /tmp/vid/music.wav (music.py de la v1), /tmp/vid/logo.png, fuentes en /tmp/vid/fonts, fotos en ../fotos.
# Uso: python compose.py v salida-9x16.mp4   |   python compose.py h salida-16x9.mp4   [--poster poster.jpg]
import json, os, sys, bisect, subprocess, math, re
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FOTOS = os.path.join(HERE, '..', 'fotos')
FF = os.environ.get('FFMPEG') or __import__('imageio_ffmpeg').get_ffmpeg_exe()
V = sys.argv[1] == 'v'; OUT = sys.argv[2]
POSTER = sys.argv[sys.argv.index('--poster') + 1] if '--poster' in sys.argv else None
W, H = (1080, 1920) if V else (1920, 1080)
FPS = 30; X = 0.30  # fundido entre escenas
REC = '/tmp/vid/rec'
COPPER = (201, 138, 85); GOLD = (227, 190, 140); INK = (13, 11, 10)
G = {l['id']: l for l in json.load(open(os.path.join(HERE, 'guion.json')))['lineas']}
F_SUB = '/tmp/vid/fonts/f2.ttf'; F_BOLD = '/tmp/vid/fonts/f3.ttf'; F_TITLE = '/tmp/vid/fonts/f1.ttf'
font = lambda f, s: ImageFont.truetype(f, s)

# escena: (id, duración, tipo, inicio de la voz dentro de la escena)
SCENES = [('l1', 4.8, 'hook', 0.45), ('l2', 5.8, 'rec', 0.30), ('l3', 8.0, 'rec', 0.30), ('l4', 7.6, 'rec', 0.35),
          ('l5', 8.4, 'rec', 0.35), ('l6', 6.6, 'rec', 0.30), ('l6b', 7.6, 'ia', 0.35), ('l7', 6.2, 'rec', 0.30),
          ('l8', 6.4, 'rec', 0.30), ('l9', 6.8, 'close', 2.05)]
START = {}; t = 0
for k, (n, d, _, _) in enumerate(SCENES): START[n] = t; t += d - (X if k < len(SCENES) - 1 else 0)
TOTAL = t

def ease(x): x = max(0., min(1., x)); return x * x * (3 - 2 * x)
def adur(f):
    e = subprocess.run([FF, '-i', f], capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', e).groups(); return int(h) * 3600 + int(m) * 60 + float(s)

# ---------- fondo, utilidades ----------
def background():
    bg = Image.new('RGB', (W, H), INK); d = ImageDraw.Draw(bg)
    cx, cy = (W * .5, H * .38) if V else (W * .62, H * .45); R = max(W, H) * .75
    glow = Image.new('L', (W // 4, H // 4), 0); gd = ImageDraw.Draw(glow)
    for i in range(40, 0, -1):
        r = R / 4 * i / 40; gd.ellipse((cx / 4 - r, cy / 4 - r, cx / 4 + r, cy / 4 + r), fill=int(70 * (1 - i / 40) ** 1.6))
    glow = glow.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(30))
    tint = Image.new('RGB', (W, H), (60, 36, 20))
    return Image.composite(tint, bg, glow)
BG = background()
_masks = {}
def rmask(w, h, r):
    k = (w, h, r)
    if k not in _masks:
        m = Image.new('L', (w * 2, h * 2), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), r * 2, fill=255)
        _masks[k] = m.resize((w, h), Image.LANCZOS)
        if len(_masks) > 400: _masks.clear()
    return _masks[k]
def panel(dst, img, box, r=26, border=COPPER, bw=2, shadow=True):
    x, y, w, h = [int(round(v)) for v in box]
    if w < 4 or h < 4: return
    if img.size != (w, h): img = img.resize((w, h), Image.BICUBIC)
    if shadow:
        sh = Image.new('L', (w + 80, h + 80), 0); ImageDraw.Draw(sh).rounded_rectangle((40, 50, w + 40, h + 50), r, fill=150)
        sh = sh.filter(ImageFilter.GaussianBlur(18)); dst.paste((0, 0, 0), (x - 40, y - 40), sh)
    dst.paste(img, (x, y), rmask(w, h, r))
    if bw: ImageDraw.Draw(dst).rounded_rectangle((x, y, x + w - 1, y + h - 1), r, outline=border, width=bw)
def blend_alpha(dst, src, a):
    return dst if a <= 0 else src if a >= 1 else Image.blend(dst, src, a)
def text_img(txt, f, fill=(242, 238, 232), max_w=None, align='center', spacing=10):
    d = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    words = txt.split(); lines = []; cur = ''
    for w_ in words:
        tst = (cur + ' ' + w_).strip()
        if max_w and d.textlength(tst, font=f) > max_w and cur: lines.append(cur); cur = w_
        else: cur = tst
    lines.append(cur)
    asc, desc = f.getmetrics(); lh = asc + desc
    tw = int(max(d.textlength(l, font=f) for l in lines)) + 4; th = lh * len(lines) + spacing * (len(lines) - 1)
    im = Image.new('RGBA', (tw, th), (0, 0, 0, 0)); dd = ImageDraw.Draw(im)
    for i, l in enumerate(lines):
        lw = dd.textlength(l, font=f); x = (tw - lw) / 2 if align == 'center' else 0
        dd.text((x, i * (lh + spacing)), l, font=f, fill=fill)
    return im, len(lines)
def subtitle_img(txt):
    size = 50 if V else 44; maxw = 900 if V else 980
    while True:
        im, n = text_img(txt, font(F_SUB, size), max_w=maxw)
        if n <= 2 or size < 30: break
        size -= 3
    px, py = 30, 16
    box = Image.new('RGBA', (im.width + 2 * px, im.height + 2 * py), (0, 0, 0, 0))
    ImageDraw.Draw(box).rounded_rectangle((0, 0, box.width - 1, box.height - 1), 20, fill=(12, 10, 9, 175))
    box.alpha_composite(im, (px, py - 2)); return box
def put(dst, im, cx, cy, alpha=1.0):
    if alpha <= 0.01: return
    if alpha < 1: im = im.copy(); im.putalpha(im.getchannel('A').point(lambda v: int(v * alpha)))
    dst.paste(im, (int(cx - im.width / 2), int(cy - im.height / 2)), im)
def chip(txt, size=26, fill=COPPER):
    t, _ = text_img(txt.upper(), font(F_BOLD, size), fill=fill)
    im = Image.new('RGBA', (t.width + 40, t.height + 20), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, im.width - 1, im.height - 1), im.height // 2, fill=(12, 10, 9, 190), outline=fill, width=2)
    im.alpha_composite(t, (20, 8)); return im

# ---------- grabación: frames + registro ----------
class Rec:
    def __init__(s, name, D):
        m = json.load(open(f'{REC}/{name}/meta.json')); s.t0 = m['t0']; s.end = m.get('end', m['frames'][-1][1])
        s.fr = m['frames']; s.ft = [f[1] for f in s.fr]
        s.log = sorted(m['log'], key=lambda e: e[0]); s.lt = [e[0] / 1000 for e in s.log]
        s.cache = (None, None); s.D = D
        dur = s.end - s.t0; off = 0.2; tail = 0.15
        segs = [(off, dur - tail, 1.0)]
        marks = dict(m.get('marks', []))
        if 'zona0' in marks:  # los toques del contorno se aceleran ×3
            a, b = marks['zona0'] - s.t0, marks['zona1'] - s.t0; segs = [(off, a, 1.0), (a, b, 3.0), (b, dur - tail, 1.0)]
        k = sum((e - st) / w for st, e, w in segs) / D  # velocidad base
        k = max(k, 0.8)
        s.map = []; o = 0
        for st, e, w in segs: s.map.append((o, st, (e - st) / (w * k), w * k)); o += (e - st) / (w * k)
    def src(s, tau):
        for o, st, d, sp in s.map:
            if tau <= o + d: return s.t0 + st + (tau - o) * sp
        o, st, d, sp = s.map[-1]; return s.t0 + st + d * sp
    def at(s, tau):
        ts = s.src(tau); i = max(0, bisect.bisect_right(s.ft, ts) - 1)
        fn, fts = s.fr[i]
        j = max(0, bisect.bisect_right(s.lt, fts + 0.02) - 1); lg = s.log[j]
        if s.cache[0] != fn: s.cache = (fn, Image.open(fn).convert('RGB'))
        return s.cache[1], lg

PH_W, PH_H, NAV = 432, 768, 64
_bottom = {}
def content_bottom(frame):
    # última fila con contenido (sobre la barra inferior), en px CSS: la página se acorta al fijar o comparar
    k = id(frame)
    if k not in _bottom:
        g = frame.crop((0, 0, 864, (2300 - NAV) * 2)).convert('L').resize((108, (2300 - NAV) // 4), Image.BOX)
        px = g.load(); rows = [y for y in range(g.height) if sum(1 for x in range(g.width) if px[x, y] - min(px[x2, y] for x2 in (0, 1, 2, 105, 106, 107)) > 12) >= 8]  # ignora el cursor (punto chico)
        _bottom.clear(); _bottom[k] = (rows[-1] + 1) * 4 if rows else 2300
    return _bottom[k]
def phone(frame, lg):
    hdr = round(lg[1]); vs = lg[2]; win = PH_H - hdr - NAV
    vs = max(0, min(vs, content_bottom(frame) + 20 - hdr - win))
    if lg[4]: vs = min(vs, 330)  # en «Comparar» la página es más corta: no dejar la ventana sobre el vacío
    out = Image.new('RGB', (PH_W * 2, PH_H * 2), INK)
    out.paste(frame.crop((0, 0, 864, hdr * 2)), (0, 0))
    y0 = int(round((hdr + vs) * 2)); out.paste(frame.crop((0, y0, 864, y0 + win * 2)), (0, hdr * 2))
    out.paste(frame.crop((0, (2300 - NAV) * 2, 864, 4600)), (0, (PH_H - NAV) * 2))
    return out
HEAD = (0.50, 0.20, 0.62)  # centro x, centro y, ancho (fracciones del canvas)
def closeup(frame, lg, aspect, zoom=1.0, cx=None):
    cvs = lg[4] or ([lg[3]] if lg[3] else None)
    if not cvs: return None
    if len(cvs) == 1:
        x, y, w, h = cvs[0]; c = cx if cx is not None else HEAD[0]
        cw = HEAD[2] * w / zoom; ch = cw / aspect
        X0 = x + c * w - cw / 2; Y0 = max(y, y + HEAD[1] * h - ch / 2)
        return frame.crop((int(X0 * 2), int(Y0 * 2), int((X0 + cw) * 2), int((Y0 + ch) * 2)))
    # par A/B: dos cabezas lado a lado con su rótulo
    tw = 1000; th = int(tw / aspect); gap = 16; each = (tw - gap) // 2
    out = Image.new('RGB', (tw, th), (20, 17, 15))
    for i, (x, y, w, h) in enumerate(cvs[:2]):
        cw = 0.66 * w; ch = cw * th / each
        X0 = x + 0.5 * w - cw / 2; Y0 = y
        im = frame.crop((int(X0 * 2), int(Y0 * 2), int((X0 + cw) * 2), int((Y0 + ch) * 2))).resize((each, th), Image.BICUBIC)
        out.paste(im, (i * (each + gap), 0))
        put(out, chip('Opción ' + 'AB'[i], 24), i * (each + gap) + each / 2, th - 40)
    return out

# ---------- layout ----------
if V:
    CU_BOX = (80, 250, 920, 700)
    PH_SPLIT = (324, 1112, 432, 768); PH_BIG = (206, 250, 668, 1188)
    SUB_SPLIT = (540, 1031); SUB_BIG = (540, 1540)
    WM = (540, 212)
else:
    PH = (150, 64, 536, 953)
    CU_BOX = (800, 80, 1000, 760)
    SUB_SPLIT = SUB_BIG = (1300, 958)
    WM = (1300, 1048)
CU_ASPECT = CU_BOX[2] / CU_BOX[3]
def lerp(a, b, m): return tuple(x + (y - x) * m for x, y in zip(a, b))
BRAND = None
if not V:
    BRAND = Image.new('RGBA', (1000, 520), (0, 0, 0, 0))
    t1, _ = text_img('ESPEJO WS', font(F_TITLE, 150), fill=(239, 232, 220)); BRAND.alpha_composite(t1, ((1000 - t1.width) // 2, 90))
    ImageDraw.Draw(BRAND).rectangle((450, 300, 550, 303), fill=COPPER)
    t2, _ = text_img('WS Style · Panel del barbero', font(F_SUB, 40), fill=GOLD); BRAND.alpha_composite(t2, ((1000 - t2.width) // 2, 340))

def render_rec(r, tau, state):
    frame, lg = r.at(tau)
    has = bool(lg[3] or lg[4]); tgt = 1.0 if has else 0.0
    if state.get('m') is None: state['m'] = tgt
    state['m'] += (tgt - state['m']) * 0.16; m = ease(state['m'])
    img = BG.copy()
    z = 1.0 + 0.12 * ease(tau / r.D)
    cu = closeup(frame, lg, CU_ASPECT, zoom=z) if has else None
    if cu is not None: state['cu'] = cu
    cu = state.get('cu')
    ph = phone(frame, lg)
    if V:
        pb = lerp(PH_BIG, PH_SPLIT, m)
        if cu is not None and m > 0.02:
            bx = CU_BOX; s = 0.9 + 0.1 * m
            box = (bx[0] + bx[2] * (1 - s) / 2, bx[1] + bx[3] * (1 - s) / 2 - 40 * (1 - m), bx[2] * s, bx[3] * s)
            tmp = img.copy(); panel(tmp, cu, box, r=28); img = blend_alpha(img, tmp, m)
        panel(img, ph, pb, r=int(34 * pb[2] / 432), border=(70, 58, 48), bw=3)
        sub = lerp(SUB_BIG, SUB_SPLIT, m)
    else:
        if m < 0.98: tmp = img.copy(); put(tmp, BRAND, 1300, 420); img = blend_alpha(img, tmp, 1 - m)
        if cu is not None and m > 0.02:
            tmp = img.copy(); bx = CU_BOX; s = 0.92 + 0.08 * m
            panel(tmp, cu, (bx[0] + bx[2] * (1 - s) / 2, bx[1] + bx[3] * (1 - s) / 2, bx[2] * s, bx[3] * s), r=30); img = blend_alpha(img, tmp, m)
        panel(img, ph, PH, r=38, border=(70, 58, 48), bw=3)
        sub = SUB_SPLIT
    return img, sub

# ---------- montajes (fotos reales) ----------
def load(n): return Image.open(os.path.join(FOTOS, n)).convert('RGB')
JOE = load('joe-frente.jpg'); JOE1 = load('joe-corte-1.jpg').resize(JOE.size, Image.LANCZOS); JOE2 = load('joe-corte-2.jpg').resize(JOE.size, Image.LANCZOS)
PED = load('pedro-frente.jpg'); PED1 = load('pedro-corte-1.jpg').resize(PED.size, Image.LANCZOS)
def crop_rel(im, cx, cy, w_rel, aspect, zoom=1.0):
    W0, H0 = im.size; cw = W0 * w_rel / zoom; ch = cw / aspect
    if ch > H0: ch = H0; cw = ch * aspect
    x0 = min(max(0, cx * W0 - cw / 2), W0 - cw); y0 = min(max(0, cy * H0 - ch / 2), H0 - ch)
    return im.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch)))
def sweep(before, after, size, p):
    w, h = size; b = before.resize(size, Image.BICUBIC); a = after.resize(size, Image.BICUBIC)
    xs = int(w * p); out = b.copy()
    if xs > 0: out.paste(a.crop((0, 0, xs, h)), (0, 0))
    if 0 < p < 1:
        d = ImageDraw.Draw(out); glow = Image.new('L', size, 0); ImageDraw.Draw(glow).rectangle((xs - 14, 0, xs + 14, h), fill=110)
        out.paste(COPPER, (0, 0), glow.filter(ImageFilter.GaussianBlur(10))); d.rectangle((xs - 2, 0, xs + 2, h), fill=GOLD)
    return out
CH_ANTES = chip('Antes', 24, (200, 190, 180)); CH_DESP = chip('Después', 24)
def render_hook(tau):
    img = BG.copy(); p = ease((tau - 0.9) / 1.6); z = 1.0 + 0.10 * ease(tau / 4.8)
    if V:
        box = (60, 250, 960, 1180); asp = box[2] / box[3]
    else:
        box = (1010, 60, 780, 960); asp = box[2] / box[3]
    b = crop_rel(JOE, 0.48, 0.42 if V else 0.40, 0.98, asp, z); a = crop_rel(JOE1, 0.48, 0.42 if V else 0.40, 0.98, asp, z)
    sw = sweep(b, a, (int(box[2]), int(box[3])), p)
    panel(img, sw, box, r=30)
    put(img, CH_DESP, box[0] + 30 + CH_DESP.width / 2, box[1] + 40, alpha=ease((p - 0.15) * 4))
    put(img, CH_ANTES, box[0] + box[2] - 30 - CH_ANTES.width / 2, box[1] + 40, alpha=1 - ease((p - 0.75) * 4))
    if V:
        t1, _ = text_img('ESPEJO WS', font(F_TITLE, 96), fill=(239, 232, 220))
        put(img, t1, 540, 1340, alpha=ease((tau - 0.3) / 0.6))
    else:
        put(img, BRAND, 520, 400, alpha=ease((tau - 0.2) / 0.6))
    return img, ((540, 1540) if V else (520, 900))
def render_ia(tau):
    img = BG.copy(); c = chip('Vista previa con IA', 28)
    pA = 1 - ease((tau - 3.7) / 0.4)
    if pA > 0:
        tmp = img.copy()
        if V: boxes = [(60, 330, 470, 660), (550, 330, 470, 660)]; ly = 1035
        else: boxes = [(330, 130, 610, 720), (980, 130, 610, 720)]; ly = 890
        z = 1.0 + 0.06 * ease(tau / 4)
        for i, (im, lab) in enumerate([(JOE1, 'Degradado medio + línea'), (JOE2, 'Degradado alto')]):
            bx = boxes[i]; delay = 0.15 * i; a = ease((tau - delay) / 0.5)
            cr = crop_rel(im, 0.49, 0.25, 0.62, bx[2] / bx[3], z)
            t2 = tmp.copy(); panel(t2, cr, (bx[0], bx[1] + 30 * (1 - a), bx[2], bx[3]), r=26); tmp = blend_alpha(tmp, t2, a)
            lt, _ = text_img(lab, font(F_SUB, 34 if V else 32), fill=GOLD); put(tmp, lt, bx[0] + bx[2] / 2, ly, alpha=a)
        img = blend_alpha(img, tmp, pA)
    if pA < 1:
        tmp = BG.copy(); q = tau - 3.7; p = ease((q - 0.7) / 1.5)
        box = (110, 330, 860, 860) if V else (560, 130, 800, 720)
        cr_b = crop_rel(PED, 0.45, 0.40, 0.78, box[2] / box[3], 1 + 0.05 * ease(q / 3.9)); cr_a = crop_rel(PED1, 0.45, 0.40, 0.78, box[2] / box[3], 1 + 0.05 * ease(q / 3.9))
        panel(tmp, sweep(cr_b, cr_a, (box[2], box[3]), p), box, r=28)
        put(tmp, CH_DESP, box[0] + 30 + CH_DESP.width / 2, box[1] + 40, alpha=ease((p - 0.15) * 4))
        put(tmp, CH_ANTES, box[0] + box[2] - 30 - CH_ANTES.width / 2, box[1] + 40, alpha=1 - ease((p - 0.75) * 4))
        img = blend_alpha(img, tmp, 1 - pA)
    put(img, c, W / 2, 280 if V else 70, alpha=ease(tau / 0.4))
    return img, ((540, 1540) if V else (960, 985))
ELEGIDO = Image.open('/tmp/vid/rec/elegido.png').convert('RGB')
LOGO = Image.open('/tmp/vid/logo.png').convert('RGBA')
def render_close(tau):
    img = Image.new('RGB', (W, H), (0, 0, 0))
    a_des = 1 - ease((tau - 1.35) / 0.9)
    if a_des > 0:
        tmp = BG.copy(); box = (60, 420, 960, 960 / CU_ASPECT) if V else (410, 90, 1100, 1100 / CU_ASPECT)
        cr = crop_rel(ELEGIDO, HEAD[0], 0.21, HEAD[2], box[2] / box[3], 1.0 + 0.12 * ease(tau / 2.2))
        panel(tmp, cr, box, r=30)
        ch = chip('Diseño elegido', 26); put(tmp, ch, W / 2, box[1] - 50)
        img = blend_alpha(img, tmp, a_des)
    a_logo = ease((tau - 1.9) / 0.8)
    if a_logo > 0:
        lw = 560 if V else 620; lg = LOGO.resize((lw, int(LOGO.height * lw / LOGO.width)), Image.LANCZOS)
        cy = H / 2 - 60; tmp = img.copy(); put(tmp, lg, W / 2, cy - 30 * (1 - a_logo))
        d = ImageDraw.Draw(tmp); d.rectangle((W / 2 - 50, cy + lg.height / 2 + 40, W / 2 + 50, cy + lg.height / 2 + 43), fill=COPPER)
        f = font(F_SUB, 40 if V else 38); dd = ImageDraw.Draw(Image.new('RGB', (1, 1)))
        s1 = 'Un producto elaborado por '; s2 = 'ricorp.cl'; tw = dd.textlength(s1 + s2, font=f); x0 = W / 2 - tw / 2; y0 = cy + lg.height / 2 + 72
        fa = ease((tau - 2.25) / 0.7)
        d.text((x0, y0), s1, font=f, fill=tuple(int(v * fa) for v in (239, 232, 220))); d.text((x0 + dd.textlength(s1, font=f), y0), s2, font=f, fill=tuple(int(v * fa) for v in COPPER))
        img = blend_alpha(img, tmp, a_logo)
    return img, None

# ---------- subtítulos y marca de agua ----------
SUBS = []  # (inicio, fin, imagen)
VOICE = []
for n, d, kind, vs in SCENES:
    a = f'/tmp/vid/tts/{n}.mp3'; dv = adur(a); st = START[n] + vs; VOICE.append((a, st))
    if kind != 'close': SUBS.append((st - 0.1, min(st + dv + 0.35, START[n] + d - 0.05), subtitle_img(G[n]['sub'])))
WM_IMG, _ = text_img('Un producto elaborado por ricorp.cl', font(F_SUB, 28 if V else 26), fill=(236, 230, 222))
WM_IMG.putalpha(WM_IMG.getchannel('A').point(lambda v: int(v * 0.6)))

STATE = {n: {} for n, *_ in SCENES}
RECS = {n: Rec(n, d) for n, d, kind, _ in SCENES if kind == 'rec'}
def scene_frame(n, tau):
    kind = next(k for s, _, k, _ in SCENES if s == n)
    if kind == 'rec': return render_rec(RECS[n], tau, STATE[n])
    if kind == 'hook': return render_hook(tau)
    if kind == 'ia': return render_ia(tau)
    return render_close(tau)
def frame_at(t):
    act = [(n, t - START[n]) for n, d, *_ in SCENES if START[n] <= t < START[n] + d] or [(SCENES[-1][0], SCENES[-1][1] - 1e-3)]
    img, sub = scene_frame(*act[0])
    if len(act) > 1:
        img2, sub2 = scene_frame(*act[1]); a = ease((t - START[act[1][0]]) / X); img = Image.blend(img, img2, a)
        if sub2 is not None and a > .5: sub = sub2
    if START['l1'] + 0.4 < t < START['l9'] + 0.6:
        put(img, WM_IMG, *WM, alpha=min(1, (t - START['l1'] - 0.4) / 0.4, (START['l9'] + 0.6 - t) / 0.4))
    for a, b, im in SUBS:
        if a <= t <= b and sub is not None:
            put(img, im, *sub, alpha=min(1, (t - a) / 0.15, (b - t) / 0.15))
    return img

if POSTER:
    tp = float(os.environ.get('POSTER_T', START['l1'] + 3.4))
    for n, *_ in SCENES: STATE[n] = {}
    # el poster va sin subtítulos
    SUBS_BAK = SUBS[:]; SUBS.clear(); frame_at(tp).save(POSTER, quality=92); SUBS.extend(SUBS_BAK)
    sys.exit(0)

# ---------- audio ----------
AUD = f'/tmp/vid/mix.wav'
if not os.path.exists(AUD) or os.environ.get('REMIX'):
    inp = []; fc = []
    for j, (a, st) in enumerate(VOICE):
        inp += ['-i', a]; ms = int(st * 1000); fc.append(f'[{j}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[a{j}]')
    mi = len(VOICE); inp += ['-i', '/tmp/vid/music.wav']
    fc.append(''.join(f'[a{j}]' for j in range(len(VOICE))) + f'amix=inputs={len(VOICE)}:normalize=0,apad=whole_dur={TOTAL:.3f}[vo]')
    fc.append('[vo]asplit=2[vo1][vo2]')
    fc.append(f'[{mi}:a]aresample=48000,atrim=0:{TOTAL:.3f},volume=0.30,afade=t=in:st=0:d=0.8,afade=t=out:st={TOTAL - 3.2:.3f}:d=2.4[mu]')
    fc.append('[mu][vo2]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[mud]')
    fc.append(f'[vo1][mud]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,atrim=0:{TOTAL:.3f}[a]')
    subprocess.run([FF, '-y', '-loglevel', 'error'] + inp + ['-filter_complex', ';'.join(fc), '-map', '[a]', '-c:a', 'pcm_s16le', AUD], check=True)

# ---------- video ----------
N = int(round(TOTAL * FPS))
enc = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', AUD,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest',
    '-metadata', 'title=WS Style — Espejo WS (v2)', '-metadata', 'artist=ricorp.cl', OUT], stdin=subprocess.PIPE)
for i in range(N):
    enc.stdin.write(frame_at(i / FPS).tobytes())
    if i % 300 == 0: print(f'{i}/{N}', flush=True)
enc.stdin.close(); enc.wait(); print(OUT, round(TOTAL, 2), 's')
