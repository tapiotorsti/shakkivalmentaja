import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
LIGHT, DARK = (228, 234, 239), (126, 152, 174)
FONT = "C:/Windows/Fonts/seguisym.ttf"


def icon(size, pad_ratio=0.0):
    img = Image.new("RGB", (size, size), DARK)
    d = ImageDraw.Draw(img)
    # 4x4-ruudukko taustaksi
    n = 4
    s = size / n
    for r in range(n):
        for c in range(n):
            if (r + c) % 2 == 0:
                d.rectangle([c * s, r * s, (c + 1) * s, (r + 1) * s], fill=LIGHT)
    # keskelle valkea ratsu tummalla ääriviivalla, pyöreällä taustalla
    cx = cy = size / 2
    rad = size * (0.36 - pad_ratio * 0.5)
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(31, 78, 121))
    font = ImageFont.truetype(FONT, int(rad * 1.45))
    glyph = "\u265E"
    d.text((cx, cy + rad * 0.02), glyph, font=font, anchor="mm", fill=(253, 253, 248),
           stroke_width=max(2, size // 90), stroke_fill=(20, 32, 43))
    return img


icon(192).save(f"{out}/icon-192.png")
icon(512).save(f"{out}/icon-512.png")
icon(180).save(f"{out}/apple-touch-icon.png")
print("ok")
