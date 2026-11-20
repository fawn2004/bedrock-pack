"""Procedural 16x16 textures for the More Building Blocks pack (v2).

Everything is generated from scratch with seeded, tileable value noise,
so the pack contains no vanilla assets.
"""
import math
import random
from PIL import Image

S = 16


# ------------------------------------------------------------ colour utils

def clamp(v):
    return max(0, min(255, int(round(v))))


def shade(rgb, f):
    return tuple(clamp(c * f) for c in rgb[:3])


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(clamp(a[i] * (1 - t) + b[i] * t) for i in range(3))


def lighten(rgb, t):
    return mix(rgb, (255, 255, 255), t)


def darken(rgb, t):
    return mix(rgb, (0, 0, 0), t)


def hue_shift(rgb, warm):
    """warm > 0 pushes toward yellow/red, < 0 toward blue."""
    r, g, b = rgb
    return (clamp(r + 18 * warm), clamp(g + 6 * warm), clamp(b - 18 * warm))


# ------------------------------------------------------------ noise

class Noise:
    """Tileable multi-octave value noise on a 16x16 grid."""

    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.grids = {}

    def _grid(self, n):
        if n not in self.grids:
            self.grids[n] = [[self.rng.random() for _ in range(n)] for _ in range(n)]
        return self.grids[n]

    def value(self, x, y, cells):
        g = self._grid(cells)
        fx, fy = x / S * cells, y / S * cells
        x0, y0 = int(math.floor(fx)), int(math.floor(fy))
        tx, ty = fx - x0, fy - y0
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a = g[y0 % cells][x0 % cells]
        b = g[y0 % cells][(x0 + 1) % cells]
        c = g[(y0 + 1) % cells][x0 % cells]
        d = g[(y0 + 1) % cells][(x0 + 1) % cells]
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty

    def fbm(self, x, y, octaves=((2, 0.5), (4, 0.3), (8, 0.2))):
        return sum(self.value(x, y, c) * w for c, w in octaves) / sum(w for _, w in octaves)


def new():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


def put(px, x, y, rgb, a=255):
    px[x % S, y % S] = tuple(rgb[:3]) + (a,)


# ------------------------------------------------------------ wood

def planks(base, seed, knotty=True):
    """Four boards with flowing grain, staggered joints, knots and nails."""
    rng = random.Random(seed)
    nz = Noise(seed)
    img = new()
    px = img.load()
    dark, light = darken(base, 0.38), lighten(base, 0.12)
    for board in range(4):
        y0 = board * 4
        tone = 1 + rng.uniform(-0.08, 0.08)
        warm = rng.uniform(-0.3, 0.3)
        seam = rng.randrange(1, 15)
        phase = rng.uniform(0, 6.3)
        freq = rng.uniform(0.35, 0.6)
        for y in range(y0, y0 + 4):
            for x in range(S):
                c = hue_shift(shade(base, tone), warm)
                # flowing grain lines
                g = math.sin(x * freq + phase + (y - y0) * 1.7 + nz.value(x, y, 4) * 3)
                if g > 0.75:
                    c = shade(c, 0.86)
                elif g < -0.85:
                    c = shade(c, 1.06)
                c = shade(c, 0.94 + nz.value(x, y, 8) * 0.12)
                if y == y0:                       # top edge catches light
                    c = mix(c, light, 0.35)
                if y == y0 + 3:                   # gap between boards
                    c = mix(c, dark, 0.75)
                if x == seam and y != y0 + 3:     # end joint
                    c = mix(c, dark, 0.6)
                if x == (seam + 1) % S and y != y0 + 3:
                    c = mix(c, light, 0.25)
                put(px, x, y, c)
        # nails beside the joint
        if rng.random() < 0.7:
            for nx in ((seam - 1) % S, (seam + 2) % S):
                put(px, nx, y0 + 1, mix(base, dark, 0.7))
        # knot
        if knotty and rng.random() < 0.3:
            kx = rng.randrange(2, 14)
            put(px, kx, y0 + 1, mix(base, dark, 0.55))
            put(px, kx + 1, y0 + 1, mix(base, dark, 0.4))
            put(px, kx, y0 + 2, mix(base, dark, 0.35))
    return img


def bark(bark_col, seed, style="furrow"):
    """Log side: vertical furrows (or rings for palm-like wood)."""
    rng = random.Random(seed)
    nz = Noise(seed + 1)
    img = new()
    px = img.load()
    dark, light = darken(bark_col, 0.45), lighten(bark_col, 0.18)
    ridges = [rng.uniform(0, 6.3) for _ in range(3)]
    for y in range(S):
        for x in range(S):
            n = nz.fbm(x, y, ((2, 0.4), (4, 0.35), (16, 0.25)))
            c = shade(bark_col, 0.85 + n * 0.3)
            if style == "furrow":
                w = math.sin(x * 1.25 + ridges[0] + math.sin(y * 0.4 + ridges[1]) * 1.3)
                if w > 0.55:
                    c = mix(c, dark, 0.55)
                elif w < -0.6:
                    c = mix(c, light, 0.3)
                if nz.value(x, y, 16) > 0.82:
                    c = mix(c, dark, 0.4)
            elif style == "rings":       # palm: horizontal scaly rings
                if (y + (x // 4) % 2) % 4 == 0:
                    c = mix(c, dark, 0.55)
                elif (y + (x // 4) % 2) % 4 == 1:
                    c = mix(c, light, 0.3)
            elif style == "smooth":      # pale smooth bark with dark marks
                if nz.value(x, y, 8) > 0.78:
                    c = mix(c, dark, 0.6)
                if rng.random() < 0.04:
                    c = mix(c, dark, 0.3)
            put(px, x, y, c)
    return img


def stripped_side(base, seed):
    nz = Noise(seed + 2)
    img = new()
    px = img.load()
    dark = darken(base, 0.3)
    for y in range(S):
        for x in range(S):
            c = shade(base, 0.92 + nz.value(x, y, 8) * 0.14)
            g = math.sin(x * 2.1 + nz.value(x, y, 2) * 4)
            if g > 0.8:
                c = mix(c, dark, 0.3)
            put(px, x, y, c)
    return img


def log_top(base, bark_col, seed, with_bark=True):
    """Log end: concentric rings inside a bark border."""
    nz = Noise(seed + 3)
    img = new()
    px = img.load()
    dark, light = darken(base, 0.3), lighten(base, 0.1)
    cx = cy = 7.5
    for y in range(S):
        for x in range(S):
            dx, dy = x - cx, y - cy
            r = max(abs(dx), abs(dy)) * 0.6 + math.hypot(dx, dy) * 0.4
            r += (nz.value(x, y, 4) - 0.5) * 1.2
            c = shade(base, 0.95 + nz.value(x, y, 8) * 0.1)
            ring = r % 2.6
            if ring < 0.8:
                c = mix(c, dark, 0.4)
            elif ring > 2.0:
                c = mix(c, light, 0.25)
            if r < 1.2:
                c = mix(c, dark, 0.35)
            edge = min(x, y, 15 - x, 15 - y)
            if edge == 0:
                c = shade(bark_col, 0.9 + nz.value(x, y, 16) * 0.2) if with_bark else mix(c, dark, 0.35)
            elif edge == 1 and with_bark:
                c = mix(c, darken(bark_col, 0.3), 0.5)
            put(px, x, y, c)
    return img


# ------------------------------------------------------------ doors

def door_half(base, seed, top, stone=False, metal=(196, 180, 110)):
    rng = random.Random(seed + (7 if top else 3))
    nz = Noise(seed + (11 if top else 5))
    img = new()
    px = img.load()
    dark, light = darken(base, 0.4), lighten(base, 0.15)
    frame = darken(base, 0.22)
    for y in range(S):
        for x in range(S):
            if stone:
                c = shade(base, 0.9 + nz.fbm(x, y) * 0.2)
            else:  # vertical boards
                c = shade(base, 0.93 + nz.value(x, y, 8) * 0.12)
                if x % 4 == 3:
                    c = mix(c, dark, 0.45)
                if math.sin(y * 0.9 + x * 3 + nz.value(x, y, 4) * 3) > 0.85:
                    c = shade(c, 0.9)
            edge = x in (0, 15) or (top and y == 0) or (not top and y == 15)
            if edge:
                c = shade(frame, 0.95 + nz.value(x, y, 16) * 0.1)
            put(px, x, y, c)
    if top:
        if stone:
            win = [(x, y) for x in range(6, 10) for y in range(3, 10)]
            for x in range(5, 11):
                for y in range(2, 11):
                    put(px, x, y, mix(frame, light, 0.15))
            for (x, y) in win:
                px[x, y] = (0, 0, 0, 0)
            for y in range(3, 10):          # iron bars
                put(px, 7, y, (64, 64, 70))
            for x in range(6, 10):
                put(px, x, 6, (64, 64, 70))
        else:
            for y in range(2, 12):
                for x in range(2, 14):
                    if x in (2, 13) or y in (2, 11):
                        put(px, x, y, mix(frame, light, 0.1))
                    elif x in (7, 8) or y in (6, 7):
                        put(px, x, y, frame)
                    else:
                        px[x, y] = (0, 0, 0, 0)
        for x in range(1, 15):
            put(px, x, 14, mix(base, light, 0.4))
            put(px, x, 15, frame)
        hinge_rows = (3,)
    else:
        for x in range(1, 15):
            put(px, x, 0, frame)
            put(px, x, 1, mix(base, light, 0.35))
        for (x0, y0, x1, y1) in ((3, 3, 12, 7), (3, 9, 12, 13)):
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if x == x0 or y == y0:
                        c = mix(base, dark, 0.45)
                    elif x == x1 or y == y1:
                        c = mix(base, light, 0.35)
                    else:
                        c = shade(base, 0.9 + nz.value(x, y, 8) * 0.1)
                        if stone and (x + y) % 5 == 0:
                            c = mix(c, light, 0.12)
                    put(px, x, y, c)
        put(px, 13, 1, metal)               # handle
        put(px, 13, 2, darken(metal, 0.3))
        put(px, 12, 1, darken(metal, 0.4))
        hinge_rows = (12,)
    for hy in hinge_rows:                   # hinge plates
        for dy in range(2):
            put(px, 0, hy + dy, darken(metal, 0.45))
            put(px, 1, hy + dy, darken(metal, 0.2))
    return img


def door_item(top, bottom):
    img = new()
    img.paste(top.resize((8, 8), Image.NEAREST), (4, 0))
    img.paste(bottom.resize((8, 8), Image.NEAREST), (4, 8))
    return img


# ------------------------------------------------------------ stone

def mottled(base, seed, contrast=0.22, speck=0.0, speck_col=None, warm=0.0):
    rng = random.Random(seed)
    nz = Noise(seed)
    img = new()
    px = img.load()
    for y in range(S):
        for x in range(S):
            n = nz.fbm(x, y, ((2, 0.35), (4, 0.35), (8, 0.2), (16, 0.1)))
            c = shade(base, 1 - contrast / 2 + n * contrast)
            c = hue_shift(c, warm * (n - 0.5) * 2)
            if speck and rng.random() < speck:
                c = speck_col or darken(base, 0.4)
            put(px, x, y, c)
    return img


def marble(base, vein, seed):
    nz = Noise(seed)
    nz2 = Noise(seed + 9)
    img = mottled(base, seed, 0.08)
    px = img.load()
    for y in range(S):
        for x in range(S):
            t = math.sin((x + y) * math.tau / S + nz.fbm(x, y, ((2, 0.6), (4, 0.4))) * 5)
            if abs(t) < 0.16:
                put(px, x, y, mix(px[x, y], vein, 0.9))
            elif abs(t) < 0.36:
                put(px, x, y, mix(px[x, y], vein, 0.35))
            # faint secondary veins
            t2 = math.sin((2 * x - y) * math.tau / S + nz2.fbm(x, y) * 6)
            if abs(t2) < 0.1:
                put(px, x, y, mix(px[x, y], vein, 0.5))
    return img


def _bevel_block(px, nz, base, x0, y0, w, h, rng, mortar, chips=True):
    tone = 1 + rng.uniform(-0.1, 0.1)
    warm = rng.uniform(-0.4, 0.4)
    light, dark = lighten(base, 0.18), darken(base, 0.25)
    for yy in range(h):
        for xx in range(w):
            x, y = (x0 + xx) % S, (y0 + yy) % S
            c = hue_shift(shade(base, tone * (0.9 + nz.fbm(x, y) * 0.2)), warm)
            if yy == 0 or xx == 0:
                c = mix(c, light, 0.45)
            elif yy == h - 1 or xx == w - 1:
                c = mix(c, dark, 0.45)
            put(px, x, y, c)
    if chips and rng.random() < 0.45:      # a chipped corner
        cx = x0 + (w - 1 if rng.random() < 0.5 else 0)
        cy = y0 + (h - 1 if rng.random() < 0.5 else 0)
        put(px, cx, cy, mortar)
    if chips and rng.random() < 0.25 and w > 4:   # hairline crack
        cx, cy = x0 + rng.randrange(2, w - 2), y0 + 1
        for i in range(h - 2):
            put(px, cx + (i % 2), cy + i, mix(base, dark, 0.8))


def bricks(base, mortar, seed, rows=4, brick_w=8):
    rng = random.Random(seed)
    nz = Noise(seed)
    img = new()
    px = img.load()
    for y in range(S):
        for x in range(S):
            put(px, x, y, shade(mortar, 0.9 + nz.value(x, y, 16) * 0.2))
    h = S // rows
    for row in range(rows):
        off = 0 if row % 2 == 0 else brick_w // 2
        for col in range(S // brick_w):
            _bevel_block(px, nz, base, col * brick_w + off, row * h, brick_w - 1, h - 1, rng, mortar)
    return img


def tiles(base, grout, seed, n=2):
    rng = random.Random(seed)
    nz = Noise(seed)
    img = new()
    px = img.load()
    for y in range(S):
        for x in range(S):
            put(px, x, y, grout)
    size = S // n
    for ty in range(n):
        for tx in range(n):
            _bevel_block(px, nz, base, tx * size + 1, ty * size + 1, size - 1, size - 1, rng, grout,
                         chips=False)
    return img


def polished(base, seed):
    nz = Noise(seed)
    img = new()
    px = img.load()
    light, dark = lighten(base, 0.22), darken(base, 0.3)
    for y in range(S):
        for x in range(S):
            c = shade(base, 0.95 + nz.fbm(x, y) * 0.1)
            # diagonal sheen
            if 10 <= (x + y) <= 12:
                c = mix(c, light, 0.25)
            if (x + y) == 6:
                c = mix(c, light, 0.12)
            if x == 0 or y == 0:
                c = mix(c, light, 0.5)
            elif x == 15 or y == 15:
                c = mix(c, dark, 0.5)
            elif x == 1 or y == 1:
                c = mix(c, light, 0.15)
            put(px, x, y, c)
    return img


def travertine(base, seed):
    rng = random.Random(seed)
    nz = Noise(seed)
    img = new()
    px = img.load()
    dark = darken(base, 0.35)
    for y in range(S):
        for x in range(S):
            band = math.sin(y * 1.1 + nz.value(x, y, 4) * 3)
            c = shade(base, 0.92 + nz.fbm(x, y) * 0.16 + band * 0.04)
            c = hue_shift(c, band * 0.3)
            put(px, x, y, c)
    for _ in range(9):                       # pits
        x, y = rng.randrange(S), rng.randrange(S)
        put(px, x, y, dark)
        if rng.random() < 0.5:
            put(px, x + 1, y, mix(base, dark, 0.6))
    # faint slab joint like real cut travertine
    for x in range(S):
        put(px, x, 7, mix(px[x, 7], dark, 0.35))
    return img


def gabbro(base, mortar, seed):
    """Speckled dark stone cut into large bricks."""
    img = bricks(base, mortar, seed, rows=2)
    rng = random.Random(seed + 5)
    px = img.load()
    for y in range(S):
        for x in range(S):
            if px[x, y][:3] != tuple(mortar) and rng.random() < 0.12:
                put(px, x, y, lighten(base, rng.uniform(0.25, 0.45)))
    return img


def shale_bricks(base, mortar, seed):
    """Thin stacked bricks."""
    return bricks(base, mortar, seed, rows=8, brick_w=8)


def chalk_tiles(base, grout, seed):
    img = tiles(base, grout, seed, n=4)
    nz = Noise(seed + 3)
    px = img.load()
    for y in range(S):
        for x in range(S):
            if px[x, y][:3] != tuple(grout) and nz.value(x, y, 16) > 0.85:
                put(px, x, y, darken(base, 0.08))
    return img


# ------------------------------------------------------------ leaves

def leaves(base, seed, dark=False):
    """Leaf block with see-through gaps, lit tops and shaded undersides."""
    rng = random.Random(seed + (31 if dark else 13))
    nz = Noise(seed + (37 if dark else 17))
    img = new()
    px = img.load()
    col = darken(base, 0.28) if dark else base
    light, shadow = lighten(col, 0.22), darken(col, 0.35)
    hole = 0.24 if dark else 0.3
    for y in range(S):
        for x in range(S):
            n = nz.fbm(x, y, ((4, 0.5), (8, 0.3), (16, 0.2)))
            if n < hole and rng.random() < 0.85:
                px[x, y] = (0, 0, 0, 0)
                continue
            c = shade(col, 0.85 + n * 0.3)
            c = hue_shift(c, (nz.value(x, y, 2) - 0.5) * 0.8)
            put(px, x, y, c)
    # light on the top edge of each clump, shadow underneath
    src = img.copy().load()
    for y in range(S):
        for x in range(S):
            if src[x, y][3] == 0:
                continue
            above, below = src[x, (y - 1) % S][3], src[x, (y + 1) % S][3]
            if above == 0:
                put(px, x, y, mix(src[x, y], light, 0.5))
            elif below == 0:
                put(px, x, y, mix(src[x, y], shadow, 0.5))
    # a few single-leaf sparkles
    for _ in range(6):
        x, y = rng.randrange(S), rng.randrange(S)
        if px[x, y][3]:
            put(px, x, y, lighten(col, 0.35))
    return img
