# v3.1 del video del Espejo WS: retoca la v3 SIN volver a grabar.
# Lee el MP4 de la v3 cuadro a cuadro, reemplaza solo 4 tramos y copia el audio tal cual (misma voz, música,
# sincronía y −14 LUFS). Tramos:
#   1. Gancho (0–5 s): zoom a la sien de Joe + divisor antes/después + recuadro de la zona que cambia.
#   2. Plano corto del Espejo (degradado alto, l4): zoom a la sien + divisor + recuadro.
#   3. Comparar A y B (l6): zoom a la sien de A (alto + línea) y B (medio), y luego el combinado (B + línea de A).
#   4. Vista previa con IA (l6b): fotos con zoom a la sien y la aclaración fija en una franja inferior todo el tramo.
# Las imágenes del Espejo (A, B, combinado) salen del mismo código de la app (client/.../mirror/photo.ts, blendFade)
# aplicado a la foto de Joe con la zona de pelo de la grabación (ver prep.py, fade.mjs, mk.py).
# Uso: python retoque.py v|h ENTRADA_V3.mp4 SALIDA.mp4 [--poster poster.jpg --t 3.6] [--preview t1,t2]
import os, sys, json, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FOTOS = os.path.join(HERE, '..', '..', '124-ws-style-espejo-v2', 'fotos')
G = {l['id']: l for l in json.load(open(os.path.join(HERE, '..', '..', '124-ws-style-espejo-v3', 'fuente', 'guion.json')))['lineas']}
ESP = os.environ.get('ESPEJO', '/tmp/v31')  # salida de mk.py: orig.png, A.png, B.png, C.png, alto.png
FONTS = os.environ.get('FONTS', '/tmp/vid/fonts')
FF = os.environ.get('FFMPEG') or __import__('imageio_ffmpeg').get_ffmpeg_exe()
V = sys.argv[1] == 'v'; SRC = sys.argv[2]; OUT = sys.argv[3]
arg = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
W, H = (1080, 1920) if V else (1920, 1080); FPS = 30
COPPER = (201, 138, 85); GOLD = (227, 190, 140); INK = (13, 11, 10); CREAM = (239, 232, 220)

_f = {}
def font(kind, s):
    if (kind, s) not in _f:
        if kind == 'title': f = ImageFont.truetype(f'{FONTS}/f1.ttf', s)
        else: f = ImageFont.truetype(f'{FONTS}/inter.ttf', s); f.set_variation_by_name('Bold' if kind == 'bold' else 'SemiBold')
        _f[(kind, s)] = f
    return _f[(kind, s)]

def ease(x): x = max(0., min(1., x)); return x * x * (3 - 2 * x)
def background():
    bg = Image.new('RGB', (W, H), INK)
    cx, cy = (W * .5, H * .40) if V else (W * .40, H * .5); R = max(W, H) * .75
    glow = Image.new('L', (W // 4, H // 4), 0); gd = ImageDraw.Draw(glow)
    for i in range(40, 0, -1):
        r = R / 4 * i / 40; gd.ellipse((cx / 4 - r, cy / 4 - r, cx / 4 + r, cy / 4 + r), fill=int(70 * (1 - i / 40) ** 1.6))
    glow = glow.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(30))
    return Image.composite(Image.new('RGB', (W, H), (60, 36, 20)), bg, glow)
BG = background()
_m = {}
def rmask(w, h, r):
    if (w, h, r) not in _m:
        m = Image.new('L', (w * 2, h * 2), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), r * 2, fill=255)
        _m[(w, h, r)] = m.resize((w, h), Image.LANCZOS)
    return _m[(w, h, r)]
def panel(dst, img, box, r=26, border=COPPER, bw=2, shadow=True):
    x, y, w, h = [int(round(v)) for v in box]
    if img.size != (w, h): img = img.resize((w, h), Image.BICUBIC)
    if shadow:
        sh = Image.new('L', (w + 80, h + 80), 0); ImageDraw.Draw(sh).rounded_rectangle((40, 50, w + 40, h + 50), r, fill=150)
        dst.paste((0, 0, 0), (x - 40, y - 40), sh.filter(ImageFilter.GaussianBlur(18)))
    dst.paste(img, (x, y), rmask(w, h, r))
    if bw: ImageDraw.Draw(dst).rounded_rectangle((x, y, x + w - 1, y + h - 1), r, outline=border, width=bw)
def text_img(txt, f, fill=CREAM, max_w=None, spacing=10):
    d = ImageDraw.Draw(Image.new('RGB', (1, 1))); lines = []; cur = ''
    for w_ in txt.split():
        t = (cur + ' ' + w_).strip()
        if max_w and d.textlength(t, font=f) > max_w and cur: lines.append(cur); cur = w_
        else: cur = t
    lines.append(cur); asc, desc = f.getmetrics(); lh = asc + desc
    tw = int(max(d.textlength(l, font=f) for l in lines)) + 4; th = lh * len(lines) + spacing * (len(lines) - 1)
    im = Image.new('RGBA', (tw, th), (0, 0, 0, 0)); dd = ImageDraw.Draw(im)
    for i, l in enumerate(lines): dd.text(((tw - dd.textlength(l, font=f)) / 2, i * (lh + spacing)), l, font=f, fill=fill)
    return im, len(lines)
def put(dst, im, cx, cy, alpha=1.0):
    if alpha <= 0.01: return
    if alpha < 1: im = im.copy(); im.putalpha(im.getchannel('A').point(lambda v: int(v * alpha)))
    dst.paste(im, (int(cx - im.width / 2), int(cy - im.height / 2)), im)
_c = {}
def chip(txt, size=26, fill=COPPER, solid=False):
    k = (txt, size, fill, solid)
    if k not in _c:
        t, _ = text_img(txt.upper(), font('bold', size), fill=(20, 14, 10) if solid else fill)
        im = Image.new('RGBA', (t.width + 40, t.height + 20), (0, 0, 0, 0))
        ImageDraw.Draw(im).rounded_rectangle((0, 0, im.width - 1, im.height - 1), im.height // 2,
                                             fill=fill + (235,) if solid else (12, 10, 9, 215), outline=fill, width=2)
        im.alpha_composite(t, (20, 8)); _c[k] = im
    return _c[k]
CH_ORIG = lambda s=24: chip('Foto original', s, (225, 220, 212))
CH_IA = lambda txt='Vista previa con IA', s=24: chip(txt, s, COPPER, solid=True)
def chip_at(dst, im, box, corner='tl', alpha=1.0, pad=22):
    x, y, w, h = box
    cx = x + pad + im.width / 2 if corner[1] == 'l' else x + w - pad - im.width / 2
    cy = y + pad + im.height / 2 if corner[0] == 't' else y + h - pad - im.height / 2
    put(dst, im, cx, cy, alpha)

def load(p, size=None):
    im = Image.open(p).convert('RGB'); return im.resize(size, Image.LANCZOS) if size else im
JOE = load(f'{FOTOS}/joe-frente.jpg'); JS = JOE.size
JOE1 = load(f'{FOTOS}/joe-corte-1.jpg', JS); JOE2 = load(f'{FOTOS}/joe-corte-2.jpg', JS)
PED = load(f'{FOTOS}/pedro-frente.jpg'); PED1 = load(f'{FOTOS}/pedro-corte-1.jpg', PED.size)
# Espejo (misma foto, 780×960): se escalan al tamaño de la original para usar las mismas coordenadas
E_ORIG = load(f'{ESP}/orig.png', JS); E_ALTO = load(f'{ESP}/alto.png', JS)
E_A = load(f'{ESP}/A.png', JS); E_B = load(f'{ESP}/B.png', JS); E_C = load(f'{ESP}/C.png', JS)

def crop_box(im, cx, cy, w_rel, aspect, zoom=1.0):
    W0, H0 = im.size; cw = W0 * w_rel / zoom; ch = cw / aspect
    if ch > H0: ch = H0; cw = ch * aspect
    x0 = min(max(0, cx * W0 - cw / 2), W0 - cw); y0 = min(max(0, cy * H0 - ch / 2), H0 - ch)
    return (x0 / W0, y0 / H0, cw / W0, ch / H0)
def crop_rel(im, cb):
    W0, H0 = im.size; x, y, w, h = cb
    return im.crop((int(x * W0), int(y * H0), int((x + w) * W0), int((y + h) * H0)))

# Zona que cambia en la foto de Joe (relativa a la foto): sien izquierda, donde va el degradado y la línea.
SIEN = (0.37, 0.115)                 # centro del zoom
ZONA = (0.300, 0.050, 0.125, 0.15)   # recuadro (x, y, w, h)

def divider(before, after, size, p, handle=True):
    """Divisor deslizante: a la izquierda «después», a la derecha «antes»."""
    w, h = size; b = before.resize(size, Image.BICUBIC); a = after.resize(size, Image.BICUBIC)
    xs = int(w * p); out = b.copy()
    if xs > 0: out.paste(a.crop((0, 0, xs, h)), (0, 0))
    if 0 < p < 1:
        glow = Image.new('L', size, 0); ImageDraw.Draw(glow).rectangle((xs - 12, 0, xs + 12, h), fill=90)
        out.paste(COPPER, (0, 0), glow.filter(ImageFilter.GaussianBlur(9)))
        d = ImageDraw.Draw(out); d.rectangle((xs - 2, 0, xs + 2, h), fill=GOLD)
        if handle:
            r = 30 if V else 26; cy = h * 0.82
            d.ellipse((xs - r, cy - r, xs + r, cy + r), fill=(20, 15, 12), outline=GOLD, width=4)
            for s in (-1, 1):
                tx = xs + s * 9; d.polygon([(tx, cy - 9), (tx, cy + 9), (tx + s * 10, cy)], fill=GOLD)
    return out

def zone_rect(dst, box, cb, alpha, label=None):
    """Recuadro discontinuo cobre sobre la zona que cambia (coordenadas de la foto → recuadro del panel)."""
    if alpha <= 0.02: return
    bx, by, bw, bh = box; cx, cy, cw, ch = cb
    x0 = bx + (ZONA[0] - cx) / cw * bw; y0 = by + (ZONA[1] - cy) / ch * bh
    x1 = bx + (ZONA[0] + ZONA[2] - cx) / cw * bw; y1 = by + (ZONA[1] + ZONA[3] - cy) / ch * bh
    x0, x1 = max(bx + 10, x0), min(bx + bw - 10, x1); y0, y1 = max(by + 10, y0), min(by + bh - 10, y1)
    lay = Image.new('RGBA', dst.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay); col = GOLD + (int(255 * alpha),)
    seg = 22
    for X0, Y0, X1, Y1 in [(x0, y0, x1, y0), (x0, y1, x1, y1), (x0, y0, x0, y1), (x1, y0, x1, y1)]:
        L = max(abs(X1 - X0), abs(Y1 - Y0)); n = int(L // seg)
        for i in range(0, n, 2):
            a, b = i / max(n, 1), min(1, (i + 1) / max(n, 1))
            d.line((X0 + (X1 - X0) * a, Y0 + (Y1 - Y0) * a, X0 + (X1 - X0) * b, Y0 + (Y1 - Y0) * b), fill=col, width=5)
    dst.paste(lay, (0, 0), lay)
    if label:
        c = chip(label, 20 if V else 18, GOLD, solid=True); put(dst, c, (x0 + x1) / 2, min(y1 + c.height / 2 + 12, by + bh - c.height / 2 - 8), alpha)

# ---------------- tiempos de la v3 (no cambian) ----------------
SC = [('l1', 5.0), ('l2', 5.9), ('l3', 8.0), ('l4', 9.0), ('l5', 7.6), ('l6', 6.0), ('l6b', 7.6), ('l7', 5.6), ('l8', 6.4), ('l9', 6.6)]
START = {}; t = 0
for k, (n, d) in enumerate(SC): START[n] = t; t += d - (0.3 if k < len(SC) - 1 else 0)
X = 0.30

# ---------------- 1. Gancho ----------------
def hook(img, tau):
    box = (90, 200, 900, 1060) if V else (1000, 60, 820, 960)
    asp = box[2] / box[3]; z = 1.0 + 0.10 * ease(tau / 5)
    cb = crop_box(JOE, SIEN[0], SIEN[1] + .02, 0.34 if V else 0.40, asp, z)
    c0, c1, c2 = crop_rel(JOE, cb), crop_rel(JOE1, cb), crop_rel(JOE2, cb)
    size = box[2:]
    # divisor: 0.8–1.9 s revela la opción 1 y vuelve al centro; 2.9–3.8 s pasa a la opción 2
    if tau < 2.7:
        p = ease((tau - 0.8) / 0.8) - 0.45 * ease((tau - 1.7) / 0.6); out = divider(c0, c1, size, p)
        lab = 'Vista previa con IA · opción 1'
    else:
        p = 0.55 + 0.45 * ease((tau - 2.9) / 0.9); out = divider(c0, c2, size, p if p < 0.999 else 1, handle=p < .999)
        lab = 'Vista previa con IA · opción 2'
    panel(img, out, box, r=30, shadow=False)
    zone_rect(img, box, cb, ease((tau - 1.9) / 0.4), 'Aquí cambia')
    chip_at(img, CH_ORIG(), box, 'tr', alpha=1 - ease((tau - 3.5) / 0.3))
    chip_at(img, CH_IA(lab), box, 'tl', alpha=ease((tau - 0.9) / 0.3))

# ---------------- 2. Plano corto del Espejo (degradado alto) ----------------
def effect(img, box, q):
    asp = box[2] / box[3]; z = 1.0 + 0.06 * ease(q / 3.2)
    cb = crop_box(E_ORIG, SIEN[0] - .01, SIEN[1] + .03, 0.30 if V else 0.36, asp, z)
    b, a = crop_rel(E_ORIG, cb), crop_rel(E_ALTO, cb)
    # el divisor revela el degradado y luego se queda a mitad para comparar
    p = ease((q - 0.2) / 0.9) - 0.5 * ease((q - 1.3) / 0.6) + 0.15 * ease((q - 2.2) / 0.5) - 0.15 * ease((q - 2.8) / 0.4)
    panel(img, divider(b, a, box[2:], p), box, r=30, shadow=False)
    zone_rect(img, box, cb, ease((q - 1.1) / 0.4), 'Degradado')
    chip_at(img, CH_ORIG(), box, 'tr', alpha=1 - ease((p - 0.85) * 6))
    chip_at(img, chip('Espejo WS · degradado alto', 24 if V else 22, COPPER, solid=True), box, 'tl', alpha=ease((q - 0.2) / 0.3))

# ---------------- 3. Comparar A y B ----------------
def pair(img, box, tau):
    x, y, w, h = box; gap = 16
    if V: boxes = [(x, y, w, (h - gap) // 2), (x, y + (h - gap) // 2 + gap, w, (h - gap) // 2)]
    else: boxes = [(x, y, (w - gap) // 2, h), (x + (w - gap) // 2 + gap, y, (w - gap) // 2, h)]
    for i, (im, lab) in enumerate([(E_A, 'Opción A · alto + línea'), (E_B, 'Opción B · medio')]):
        bx = boxes[i]; cb = crop_box(im, SIEN[0] - .005, SIEN[1] + .025, 0.30 if V else 0.22, bx[2] / bx[3], 1.0 + 0.05 * ease(tau / 2))
        panel(img, crop_rel(im, cb), bx, r=26, shadow=False)
        zone_rect(img, bx, cb, ease((tau - 0.5) / 0.4))
        chip_at(img, chip(lab, 22 if V else 20, COPPER, solid=True), bx, 'bl', pad=18)
    chip_at(img, chip('Comparar A y B · zoom a la sien', 22 if V else 20, (225, 220, 212)), box, 'tl', pad=18)
def combined(img, box, tau):
    cb = crop_box(E_C, SIEN[0] - .005, SIEN[1] + .025, 0.30 if V else 0.34, box[2] / box[3], 1.0 + 0.06 * ease(tau / 2))
    p = 1 - 0.5 * ease((tau - 0.35) / 0.6)
    panel(img, divider(crop_rel(E_ORIG, cb), crop_rel(E_C, cb), box[2:], p), box, r=30, shadow=False)
    zone_rect(img, box, cb, ease((tau - 0.6) / 0.4))
    chip_at(img, chip('Combinado · degradado B + línea A', 24 if V else 20, COPPER, solid=True), box, 'tl')
    chip_at(img, CH_ORIG(22 if V else 20), box, 'tr', alpha=ease((tau - 0.6) / 0.3))

# ---------------- 4. Vista previa con IA (re-render completo del cuadro) ----------------
DISC_TXT = 'Montaje ilustrativo con imágenes generadas por IA. No es una captura de la app.'
def disc_band():
    f = font('semi', 32 if V else 30); t, n = text_img(DISC_TXT, f, fill=CREAM, max_w=960 if V else 1700, spacing=6)
    bw = W if V else t.width + 80; bh = t.height + 30
    im = Image.new('RGBA', (bw, bh), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if V:
        d.rectangle((0, 0, bw - 1, bh - 1), fill=(22, 17, 14, 240)); d.line((0, 0, bw, 0), fill=COPPER + (255,), width=3)
    else:
        d.rounded_rectangle((0, 0, bw - 1, bh - 1), 16, fill=(22, 17, 14, 240), outline=COPPER + (255,), width=2)
    im.alpha_composite(t, ((bw - t.width) // 2, 15)); return im
DISC = disc_band()
DISC_Y = 1322 if V else 745
def sub_band(txt):
    size = 50 if V else 44; maxw = 940 if V else 820; SUB_W = 1080 if V else 900
    while True:
        im, n = text_img(txt, font('semi', size), max_w=maxw)
        if n <= 2 or size < 30: break
        size -= 3
    py = 22; bh = im.height + 2 * py
    band = Image.new('RGBA', (SUB_W, bh), (0, 0, 0, 0)); d = ImageDraw.Draw(band)
    if V:
        d.rectangle((0, 0, SUB_W - 1, bh - 1), fill=(24, 19, 16, 205))
        d.line((0, 0, SUB_W, 0), fill=(150, 104, 66, 200), width=2); d.line((0, bh - 1, SUB_W, bh - 1), fill=(150, 104, 66, 200), width=2)
    else:
        d.rounded_rectangle((0, 0, SUB_W - 1, bh - 1), 18, fill=(24, 19, 16, 205), outline=(150, 104, 66, 200), width=2)
    band.alpha_composite(im, ((SUB_W - im.width) // 2, py - 2)); return band
SUB6B = sub_band(G['l6b']['sub']); SUB_POS = (540, 1468) if V else (1410, 905)
WM_IMG, _ = text_img('Un producto elaborado por ricorp.cl', font('semi', 28 if V else 26), fill=(236, 230, 222))
WM_IMG.putalpha(WM_IMG.getchannel('A').point(lambda v: int(v * 0.6))); WM = (540, 168) if V else (1410, 1046)
SUB_WIN = None  # (inicio, fin) del subtítulo de l6b, medido en la v3

def ia(tau):
    img = BG.copy(); split = 3.9
    pA = 1 - ease((tau - split) / 0.4)
    if pA > 0:
        tmp = img.copy()
        if V: boxes = [(60, 300, 470, 450), (550, 300, 470, 450), (305, 780, 470, 450)]
        else: boxes = [(90, 135, 560, 560), (680, 135, 560, 560), (1270, 135, 560, 560)]
        z = 1.0 + 0.05 * ease(tau / 4)
        for i, (im, lab) in enumerate([(JOE, None), (JOE1, 'IA · opción 1'), (JOE2, 'IA · opción 2')]):
            bx = boxes[i]; a = ease((tau - 0.35 * i) / 0.5); bb = (bx[0], bx[1] + 24 * (1 - a), bx[2], bx[3])
            cb = crop_box(im, SIEN[0] + .015, SIEN[1] + .04, 0.36, bx[2] / bx[3], z)
            t2 = tmp.copy(); panel(t2, crop_rel(im, cb), bb, r=26)
            zone_rect(t2, bb, cb, ease((tau - 1.3) / 0.4))
            chip_at(t2, CH_ORIG(20) if lab is None else CH_IA(lab, 20), bb, 'tl', pad=16)
            tmp = Image.blend(tmp, t2, a) if a < 1 else t2
        img = Image.blend(img, tmp, pA) if pA < 1 else tmp
    if pA < 1:
        tmp = BG.copy(); q = tau - split; a = ease((q - 0.1) / 0.5); b2 = ease((q - 0.5) / 0.5)
        if V: bL, bR = (60, 330, 470, 900), (550, 330, 470, 900)
        else: bL, bR = (330, 135, 610, 560), (980, 135, 610, 560)
        zz = 1 + 0.04 * ease(q / 3.9)
        for im, bx, ch, al, cc in [(PED, bL, CH_ORIG(20), a, (0.30, 0.30)), (PED1, bR, CH_IA('Vista previa con IA', 20), b2, (0.32, 0.30))]:
            t2 = tmp.copy(); panel(t2, crop_rel(im, crop_box(im, cc[0], cc[1], 0.56, bx[2] / bx[3], zz)), bx, r=26)
            chip_at(t2, ch, bx, 'tl', pad=16); tmp = Image.blend(tmp, t2, al) if al < 1 else t2
        img = Image.blend(img, tmp, 1 - pA) if pA > 0 else tmp
    put(img, chip('Vista previa con IA', 30, COPPER, solid=True), W / 2, 240 if V else 80)
    put(img, DISC, W / 2, DISC_Y)  # aclaración fija durante todo el tramo
    put(img, WM_IMG, *WM)
    return img

# ---------------- montaje ----------------
def blend_over(base, new, a):
    return base if a <= 0 else new if a >= 1 else Image.blend(base, new, a)
def env(t, t0, t1, fin=0.25, fout=0.25):
    return min(ease((t - t0) / fin) if fin else 1, ease((t1 - t) / fout) if fout else 1)

if V:
    BIG = (90, 232, 900, 1131)
    EFF = (START['l4'] + 5.8 - X, START['l5'] + X)        # en 9:16 el plano corto reemplaza al celular
else:
    BIG = (990, 120, 840, 640)                              # columna derecha
    EFF = (START['l4'] + 5.8 - 1.2, START['l5'] + X)
PAIR = (START['l6'] + 1.55, START['l6'] + 3.3)
COMB = (START['l6'] + 4.35, START['l6b'] + X)
IA = (START['l6b'], START['l7'] + X)

def process(t, frame):
    img = frame
    if t < START['l2'] + X:
        tmp = img.copy(); hook(tmp, t); img = blend_over(img, tmp, 1 - ease((t - START['l2']) / X))
    if EFF[0] <= t < EFF[1]:
        q = t - (START['l4'] + 5.8 - X) if V else t - (START['l4'] + 5.8 - 1.2)
        tmp = img.copy(); effect(tmp, BIG, q); img = blend_over(img, tmp, env(t, EFF[0], EFF[1], X if V else 0.4, X))
    if PAIR[0] <= t < PAIR[1]:
        tmp = img.copy(); pair(tmp, BIG, t - PAIR[0]); img = blend_over(img, tmp, env(t, PAIR[0], PAIR[1]))
    if COMB[0] <= t < COMB[1]:
        tmp = img.copy(); combined(tmp, BIG, t - COMB[0]); img = blend_over(img, tmp, env(t, COMB[0], COMB[1], 0.25, X))
    if IA[0] <= t < IA[1]:
        new = ia(t - START['l6b'])
        if SUB_WIN and SUB_WIN[0] <= t <= SUB_WIN[1]:
            put(new, SUB6B, *SUB_POS, alpha=min(1, (t - SUB_WIN[0]) / 0.15, (SUB_WIN[1] - t) / 0.15))
        img = blend_over(img, new, env(t, IA[0], IA[1], X, X))
    return img

def frames(src, ss=0.0, n=None):
    cmd = [FF, '-loglevel', 'error', '-ss', f'{ss:.3f}', '-i', src] + (['-frames:v', str(n)] if n else []) + ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE); sz = W * H * 3
    while True:
        b = p.stdout.read(sz)
        if len(b) < sz: break
        yield Image.frombytes('RGB', (W, H), b)

def measure_sub():
    """Cuándo aparece y desaparece el subtítulo de l6b en la v3 (texto blanco en la franja)."""
    r = (100, 1420, 980, 1520) if V else (1000, 860, 1820, 950)
    t0 = START['l6b'] - 0.2; vals = []
    for i, f in enumerate(frames(SRC, t0, int(8.2 * FPS))):
        g = f.crop(r).convert('L').point(lambda v: 255 if v > 215 else 0); vals.append((t0 + i / FPS, g.histogram()[255]))
    mx = max(v for _, v in vals); on = [tt for tt, v in vals if v > 0.25 * mx]
    return (on[0] - 0.05, on[-1] + 0.05)

if __name__ == '__main__':
    SUB_WIN = measure_sub(); print('subtítulo l6b', SUB_WIN, flush=True)
    if '--preview' in sys.argv or '--poster' in sys.argv:
        ts = [float(arg('--t'))] if '--poster' in sys.argv else [float(x) for x in arg('--preview').split(',')]
        for tt in ts:
            f = next(frames(SRC, tt, 1)); im = process(tt, f)
            im.save(arg('--poster') if '--poster' in sys.argv else f'{OUT}-{tt:05.2f}.jpg', quality=90)
        sys.exit(0)
    enc = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
        '-i', SRC, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy', '-movflags', '+faststart', '-shortest', '-metadata', 'title=WS Style — Espejo WS (v3.1)', '-metadata', 'artist=ricorp.cl', OUT],
        stdin=subprocess.PIPE)
    for i, f in enumerate(frames(SRC)):
        enc.stdin.write(process(i / FPS, f).tobytes())
        if i % 300 == 0: print(i, flush=True)
    enc.stdin.close(); enc.wait(); print(OUT)
