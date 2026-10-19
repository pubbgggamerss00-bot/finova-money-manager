#!/usr/bin/env python3
# ═══ ساخت آیکون‌های فینوا از لوگوی لوزی نئونی ═══
from PIL import Image, ImageChops, ImageDraw, ImageFilter
import os

SRC = '/home/z/my-project/upload/grok_1792409599038.jpg'
RES = '/home/z/my-project/finova/android/app/src/main/res'
WWW = '/home/z/my-project/finova/android/app/src/main/assets/www'

src = Image.open(SRC).convert('RGB')
W, H = src.size  # 784x1168

# ── ۱) آلفا از درخشندگی (نئون روی سیاه) ──
r, g, b = src.split()
mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
# کف تاریکی ۱۴ → شفاف کامل؛ نرمی گلوی نئون حفظ شود
alpha = mx.point(lambda v: 0 if v < 14 else min(255, int((v - 14) * 255 / 224)))
rgba = src.convert('RGBA')
rgba.putalpha(alpha)

# ── ۲) برش به باکس محتوا ──
bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
dia = rgba.crop(bbox)  # لوزی با پس‌زمینه شفاف
dw, dh = dia.size
print('diamond bbox:', dw, 'x', dh, 'ratio:', round(dw/dh, 3))

# رنگ پس‌زمینه: نمونه از گوشه تصویر
corner = src.getpixel((8, 8))
bg_hex = '#%02X%02X%02X' % corner
print('corner bg color:', bg_hex)

def fit(dia, canvas, max_h_frac):
    """لوزی را در کانواس مربعی با ارتفاع max_h_frac*canvas وسط‌چین کن"""
    ch = int(canvas * max_h_frac)
    cw = int(ch * dw / dh)
    d = dia.resize((cw, ch), Image.LANCZOS)
    cv = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    cv.alpha_composite(d, ((canvas - cw) // 2, (canvas - ch) // 2))
    return cv

def with_bg(img, color, rounded=False):
    cv = Image.new('RGBA', img.size, color)
    cv.alpha_composite(img)
    if rounded:
        m = Image.new('L', img.size, 0)
        ImageDraw.Draw(m).ellipse([0, 0, img.size[0]-1, img.size[1]-1], fill=255)
        cv.putalpha(m)
    return cv

os.makedirs(WWW + '/img', exist_ok=True)

# ── ۳) آیکون‌های adaptive foreground (کانواس 108dp) ──
# ناحیه امن: دایره 66/108 ≈ 61% — لوزی کشیده است پس ارتفاع 60% امن است
for dpi, px in [('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)]:
    d = os.path.join(RES, 'mipmap-' + dpi)
    os.makedirs(d, exist_ok=True)
    fg = fit(dia, px, 0.60)
    fg.save(d + '/ic_launcher_fg.png')
    # legacy: پس‌زمینه تیره + لوزی بزرگ‌تر (بدون ماسک لانچر)
    leg = fit(dia, px, 0.78)
    with_bg(leg, corner + (255,)).convert('RGBA').save(d + '/ic_launcher.png')
    with_bg(leg, corner + (255, ), rounded=True).save(d + '/ic_launcher_round.png')

# ── ۴) لوگوی درون‌اپ (شفاف، ۵۱۲px) ──
fit(dia, 512, 0.94).save(WWW + '/img/logo.png')

# ── ۵) پیش‌نمایش برای بازبینی ──
prev = Image.new('RGBA', (1100, 480), (11, 17, 32, 255))
x = 30
for img in [fit(dia, 432, 0.60), with_bg(fit(dia, 432, 0.78), corner + (255,), rounded=True), fit(dia, 432, 0.94)]:
    prev.alpha_composite(img.resize((432, 432), Image.LANCZOS), (x, 24))
    x += 460
prev.convert('RGB').save('/home/z/my-project/finova/icon_preview.png')
print('OK — icons generated')
