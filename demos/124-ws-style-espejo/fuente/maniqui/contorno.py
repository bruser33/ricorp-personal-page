# Calcula el contorno del pelo de cada perfil a partir del render-máscara (scene.html?mask=1) y lo
# guarda en zones.json (puntos normalizados 0–1 que record.js toca con "Marcar zona de pelo").
# Uso: python contorno.py  (lee /tmp/mq/ML.jpg y /tmp/mq/MR.jpg)
import cv2, numpy as np, json
out = {}
for v, tone in [('left', [0.33, 0.42]), ('right', [0.65, 0.44])]:
    m = cv2.imread(f'/tmp/mq/M{v[0].upper()}.jpg', 0); _, b = cv2.threshold(m, 128, 255, cv2.THRESH_BINARY)
    b = cv2.morphologyEx(b, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    cs, _ = cv2.findContours(b, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); c = max(cs, key=cv2.contourArea)
    a = cv2.approxPolyDP(c, 20, True)[:, 0, :]
    M = cv2.moments(c); cx, cy = M['m10'] / M['m00'], M['m01'] / M['m00']
    out[v] = {'zone': [[round(float((x + (x - cx) * 0.025) / 960), 4), round(float((y + (y - cy) * 0.025) / 960), 4)] for x, y in a], 'tone': tone}
json.dump(out, open('/tmp/vid/zones.json', 'w'))
