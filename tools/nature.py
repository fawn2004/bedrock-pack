"""Procedural trees, bushes and rocks saved as Bedrock .mcstructure files.

Each structure goes to   BP/structures/mbb/<name>.mcstructure   (load it with
/structure load mbb:<name> ...) and gets a helper function
BP/functions/mbb/<group>/<name>.mcfunction that loads it centred on the
player (/function mbb/trees/maple_large).
"""
import io
import math
import os
import random
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

NS = "mbb"
BLOCK_VERSION = 18168832  # 1.21.60; the game upgrades older palette entries itself

# ======================================================================== NBT
# Minimal little-endian NBT writer (the format .mcstructure files use).

TAG_BYTE, TAG_INT, TAG_STRING, TAG_LIST, TAG_COMPOUND = 1, 3, 8, 9, 10


class Byte(int):
    pass


class IntList(list):
    pass


class CompoundList(list):
    pass


def _str(out, s):
    b = s.encode("utf-8")
    out.write(struct.pack("<H", len(b)))
    out.write(b)


def _tag_type(v):
    if isinstance(v, Byte):
        return TAG_BYTE
    if isinstance(v, bool):
        return TAG_BYTE
    if isinstance(v, int):
        return TAG_INT
    if isinstance(v, str):
        return TAG_STRING
    if isinstance(v, dict):
        return TAG_COMPOUND
    if isinstance(v, list):
        return TAG_LIST
    raise TypeError(v)


def _payload(out, v):
    t = _tag_type(v)
    if t == TAG_BYTE:
        out.write(struct.pack("<b", int(v)))
    elif t == TAG_INT:
        out.write(struct.pack("<i", v))
    elif t == TAG_STRING:
        _str(out, v)
    elif t == TAG_COMPOUND:
        for k, item in v.items():
            out.write(struct.pack("<b", _tag_type(item)))
            _str(out, k)
            _payload(out, item)
        out.write(b"\x00")
    elif t == TAG_LIST:
        if isinstance(v, IntList):
            et = TAG_INT
        elif isinstance(v, CompoundList):
            et = TAG_COMPOUND
        elif len(v) == 0:
            et = TAG_COMPOUND
        else:
            et = _tag_type(v[0])
        out.write(struct.pack("<b", et))
        out.write(struct.pack("<i", len(v)))
        for item in v:
            _payload(out, item)


def nbt_bytes(root):
    out = io.BytesIO()
    out.write(struct.pack("<b", TAG_COMPOUND))
    _str(out, "")
    _payload(out, root)
    return out.getvalue()


# ======================================================================== blocks
# A block is (name, ((state, value), ...)) so it can be used as a dict key.

def blk(name, **states):
    return (name, tuple(sorted(states.items())))


def leaf_v(name):  # vanilla leaves that never decay
    return blk("minecraft:" + name, persistent_bit=Byte(1), update_bit=Byte(0))


def log(wood, axis="y", stripped=False, bark=False):
    face = {"y": "up", "x": "east", "z": "north"}[axis]
    if bark:
        ident = f"{NS}:{wood}_wood"
    elif stripped:
        ident = f"{NS}:stripped_{wood}_log"
    else:
        ident = f"{NS}:{wood}_log"
    return blk(ident, **{"minecraft:block_face": face})


def mbb_stairs(ident, facing, top=False):
    """facing = the side the tall part is on (our stairs go up toward it)."""
    return blk(ident, **{"minecraft:cardinal_direction": facing,
                         "minecraft:vertical_half": "top" if top else "bottom",
                         f"{NS}:shape": "straight"})


def mbb_slab(ident, top=False):
    return blk(ident, **{"minecraft:vertical_half": "top" if top else "bottom",
                         f"{NS}:double": Byte(0)})


VANILLA_WEIRDO = {"east": 0, "west": 1, "south": 2, "north": 3}


def vanilla_stairs(name, facing, top=False):
    return blk("minecraft:" + name, weirdo_direction=VANILLA_WEIRDO[facing],
               upside_down_bit=Byte(1 if top else 0))


DIR_VEC = {"east": (1, 0), "west": (-1, 0), "south": (0, 1), "north": (0, -1)}
VEC_DIR = {v: k for k, v in DIR_VEC.items()}
OPP = {"east": "west", "west": "east", "north": "south", "south": "north"}

# priorities: stronger blocks replace weaker ones
P_LEAF, P_DETAIL, P_WOOD = 1, 2, 3


class Grid:
    def __init__(self):
        self.b = {}

    def set(self, p, block, prio=P_LEAF):
        cur = self.b.get(p)
        if cur is None or cur[1] < prio:
            self.b[p] = (block, prio)

    def has(self, p):
        return p in self.b

    def is_wood(self, p):
        return p in self.b and self.b[p][1] == P_WOOD

    def bounds(self):
        xs = [p[0] for p in self.b]
        ys = [p[1] for p in self.b]
        zs = [p[2] for p in self.b]
        return min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)


def write_structure(grid, path):
    """Saves the grid; empty cells become structure void (they don't erase
    anything when loaded). Returns (size, origin offset of world x=0,z=0)."""
    x0, y0, z0, x1, y1, z1 = grid.bounds()
    sx, sy, sz = x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1
    palette, index = [], {}
    layer0 = IntList([-1] * (sx * sy * sz))
    for (x, y, z), (block, _) in grid.b.items():
        if block not in index:
            index[block] = len(palette)
            name, states = block
            palette.append({"name": name, "states": dict(states), "version": BLOCK_VERSION})
        i = ((x - x0) * sy + (y - y0)) * sz + (z - z0)
        layer0[i] = index[block]
    root = {
        "format_version": 1,
        "size": IntList([sx, sy, sz]),
        "structure": {
            "block_indices": [layer0, IntList([-1] * (sx * sy * sz))],
            "entities": CompoundList(),
            "palette": {"default": {
                "block_palette": CompoundList(palette),
                "block_position_data": {},
            }},
        },
        "structure_world_origin": IntList([0, 0, 0]),
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(nbt_bytes(root))
    return (sx, sy, sz), (-x0, y0, -z0)


# ======================================================================== trees
# Detailed builder-style trees: buttress roots, bumpy trunks, stair-smoothed
# diagonal branches, fence twigs, and canopies made of many separate leaf
# puffs in three tones (light tops, mid body, dark undersides). Vanilla
# leaves only.

DIAGS = [("north", "east"), ("north", "west"), ("south", "east"), ("south", "west")]


class Palette:
    def __init__(self, main, shade, light, extra=None):
        self.main = [leaf_v(n) for n in main]
        self.shade = [leaf_v(n) for n in shade]
        self.light = [leaf_v(n) for n in light]
        self.extra = [leaf_v(n) for n in (extra or [])]


class Tree:
    def __init__(self, rng, wood, pal, fence):
        self.g = Grid()
        self.rng = rng
        self.wood = wood
        self.pal = pal
        self.fence_block = blk("minecraft:" + fence)
        self.path = {}
        self.width = 1

    # ------------------------------------------------------------ helpers
    def at(self, y):
        """Trunk position (north-west column) at height y."""
        y = max(0, min(int(y), max(self.path)))
        x, z = self.path[y]
        return (x, y, z)

    def choice(self, items):
        return items[self.rng.randrange(len(items))]

    def leaf(self, p, t, inner=False):
        """t: -1 (bottom of a puff) .. 1 (top). Light on top, dark below."""
        r, pal = self.rng, self.pal
        if pal.extra and r.random() < 0.06:
            b = self.choice(pal.extra)
        elif inner or t < -0.35 or (t < 0.05 and r.random() < 0.35):
            b = self.choice(pal.shade)
        elif t > 0.4 and r.random() < 0.65:
            b = self.choice(pal.light)
        else:
            b = self.choice(pal.main)
        self.g.set(p, b, P_LEAF)

    def wood_at(self, p, axis="y"):
        self.g.set(p, log(self.wood, axis), P_WOOD)

    def bark_block(self, p):
        self.g.set(p, log(self.wood, bark=True), P_WOOD)

    def stairs(self, p, facing, top=False):
        if not self.g.is_wood(p):
            self.g.set(p, mbb_stairs(f"{NS}:{self.wood}_bark_stairs", facing, top), P_DETAIL)

    def slab(self, p, top=False):
        if not self.g.has(p):
            self.g.set(p, mbb_slab(f"{NS}:{self.wood}_bark_slab", top), P_DETAIL)

    def fence(self, p):
        if not self.g.is_wood(p):
            self.g.set(p, self.fence_block, P_DETAIL)

    # ------------------------------------------------------------ canopy
    def puff(self, c, rx, ry, rz=None, ragged=0.18, hang=0, hang_chance=0.2, density=1.0):
        """One leaf puff: a flattened, bumpy ellipsoid with stray blocks
        sticking out of its rim for a ragged, natural edge."""
        r = self.rng
        rz = rz or rx
        cx, cy, cz = c
        cells = []
        for x in range(int(math.floor(cx - rx - 1)), int(math.ceil(cx + rx + 2))):
            for y in range(int(math.floor(cy - ry - 1)), int(math.ceil(cy + ry + 2))):
                for z in range(int(math.floor(cz - rz - 1)), int(math.ceil(cz + rz + 2))):
                    dx, dy, dz = (x - cx) / rx, (y - cy) / ry, (z - cz) / rz
                    d = dx * dx + dy * dy * 1.15 + dz * dz
                    if d <= 1 + r.uniform(-0.3, 0.15) and r.random() < density:
                        self.leaf((x, y, z), dy, inner=d < 0.3)
                        cells.append((x, y, z))
        cellset = set(cells)
        for (x, y, z) in cells:
            # ragged rim: single blocks poking out sideways (and sometimes down)
            if r.random() < ragged:
                dx, dz = self.choice(list(DIR_VEC.values()))
                q = (x + dx, y - (1 if r.random() < 0.3 else 0), z + dz)
                if q not in cellset and not self.g.has(q):
                    self.leaf(q, -0.2)
            if hang and (x, y - 1, z) not in cellset and r.random() < hang_chance:
                for k in range(1, r.randint(1, hang) + 1):
                    q = (x, y - k, z)
                    if self.g.has(q):
                        break
                    self.leaf(q, -1)
        return cells

    def cluster(self, c, size, hang=0, density=1.0, flat=0.6, n=(2, 4)):
        """A few overlapping puffs of different sizes around a point."""
        r = self.rng
        n = r.randint(*n)
        for i in range(n):
            ox = r.uniform(-1, 1) * size * 0.7
            oz = r.uniform(-1, 1) * size * 0.7
            oy = r.uniform(-0.4, 0.8) * size * 0.5
            rad = size * r.uniform(0.6, 1.0)
            self.puff((c[0] + ox, c[1] + oy, c[2] + oz), rad, max(1.1, rad * flat), hang=hang,
                      density=density)

    def clump(self, c, rx, ry, bias=0.0, density=0.9, hang=0, hang_chance=0.25):
        """Small leaf clump; bias shifts its tone (+ lighter, - darker)."""
        r = self.rng
        cx, cy, cz = (float(v) for v in c)
        cells = []
        for x in range(int(math.floor(cx - rx - 1)), int(math.ceil(cx + rx + 1)) + 1):
            for y in range(int(math.floor(cy - ry - 1)), int(math.ceil(cy + ry + 1)) + 1):
                for z in range(int(math.floor(cz - rx - 1)), int(math.ceil(cz + rx + 1)) + 1):
                    dx, dy, dz = (x - cx) / rx, (y - cy) / ry, (z - cz) / rx
                    d = dx * dx + dy * dy + dz * dz
                    if d <= 1 + r.uniform(-0.35, 0.1) and r.random() < density and not self.g.has((x, y, z)):
                        self.leaf((x, y, z), dy + bias, inner=d < 0.25)
                        cells.append((x, y, z))
        if hang:
            cs = set(cells)
            for (x, y, z) in cells:
                if (x, y - 1, z) in cs or r.random() > hang_chance:
                    continue
                for k in range(1, r.randint(1, hang) + 1):
                    q = (x, y - k, z)
                    if self.g.has(q):
                        break
                    self.leaf(q, -1)
        return cells

    # ------------------------------------------------------------ trunk
    def trunk(self, h, base_w=1, narrow_at=None, lean=None, lean_every=99, top_w=1):
        """Logs up to h. Optional 2x2 base that narrows to 1 at narrow_at,
        and an optional lean (shifts one block every lean_every)."""
        x = z = 0
        self.width = base_w
        for y in range(h):
            w = base_w if (narrow_at is None or y < narrow_at) else top_w
            if lean and y > 0 and y % lean_every == 0:
                dx, dz = DIR_VEC[lean]
                x, z = x + dx, z + dz
                self.stairs((x - dx, y, z - dz), lean, top=False)   # smooth the kink
                self.stairs((x, y - 1, z), OPP[lean], top=True)
            for ox in range(w):
                for oz in range(w):
                    self.wood_at((x + ox, y, z + oz))
            if narrow_at is not None and y == narrow_at and base_w > top_w:
                # stairs on the ledge where the trunk narrows
                for ox in range(base_w):
                    for oz in range(base_w):
                        p = (x + ox, y, z + oz)
                        if not self.g.is_wood(p):
                            fx = "east" if ox == 0 else "west"
                            self.stairs(p, fx)
            self.path[y] = (x, z)
        top = (x, h - 1, z)
        self.bark_block(top)
        return top

    def trunk_bumps(self, lo, hi, n):
        """Bark stairs / slabs stuck to the trunk so it isn't a plain pole."""
        r = self.rng
        for _ in range(n):
            x, y, z = self.at(r.randint(lo, hi))
            d = self.choice(list(DIR_VEC))
            dx, dz = DIR_VEC[d]
            ox = self.width if dx > 0 else (-1 if dx < 0 else r.randrange(self.width))
            oz = self.width if dz > 0 else (-1 if dz < 0 else r.randrange(self.width))
            p = (x + ox, y, z + oz)
            if self.g.has(p):
                continue
            kind = r.random()
            if kind < 0.45:
                self.stairs(p, OPP[d], top=r.random() < 0.5)
            elif kind < 0.7:
                self.bark_block(p)
                self.stairs((p[0], y - 1, p[2]), OPP[d], top=True)
            elif kind < 0.85:
                self.slab(p, top=r.random() < 0.5)
            else:
                self.fence(p)
                self.fence((p[0] + dx, y, p[2] + dz))

    def buttress(self, reach=2, tall=2):
        """Wide spreading roots: wood blocks hugging the trunk, then stairs,
        then slabs reaching out across the ground."""
        r = self.rng
        w = self.width
        x0, _, z0 = self.at(0)
        spots = []
        for d, (dx, dz) in DIR_VEC.items():
            for k in range(w):
                if dx:
                    spots.append((d, x0 + (w if dx > 0 else -1), z0 + k))
                else:
                    spots.append((d, x0 + k, z0 + (w if dz > 0 else -1)))
        for d, x, z in spots:
            if r.random() < 0.15:
                continue
            dx, dz = DIR_VEC[d]
            length = r.randint(1, reach)
            height = r.randint(1, tall)
            for i in range(length + 2):
                p = (x + dx * i, 0, z + dz * i)
                h = height - i
                if i < length and h >= 1:
                    for y in range(h):
                        self.bark_block((p[0], y, p[2]))
                    self.stairs((p[0], h, p[2]), OPP[d])
                elif i < length + 1:
                    self.stairs(p, OPP[d])
                elif r.random() < 0.6:
                    self.slab(p)
            # sometimes a root curls sideways
            if r.random() < 0.3:
                side = CW_DIR[d] if r.random() < 0.5 else CCW_DIR[d]
                sx, sz = DIR_VEC[side]
                p = (x + dx * length + sx, 0, z + dz * length + sz)
                self.stairs(p, OPP[side])

    # ------------------------------------------------------------ branches
    def branch(self, start, d, out, up, side=None):
        """A branch leaving the trunk at `start`, going `out` blocks in
        direction d while climbing `up` blocks, with stairs smoothing every
        step so it reads as one diagonal limb. `side` drifts it sideways."""
        r = self.rng
        x, y, z = start
        dx, dz = DIR_VEC[d]
        sx, sz = DIR_VEC[side] if side else (0, 0)
        steps = out + up
        ups = set(r.sample(range(1, steps), min(up, steps - 1))) if steps > 1 else set()
        prev = (x, y, z)
        for i in range(steps):
            if i in ups:
                y += 1
                self.wood_at((x, y, z))
                # smooth the step: stair under the outer corner, stair on the inner
                self.stairs((x + dx, y - 1, z + dz), OPP[d], top=True)
                self.stairs((x - dx, y, z - dz), d) if not self.g.has((x - dx, y, z - dz)) else None
            else:
                if side and r.random() < 0.3:
                    x, z = x + sx, z + sz
                    axis = "x" if sx else "z"
                else:
                    x, z = x + dx, z + dz
                    axis = "x" if dx else "z"
                self.wood_at((x, y, z), axis)
            prev = (x, y, z)
        return prev

    def twigs(self, p, d, n=2, length=(1, 2)):
        r = self.rng
        dirs = [d, CW_DIR[d], CCW_DIR[d]]
        for _ in range(n):
            q = p
            dd = self.choice(dirs)
            up = r.random() < 0.4
            for _ in range(r.randint(*length)):
                if up and r.random() < 0.5:
                    q = (q[0], q[1] + 1, q[2])
                else:
                    q = (q[0] + DIR_VEC[dd][0], q[1], q[2] + DIR_VEC[dd][1])
                if self.g.is_wood(q):
                    break
                self.fence(q)


CW_DIR = {"north": "east", "east": "south", "south": "west", "west": "north"}
CCW_DIR = {v: k for k, v in CW_DIR.items()}


def limb_dirs(rng, n):
    """n branch directions spread round the tree, each with a sideways drift."""
    base = list(DIR_VEC)
    rng.shuffle(base)
    out = []
    for i in range(n):
        d = base[i % 4]
        out.append((d, rng.choice([CW_DIR[d], CCW_DIR[d], None])))
    return out


# ---- tree shapes --------------------------------------------------------

def oak(t, s, h=(13, 16), puff=3.2, limbs=(4, 6), hang=0, lower_puffs=True):
    """Big broad oak: buttressed trunk, stepped limbs, a crown of separate
    puffs with gaps, and a couple of small low puffs on stubby branches."""
    r = t.rng
    H = int(r.randint(*h) * s)
    big = s >= 1.3
    top = t.trunk(H, base_w=2 if big else 1, narrow_at=int(H * 0.35) if big else None)
    t.buttress(reach=3 if big else 2, tall=3 if big else 2)
    t.trunk_bumps(1, H - 2, int(6 * s))
    n = int(r.randint(*limbs) * s)
    for i, (d, side) in enumerate(limb_dirs(r, n)):
        y0 = int(H * (0.45 + 0.4 * i / max(1, n - 1)) + r.uniform(-1, 1))
        end = t.branch(t.at(y0), d, int(r.uniform(3, 5) * s), int(r.uniform(2, 4) * s), side)
        t.twigs(end, d, n=r.randint(1, 3))
        t.cluster((end[0], end[1] + 1, end[2]), puff * r.uniform(0.6, 0.8) * s, hang=hang, n=(1, 2))
    t.cluster((top[0], top[1] + 2, top[2]), puff * 0.85 * s, hang=hang, n=(2, 3))
    if lower_puffs:
        for d, side in limb_dirs(r, 2):
            end = t.branch(t.at(int(H * r.uniform(0.3, 0.45))), d, 2, 1)
            t.puff((end[0] + DIR_VEC[d][0], end[1] + 1, end[2] + DIR_VEC[d][1]), 1.8 * s, 1.3, hang=hang)


def birch(t, s):
    """Tall straight trunk with chunky root blocks, stepped limbs near the
    top and a loose crown of puffs pierced by fence twigs."""
    r = t.rng
    H = int(r.randint(15, 18) * s)
    top = t.trunk(H)
    t.buttress(reach=1, tall=3)
    t.trunk_bumps(2, H - 3, int(4 * s))
    for d, side in limb_dirs(r, int(5 * s)):
        y0 = int(H * r.uniform(0.6, 0.9))
        end = t.branch(t.at(y0), d, int(r.uniform(1, 3) * s), int(r.uniform(2, 3) * s), side)
        t.twigs(end, d, n=3, length=(1, 3))
        t.cluster((end[0], end[1] + 1, end[2]), 2.6 * s)
    t.cluster((top[0], top[1] + 2, top[2]), 3.0 * s)
    for _ in range(int(4 * s)):   # twigs poking out of the crown
        x = top[0] + r.randint(-3, 3)
        z = top[2] + r.randint(-3, 3)
        y = top[1] + r.randint(1, 4)
        d = r.choice(list(DIR_VEC))
        t.fence((x, y, z))
        t.fence((x + DIR_VEC[d][0], y, z + DIR_VEC[d][1]))


def spruce(t, s):
    """Tiered spruce: wide buttress roots, then flat star-shaped tiers of
    leaves that stick out in points, each tier turned from the last."""
    r = t.rng
    H = int(r.randint(18, 22) * s)
    big = s >= 1.3
    top = t.trunk(H, base_w=2 if big else 1, narrow_at=int(H * 0.25) if big else None)
    t.buttress(reach=3, tall=3 if big else 2)
    t.trunk_bumps(1, int(H * 0.3), int(4 * s))
    start = int(H * 0.28)
    y = start
    tier = 0
    while y <= H:
        frac = (y - start) / max(1, H - start)
        reach = max(1, int(round((5.2 * s) * (1 - frac) + 1)))
        x0, _, z0 = t.at(y)
        arms = DIAGS if tier % 2 else [(d, None) for d in DIR_VEC]
        # tier plate: a small disc plus pointed arms
        t.puff((x0 + 0.5 * (t.width - 1), y, z0 + 0.5 * (t.width - 1)), max(1.2, reach * 0.55), 0.8,
               ragged=0.1)
        for a in arms:
            d1, d2 = a
            vx, vz = DIR_VEC[d1]
            if d2:
                vx, vz = vx + DIR_VEC[d2][0], vz + DIR_VEC[d2][1]
            L = reach if not d2 else max(1, int(reach * 0.7))
            for i in range(1, L + 1):
                p = (x0 + vx * i, y - (1 if i == L and L > 2 else 0), z0 + vz * i)
                t.leaf(p, 0.2 if i < L else -0.5)
                if i < L - 1:   # thicken the arm
                    t.leaf((p[0] + (vz != 0), p[1], p[2] + (vx != 0)), -0.4)
            if L > 2 and r.random() < 0.7:   # a hidden branch inside the arm
                bx, bz = (vx > 0) - (vx < 0), (vz > 0) - (vz < 0)
                for i in range(1, L - 1):
                    t.wood_at((x0 + bx * i, y - 1, z0 + bz * i), "x" if bx else "z")
        y += 2
        tier += 1
    for k in range(1, 4):   # spire tip
        t.leaf((top[0], H + k - 1, top[2]), 1 if k == 3 else 0)


def pine(t, s):
    """Very tall, thin pine: bare lower trunk with dead twigs, then small
    tufts on short branches towards the top."""
    r = t.rng
    H = int(r.randint(24, 30) * s)
    top = t.trunk(H, lean=r.choice(list(DIR_VEC)), lean_every=r.randint(14, 18))
    t.buttress(reach=1, tall=2)
    t.trunk_bumps(1, int(H * 0.5), int(5 * s))
    for _ in range(int(5 * s)):   # dead twigs on the bare trunk
        x, y, z = t.at(r.randint(int(H * 0.25), int(H * 0.55)))
        d = r.choice(list(DIR_VEC))
        t.twigs((x, y, z), d, n=1, length=(1, 3))
    y = int(H * 0.5)
    while y <= H:
        frac = (y - H * 0.5) / (H * 0.5)
        dirs = list(DIR_VEC)
        r.shuffle(dirs)
        for d in dirs[:r.randint(2, 3)]:
            side = r.choice([CW_DIR[d], CCW_DIR[d], None])
            out = max(1, int((3.2 * s) * (1 - frac * 0.7)))
            end = t.branch(t.at(y), d, out, 1 if out > 2 else 0, side)
            t.twigs(end, d, n=1)
            t.puff((end[0], end[1] + 1, end[2]), 1.3 + 0.6 * s * (1 - frac), 1.0, ragged=0.3)
        y += r.choice((2, 3))
    t.puff((top[0], H + 1, top[2]), 1.4, 2.2, ragged=0.25)


def cypress(t, s):
    """Narrow spire made of stacked, offset leaf layers with stray blocks
    sticking out, like a tall Italian cypress."""
    r = t.rng
    H = int(r.randint(16, 20) * s)
    top = t.trunk(H)
    t.buttress(reach=1, tall=1)
    for y in range(2, H + 4):
        frac = (y - 2) / (H + 2)
        rad = (2.6 * s) * math.sin(math.pi * min(1.0, 0.15 + frac * 0.95)) ** 0.7 + 0.5
        x0, _, z0 = t.at(min(y, H - 1))
        ox, oz = r.uniform(-0.6, 0.6), r.uniform(-0.6, 0.6)
        for x in range(int(-rad - 2), int(rad + 3)):
            for z in range(int(-rad - 2), int(rad + 3)):
                d = math.hypot(x - ox, z - oz)
                if d <= rad + r.uniform(-0.4, 0.3):
                    t.leaf((x0 + x, y, z0 + z), 0.6 if d > rad - 1 else -0.6, inner=d < rad - 1.5)
        # stray block sticking out of this layer
        if r.random() < 0.7:
            d = r.choice(list(DIR_VEC))
            k = int(rad) + 1
            t.leaf((x0 + DIR_VEC[d][0] * k, y, z0 + DIR_VEC[d][1] * k), 0.3)
    t.leaf((top[0], H + 4, top[2]), 1)


def willow(t, s):
    r = t.rng
    H = int(r.randint(10, 12) * s)
    top = t.trunk(H, lean=r.choice(list(DIR_VEC)), lean_every=5)
    t.buttress(reach=2, tall=2)
    t.trunk_bumps(1, H - 2, int(4 * s))
    for d, side in limb_dirs(r, int(5 * s)):
        end = t.branch(t.at(H * r.uniform(0.6, 0.9)), d, int(r.uniform(3, 5) * s), 2, side)
        t.twigs(end, d, n=1)
        t.cluster((end[0], end[1] + 1, end[2]), 2.6 * s, hang=int(6 * s), flat=0.5)
    t.cluster((top[0], top[1] + 2, top[2]), 3.2 * s, hang=int(6 * s), flat=0.5)


def acacia(t, s):
    """Ebony: tall forked trunk with flat umbrella puffs."""
    r = t.rng
    H = int(r.randint(10, 13) * s)
    top = t.trunk(H)
    t.buttress(reach=2, tall=2)
    t.trunk_bumps(1, H - 2, int(4 * s))
    for d, side in limb_dirs(r, max(3, int(4 * s))):
        end = t.branch(t.at(H * r.uniform(0.55, 0.8)), d, int(r.uniform(3, 5) * s), int(r.uniform(2, 4) * s),
                       side)
        t.twigs(end, d, n=2)
        t.puff((end[0], end[1] + 1, end[2]), 3.4 * s, 1.1, ragged=0.25)
    t.puff((top[0], top[1] + 1, top[2]), 3.8 * s, 1.2, ragged=0.25)


def palm(t, s):
    r = t.rng
    H = int(r.randint(12, 15) * s)
    lean = r.choice(list(DIR_VEC))
    top = t.trunk(H, lean=lean, lean_every=r.choice((3, 4)))
    t.buttress(reach=1, tall=1)
    crown = (top[0], top[1] + 1, top[2])
    t.puff(crown, 1.4, 1.0, ragged=0)
    arms = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
    for ax, az in arms:
        L = int(r.randint(4, 6) * s)
        x, y, z = crown
        for i in range(1, L + 1):
            x, z = x + ax, z + az
            if i in (L // 2 + 1, L):
                y -= 1
            t.leaf((x, y, z), 0.6)
            if 1 < i < L:
                if r.random() < 0.7:
                    t.leaf((x + az, y - 1, z - ax), -0.6)
                if r.random() < 0.7:
                    t.leaf((x - az, y - 1, z + ax), -0.6)
        t.leaf((x, y - 1, z), -1)
    for ax, az in r.sample(arms[:4], 3):   # coconuts
        t.bark_block((crown[0] + ax, crown[1] - 1, crown[2] + az))


def ghost(t, s):
    """Ghostwood: crooked trunk, lots of bare stepped branches and twigs,
    with thin, pale foliage."""
    r = t.rng
    H = int(r.randint(13, 16) * s)
    top = t.trunk(H, lean=r.choice(list(DIR_VEC)), lean_every=4)
    t.buttress(reach=2, tall=2)
    t.trunk_bumps(1, H - 2, int(6 * s))
    for d, side in limb_dirs(r, int(7 * s)):
        end = t.branch(t.at(H * r.uniform(0.35, 0.95)), d, int(r.uniform(2, 4) * s), int(r.uniform(1, 3) * s),
                       side)
        t.twigs(end, d, n=3, length=(1, 3))
        if r.random() < 0.7:
            t.puff((end[0], end[1] + 1, end[2]), 2.0 * s, 1.3, density=0.75, hang=3, hang_chance=0.3)
    t.cluster((top[0], top[1] + 1, top[2]), 2.4 * s, density=0.8, hang=3)


def dome(t, s):
    """Plumwood: tall trunk carrying a big flowering dome with a drooping rim."""
    r = t.rng
    H = int(r.randint(11, 13) * s)
    top = t.trunk(H)
    t.buttress(reach=2, tall=2)
    t.trunk_bumps(1, H - 2, int(4 * s))
    R = 4.8 * s
    for d in DIR_VEC:   # ribs holding up the dome
        end = t.branch(t.at(H - 3), d, int(R * 0.5), 2)
        t.twigs(end, d, 1)
    for x in range(-int(R) - 1, int(R) + 2):
        for z in range(-int(R) - 1, int(R) + 2):
            d = math.hypot(x, z)
            if d > R + r.uniform(-0.5, 0.3):
                continue
            hgt = int(round(math.sqrt(max(0.0, R * R - d * d)) * 0.55))
            for y in range(0, hgt + 1):
                t.leaf((top[0] + x, top[1] + y, top[2] + z), (y / max(1, hgt)) * 2 - 1, inner=y < hgt - 1)
            if d > R - 1.3:
                for k in range(1, r.randint(1, 3) + 1):
                    t.leaf((top[0] + x, top[1] - k, top[2] + z), -1)


# species -> (shape, kwargs, twig fence, palette)
def _pal(main, shade, light, extra=None):
    return Palette(main, shade, light, extra)


SPECIES = {
    "maple": (oak, {}, "spruce_fence",
              _pal(["oak_leaves"], ["dark_oak_leaves"], ["azalea_leaves"])),
    "redwood": (spruce, {}, "mangrove_fence",
                _pal(["spruce_leaves"], ["dark_oak_leaves", "spruce_leaves"], ["spruce_leaves"],
                     ["azalea_leaves"])),
    "ebony": (acacia, {}, "dark_oak_fence",
              _pal(["acacia_leaves"], ["dark_oak_leaves"], ["acacia_leaves", "azalea_leaves"])),
    "willow": (willow, {}, "spruce_fence",
               _pal(["mangrove_leaves"], ["dark_oak_leaves"], ["azalea_leaves"])),
    "ash": (birch, {}, "pale_oak_fence",
            _pal(["birch_leaves"], ["dark_oak_leaves"], ["birch_leaves", "azalea_leaves"])),
    "azure": (cypress, {}, "dark_oak_fence",
              _pal(["oak_leaves"], ["dark_oak_leaves"], ["azalea_leaves"])),
    "walnut": (oak, dict(h=(15, 18), puff=3.6, limbs=(5, 7)), "dark_oak_fence",
               _pal(["oak_leaves", "dark_oak_leaves"], ["dark_oak_leaves"], ["azalea_leaves", "oak_leaves"])),
    "rosewood": (oak, dict(h=(11, 13), puff=3.0, limbs=(4, 5), hang=2), "crimson_fence",
                 _pal(["cherry_leaves"], ["azalea_leaves_flowered", "cherry_leaves"], ["cherry_leaves"])),
    "palm": (palm, {}, "jungle_fence",
             _pal(["jungle_leaves"], ["jungle_leaves", "dark_oak_leaves"], ["azalea_leaves"])),
    "ironwood": (pine, {}, "spruce_fence",
                 _pal(["spruce_leaves"], ["dark_oak_leaves"], ["azalea_leaves", "spruce_leaves"])),
    "ghostwood": (ghost, {}, "pale_oak_fence",
                  _pal(["pale_oak_leaves"], ["pale_oak_leaves"], ["pale_oak_leaves", "birch_leaves"])),
    "plumwood": (dome, {}, "crimson_fence",
                 _pal(["azalea_leaves_flowered"], ["dark_oak_leaves", "azalea_leaves"], ["cherry_leaves"])),
}

SIZES = [("small", 0.85), ("medium", 1.1), ("large", 1.4)]


# ======================================================================== organic trees (v3)
import growth as GR  # noqa: E402


def organic(t, s, trunk_h, crown, shape="ellipsoid", points=302, lumps=9, rmax=0.9,
            leaf_r=2.4, tropism=(0, 0.12, 0), influence=6.5, lean=(0.0, 0.0), sprout_from=0.55,
            n_roots=5, root_reach=3.5, hang=0, hang_chance=0.25, flat=0.75, density=0.9,
            skip=0.0, along=0.3, max_w=3, dead=0, lump_r=0.22, fence_chance=0.45, kill=2.4):
    """Space-colonisation broadleaf. crown = (rx, ry, rz, centre height above trunk top)."""
    r = t.rng
    sk = GR.Skeleton()
    H = max(3, int(trunk_h * s))
    lx, lz = lean
    top = GR.grow_trunk(sk, r, H, lean=(lx, lz))
    trunk_nodes = [i for i, k in enumerate(sk.kind) if k == "trunk"]
    rx, ry, rz, up = crown
    tp = sk.pos[top]
    pts = GR.crown_points(r, shape, int(points * s), (tp[0], tp[1] + up * s, tp[2]),
                          rx * s, ry * s, rz * s, lumps=lumps, lump_r=lump_r)
    GR.colonise(sk, r, pts, trunk_nodes[int(len(trunk_nodes) * sprout_from):], influence=influence * s ** 0.5,
                tropism=tropism, kill=kill * s ** 0.5)
    for _ in range(dead):   # dead stubs low on the trunk
        base = trunk_nodes[r.randint(int(H * 0.25), int(H * 0.6))]
        ang = r.uniform(0, math.tau)
        p = sk.pos[base]
        prev = base
        for k in range(r.randint(1, 3)):
            p = p + np.array([math.cos(ang), 0.3, math.sin(ang)])
            prev = sk.add(p, prev, "dead")
    GR.roots(sk, r, 0, n_roots, root_reach * s)
    w, ch, radius = GR.voxelise(t, sk, rmax * (0.62 + (s - 0.85) * 1.2), fence_chance=fence_chance)
    GR.smooth_steps(t)
    GR.leaves_at_tips(t, sk, w, ch, radius, leaf_r=leaf_r * s ** 0.5, hang=hang, hang_chance=hang_chance,
                      flat=flat, density=density, skip=skip, along=along, max_w=max_w)


def conifer3(t, s, height=22, base_len=6.0, rmax=0.9, start=0.25, profile="cone", per=(5, 7),
             gap=(2, 3), leaf_r=1.4, dead=0, n_roots=6):
    r = t.rng
    sk = GR.Skeleton()
    H = int(height * s)
    GR.grow_trunk(sk, r, H, wobble=0.06 if profile == "cone" else 0.1)
    trunk_nodes = [i for i, k in enumerate(sk.kind) if k == "trunk"]
    GR.whorls(sk, r, trunk_nodes, int(H * start), H - 1, base_len * s, per_whorl=per, gap=gap,
              profile=profile)
    for _ in range(dead):
        base = trunk_nodes[r.randint(int(H * 0.2), int(H * start))]
        ang = r.uniform(0, math.tau)
        p, prev = sk.pos[base], base
        for k in range(r.randint(1, 3)):
            p = p + np.array([math.cos(ang), -0.1, math.sin(ang)])
            prev = sk.add(p, prev, "dead")
    GR.roots(sk, r, 0, n_roots, 3.5 * s)
    w, ch, radius = GR.voxelise(t, sk, rmax * (0.62 + (s - 0.85) * 1.2), fence_chance=0.2)
    GR.smooth_steps(t)
    GR.leaves_at_tips(t, sk, w, ch, radius, leaf_r=leaf_r * s ** 0.4, flat=0.6, along=0.8, max_w=4,
                      density=0.92)
    top = sk.pos[trunk_nodes[-1]]
    for k in range(3):   # leader at the very top
        t.leaf((int(round(top[0])), int(round(top[1])) + 1 + k, int(round(top[2]))), 0.8)


def oak3(t, s):
    organic(t, s, 7, (6.5, 4.5, 6.5, 3.0), points=273, lumps=7, rmax=1.05, leaf_r=2.0, sprout_from=0.35)


def walnut3(t, s):
    organic(t, s, 8, (7.5, 4.6, 7.0, 5.0), points=467, lumps=12, rmax=1.25, leaf_r=2.5, n_roots=6,
            root_reach=4.5)


def ash3(t, s):
    organic(t, s, 9, (5.0, 7.0, 5.0, 4.5), points=360, lumps=8, rmax=0.85, leaf_r=2.2, sprout_from=0.4,
            tropism=(0, 0.25, 0), dead=2)


def willow3(t, s):
    organic(t, s, 6, (6.5, 3.5, 6.5, 3.0), shape="dome", points=345, lumps=9, rmax=0.95, leaf_r=2.2,
            tropism=(0, -0.05, 0), hang=7, hang_chance=0.45, flat=0.6, lean=(0.08, 0.0))


def acacia3(t, s):
    organic(t, s, 7, (7.0, 1.6, 6.5, 4.0), shape="disc", points=302, lumps=7, rmax=0.85, leaf_r=2.3,
            tropism=(0, 0.35, 0), flat=0.45, sprout_from=0.6, lean=(0.06, 0.04))


def cherry3(t, s):
    organic(t, s, 5, (6.0, 3.0, 6.0, 3.5), shape="dome", points=331, lumps=9, rmax=0.9, leaf_r=2.4,
            hang=2, hang_chance=0.3, flat=0.7)


def ghost3(t, s):
    organic(t, s, 8, (4.5, 5.0, 4.5, 4.0), points=216, lumps=6, rmax=0.85, leaf_r=1.9, skip=0.45,
            density=0.75, hang=3, hang_chance=0.35, lean=(0.1, 0.05), dead=4, max_w=2)


def dome3(t, s):
    organic(t, s, 8, (5.5, 3.6, 5.5, 2.5), shape="dome", points=374, lumps=8, rmax=0.95, leaf_r=2.5,
            hang=3, hang_chance=0.35, flat=0.7)


def redwood3(t, s):
    conifer3(t, s, height=24, base_len=6.5, rmax=1.25, start=0.3, leaf_r=1.45, dead=3)


def pine3(t, s):
    conifer3(t, s, height=30, base_len=3.0, rmax=0.85, start=0.55, profile="pine", per=(3, 5),
             gap=(2, 3), leaf_r=1.5, dead=6, n_roots=4)


SPECIES = {
    "maple": (oak3, {}, "spruce_fence",
              _pal(["oak_leaves"], ["dark_oak_leaves"], ["azalea_leaves"])),
    "redwood": (redwood3, {}, "mangrove_fence",
                _pal(["spruce_leaves"], ["dark_oak_leaves", "spruce_leaves"], ["spruce_leaves"],
                     ["azalea_leaves"])),
    "ebony": (acacia3, {}, "dark_oak_fence",
              _pal(["acacia_leaves"], ["dark_oak_leaves"], ["acacia_leaves", "azalea_leaves"])),
    "willow": (willow3, {}, "spruce_fence",
               _pal(["mangrove_leaves"], ["dark_oak_leaves"], ["azalea_leaves"])),
    "ash": (ash3, {}, "pale_oak_fence",
            _pal(["birch_leaves"], ["dark_oak_leaves"], ["birch_leaves", "azalea_leaves"])),
    "azure": (cypress, {}, "dark_oak_fence",
              _pal(["oak_leaves"], ["dark_oak_leaves"], ["azalea_leaves"])),
    "walnut": (walnut3, {}, "dark_oak_fence",
               _pal(["oak_leaves", "dark_oak_leaves"], ["dark_oak_leaves"], ["azalea_leaves", "oak_leaves"])),
    "rosewood": (cherry3, {}, "crimson_fence",
                 _pal(["cherry_leaves"], ["azalea_leaves_flowered", "cherry_leaves"], ["cherry_leaves"])),
    "palm": (palm, {}, "jungle_fence",
             _pal(["jungle_leaves"], ["jungle_leaves", "dark_oak_leaves"], ["azalea_leaves"])),
    "ironwood": (pine3, {}, "spruce_fence",
                 _pal(["spruce_leaves"], ["dark_oak_leaves"], ["azalea_leaves", "spruce_leaves"])),
    "ghostwood": (ghost3, {}, "pale_oak_fence",
                  _pal(["pale_oak_leaves"], ["pale_oak_leaves"], ["pale_oak_leaves", "birch_leaves"])),
    "plumwood": (dome3, {}, "crimson_fence",
                 _pal(["azalea_leaves_flowered"], ["dark_oak_leaves", "azalea_leaves"], ["cherry_leaves"])),
}





# ======================================================================== trees v5: limbs + leaf pads
# Readable trees: a clear trunk and limbs, each limb ending in a flat leaf
# pad (wide middle layer, smaller top, sparse dark underside), pads at
# different heights with open space between them. Conifers are stacked rings.


def limb(t, start, ang, elev, length):
    """A straight limb at any angle, as connected logs; stairs are added
    later by GR.smooth_steps so diagonals read as smooth slopes."""
    sx, sy, sz = (float(v) for v in start)
    ex = sx + math.cos(ang) * math.cos(elev) * length
    ey = sy + math.sin(elev) * length
    ez = sz + math.sin(ang) * math.cos(elev) * length
    cells = GR._line((sx, sy, sz), (ex, ey, ez))
    for j, p in enumerate(cells):
        if j == 0:
            continue
        d = np.subtract(p, cells[j - 1])
        t.wood_at(p, GR.axis_of(d))
    return cells[-1]


def pad(t, c, R, layers=3, bias=0.0, hole=0.06, hang=0, hang_chance=0.3):
    """A leaf puff: sparse dark underside, wide body, then rounding over
    on top in lighter leaves. layers 1-3 sets how tall it is."""
    r = t.rng
    cx, cy, cz = (int(round(v)) for v in c)
    spec = {1: [(0, R, 0.0, 1.0), (1, R - 1.3, 0.7, 0.9)],
            2: [(-1, R - 1.3, -0.9, 0.7), (0, R, -0.2, 1.0), (1, R - 0.7, 0.4, 1.0), (2, R - 2.0, 0.9, 0.9)],
            3: [(-1, R - 1.2, -0.9, 0.75), (0, R, -0.3, 1.0), (1, R - 0.3, 0.2, 1.0), (2, R - 1.1, 0.6, 1.0),
                (3, R - 2.3, 0.95, 0.85)]}[layers]
    ox, oz = r.uniform(-0.5, 0.5), r.uniform(-0.5, 0.5)
    placed = []
    for dy, rr, tone, dens in spec:
        rr = max(0.7, rr)
        ir = int(math.ceil(rr + 1))
        for x in range(-ir, ir + 1):
            for z in range(-ir, ir + 1):
                d = math.hypot(x - ox, z - oz)
                if d <= rr + r.uniform(-0.6, 0.3) and r.random() < dens and r.random() > hole:
                    p = (cx + x, cy + dy, cz + z)
                    if not t.g.has(p):
                        t.leaf(p, tone + bias + (0.25 if d < rr - 1.5 and dy >= 0 else 0), inner=d < rr - 1.8 and 0 <= dy < 2)
                        placed.append(p)
    if hang:
        ps = set(placed)
        for (x, y, z) in placed:
            if (x, y - 1, z) in ps or r.random() > hang_chance:
                continue
            for k in range(1, r.randint(1, hang) + 1):
                q = (x, y - k, z)
                if t.g.has(q):
                    break
                t.leaf(q, -1)
    return placed


def broad5(t, s, trunk=(9, 11), limbs=(4, 6), reach=(4, 6), elev=(0.35, 0.7), pad_r=(2.4, 3.2),
           secondary=0.7, low=1, top=True, hang=0, hang_chance=0.3, layers=3, lean=None):
    """Oak-style: visible trunk, limbs radiating at different heights, each
    with a side branch, every tip carrying its own pad."""
    r = t.rng
    H = int(r.randint(*trunk) * s)
    big = s >= 1.3
    t.trunk(H, base_w=2 if big else 1, narrow_at=int(H * 0.3) if big else None,
            lean=lean, lean_every=5 if lean else 99)
    t.buttress(reach=1 if not big else 2, tall=2 if big else 1)
    t.trunk_bumps(1, H - 2, int(2 * s))
    k = s ** 0.5
    n = r.randint(*limbs)
    a0 = r.uniform(0, math.tau)
    for i in range(n):
        ang = a0 + i * math.tau / n + r.uniform(-0.35, 0.35)
        y = int(H * (0.5 + 0.45 * i / max(1, n - 1))) + r.randint(-1, 1)
        x0, y0, z0 = t.at(y)
        L = r.uniform(*reach) * s
        e = r.uniform(*elev)
        end = limb(t, (x0, y0, z0), ang, e, L)
        t.twigs(end, r.choice(list(DIR_VEC)), n=r.randint(1, 2))
        pad(t, (end[0], end[1] + 1, end[2]), r.uniform(*pad_r) * k, layers, hang=hang, hang_chance=hang_chance)
        if r.random() < secondary:
            # side branch from part-way along the limb, angled away
            f = r.uniform(0.45, 0.65)
            mid = (x0 + (end[0] - x0) * f, y0 + (end[1] - y0) * f, z0 + (end[2] - z0) * f)
            a2 = ang + r.choice((-1, 1)) * r.uniform(0.7, 1.2)
            e2 = end2 = limb(t, mid, a2, e + 0.15, L * r.uniform(0.45, 0.6))
            t.twigs(end2, r.choice(list(DIR_VEC)), n=1)
            pad(t, (e2[0], e2[1] + 1, e2[2]), r.uniform(*pad_r) * k * 0.75, max(1, layers - 1),
                hang=hang, hang_chance=hang_chance)
    for _ in range(low):   # a small low pad on a stubby branch
        x0, y0, z0 = t.at(int(H * r.uniform(0.3, 0.42)))
        end = limb(t, (x0, y0, z0), r.uniform(0, math.tau), 0.5, 2.5 * s)
        pad(t, (end[0], end[1] + 1, end[2]), 1.9 * k, 1)
    if top:
        tx, ty, tz = t.at(H - 1)
        pad(t, (tx, ty + 1, tz), r.uniform(*pad_r) * k * 0.9, layers, hang=hang, hang_chance=hang_chance)
        pad(t, (tx + r.randint(-1, 1), ty + 3, tz + r.randint(-1, 1)), r.uniform(*pad_r) * k * 0.55, 2)
    GR.smooth_steps(t)


def flat_ring(t, c, R):
    """One conifer tier: a flat ragged disc whose tips droop a block,
    with a small darker layer underneath near the trunk."""
    r = t.rng
    cx, cy, cz = c
    ir = int(math.ceil(R + 1))
    for x in range(-ir, ir + 1):
        for z in range(-ir, ir + 1):
            d = math.hypot(x, z)
            lim = R + r.uniform(-0.7, 0.4)
            if d <= lim:
                drop = 1 if d > R - 0.8 and R > 2 and r.random() < 0.6 else 0
                p = (int(round(cx + x)), cy - drop, int(round(cz + z)))
                if not t.g.has(p):
                    t.leaf(p, 0.5 if d < R - 1 else 0.0)
            if d <= R * 0.45 and r.random() < 0.7:
                q = (int(round(cx + x)), cy - 1, int(round(cz + z)))
                if not t.g.has(q):
                    t.leaf(q, -1)
            if d <= R * 0.55 + r.uniform(-0.4, 0.4):   # smaller layer on top
                q = (int(round(cx + x)), cy + 1, int(round(cz + z)))
                if not t.g.has(q):
                    t.leaf(q, 0.9)


def rings5(t, s, height=(20, 24), start=0.28, base_r=5.5, gap=2, pine=False, dead=0):
    """Spruce-style: stacked flat rings, alternating wide and narrow, with
    hidden branches inside each ring and a pointed leader on top."""
    r = t.rng
    H = int(r.randint(*height) * s)
    big = s >= 1.3 and not pine
    top = t.trunk(H, base_w=2 if big else 1, narrow_at=int(H * 0.25) if big else None)
    t.buttress(reach=3 if not pine else 1, tall=3 if big else 2)
    t.trunk_bumps(1, int(H * start), int(4 * s))
    y0 = int(H * start)
    i = 0
    y = y0
    while y < H:
        frac = (y - y0) / max(1, H - y0)
        if pine:
            R = (2.4 * s) * (0.55 + 0.45 * (1 - frac)) + 0.6
        else:
            R = (base_r * s) * (1 - frac) ** 0.85 + 1.0
        R *= 1.0 if i % 2 == 0 else 0.65          # wide / narrow zig-zag
        x, _, z = t.at(y)
        cx, cz = x + (t.width - 1) / 2, z + (t.width - 1) / 2
        # branches hidden inside the ring, poking out as twigs
        for k in range(r.randint(2, 3)):
            ang = r.uniform(0, math.tau)
            end = limb(t, (x, y, z), ang, -0.05, max(1.0, R - 2.2))
            if r.random() < 0.2:
                t.fence((end[0] + int(round(math.cos(ang))), end[1], end[2] + int(round(math.sin(ang)))))
        flat_ring(t, (x, y, z), R)
        y += 3 if not pine else r.choice((2, 3))
        i += 1
    tx, ty, tz = top
    for k in range(1, 4):
        t.leaf((tx, ty + k, tz), 0.9)
    for _ in range(dead):   # dead twigs on the bare trunk
        x, y, z = t.at(r.randint(int(H * 0.15), max(int(H * 0.16), y0 - 1)))
        d = r.choice(list(DIR_VEC))
        t.twigs((x, y, z), d, n=1, length=(1, 3))
    GR.smooth_steps(t)


def oak5(t, s):
    broad5(t, s)


def walnut5(t, s):
    broad5(t, s, trunk=(10, 12), limbs=(5, 7), reach=(5, 7), pad_r=(2.8, 3.6), low=2)


def ash5(t, s):
    broad5(t, s, trunk=(11, 13), limbs=(5, 6), reach=(3, 4.5), elev=(0.6, 0.9), pad_r=(2.6, 3.2), low=1)


def willow5(t, s):
    broad5(t, s, trunk=(8, 10), limbs=(5, 6), reach=(4, 6), elev=(0.3, 0.6), pad_r=(2.6, 3.2),
           hang=6, hang_chance=0.45, layers=2, lean=r_choice_dir(t))


def acacia5(t, s):
    broad5(t, s, trunk=(7, 9), limbs=(3, 4), reach=(5, 7), elev=(0.55, 0.8), pad_r=(3.0, 3.8),
           secondary=0.5, low=0, layers=2)


def cherry5(t, s):
    broad5(t, s, trunk=(6, 8), limbs=(4, 6), reach=(4, 6), elev=(0.35, 0.6), pad_r=(2.8, 3.4),
           hang=2, hang_chance=0.3)


def ghost5(t, s):
    broad5(t, s, trunk=(10, 12), limbs=(6, 8), reach=(3, 5), elev=(0.4, 0.9), pad_r=(1.6, 2.2),
           secondary=0.9, low=2, layers=2, hang=3, hang_chance=0.3, lean=r_choice_dir(t))


def redwood5(t, s):
    rings5(t, s, height=(22, 26), start=0.3, base_r=5.5, dead=3)


def pine5(t, s):
    rings5(t, s, height=(26, 32), start=0.58, pine=True, dead=6)


def r_choice_dir(t):
    return t.rng.choice(list(DIR_VEC))


SPECIES = {
    "maple": (oak5, {}, "spruce_fence",
              _pal(["oak_leaves"], ["dark_oak_leaves"], ["azalea_leaves"])),
    "redwood": (redwood5, {}, "mangrove_fence",
                _pal(["spruce_leaves"], ["dark_oak_leaves", "spruce_leaves"], ["spruce_leaves"])),
    "ebony": (acacia5, {}, "dark_oak_fence",
              _pal(["acacia_leaves"], ["dark_oak_leaves"], ["acacia_leaves", "azalea_leaves"])),
    "willow": (willow5, {}, "spruce_fence",
               _pal(["mangrove_leaves"], ["dark_oak_leaves"], ["azalea_leaves"])),
    "ash": (ash5, {}, "pale_oak_fence",
            _pal(["birch_leaves"], ["dark_oak_leaves"], ["birch_leaves", "azalea_leaves"])),
    "azure": (cypress, {}, "dark_oak_fence",
              _pal(["oak_leaves"], ["dark_oak_leaves"], ["azalea_leaves"])),
    "walnut": (walnut5, {}, "dark_oak_fence",
               _pal(["oak_leaves"], ["dark_oak_leaves"], ["azalea_leaves", "oak_leaves"])),
    "rosewood": (cherry5, {}, "crimson_fence",
                 _pal(["cherry_leaves"], ["azalea_leaves_flowered", "cherry_leaves"], ["cherry_leaves"])),
    "palm": (palm, {}, "jungle_fence",
             _pal(["jungle_leaves"], ["jungle_leaves", "dark_oak_leaves"], ["azalea_leaves"])),
    "ironwood": (pine5, {}, "spruce_fence",
                 _pal(["spruce_leaves"], ["dark_oak_leaves"], ["spruce_leaves"])),
    "ghostwood": (ghost5, {}, "pale_oak_fence",
                  _pal(["pale_oak_leaves"], ["pale_oak_leaves"], ["pale_oak_leaves", "birch_leaves"])),
    "plumwood": (dome, {}, "crimson_fence",
                 _pal(["azalea_leaves_flowered"], ["dark_oak_leaves", "azalea_leaves"], ["cherry_leaves"])),
}


# ======================================================================== bushes

def bush(rng, main, dark, accent=None, size=1.0, stem=None, flowers=None):
    g = Grid()
    rx = rng.uniform(2.2, 3.0) * size
    ry = rng.uniform(1.4, 2.0) * size
    cells = []
    for _ in range(rng.randint(3, 4)):   # a few overlapping clumps
        cx, cz = rng.uniform(-1.6, 1.6) * size, rng.uniform(-1.6, 1.6) * size
        crx = rx * rng.uniform(0.7, 1.0)
        for x in range(int(cx - crx - 1), int(cx + crx + 2)):
            for y in range(0, int(ry * 2) + 2):
                for z in range(int(cz - crx - 1), int(cz + crx + 2)):
                    dx, dy, dz = (x - cx) / crx, (y - ry * 0.6) / ry, (z - cz) / crx
                    if dx * dx + dy * dy + dz * dz <= 1 + rng.uniform(-0.3, 0.1):
                        if accent and rng.random() < 0.12:
                            b = accent
                        elif dy < -0.1 or rng.random() < 0.25:
                            b = dark
                        else:
                            b = main
                        g.set((x, y, z), b)
                        cells.append((x, y, z))
    if stem:
        g.set((0, 0, 0), stem, P_WOOD)
        g.set((0, 1, 0), stem, P_WOOD)
    if flowers:   # flowers / moss tufts on the top surface
        for (x, y, z) in cells:
            if not g.has((x, y + 1, z)) and rng.random() < 0.15:
                g.set((x, y + 1, z), flowers, P_DETAIL)
    return g


# ======================================================================== rocks

ROCK_SETS = {
    "grey": dict(blocks=[("minecraft:stone", 6), ("minecraft:andesite", 3), ("minecraft:cobblestone", 2)],
                 stairs=lambda f, top: vanilla_stairs("andesite_stairs", f, top),
                 top=[("minecraft:moss_carpet", 0.15)]),
    "mossy": dict(blocks=[("minecraft:mossy_cobblestone", 5), ("minecraft:cobblestone", 3),
                          ("minecraft:stone", 2)],
                  stairs=lambda f, top: vanilla_stairs("mossy_cobblestone_stairs", f, top),
                  cap="minecraft:moss_block", top=[("minecraft:moss_carpet", 0.45)]),
    "marble": dict(blocks=[(f"{NS}:marble", 6), ("minecraft:calcite", 3), ("minecraft:diorite", 1)],
                   stairs=lambda f, top: mbb_stairs(f"{NS}:marble_stairs", f, top), top=[]),
    "travertine": dict(blocks=[(f"{NS}:travertine", 7), ("minecraft:sandstone", 2)],
                       stairs=lambda f, top: mbb_stairs(f"{NS}:travertine_stairs", f, top), top=[]),
    "dark": dict(blocks=[("minecraft:tuff", 5), ("minecraft:cobbled_deepslate", 3), ("minecraft:andesite", 2)],
                 stairs=lambda f, top: vanilla_stairs("tuff_stairs", f, top),
                 top=[("minecraft:moss_carpet", 0.1)]),
}


def pick(rng, weighted):
    total = sum(w for _, w in weighted)
    v = rng.uniform(0, total)
    for b, w in weighted:
        v -= w
        if v <= 0:
            return b
    return weighted[-1][0]


def rock(rng, style, lumps):
    """lumps: list of (cx, cy, cz, rx, ry, rz). Starts 1 block below ground."""
    s = ROCK_SETS[style]
    solid = set()
    for (cx, cy, cz, rx, ry, rz) in lumps:
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            for y in range(-1, int(cy + ry + 2)):
                for z in range(int(cz - rz - 1), int(cz + rz + 2)):
                    dx, dy, dz = (x - cx) / rx, (y - cy) / ry, (z - cz) / rz
                    if dx * dx + dy * dy + dz * dz <= 1 + rng.uniform(-0.25, 0.1):
                        solid.add((x, y, z))
    g = Grid()
    for p in solid:
        name = pick(rng, s["blocks"])
        if s.get("cap") and (p[0], p[1] + 1, p[2]) not in solid and rng.random() < 0.6:
            name = s["cap"]
        g.set(p, blk(name), P_WOOD)
    # soften the top edges with stairs that slope outwards
    for (x, y, z) in solid:
        if (x, y + 1, z) in solid or y < 0:
            continue
        open_sides = [d for d, (dx, dz) in DIR_VEC.items() if (x + dx, y, z + dz) not in solid]
        if len(open_sides) == 1 and rng.random() < 0.7:
            g.b[(x, y, z)] = (s["stairs"](OPP[open_sides[0]], False), P_WOOD)
        elif not open_sides and rng.random() < 0.05:
            pass
    # overhang undersides: upside-down stairs
    for (x, y, z) in solid:
        if y <= 0 or (x, y - 1, z) in solid:
            continue
        open_sides = [d for d, (dx, dz) in DIR_VEC.items() if (x + dx, y, z + dz) not in solid]
        if len(open_sides) == 1 and rng.random() < 0.6:
            g.b[(x, y, z)] = (s["stairs"](OPP[open_sides[0]], True), P_WOOD)
    # moss / details on top
    for (x, y, z) in list(solid):
        if (x, y + 1, z) in solid:
            continue
        for name, chance in s["top"]:
            if rng.random() < chance:
                g.set((x, y + 1, z), blk(name), P_DETAIL)
    return g


# ======================================================================== build

def _save(bp, group, name, grid, functions, y_offset=0):
    path = os.path.join(bp, "structures", NS, name + ".mcstructure")
    size, origin = write_structure(grid, path)
    # load so that world x=0,z=0 of the design (the trunk) is at the player
    ox, oy, oz = origin
    fn = os.path.join(bp, "functions", NS, group, name + ".mcfunction")
    os.makedirs(os.path.dirname(fn), exist_ok=True)
    with open(fn, "w") as f:
        f.write(f"structure load {NS}:{name} ~{-ox} ~{oy + y_offset} ~{-oz}\n")
    functions.append((group, name, size, origin, y_offset))


def build(bp):
    shutil_rm(os.path.join(bp, "structures"))
    shutil_rm(os.path.join(bp, "functions"))
    made = []

    # ---- trees: Minecraft's own tree generators (see build_tree_features)
    build_tree_functions(bp, made)

    # ---- bushes (vanilla leaves only)
    V = leaf_v
    bushes = [
        ("oak_bush", V("oak_leaves"), V("dark_oak_leaves"), V("azalea_leaves"), 1.0, log("maple"), None),
        ("oak_bush_large", V("oak_leaves"), V("dark_oak_leaves"), V("azalea_leaves"), 1.5, log("walnut"), None),
        ("azalea_bush", V("azalea_leaves"), V("dark_oak_leaves"), V("azalea_leaves_flowered"), 1.2, None,
         blk("minecraft:moss_carpet")),
        ("flowering_bush", V("azalea_leaves_flowered"), V("azalea_leaves"), V("cherry_leaves"), 1.0, None, None),
        ("cherry_bush", V("cherry_leaves"), V("azalea_leaves_flowered"), None, 1.0, log("rosewood"), None),
        ("birch_bush", V("birch_leaves"), V("dark_oak_leaves"), V("azalea_leaves"), 1.1, None, None),
        ("spruce_shrub", V("spruce_leaves"), V("dark_oak_leaves"), None, 1.1, log("redwood"), None),
        ("jungle_bush", V("jungle_leaves"), V("dark_oak_leaves"), V("azalea_leaves"), 1.2, log("palm"), None),
        ("acacia_bush", V("acacia_leaves"), V("dark_oak_leaves"), None, 1.0, None, None),
        ("mangrove_bush", V("mangrove_leaves"), V("dark_oak_leaves"), V("azalea_leaves"), 1.1, None, None),
        ("pale_bush", V("pale_oak_leaves"), V("pale_oak_leaves"), V("birch_leaves"), 1.0, None, None),
    ]
    for i, (name, main, dark, acc, size, stem, flowers) in enumerate(bushes):
        rng = random.Random(7000 + i * 13)
        _save(bp, "bushes", name, bush(rng, main, dark, acc, size, stem, flowers), made)

    # little "tree" bushes on a short stem, and a tall narrow bush
    oak_pal = Palette(["oak_leaves"], ["dark_oak_leaves"], ["azalea_leaves"])
    for i, (name, wood, stem_h, size) in enumerate((("stemmed_bush", "maple", 2, 2.0),
                                                    ("stemmed_bush_large", "walnut", 3, 2.5))):
        t = Tree(random.Random(7700 + i), wood, oak_pal, "spruce_fence")
        t.trunk(stem_h + 1)
        t.buttress(reach=1, tall=1)
        t.cluster((0, stem_h + 2, 0), size)
        _save(bp, "bushes", name, t.g, made)
    t = Tree(random.Random(7800), "maple", oak_pal, "spruce_fence")
    t.trunk(2)
    for k, rad in enumerate((1.8, 1.9, 1.7, 1.4, 1.0)):
        t.puff((0, 2 + k * 1.3, 0), rad, 1.0, ragged=0.25)
    _save(bp, "bushes", "tall_bush", t.g, made)

    # ---- rocks
    rocks = []
    for i, style in enumerate(ROCK_SETS):
        rng = random.Random(9000 + i * 17)
        rocks.append((f"{style}_boulder", style, [(0, 0.5, 0, 2.2, 1.8, 1.8)]))
        rocks.append((f"{style}_boulder_large", style,
                      [(0, 1.5, 0, 3.6, 3.0, 3.0), (2.5, 0.5, 1.5, 2.2, 1.8, 2.0)]))
        rocks.append((f"{style}_rock_pile", style,
                      [(rng.uniform(-3, 3), 0, rng.uniform(-3, 3), rng.uniform(1.0, 1.8), 1.1, rng.uniform(1.0, 1.8))
                       for _ in range(4)]))
    rocks.append(("grey_spire", "grey", [(0, 3, 0, 1.6, 5.5, 1.6), (1.2, 1, 0.8, 1.6, 2.5, 1.5)]))
    rocks.append(("dark_outcrop", "dark", [(0, 1, 0, 4.5, 2.0, 2.5), (-2, 2.5, 0.5, 2.0, 2.0, 1.8)]))
    rocks.append(("mossy_ledge", "mossy", [(0, 0.5, 0, 5.0, 1.2, 3.0), (1.5, 2, -0.5, 2.5, 1.5, 2.0)]))
    for i, (name, style, lumps) in enumerate(rocks):
        rng = random.Random(9500 + i * 11)
        _save(bp, "rocks", name, rock(rng, style, lumps), made, y_offset=0)

    _showcase(bp, made)
    return made


def _showcase(bp, made):
    """/function mbb/showcase lays everything out in rows in front of you."""
    lines = ["say Placing every More Building Blocks tree, bush and rock... stand back!"]
    z = 8
    # trees: every wood three times so you can see the variety
    trees = [m for m in made if m[0] == "tree"]
    for row in range(2):
        for i, (_, name, _, _, _) in enumerate(trees):
            lines.append(f"scriptevent {NS}:tree {name} {(i % 9) * 18} {z + (i // 9) * 20}")
        z += 44
    for group in ("bushes", "rocks"):
        items = [m for m in made if m[0] == group]
        x, row_depth = 0, 0
        for (_, name, size, origin, yoff) in items:
            if x > 110:
                z += row_depth + 4
                x, row_depth = 0, 0
            lines.append(f"structure load {NS}:{name} ~{x} ~{yoff} ~{z}")
            x += size[0] + 3
            row_depth = max(row_depth, size[2])
        z += row_depth + 8
    with open(os.path.join(bp, "functions", NS, "showcase.mcfunction"), "w") as f:
        f.write("\n".join(lines) + "\n")


def shutil_rm(path):
    import shutil
    shutil.rmtree(path, ignore_errors=True)


# ======================================================================== trees from Minecraft's own generators
# The script grows a real vanilla tree with Dimension.placeFeature, then
# walks that tree from its base and swaps its logs for our wood (keeping each
# log's direction) and makes its leaves persistent.
# name -> (vanilla feature, vanilla log ids it uses, our wood)
TREE_VARIANTS = {
    "maple_tree": ("minecraft:fancy_oak_tree_feature", ["minecraft:oak_log"], "maple"),
    "maple_tree_small": ("minecraft:oak_tree_feature", ["minecraft:oak_log"], "maple"),
    "walnut_tree": ("minecraft:roofed_tree_feature", ["minecraft:dark_oak_log"], "walnut"),
    "redwood_tree": ("minecraft:mega_spruce_tree_feature", ["minecraft:spruce_log"], "redwood"),
    "redwood_tree_pine": ("minecraft:mega_pine_tree_feature", ["minecraft:spruce_log"], "redwood"),
    "ironwood_tree": ("minecraft:pine_tree_feature", ["minecraft:spruce_log"], "ironwood"),
    "ironwood_tree_mountain": ("minecraft:mountain_pine_tree_feature", ["minecraft:spruce_log"], "ironwood"),
    "azure_tree": ("minecraft:spruce_tree_feature", ["minecraft:spruce_log"], "azure"),
    "ash_tree": ("minecraft:super_birch_tree_feature", ["minecraft:birch_log"], "ash"),
    "ash_tree_small": ("minecraft:birch_tree_feature", ["minecraft:birch_log"], "ash"),
    "ghostwood_tree": ("minecraft:pale_oak_tree_feature", ["minecraft:pale_oak_log"], "ghostwood"),
    "ebony_tree": ("minecraft:savanna_tree_feature", ["minecraft:acacia_log"], "ebony"),
    "rosewood_tree": ("minecraft:cherry_tree_feature", ["minecraft:cherry_log"], "rosewood"),
    "willow_tree": ("minecraft:swamp_tree_feature", ["minecraft:oak_log"], "willow"),
    "willow_tree_mangrove": ("minecraft:mangrove_tree_feature", ["minecraft:mangrove_log"], "willow"),
    "palm_tree": ("minecraft:jungle_tree_feature", ["minecraft:jungle_log"], "palm"),
    "palm_tree_mega": ("minecraft:mega_jungle_tree_feature", ["minecraft:jungle_log"], "palm"),
    "plumwood_tree": ("minecraft:azalea_tree_feature", ["minecraft:oak_log"], "plumwood"),
}


def build_tree_functions(bp, made):
    for name in TREE_VARIANTS:
        fn = os.path.join(bp, "functions", NS, "trees", f"{name}.mcfunction")
        os.makedirs(os.path.dirname(fn), exist_ok=True)
        with open(fn, "w") as fh:
            fh.write(f"scriptevent {NS}:tree {name}\n")
        made.append(("tree", name, (14, 0, 14), (0, 0, 0), 0))
