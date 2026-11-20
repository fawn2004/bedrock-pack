"""Procedural 16x16 textures for the More Building Blocks pack.

All textures are generated from scratch (no vanilla assets), so the pack
is fully original.
"""
import random
from PIL import Image

S = 16


def clamp(v):
    return max(0, min(255, int(v)))


def shade(rgb, f):
    return tuple(clamp(c * f) for c in rgb[:3])


def mix(a, b, t):
    return tuple(clamp(a[i] * (1 - t) + b[i] * t) for i in range(3))


def jitter(rng, rgb, amt):
    return shade(rgb, 1 + rng.uniform(-amt, amt))


# ---------------------------------------------------------------- wood

def planks(base, seed):
    rng = random.Random(seed)
    img = Image.new("RGBA", (S, S))
    px = img.load()
    seams = [rng.randrange(2, 14) for _ in range(4)]
    for board in range(4):
        bshade = 1 + rng.uniform(-0.07, 0.07)
        for y in range(board * 4, board * 4 + 4):
            for x in range(S):
                c = shade(base, bshade)
                # grain streaks
                if rng.random() < 0.18:
                    c = shade(c, 0.88)
                c = jitter(rng, c, 0.04)
                if y == board * 4 + 3:  # gap between boards
                    c = shade(base, 0.62)
                if x == seams[board] and y != board * 4 + 3:
                    c = shade(base, 0.7)
                px[x, y] = c + (255,)
    return img


def door_half(base, seed, top, stone=False):
    """Door texture half. Top half has a window (transparent) for wood."""
    rng = random.Random(seed + (7 if top else 3))
    img = Image.new("RGBA", (S, S))
    px = img.load()
    frame = shade(base, 0.72)
    for y in range(S):
        for x in range(S):
            c = jitter(rng, base, 0.05)
            if rng.random() < 0.12:
                c = shade(c, 0.9)
            edge = x in (0, 15) or (top and y == 0) or (not top and y == 15)
            if edge:
                c = jitter(rng, frame, 0.04)
            px[x, y] = c + (255,)
    if top:
        if stone:
            # small slit window
            for y in range(3, 9):
                for x in range(6, 10):
                    px[x, y] = (0, 0, 0, 0)
            for y in range(2, 10):
                for x in (5, 10):
                    px[x, y] = frame + (255,)
            for x in range(5, 11):
                px[x, 2] = frame + (255,)
                px[x, 9] = frame + (255,)
        else:
            # 2x2 window panes
            for y in range(2, 12):
                for x in range(2, 14):
                    if x in (2, 13, 7, 8) or y in (2, 11, 6, 7):
                        px[x, y] = jitter(rng, frame, 0.03) + (255,)
                    else:
                        px[x, y] = (0, 0, 0, 0)
        # bottom rail of top half
        for x in range(S):
            px[x, 15] = shade(base, 0.85) + (255,)
    else:
        # recessed panels
        for (x0, y0, x1, y1) in ((3, 2, 12, 6), (3, 9, 12, 13)):
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if x in (x0, x1) or y in (y0, y1):
                        c = shade(base, 0.78 if (x == x0 or y == y0) else 1.12)
                    else:
                        c = jitter(rng, shade(base, 0.94), 0.04)
                    px[x, y] = c + (255,)
        # handle
        handle = (200, 190, 120) if not stone else (70, 70, 75)
        px[13, 1] = handle + (255,)
        px[13, 2] = shade(handle, 0.75) + (255,)
    return img


def door_item(top, bottom):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    t = top.resize((8, 8), Image.NEAREST)
    b = bottom.resize((8, 8), Image.NEAREST)
    img.paste(t, (4, 0))
    img.paste(b, (4, 8))
    return img


# --------------------------------------------------------------- stone

def noise_stone(base, seed, speck=0.08):
    rng = random.Random(seed)
    img = Image.new("RGBA", (S, S))
    px = img.load()
    for y in range(S):
        for x in range(S):
            c = jitter(rng, base, speck)
            if rng.random() < 0.08:
                c = shade(c, 0.85)
            px[x, y] = c + (255,)
    return img


def marble(base, vein, seed):
    rng = random.Random(seed)
    img = noise_stone(base, seed, 0.03)
    px = img.load()
    for _ in range(3):
        x = rng.uniform(0, S)
        dx = rng.uniform(-0.8, 0.8)
        for y in range(S):
            xi = int(x) % S
            px[xi, y] = jitter(rng, vein, 0.06) + (255,)
            if rng.random() < 0.35:
                px[(xi + 1) % S, y] = mix(vein, base, 0.5) + (255,)
            x += dx + rng.uniform(-0.7, 0.7)
    return img


def bricks(base, mortar, seed, rows=4):
    rng = random.Random(seed)
    img = Image.new("RGBA", (S, S))
    px = img.load()
    h = S // rows
    shades = {}
    for y in range(S):
        row = y // h
        off = 0 if row % 2 == 0 else 4
        for x in range(S):
            bx = ((x + off) % S) // 8
            key = (row, bx)
            if key not in shades:
                shades[key] = 1 + rng.uniform(-0.08, 0.08)
            if y % h == h - 1 or (x + off) % 8 == 7:
                c = jitter(rng, mortar, 0.04)
            else:
                c = jitter(rng, shade(base, shades[key]), 0.05)
                if (x + off) % 8 == 0 or y % h == 0:
                    c = shade(c, 1.08)
            px[x, y] = c + (255,)
    return img


def tiles(base, grout, seed):
    rng = random.Random(seed)
    img = Image.new("RGBA", (S, S))
    px = img.load()
    t = {}
    for y in range(S):
        for x in range(S):
            key = (x // 8, y // 8)
            if key not in t:
                t[key] = 1 + rng.uniform(-0.06, 0.06)
            if x % 8 in (0,) or y % 8 in (0,):
                c = jitter(rng, grout, 0.03)
            else:
                c = jitter(rng, shade(base, t[key]), 0.04)
                if x % 8 == 1 or y % 8 == 1:
                    c = shade(c, 1.1)
                if x % 8 == 7 or y % 8 == 7:
                    c = shade(c, 0.9)
            px[x, y] = c + (255,)
    return img


def polished(base, seed):
    rng = random.Random(seed)
    img = noise_stone(base, seed, 0.03)
    px = img.load()
    for i in range(S):
        for (x, y, f) in ((i, 0, 1.15), (0, i, 1.15), (i, 15, 0.8), (15, i, 0.8)):
            px[x, y] = jitter(rng, shade(base, f), 0.02) + (255,)
    return img
