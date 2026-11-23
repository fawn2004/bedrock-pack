"""Draws the launcher icon (a green block with a down arrow) at every density."""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

def draw(size):
    s = 4 * size  # supersample, then shrink for smooth edges
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = s * 0.06
    d.rounded_rectangle([m, m, s - m, s - m], radius=s * 0.2, fill=(60, 133, 39, 255))
    # dirt band at the bottom, like a block seen from the side
    d.rounded_rectangle([m, s * 0.62, s - m, s - m], radius=s * 0.2, fill=(121, 85, 58, 255))
    d.rectangle([m, s * 0.62, s - m, s * 0.75], fill=(121, 85, 58, 255))
    d.rectangle([m, s * 0.58, s - m, s * 0.64], fill=(45, 104, 28, 255))
    # white down arrow
    cx, w = s / 2, s * 0.11
    d.rectangle([cx - w, s * 0.2, cx + w, s * 0.5], fill="white")
    d.polygon([(cx - s * 0.25, s * 0.45), (cx + s * 0.25, s * 0.45), (cx, s * 0.72)], fill="white")
    return im.resize((size, size), Image.LANCZOS)

for dens, px in SIZES.items():
    out = os.path.join(HERE, "..", "res", f"mipmap-{dens}")
    os.makedirs(out, exist_ok=True)
    draw(px).save(os.path.join(out, "ic_launcher.png"))
