"""Builds dist/FactionsCore.mcpack from packs/FactionsCore_BP.

The scripts are hand-written (packs/FactionsCore_BP/scripts), so this only
draws the pack icon if it is missing and zips the pack.
    python3 tools/build_factions.py
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BP = os.path.join(ROOT, "packs", "FactionsCore_BP")
DIST = os.path.join(ROOT, "dist")


def draw_icon(path):
    from PIL import Image, ImageDraw

    s = 256
    img = Image.new("RGBA", (s, s), (40, 20, 24, 255))
    d = ImageDraw.Draw(img)
    # Banner on a pole.
    d.rectangle([60, 30, 72, 230], fill=(120, 85, 50, 255))
    d.polygon([(72, 40), (210, 40), (210, 170), (141, 140), (72, 170)], fill=(170, 30, 40, 255))
    d.polygon([(72, 40), (210, 40), (210, 52), (72, 52)], fill=(230, 180, 60, 255))
    # Crossed swords on the banner.
    for a, b in (((100, 70), (180, 130)), ((180, 70), (100, 130))):
        d.line([a, b], fill=(225, 225, 235, 255), width=9)
    d.ellipse([128, 88, 154, 114], fill=(230, 180, 60, 255))
    img.save(path)


def main():
    icon = os.path.join(BP, "pack_icon.png")
    if not os.path.exists(icon):
        draw_icon(icon)
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "FactionsCore.mcpack")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(BP):
            for name in sorted(files):
                full = os.path.join(base, name)
                z.write(full, os.path.relpath(full, BP))
    print("wrote", os.path.relpath(out, ROOT))


if __name__ == "__main__":
    main()
