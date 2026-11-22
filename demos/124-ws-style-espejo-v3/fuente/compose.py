# Arma el video v3 del Espejo WS cuadro a cuadro (Pillow → ffmpeg), con composición propia por formato.
# Cambios frente a la v2 (revisión de ChatGPT):
#   · Antes/después contundente: misma cara, mismo encuadre (costado de la cabeza), foto original → IA 1 → IA 2.
#   · El efecto del Espejo sobre la foto se muestra UNA vez, en un plano corto (original ↔ degradado alto).
#   · La app manda: «cámara» sobre el celular que se acerca al control que toca Matías (registro de record.js).
#     9:16 → celular a pantalla casi completa, alternando vista completa y acercamientos.
#     16:9 → celular ~50 % más grande a la izquierda; a la derecha el paso, el plano corto o la comparación.
#   · Rótulos «Foto original» / «Vista previa con IA» en cada imagen; el tramo IA se declara montaje ilustrativo.
#   · Subtítulos siempre sobre una franja oscura semitransparente con filete, legible también sobre negro.
# Entradas: /tmp/vid/rec/<escena>/meta.json + frames + alto.png + elegido.png (record.js), /tmp/vid/tts/<id>.mp3,
#           /tmp/vid/music.wav, /tmp/vid/logo.png, fuentes en /tmp/vid/fonts, fotos en ../../124-ws-style-espejo-v2/fotos.
# Uso: python compose.py v salida-9x16.mp4   |   python compose.py h salida-16x9.mp4   [--poster poster.jpg]
import json, os, sys, bisect, subprocess, re
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FOTOS = os.path.join(HERE, '..', '..', '124-ws-style-espejo-v2', 'fotos')
FF = os.environ.get('FFMPEG') or __import__('imageio_ffmpeg').get_ffmpeg_exe()
V = sys.argv[1] == 'v'; OUT = sys.argv[2]
POSTER = sys.argv[sys.argv.index('--poster') + 1] if '--poster' in sys.argv else None
W, H = (1080, 1920) if V else (1920, 1080)
FPS = 30; X = 0.30  # fundido entre escenas
REC = '/tmp/vid/rec'
COPPER = (201, 138, 85); GOLD = (227, 190, 140); INK = (13, 11, 10); CREAM = (239, 232, 220)
G = {l['id']: l for l in json.load(open(os.path.join(HERE, 'guion.json')))['lineas']}
F_SUB = '/tmp/vid/fonts/f2.ttf'; F_BOLD = '/tmp/vid/fonts/f3.ttf'; F_TITLE = '/tmp/vid/fonts/f1.ttf'
_fonts = {}
def font(f, s):
    if (f, s) not in _fonts: _fonts[(f, s)] = ImageFont.truetype(f, s)
    return _fonts[(f, s)]

# escena: (id, duración, tipo, inicio de la voz)
SCENES = [('l1', 5.0, 'hook', 0.45), ('l2', 5.9, 'rec', 0.25), ('l3', 8.0, 'rec', 0.30), ('l4', 9.0, 'rec', 0.35),
          ('l5', 7.6, 'rec', 0.30), ('l6', 6.0, 'rec', 0.30), ('l6b', 7.6, 'ia', 0.35), ('l7', 5.6, 'rec', 0.30),
          ('l8', 6.4, 'rec', 0.30), ('l9', 6.6, 'close', 2.05)]
EFFECT_AT = 5.8  # en l4, desde aquí el plano corto del efecto (en 9:16 reemplaza al celular)
STEP = {'l2': ('01', 'PANEL DEL BARBERO'), 'l3': ('02', 'FOTO DE FRENTE'), 'l4': ('03', 'DEGRADADO'),
        'l5': ('04', 'LÍNEAS DE DISEÑO'), 'l6': ('05', 'COMPARAR Y COMBINAR'), 'l7': ('06', 'DISEÑO ELEGIDO'),
        'l8': ('07', 'FIN DE LA CONSULTA')}
START = {}; t = 0
for k, (n, d, _, _) in enumerate(SCENES): START[n] = t; t += d - (X if k < len(SCENES) - 1 else 0)
TOTAL = t

def ease(x): x = max(0., min(1., x)); return x * x * (3 - 2 * x)
def adur(f):
    e = subprocess.run([FF, '-i', f], capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', e).groups(); return int(h) * 3600 + int(m) * 60 + float(s)

# ---------- fondo y utilidades ----------
def background():
    bg = Image.new('RGB', (W, H), INK)
    cx, cy = (W * .5, H * .40) if V else (W * .40, H * .5); R = max(W, H) * .75
    glow = Image.new('L', (W // 4, H // 4), 0); gd = ImageDraw.Draw(glow)
    for i in range(40, 0, -1):
        r = R / 4 * i / 40; gd.ellipse((cx / 4 - r, cy / 4 - r, cx / 4 + r, cy / 4 + r), fill=int(70 * (1 - i / 40) ** 1.6))
    glow = glow.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(30))
    return Image.composite(Image.new('RGB', (W, H), (60, 36, 20)), bg, glow)
BG = background()
_masks = {}
def rmask(w, h, r):
    k = (w, h, r)
    if k not in _masks:
        m = Image.new('L', (w * 2, h * 2), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), r * 2, fill=255)
        if len(_masks) > 300: _masks.clear()
        _masks[k] = m.resize((w, h), Image.LANCZOS)
    return _masks[k]
_shadows = {}
def panel(dst, img, box, r=26, border=COPPER, bw=2, shadow=True):
    x, y, w, h = [int(round(v)) for v in box]
    if w < 4 or h < 4: return
    if img.size != (w, h): img = img.resize((w, h), Image.BICUBIC)
    if shadow:
        k = (w, h, r)
        if k not in _shadows:
            sh = Image.new('L', (w + 80, h + 80), 0); ImageDraw.Draw(sh).rounded_rectangle((40, 50, w + 40, h + 50), r, fill=150)
            if len(_shadows) > 100: _shadows.clear()
            _shadows[k] = sh.filter(ImageFilter.GaussianBlur(18))
        dst.paste((0, 0, 0), (x - 40, y - 40), _shadows[k])
    dst.paste(img, (x, y), rmask(w, h, r))
    if bw: ImageDraw.Draw(dst).rounded_rectangle((x, y, x + w - 1, y + h - 1), r, outline=border, width=bw)
def blend_alpha(dst, src, a):
    return dst if a <= 0 else src if a >= 1 else Image.blend(dst, src, a)
def text_img(txt, f, fill=CREAM, max_w=None, spacing=10):
    d = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    lines = []; cur = ''
    for w_ in txt.split():
        tst = (cur + ' ' + w_).strip()
        if max_w and d.textlength(tst, font=f) > max_w and cur: lines.append(cur); cur = w_
        else: cur = tst
    lines.append(cur)
    asc, desc = f.getmetrics(); lh = asc + desc
    tw = int(max(d.textlength(l, font=f) for l in lines)) + 4; th = lh * len(lines) + spacing * (len(lines) - 1)
    im = Image.new('RGBA', (tw, th), (0, 0, 0, 0)); dd = ImageDraw.Draw(im)
    for i, l in enumerate(lines): dd.text(((tw - dd.textlength(l, font=f)) / 2, i * (lh + spacing)), l, font=f, fill=fill)
    return im, len(lines)
def put(dst, im, cx, cy, alpha=1.0):
    if alpha <= 0.01: return
    if alpha < 1: im = im.copy(); im.putalpha(im.getchannel('A').point(lambda v: int(v * alpha)))
    dst.paste(im, (int(cx - im.width / 2), int(cy - im.height / 2)), im)
_chips = {}
def chip(txt, size=26, fill=COPPER, solid=False):
    k = (txt, size, fill, solid)
    if k not in _chips:
        t, _ = text_img(txt.upper(), font(F_BOLD, size), fill=(20, 14, 10) if solid else fill)
        im = Image.new('RGBA', (t.width + 40, t.height + 20), (0, 0, 0, 0))
        ImageDraw.Draw(im).rounded_rectangle((0, 0, im.width - 1, im.height - 1), im.height // 2,
                                             fill=fill + (235,) if solid else (12, 10, 9, 215), outline=fill, width=2)
        im.alpha_composite(t, (20, 8)); _chips[k] = im
    return _chips[k]
CH_ORIG = lambda s=24: chip('Foto original', s, (225, 220, 212))
CH_IA = lambda txt='Vista previa con IA', s=24: chip(txt, s, COPPER, solid=True)
def chip_at(dst, im, box, corner='tl', alpha=1.0, pad=22):
    x, y, w, h = box
    cx = x + pad + im.width / 2 if corner[1] == 'l' else x + w - pad - im.width / 2
    cy = y + pad + im.height / 2 if corner[0] == 't' else y + h - pad - im.height / 2
    put(dst, im, cx, cy, alpha)

# Subtítulo: franja oscura semitransparente con filete cobre tenue (se lee sobre negro y sobre imagen).
SUB_W = 1080 if V else 900
def subtitle_img(txt):
    size = 50 if V else 44; maxw = 940 if V else 820
    while True:
        im, n = text_img(txt, font(F_SUB, size), max_w=maxw)
        if n <= 2 or size < 30: break
        size -= 3
    py = 22; bw = SUB_W; bh = im.height + 2 * py
    band = Image.new('RGBA', (bw, bh), (0, 0, 0, 0)); d = ImageDraw.Draw(band)
    if V:
        d.rectangle((0, 0, bw - 1, bh - 1), fill=(24, 19, 16, 205))
        d.line((0, 0, bw, 0), fill=(150, 104, 66, 200), width=2); d.line((0, bh - 1, bw, bh - 1), fill=(150, 104, 66, 200), width=2)
    else:
        d.rounded_rectangle((0, 0, bw - 1, bh - 1), 18, fill=(24, 19, 16, 205), outline=(150, 104, 66, 200), width=2)
    band.alpha_composite(im, ((bw - im.width) // 2, py - 2)); return band

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
        glow = Image.new('L', size, 0); ImageDraw.Draw(glow).rectangle((xs - 14, 0, xs + 14, h), fill=110)
        out.paste(COPPER, (0, 0), glow.filter(ImageFilter.GaussianBlur(10))); ImageDraw.Draw(out).rectangle((xs - 2, 0, xs + 2, h), fill=GOLD)
    return out
SIDE = (0.40, 0.15, 0.46)  # costado de la cabeza de Joe (centro x, centro y, ancho relativo): degradado y línea

# ---------- grabación: frames + registro ----------
class Rec:
    def __init__(s, name, D):
        m = json.load(open(f'{REC}/{name}/meta.json')); s.t0 = m['t0']; s.end = m.get('end', m['frames'][-1][1])
        s.fr = m['frames']; s.ft = [f[1] for f in s.fr]
        s.log = sorted(m['log'], key=lambda e: e[0]); s.lt = [e[0] / 1000 for e in s.log]
        s.cache = (None, None); s.D = D; s.marks = {k: v - s.t0 for k, v in m.get('marks', [])}
        dur = s.end - s.t0; off = 0.2; tail = 0.15
        segs = [(off, dur - tail, 1.0)]
        if 'zona0' in s.marks:  # los toques del contorno van ×3
            a, b = s.marks['zona0'], s.marks['zona1']; segs = [(off, a, 1.0), (a, b, 3.0), (b, dur - tail, 1.0)]
        k = max(sum((e - st) / w for st, e, w in segs) / D, 0.8)
        s.map = []; o = 0
        for st, e, w in segs: s.map.append((o, st, (e - st) / (w * k), w * k)); o += (e - st) / (w * k)
    def src(s, tau):
        for o, st, d, sp in s.map:
            if tau <= o + d: return s.t0 + st + (tau - o) * sp
        o, st, d, sp = s.map[-1]; return s.t0 + st + d * sp
    def at(s, tau):
        ts = s.src(tau); i = max(0, bisect.bisect_right(s.ft, ts) - 1)
        fn, fts = s.fr[i]
        j = max(0, bisect.bisect_right(s.lt, ts) - 1); lg = s.log[j]
        if s.cache[0] != fn: s.cache = (fn, Image.open(fn).convert('RGB'))
        return s.cache[1], lg, ts - s.t0

PH_W, PH_H, NAV, PAGE_H = 432, 768, 64, 2300
_bottom = {}
def content_bottom(fn, frame):
    if fn not in _bottom:
        g = frame.crop((0, 0, 864, (PAGE_H - NAV) * 2)).convert('L').resize((108, (PAGE_H - NAV) // 4), Image.BOX)
        px = g.load(); rows = [y for y in range(g.height) if sum(1 for x in range(g.width) if px[x, y] - min(px[x2, y] for x2 in (0, 1, 2, 105, 106, 107)) > 12) >= 8]
        if len(_bottom) > 50: _bottom.clear()
        _bottom[fn] = (rows[-1] + 1) * 4 if rows else PAGE_H
    return _bottom[fn]
def phone(fn, frame, lg):
    """Pantalla del celular (864×1536, 2×) + scroll usado + alto del encabezado."""
    hdr = round(lg[1]); vs = lg[2]; win = PH_H - hdr - NAV
    vs = max(0, min(vs, content_bottom(fn, frame) + 20 - hdr - win))
    if lg[4]: vs = min(vs, 330)
    out = Image.new('RGB', (PH_W * 2, PH_H * 2), INK)
    out.paste(frame.crop((0, 0, 864, hdr * 2)), (0, 0))
    y0 = int(round((hdr + vs) * 2)); out.paste(frame.crop((0, y0, 864, y0 + win * 2)), (0, hdr * 2))
    out.paste(frame.crop((0, (PAGE_H - NAV) * 2, 864, PAGE_H * 2)), (0, (PH_H - NAV) * 2))
    return out, vs, hdr
def to_phone(x, y, vs, hdr):
    if y >= PAGE_H - NAV: return x, y - (PAGE_H - NAV) + (PH_H - NAV)
    if y < hdr: return x, y
    return x, y - vs

# ---------- layout ----------
if V:
    PHB = (222, 232, 636, 1131)   # celular (432×768 css → ×1.47)
    SUB_Y = 1468; WM = (540, 168)
    BIG = (90, 232, 900, 1131)    # plano corto / montajes
else:
    PHB = (110, 50, 800, 980)     # celular ~50 % más grande que en la v2 (536 → 800 px de ancho)
    RCX = 1410                    # centro de la columna derecha
    RBOX = (990, 120, 840, 640)   # imagen de la columna derecha
    SUB_Y = 905; WM = (RCX, 1046)
PH_ASP = PHB[2] / PHB[3]

# «Cámara» sobre el celular. Acercar = mostrar una ventana más baja del celular, siempre con casi todo su ancho
# (así no se cortan los botones), y en 9:16 además el recuadro crece hasta el ancho de la pantalla.
ZB = (40, 232, 1000, 1131) if V else PHB
def camera(st, lg, vs, hdr, pb=None, zb=None, skip_photo=False):
    pb = pb or PHB; zb = zb or ZB
    mt = max(0.0, min(1.0, (lg[6] - 1) / 0.8)) if len(lg) > 6 else 0.0
    on_photo = bool(lg[3] and len(lg) > 5 and lg[5] and lg[3][0] <= lg[5][0] <= lg[3][0] + lg[3][2]
                    and lg[3][1] - 10 <= lg[5][1] <= lg[3][1] + lg[3][3])
    if len(lg) > 5 and lg[5] and not (skip_photo and on_photo):
        st['ft'] = to_phone(lg[5][0], lg[5][1], vs, hdr)
    ft = st.get('ft', (PH_W / 2, PH_H / 2))
    if 'm' not in st: st['m'] = mt; st['f'] = ft
    st['m'] += (mt - st['m']) * 0.10
    st['f'] = (st['f'][0] + (ft[0] - st['f'][0]) * 0.12, st['f'][1] + (ft[1] - st['f'][1]) * 0.12)
    m = ease(st['m'])
    box = tuple(p + (q - p) * m for p, q in zip(pb, zb))
    cw = PH_W * (1 - 0.10 * m); ch = cw * box[3] / box[2]
    if ch > PH_H: ch = PH_H; cw = ch * box[2] / box[3]
    x0 = min(max(0, st['f'][0] - cw / 2), PH_W - cw); y0 = min(max(0, st['f'][1] - ch / 2), PH_H - ch)
    return (x0, y0, cw, ch, box)

def draw_phone(img, ph, cam):
    x0, y0, cw, ch, box = cam
    crop = ph.crop((int(x0 * 2), int(y0 * 2), int((x0 + cw) * 2), int((y0 + ch) * 2)))
    zoomed = ch < PH_H - 2
    panel(img, crop, box, r=34 if not zoomed else 26, border=COPPER if zoomed else (92, 72, 56), bw=3)

def phone_to_out(cam, px, py):
    x0, y0, cw, ch, box = cam
    return box[0] + (px - x0) * box[2] / cw, box[1] + (py - y0) * box[3] / ch

_step_cache = {}
def step_card(n):
    if n not in _step_cache:
        num, title = STEP[n]
        im = Image.new('RGBA', (840, 560), (0, 0, 0, 0))
        t0, _ = text_img(num, font(F_TITLE, 120), fill=COPPER); im.alpha_composite(t0, ((840 - t0.width) // 2, 40))
        size = 104
        while True:
            t1, nl = text_img(title, font(F_TITLE, size), fill=CREAM, max_w=800, spacing=0)
            if nl <= 2 or size < 60: break
            size -= 8
        im.alpha_composite(t1, ((840 - t1.width) // 2, 230))
        y = 230 + t1.height + 34; ImageDraw.Draw(im).rectangle((370, y, 470, y + 3), fill=COPPER)
        t2, _ = text_img('Espejo WS · panel del barbero', font(F_SUB, 32), fill=GOLD); im.alpha_composite(t2, ((840 - t2.width) // 2, y + 30))
        _step_cache[n] = im
    return _step_cache[n]

ALTO = Image.open(f'{REC}/alto.png').convert('RGB')
JOE_C = JOE.resize(ALTO.size, Image.LANCZOS)
def effect_img(size, p, z):
    asp = size[0] / size[1]
    b = crop_rel(JOE_C, SIDE[0] - .02, SIDE[1] + .02, SIDE[2] * .78, asp, z); a = crop_rel(ALTO, SIDE[0] - .02, SIDE[1] + .02, SIDE[2] * .78, asp, z)
    return sweep(b, a, size, p)
def draw_effect(img, box, q):
    p = ease((q - 0.35) / 1.1); z = 1.0 + 0.10 * ease(q / 3.2)
    panel(img, effect_img((int(box[2]), int(box[3])), p, z), box, r=30)
    chip_at(img, CH_ORIG(), box, 'tr', alpha=1 - ease((p - 0.6) * 4))
    chip_at(img, chip('Espejo WS · degradado alto', 24, COPPER, solid=True), box, 'tl', alpha=ease((p - 0.2) * 4))

def pair_img(frame, lg, size):
    tw, th = size; gap = 16; each = (tw - gap) // 2
    out = Image.new('RGB', (tw, th), (20, 17, 15))
    for i, (x, y, w, h) in enumerate(lg[4][:2]):
        cw = 0.70 * w; ch = cw * th / each
        X0 = x + 0.5 * w - cw / 2; Y0 = y + 0.01 * h
        out.paste(frame.crop((int(X0 * 2), int(Y0 * 2), int((X0 + cw) * 2), int((Y0 + ch) * 2))).resize((each, th), Image.BICUBIC), (i * (each + gap), 0))
        put(out, chip('Opción ' + 'AB'[i], 24), i * (each + gap) + each / 2, th - 40)
    return out

LIVE_BOX = (60, 232, 960, 540) if V else (990, 120, 840, 640)
def live_crop(frame, cv, aspect):
    x, y, w, h = cv; cw = 0.40 * w; ch = cw / aspect
    X0 = x + 0.36 * w - cw / 2; Y0 = max(y, y + 0.12 * h - ch / 2)
    return frame.crop((int(X0 * 2), int(Y0 * 2), int((X0 + cw) * 2), int((Y0 + ch) * 2)))

def render_rec(n, r, tau, st):
    img = BG.copy()
    if V and n == 'l4' and tau >= EFFECT_AT - X:
        q = tau - EFFECT_AT + X
        tmp = BG.copy(); draw_effect(tmp, BIG, q)
        if q < X:
            frame, lg, _ = r.at(min(tau, r.D)); ph, vs, hdr = phone(r.cache[0], frame, lg); draw_phone(img, ph, camera(st, lg, vs, hdr))
            return blend_alpha(img, tmp, ease(q / X)), SUB_Y
        return tmp, SUB_Y
    frame, lg, ts = r.at(tau)
    ph, vs, hdr = phone(r.cache[0], frame, lg)
    if n == 'l5':  # línea en vivo: acercamiento al costado de la cabeza (desde el mismo cuadro) + controles
        if V: cam = camera(st, lg, vs, hdr, pb=(60, 800, 960, 580), zb=(60, 800, 960, 580), skip_photo=True)
        else: cam = camera(st, lg, vs, hdr, skip_photo=True)
        draw_phone(img, ph, cam)
        if lg[3]: st['live'] = live_crop(frame, lg[3], LIVE_BOX[2] / LIVE_BOX[3])
        if st.get('live') is not None:
            panel(img, st['live'], LIVE_BOX, r=28); chip_at(img, chip('En vivo · Espejo WS', 22, COPPER, solid=True), LIVE_BOX, 'tl', pad=18)
        return img, SUB_Y
    cam = camera(st, lg, vs, hdr)
    draw_phone(img, ph, cam)
    # «Foto original» sobre la foto de Joe dentro de la app mientras se ve sin cambios (marcando el pelo)
    if n == 'l3' and lg[3] and 'zona1' in r.marks and ts < r.marks['zona1']:
        cx, cy, cw_, ch_ = lg[3]; px, py = to_phone(cx + 12, cy + 12, vs, hdr)
        ox, oy = phone_to_out(cam, px, py)
        c = CH_ORIG(20 if V else 20)
        bx = cam[4]
        if bx[0] <= ox and bx[1] + 10 <= oy <= bx[1] + bx[3] - 60:
            put(img, c, min(ox + c.width / 2, bx[0] + bx[2] - c.width / 2 - 10), oy + c.height / 2)
    if not V:
        # columna derecha: paso / plano corto del efecto / comparación
        if n == 'l4' and tau >= EFFECT_AT - 1.2:
            q = tau - EFFECT_AT + 1.2; a = ease(q / 0.4)
            tmp = img.copy(); put(tmp, step_card(n), RCX, 420); img = blend_alpha(img, tmp, 1 - a)
            tmp = img.copy(); draw_effect(tmp, RBOX, q); img = blend_alpha(img, tmp, a)
        elif n == 'l6' and lg[4]:
            st['pair'] = pair_img(frame, lg, RBOX[2:])
        if n == 'l6' and st.get('pair') is not None:
            st['pm'] = min(1, st.get('pm', 0) + 1 / 9)
            tmp = img.copy(); put(tmp, step_card(n), RCX, 420); img = blend_alpha(img, tmp, 1 - ease(st['pm']))
            tmp = img.copy(); panel(tmp, st['pair'], RBOX, r=30); chip_at(tmp, chip('Comparar A y B', 22, COPPER, solid=True), RBOX, 'tl')
            img = blend_alpha(img, tmp, ease(st['pm']))
        elif not (n == 'l4' and tau >= EFFECT_AT - 1.2) and n != 'l5':
            put(img, step_card(n), RCX, 420, alpha=ease(tau / 0.4) if n != 'l2' else 1)
    return img, SUB_Y

# ---------- gancho: antes/después contundente (mismo rostro, mismo encuadre) ----------
STAGES = [(JOE, None), (JOE1, 'Opción 1'), (JOE2, 'Opción 2')]
def render_hook(tau):
    img = BG.copy()
    box = (90, 200, 900, 1060) if V else (1000, 60, 820, 960)
    asp = box[2] / box[3]; z = 1.0 + 0.08 * ease(tau / 5)
    p1 = ease((tau - 0.9) / 1.0); p2 = ease((tau - 2.9) / 0.9)
    c0 = crop_rel(JOE, SIDE[0], SIDE[1] + .03, SIDE[2], asp, z)
    c1 = crop_rel(JOE1, SIDE[0], SIDE[1] + .03, SIDE[2], asp, z); c2 = crop_rel(JOE2, SIDE[0], SIDE[1] + .03, SIDE[2], asp, z)
    size = (box[2], box[3])
    sw = sweep(c1, c2, size, p2) if p2 > 0 else sweep(c0, c1, size, p1)
    panel(img, sw, box, r=30)
    chip_at(img, CH_ORIG(), box, 'tr', alpha=1 - ease((p1 - 0.6) * 4))
    lab = 'Vista previa con IA · opción 2' if p2 > 0.5 else 'Vista previa con IA · opción 1'
    chip_at(img, CH_IA(lab), box, 'tl', alpha=ease((p1 - 0.2) * 4))
    if V:
        t1, _ = text_img('ESPEJO WS', font(F_TITLE, 84), fill=CREAM); put(img, t1, 540, 1335, alpha=ease((tau - 0.3) / 0.6))
    else:
        t1, _ = text_img('ESPEJO WS', font(F_TITLE, 150), fill=CREAM); put(img, t1, 500, 330, alpha=ease((tau - 0.2) / 0.6))
        ImageDraw.Draw(img).rectangle((450, 440, 550, 443), fill=COPPER)
        t2, _ = text_img('WS Style · Panel del barbero', font(F_SUB, 40), fill=GOLD); put(img, t2, 500, 490, alpha=ease((tau - 0.4) / 0.6))
    return img, (SUB_Y if V else (500, 760))

# ---------- tramo IA: montaje rotulado (no es una captura de la app) ----------
DISC, _ = text_img('Montaje ilustrativo con imágenes generadas por IA. No es una captura de la app.', font(F_SUB, 26 if V else 24), fill=(196, 186, 172), max_w=900)
def render_ia(tau):
    img = BG.copy(); split = 3.9
    pA = 1 - ease((tau - split) / 0.4)
    if pA > 0:
        tmp = img.copy()
        if V: boxes = [(60, 290, 470, 520), (550, 290, 470, 520), (305, 835, 470, 500)]
        else: boxes = [(90, 140, 560, 640), (680, 140, 560, 640), (1270, 140, 560, 640)]
        z = 1.0 + 0.05 * ease(tau / 4)
        for i, (im, lab) in enumerate(STAGES):
            bx = boxes[i]; a = ease((tau - 0.35 * i) / 0.5)
            cr = crop_rel(im, SIDE[0] + .02, SIDE[1] + .04, SIDE[2] * 1.05, bx[2] / bx[3], z)
            t2 = tmp.copy(); panel(t2, cr, (bx[0], bx[1] + 24 * (1 - a), bx[2], bx[3]), r=26)
            chip_at(t2, CH_ORIG(20) if lab is None else CH_IA('IA · ' + lab.lower(), 20), (bx[0], bx[1] + 24 * (1 - a), bx[2], bx[3]), 'tl', pad=16)
            tmp = blend_alpha(tmp, t2, a)
        img = blend_alpha(img, tmp, pA)
    if pA < 1:
        tmp = BG.copy(); q = tau - split; a = ease((q - 0.1) / 0.5); b2 = ease((q - 0.5) / 0.5)
        if V: bL, bR = (60, 360, 470, 900), (550, 360, 470, 900)
        else: bL, bR = (330, 140, 610, 640), (980, 140, 610, 640)
        zz = 1 + 0.04 * ease(q / 3.9)
        t2 = tmp.copy(); panel(t2, crop_rel(PED, 0.46, 0.40, 0.70, bL[2] / bL[3], zz), bL, r=26); chip_at(t2, CH_ORIG(20), bL, 'tl', pad=16); tmp = blend_alpha(tmp, t2, a)
        t2 = tmp.copy(); panel(t2, crop_rel(PED1, 0.46, 0.40, 0.70, bR[2] / bR[3], zz), bR, r=26); chip_at(t2, CH_IA('Vista previa con IA', 20), bR, 'tl', pad=16); tmp = blend_alpha(tmp, t2, b2)
        img = blend_alpha(img, tmp, 1 - pA)
    put(img, chip('Vista previa con IA', 30, COPPER, solid=True), W / 2, 230 if V else 80, alpha=ease(tau / 0.4))
    put(img, DISC, W / 2, 1362 if V else 812, alpha=ease((tau - 0.5) / 0.5))
    return img, SUB_Y

# ---------- cierre: diseño elegido → negro → logo ----------
ELEGIDO = Image.open(f'{REC}/elegido.png').convert('RGB')
LOGO = Image.open('/tmp/vid/logo.png').convert('RGBA')
def render_close(tau):
    img = Image.new('RGB', (W, H), (0, 0, 0))
    a_des = 1 - ease((tau - 1.35) / 0.9)
    if a_des > 0:
        tmp = BG.copy(); box = (90, 330, 900, 1000) if V else (560, 110, 800, 820)
        cr = crop_rel(ELEGIDO, 0.48, 0.21, 0.66, box[2] / box[3], 1.0 + 0.10 * ease(tau / 2.2))
        panel(tmp, cr, box, r=30); chip_at(tmp, chip('Diseño elegido · Espejo WS', 24, COPPER, solid=True), box, 'tl')
        img = blend_alpha(img, tmp, a_des)
    a_logo = ease((tau - 1.9) / 0.8)
    if a_logo > 0:
        lw = 560 if V else 620; lg = LOGO.resize((lw, int(LOGO.height * lw / LOGO.width)), Image.LANCZOS)
        cy = H / 2 - 60; tmp = img.copy(); put(tmp, lg, W / 2, cy - 30 * (1 - a_logo))
        d = ImageDraw.Draw(tmp); d.rectangle((W / 2 - 50, cy + lg.height / 2 + 40, W / 2 + 50, cy + lg.height / 2 + 43), fill=COPPER)
        f = font(F_SUB, 40 if V else 38); dd = ImageDraw.Draw(Image.new('RGB', (1, 1)))
        s1 = 'Un producto elaborado por '; s2 = 'ricorp.cl'; tw = dd.textlength(s1 + s2, font=f); x0 = W / 2 - tw / 2; y0 = cy + lg.height / 2 + 72
        fa = ease((tau - 2.25) / 0.7)
        d.text((x0, y0), s1, font=f, fill=tuple(int(v * fa) for v in CREAM)); d.text((x0 + dd.textlength(s1, font=f), y0), s2, font=f, fill=tuple(int(v * fa) for v in COPPER))
        img = blend_alpha(img, tmp, a_logo)
    return img, None

# ---------- subtítulos y marca de agua ----------
SUBS = []; VOICE = []
for n, d, kind, vs in SCENES:
    a = f'/tmp/vid/tts/{n}.mp3'; dv = adur(a); st = START[n] + vs; VOICE.append((a, st))
    if kind != 'close': SUBS.append((st - 0.1, min(st + dv + 0.35, START[n] + d - 0.05), subtitle_img(G[n]['sub'])))
WM_IMG, _ = text_img('Un producto elaborado por ricorp.cl', font(F_SUB, 28 if V else 26), fill=(236, 230, 222))
WM_IMG.putalpha(WM_IMG.getchannel('A').point(lambda v: int(v * 0.6)))

STATE = {n: {} for n, *_ in SCENES}
def rec_dur(n, d): return EFFECT_AT if (V and n == 'l4') else d
RECS = {n: Rec(n, rec_dur(n, d)) for n, d, kind, _ in SCENES if kind == 'rec'}
def scene_frame(n, tau):
    kind = next(k for s, _, k, _ in SCENES if s == n)
    if kind == 'rec': return render_rec(n, RECS[n], tau, STATE[n])
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
            sx, sy = (540, sub) if V and isinstance(sub, (int, float)) else (sub if isinstance(sub, tuple) else (RCX, sub))
            put(img, im, sx, sy, alpha=min(1, (t - a) / 0.15, (b - t) / 0.15))
    return img

if POSTER:
    tp = float(os.environ.get('POSTER_T', START['l1'] + 4.2))
    # avanzar los estados suavizados hasta el instante del poster
    for i in range(max(0, int((tp - 1.5) * FPS)), int(tp * FPS)): frame_at(i / FPS)
    SUBS.clear(); frame_at(tp).convert('RGB').save(POSTER, quality=92)
    sys.exit(0)
if os.environ.get('PREVIEW'):  # cuadros sueltos para revisar: PREVIEW=t1,t2,...
    for tt in [float(x) for x in os.environ['PREVIEW'].split(',')]:
        for n in STATE: STATE[n] = {}
        for i in range(max(0, int((tt - 1.2) * FPS)), int(tt * FPS)): frame_at(i / FPS)
        frame_at(tt).convert('RGB').save(f'{OUT}-{tt:05.1f}.jpg', quality=85)
    sys.exit(0)

# ---------- audio ----------
AUD = '/tmp/vid/mix-v3.wav'
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
    '-metadata', 'title=WS Style — Espejo WS (v3)', '-metadata', 'artist=ricorp.cl', OUT], stdin=subprocess.PIPE)
for i in range(N):
    enc.stdin.write(frame_at(i / FPS).convert('RGB').tobytes())
    if i % 300 == 0: print(f'{i}/{N}', flush=True)
enc.stdin.close(); enc.wait(); print(OUT, round(TOTAL, 2), 's')
