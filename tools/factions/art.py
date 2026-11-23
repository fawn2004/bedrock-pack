"""Textures for Factions Core: items, blocks, the crawler entity and UI panels."""
import random
from PIL import Image, ImageDraw, ImageFilter
import icons as I

ITEM = 32  # item textures are 32x32 (HD), drawn from the same art as the UI icons
BLOCK = 32

RARITY_RGB = {
    "common": (225, 230, 240), "rare": (80, 150, 255), "epic": (175, 90, 255),
    "legendary": (255, 190, 40), "mythic": (255, 70, 70),
}

SPAWNER_COLORS = {
    "pig": (240, 150, 160), "chicken": (250, 250, 250), "cow": (120, 85, 60), "zombie": (90, 170, 90),
    "spider": (150, 40, 40), "skeleton": (220, 220, 210), "creeper": (80, 220, 80), "blaze": (255, 170, 40),
    "enderman": (190, 80, 255), "iron_golem": (210, 200, 190),
}

CRAWLER_COLORS = {
    "coal": ((95, 98, 108), (45, 47, 55), (30, 30, 34)),
    "iron": ((215, 205, 195), (150, 140, 132), (230, 190, 160)),
    "gold": ((255, 215, 80), (200, 140, 30), (255, 240, 120)),
    "diamond": ((110, 235, 230), (40, 160, 170), (180, 255, 250)),
    "emerald": ((80, 225, 120), (25, 140, 60), (150, 255, 170)),
    "netherite": ((85, 70, 80), (45, 35, 42), (170, 120, 255)),
}


def small(icon64, size=ITEM):
    return icon64.resize((size, size), Image.LANCZOS)


def item_textures(ic):
    out = {"crystal": ic["crystal"], "bank_note": ic["note"], "sell_wand": ic["sell_wand"], "genbucket": ic["genbucket"],
           "genbucket_obsidian": ic["genbucket_obsidian"], "genbucket_sand": ic["genbucket_sand"], "chunk_buster": ic["chunk_buster"],
           "xp_shard": ic["xp_shard"], "power_shard": ic["power_shard"], "mystery_spawner": ic["mystery_spawner"], "menu": ic["menu"]}
    for r in RARITY_RGB:
        out[f"key_{r}"] = ic[f"key_{r}"]
        out[f"book_{r}"] = ic[f"book_{r}"]
    for t in (1, 2, 3, 4):
        out[f"boss_egg_{t}"] = ic[f"boss_egg_{t}"]
    for t, (a, b, eye) in CRAWLER_COLORS.items():
        out[f"crawler_{t}"] = I.robot((a, b), (tuple(min(255, c + 60) for c in eye), eye)).done()
    return {k: small(v) for k, v in out.items()}


# ---------------------------------------------------------------- blocks

def noise_fill(img, box, base, var=10, seed=1):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = box
    for y in range(y0, y1):
        for x in range(x0, x1):
            d = rnd.randint(-var, var)
            img.putpixel((x, y), tuple(max(0, min(255, c + d)) for c in base) + (255,))


def spawner_texture(mob):
    s = BLOCK
    img = Image.new("RGBA", (s, s))
    noise_fill(img, (0, 0, s, s), (18, 20, 30), 4, sum(map(ord, mob)))
    glow = SPAWNER_COLORS[mob]
    # glowing core
    g = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for r, a in ((13, 60), (10, 110), (7, 180), (4, 255)):
        gd.ellipse((16 - r, 16 - r, 15 + r, 15 + r), fill=glow + (a,))
    img.alpha_composite(g)
    d = ImageDraw.Draw(img)
    bar, hi, lo = (120, 128, 148, 255), (190, 198, 215, 255), (60, 64, 78, 255)
    for x in (0, 7, 15, 23, 31):
        d.line([(x, 0), (x, s - 1)], fill=bar)
        d.line([(x + 1 if x < 31 else x - 1, 0), (x + 1 if x < 31 else x - 1, s - 1)], fill=lo)
    for y in (0, 10, 21, 31):
        d.line([(0, y), (s - 1, y)], fill=bar)
        d.line([(0, y + 1 if y < 31 else y - 1), (s - 1, y + 1 if y < 31 else y - 1)], fill=lo)
    d.rectangle((0, 0, s - 1, s - 1), outline=hi)
    d.rectangle((1, 1, s - 2, s - 2), outline=lo)
    return img


def crate_textures(rarity):
    s = BLOCK
    trim = RARITY_RGB[rarity]
    dark = tuple(int(c * 0.55) for c in trim)

    def planks(seed):
        img = Image.new("RGBA", (s, s))
        rnd = random.Random(seed)
        for row in range(4):
            base = (120 + rnd.randint(-8, 8), 78 + rnd.randint(-6, 6), 42)
            noise_fill(img, (0, row * 8, s, row * 8 + 8), base, 7, seed + row)
            d = ImageDraw.Draw(img)
            d.line([(0, row * 8 + 7), (s, row * 8 + 7)], fill=(70, 44, 22, 255))
        return img

    def frame(img):
        d = ImageDraw.Draw(img)
        d.rectangle((0, 0, s - 1, s - 1), outline=dark + (255,), width=3)
        d.rectangle((1, 1, s - 2, s - 2), outline=trim + (255,), width=1)
        for cx, cy in ((3, 3), (s - 4, 3), (3, s - 4), (s - 4, s - 4)):
            d.rectangle((cx - 2, cy - 2, cx + 2, cy + 2), fill=trim + (255,))
            d.point((cx - 1, cy - 1), fill=(255, 255, 255, 255))
        return d

    side = planks(7)
    d = frame(side)
    d.rectangle((12, 10, 19, 21), fill=dark + (255,))
    d.rectangle((13, 11, 18, 20), fill=trim + (255,))
    d.rectangle((15, 14, 16, 17), fill=(20, 20, 30, 255))
    top = planks(11)
    d = frame(top)
    gem = [(16, 8), (23, 16), (16, 24), (9, 16)]
    d.polygon(gem, fill=trim + (255,), outline=(20, 20, 30, 255))
    d.line([(16, 10), (13, 16)], fill=(255, 255, 255, 255))
    bottom = planks(13)
    frame(bottom)
    return side, top, bottom


def supply_textures():
    s = BLOCK
    side = Image.new("RGBA", (s, s))
    noise_fill(side, (0, 0, s, s), (200, 205, 215), 6, 3)
    d = ImageDraw.Draw(side)
    for k in range(-s, s * 2, 8):
        d.line([(k, s), (k + s, 0)], fill=(150, 70, 230, 255), width=3)
    d.rectangle((4, 4, s - 5, s - 5), outline=(90, 95, 110, 255), width=2)
    d.rectangle((0, 0, s - 1, s - 1), outline=(60, 62, 75, 255), width=2)
    top = Image.new("RGBA", (s, s))
    noise_fill(top, (0, 0, s, s), (190, 195, 205), 6, 5)
    d = ImageDraw.Draw(top)
    d.rectangle((0, 0, s - 1, s - 1), outline=(60, 62, 75, 255), width=2)
    d.ellipse((9, 9, 22, 22), fill=(170, 100, 255, 255), outline=(255, 255, 255, 255))
    d.ellipse((13, 13, 18, 18), fill=(255, 255, 255, 255))
    return side, top


# ---------------------------------------------------------------- crawler entity

# Box UV layout used by geometry in build.py: name -> (u, v, w, h, d)
CRAWLER_BOXES = {
    "tread": (0, 0, 3, 4, 14),
    "chassis": (0, 18, 8, 4, 12),
    "cab": (0, 34, 6, 5, 6),
    "antenna": (24, 34, 1, 4, 1),
    "drill_base": (34, 0, 5, 5, 3),
    "drill_mid": (34, 8, 3, 3, 3),
    "drill_tip": (50, 0, 1, 1, 2),
    "lamp": (28, 34, 2, 2, 2),
}


def faces(u, v, w, h, d):
    """Rectangles of each face of a Bedrock box UV."""
    return {
        "top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d),
        "east": (u, v + d, d, h), "north": (u + d, v + d, w, h),
        "west": (u + d + w, v + d, d, h), "south": (u + 2 * d + w, v + d, w, h),
    }


def crawler_texture(tier):
    main, shade, accent = CRAWLER_COLORS[tier]
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    rnd = random.Random(tier)

    def paint(name, color, var=8, edge=True):
        u, v, w, h, d = CRAWLER_BOXES[name]
        for face, (x, y, fw, fh) in faces(u, v, w, h, d).items():
            c = color if face not in ("bottom",) else tuple(int(k * 0.6) for k in color)
            if face in ("east", "west", "south"):
                c = tuple(int(k * 0.82) for k in c)
            for yy in range(y, y + fh):
                for xx in range(x, x + fw):
                    dd = rnd.randint(-var, var)
                    img.putpixel((xx, yy), tuple(max(0, min(255, k + dd)) for k in c) + (255,))
            if edge and fw > 2 and fh > 2:
                dr = ImageDraw.Draw(img)
                dr.rectangle((x, y, x + fw - 1, y + fh - 1), outline=tuple(int(k * 0.55) for k in c) + (255,))

    paint("tread", (40, 42, 50), 5)
    u, v, w, h, d = CRAWLER_BOXES["tread"]
    dr = ImageDraw.Draw(img)
    for face, (x, y, fw, fh) in faces(u, v, w, h, d).items():
        if face in ("east", "west", "top", "bottom"):
            for k in range(0, fw if face in ("east", "west") else fh, 2):
                if face in ("east", "west"):
                    dr.line([(x + k, y), (x + k, y + fh - 1)], fill=(80, 84, 96, 255))
                else:
                    dr.line([(x, y + k), (x + fw - 1, y + k)], fill=(80, 84, 96, 255))
    paint("chassis", main)
    # hazard stripe on the chassis sides
    u, v, w, h, d = CRAWLER_BOXES["chassis"]
    for face, (x, y, fw, fh) in faces(u, v, w, h, d).items():
        if face in ("east", "west"):
            for k in range(fw):
                img.putpixel((x + k, y + fh - 2), (255, 200, 40, 255) if (k // 2) % 2 == 0 else (30, 30, 30, 255))
    paint("cab", shade)
    # visor with glowing eyes on the cab front (north face)
    u, v, w, h, d = CRAWLER_BOXES["cab"]
    x, y, fw, fh = faces(u, v, w, h, d)["north"]
    dr.rectangle((x, y + 1, x + fw - 1, y + 3), fill=(15, 18, 28, 255))
    for ex in (x + 1, x + fw - 2):
        img.putpixel((ex, y + 2), accent + (255,))
    paint("antenna", (170, 175, 190), 4, False)
    paint("lamp", accent, 4, False)
    paint("drill_base", (150, 155, 170), 6)
    paint("drill_mid", (185, 190, 205), 6)
    paint("drill_tip", accent, 3, False)
    # spiral lines on the drill
    for name in ("drill_base", "drill_mid"):
        u, v, w, h, d = CRAWLER_BOXES[name]
        for face, (x, y, fw, fh) in faces(u, v, w, h, d).items():
            if face in ("top", "bottom", "east", "west"):
                for k in range(0, max(fw, fh), 2):
                    if face in ("east", "west") and k < fw:
                        img.putpixel((x + k, y + (k % fh)), (90, 95, 110, 255))
    return img


def blank(size=16):
    return Image.new("RGBA", (size, size), (0, 0, 0, 0))


# ---------------------------------------------------------------- UI panels

NAVY_TOP = (16, 34, 70)
NAVY_BOT = (9, 20, 44)
EDGE = (70, 190, 255)
EDGE_DIM = (32, 92, 160)


def vgrad(img, box, top, bottom, alpha=255):
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)
    for y in range(y0, y1):
        t = (y - y0) / max(1, y1 - y0 - 1)
        d.line([(x0, y), (x1 - 1, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (alpha,))


def ui_panel():
    """Main window: navy gradient, cyan edge, bright corner brackets. 32px, nineslice 8."""
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    vgrad(img, (0, 0, 32, 32), NAVY_TOP, NAVY_BOT, 245)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 31, 31), outline=EDGE_DIM + (255,))
    d.rectangle((2, 2, 29, 29), outline=(22, 52, 100, 255))
    c = EDGE + (255,)
    for (x, y, dx, dy) in ((0, 0, 1, 1), (31, 0, -1, 1), (0, 31, 1, -1), (31, 31, -1, -1)):
        d.line([(x, y), (x + dx * 6, y)], fill=c, width=1)
        d.line([(x, y), (x, y + dy * 6)], fill=c, width=1)
        d.line([(x + dx, y + dy), (x + dx * 5, y + dy)], fill=c)
        d.line([(x + dx, y + dy), (x + dx, y + dy * 5)], fill=c)
    return img


def ui_box(fill_top, fill_bot, edge, size=16, inner=None, accent=None, alpha=255):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    vgrad(img, (0, 0, size, size), fill_top, fill_bot, alpha)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, size - 1, size - 1), outline=edge + (255,))
    if inner:
        d.rectangle((1, 1, size - 2, size - 2), outline=inner + (255,))
    if accent:
        d.line([(1, 2), (1, size - 3)], fill=accent + (255,))
        d.line([(2, 2), (2, size - 3)], fill=accent + (160,))
    return img


def ui_close(hover=False):
    img = ui_box((120, 30, 40) if hover else (60, 24, 40), (80, 15, 25) if hover else (35, 14, 26), (255, 110, 110) if hover else (200, 70, 90))
    d = ImageDraw.Draw(img)
    c = (255, 255, 255, 255)
    d.line([(4, 4), (11, 11)], fill=c, width=2)
    d.line([(11, 4), (4, 11)], fill=c, width=2)
    return img


def ui_textures():
    return {
        "panel": (ui_panel(), 8, 32),
        "inner": (ui_box((12, 26, 54), (8, 18, 40), EDGE_DIM, inner=(18, 40, 78), alpha=235), 4, 16),
        "card": (ui_box((20, 44, 88), (12, 28, 60), (48, 110, 190), inner=(26, 58, 110), accent=(70, 190, 255)), 4, 16),
        "card_hover": (ui_box((30, 70, 130), (18, 44, 90), (110, 210, 255), inner=(40, 90, 160), accent=(150, 230, 255)), 4, 16),
        "btn": (ui_box((22, 50, 98), (14, 32, 66), (52, 115, 200), inner=(28, 64, 120)), 4, 16),
        "btn_hover": (ui_box((34, 80, 145), (20, 52, 100), (120, 215, 255), inner=(50, 110, 180), accent=(150, 230, 255)), 4, 16),
        "btn_press": (ui_box((10, 26, 52), (8, 18, 40), (90, 180, 240), inner=(20, 44, 84)), 4, 16),
        "header": (ui_box((20, 46, 92), (12, 28, 60), (40, 100, 175), inner=(26, 60, 112)), 4, 16),
        "hud_panel": (ui_box((12, 26, 54), (8, 18, 40), (60, 170, 240), inner=(20, 46, 88), alpha=200), 4, 16),
        "close": (ui_close(False), 0, 16),
        "close_hover": (ui_close(True), 0, 16),
    }
