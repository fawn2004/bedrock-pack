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

class Tree:
    def __init__(self, rng, wood, spec):
        self.g = Grid()
        self.rng = rng
        self.wood = wood
        self.spec = spec
        self.trunk_cells = []
        self.path = {}

    def at(self, y):
        """Trunk position at height y (trunks can lean)."""
        y = max(0, min(int(y), max(self.path)))
        x, z = self.path[y]
        return (x, y, z)

    # ---- leaves with shading: dark underneath and inside, accents sprinkled
    def leaf(self, p, shade_t, inner=False):
        r, s = self.rng, self.spec
        if s.get("accent") and r.random() < s.get("accent_chance", 0.08):
            block = s["accent"][r.randrange(len(s["accent"]))]
        elif inner or shade_t < -0.25 or (shade_t < 0.2 and r.random() < 0.35):
            block = blk(f"{NS}:{self.wood}_leaves_dark")
        else:
            block = blk(f"{NS}:{self.wood}_leaves")
        self.g.set(p, block, P_LEAF)

    def blob(self, c, rx, ry, rz, density=1.0, hang=0, hang_chance=0.25, flat_bottom=False):
        r = self.rng
        cx, cy, cz = c
        cells = []
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            for y in range(int(cy - ry - 1), int(cy + ry + 2)):
                for z in range(int(cz - rz - 1), int(cz + rz + 2)):
                    dx, dy, dz = (x - cx) / rx, (y - cy) / ry, (z - cz) / rz
                    if flat_bottom and dy < -0.35:
                        continue
                    d = dx * dx + dy * dy + dz * dz
                    if d <= 1 + r.uniform(-0.35, 0.12) and r.random() < density:
                        self.leaf((x, y, z), dy, inner=d < 0.35)
                        cells.append((x, y, z))
        if hang:
            for (x, y, z) in cells:
                if self.g.has((x, y - 1, z)) or r.random() > hang_chance:
                    continue
                for k in range(1, r.randint(1, hang) + 1):
                    p = (x, y - k, z)
                    if self.g.has(p):
                        break
                    self.g.set(p, blk(f"{NS}:{self.wood}_leaves_dark") if k > 1 or r.random() < 0.6
                               else blk(f"{NS}:{self.wood}_leaves"))
        return cells

    # ---- wood
    def log_at(self, p, axis="y"):
        self.g.set(p, log(self.wood, axis), P_WOOD)

    def bark_stairs(self, p, facing, top=False):
        if not self.g.is_wood(p):
            self.g.set(p, mbb_stairs(f"{NS}:{self.wood}_bark_stairs", facing, top), P_DETAIL)

    def fence(self, p):
        if not self.g.is_wood(p):
            self.g.set(p, blk("minecraft:" + self.spec["fence"]), P_DETAIL)

    def trunk(self, h, width=1, lean=None, lean_every=99):
        x = z = 0
        top = None
        for y in range(h):
            if lean and y > 0 and y % lean_every == 0:
                x += DIR_VEC[lean][0]
                z += DIR_VEC[lean][1]
                # bracket under the step so the bend looks solid
                self.bark_stairs((x, y - 1, z), OPP[lean], top=True)
            for ox in range(width):
                for oz in range(width):
                    p = (x + ox, y, z + oz)
                    self.log_at(p)
                    if y == 0:
                        self.trunk_cells.append(p)
            self.path[y] = (x, z)
            top = (x, y, z)
        # wood block cap so the top isn't a log end showing through leaves
        for ox in range(width):
            for oz in range(width):
                self.g.set((top[0] + ox, top[1], top[2] + oz), log(self.wood, bark=True), P_WOOD)
        return top

    def roots(self, size=1):
        """Bark-stair flare round the base, plus a few creeping root logs."""
        r = self.rng
        cells = set(self.trunk_cells)
        for (x, y, z) in self.trunk_cells:
            for d, (dx, dz) in DIR_VEC.items():
                p = (x + dx, 0, z + dz)
                if (p[0], 0, p[2]) in cells:
                    continue
                if r.random() < 0.85:
                    self.bark_stairs(p, OPP[d])
                if size > 1 and r.random() < 0.5:   # second ring higher up
                    self.bark_stairs((p[0], 1, p[2]), OPP[d])
                if r.random() < 0.25 * size:       # creeping root
                    q = p
                    for _ in range(r.randint(1, 1 + size)):
                        self.g.set(q, log(self.wood, "x" if dx else "z"), P_WOOD)
                        q = (q[0] + dx, 0, q[2] + dz)
                    self.bark_stairs(q, OPP[d])

    def branch(self, start, d, length, rise_every=2, diag=None):
        """Grows a branch outwards from the trunk. Returns its end point."""
        x, y, z = start
        dx, dz = DIR_VEC[d]
        ex, ez = DIR_VEC[diag] if diag else (0, 0)
        first = True
        for i in range(length):
            if diag and i % 2 == 1:
                x, z = x + ex, z + ez
                axis = "x" if ex else "z"
            else:
                x, z = x + dx, z + dz
                axis = "x" if dx else "z"
            self.g.set((x, y, z), log(self.wood, axis), P_WOOD)
            if first:   # upside-down stair bracket under the joint
                self.bark_stairs((x, y - 1, z), OPP[d], top=True)
                first = False
            if rise_every and i % rise_every == rise_every - 1:
                y += 1
                self.log_at((x, y, z))
        return (x, y, z)

    def twigs(self, p, d=None, n=2):
        """Fence-post twigs poking out of a branch end."""
        r = self.rng
        x, y, z = p
        options = [(0, 1, 0)]
        if d:
            options.append((DIR_VEC[d][0], 0, DIR_VEC[d][1]))
        for dd in DIR_VEC.values():
            options.append((dd[0], 0, dd[1]))
        for _ in range(n):
            ox, oy, oz = options[r.randrange(len(options))]
            q = p
            for _ in range(r.randint(1, 2)):
                q = (q[0] + ox, q[1] + oy, q[2] + oz)
                if self.g.is_wood(q):
                    break
                self.fence(q)

    def branch_detail(self, end, d):
        r = self.rng
        self.twigs(end, d, n=r.randint(1, 3))
        if r.random() < 0.35:   # bark slab knot on top of the branch
            above = (end[0], end[1] + 1, end[2])
            if not self.g.has(above):
                self.g.set(above, mbb_slab(f"{NS}:{self.wood}_bark_slab"), P_DETAIL)


def horizontal_dirs(rng, n):
    dirs = list(DIR_VEC)
    rng.shuffle(dirs)
    out = []
    for i in range(n):
        d = dirs[i % 4]
        side = [k for k in DIR_VEC if k not in (d, OPP[d])]
        out.append((d, rng.choice(side + [None])))
    return out


# ---- tree shapes --------------------------------------------------------

def broadleaf(t, scale, h=(9, 12), crown=(3.6, 2.6), branches=(4, 6), blen=(3, 5),
              hang=1, density=1.0, width=1, top_extra=1.0):
    """Big rounded deciduous tree: several branch clusters + a crown."""
    r = t.rng
    H = int(r.randint(*h) * scale)
    w = 2 if (width == 2 and scale >= 1.2) else 1
    top = t.trunk(H, w)
    t.roots(2 if scale >= 1 else 1)
    n = max(3, int(r.randint(*branches) * scale))
    for i, (d, diag) in enumerate(horizontal_dirs(r, n)):
        y = int(H * r.uniform(0.45, 0.85))
        L = max(2, int(r.randint(*blen) * scale))
        end = t.branch(t.at(y), d, L, rise_every=r.choice((1, 2, 2)), diag=diag)
        t.branch_detail(end, d)
        rx = crown[0] * r.uniform(0.6, 0.85) * scale
        t.blob((end[0], end[1] + 1, end[2]), rx, crown[1] * 0.75 * scale, rx,
               density=density, hang=hang)
    cx = top[0] + (w - 1) / 2
    cz = top[2] + (w - 1) / 2
    t.blob((cx, top[1] + 1, cz), crown[0] * scale * top_extra, crown[1] * scale,
           crown[0] * scale * top_extra, density=density, hang=hang)
    # a few twigs breaking through the top of the crown
    for _ in range(int(3 * scale)):
        p = (int(cx + r.uniform(-2, 2) * scale), int(top[1] + crown[1] * scale), int(cz + r.uniform(-2, 2) * scale))
        if not t.g.is_wood(p):
            t.fence(p)


def conifer(t, scale, h=(16, 22), base_r=4.5, width=1):
    """Tall redwood: thick trunk, stacked cone of leaf tiers with branches."""
    r = t.rng
    H = int(r.randint(*h) * scale)
    w = width if scale >= 1 else 1
    top = t.trunk(H, w)
    t.roots(3 if w > 1 else 2)
    start = int(H * 0.3)
    y = start
    while y < H + 2:
        frac = (y - start) / max(1, (H + 2 - start))
        rad = max(1.2, base_r * scale * (1 - frac) + 0.8)
        cx, cz = top[0] + (w - 1) / 2, top[2] + (w - 1) / 2
        t.blob((cx, y, cz), rad, 1.3, rad, density=0.97, hang=1, hang_chance=0.15, flat_bottom=True)
        if rad > 2.2:
            for d in r.sample(list(DIR_VEC), 2):
                end = t.branch(t.at(y - 1), d, int(rad - 1), rise_every=0)
                t.twigs(end, d, 1)
        y += r.choice((2, 3))
    for k in range(1, 3):   # spire
        t.g.set((top[0], H + k, top[2]), blk(f"{NS}:{t.wood}_leaves"))


def column(t, scale, h=(17, 21)):
    """Ironwood: tall narrow cypress-like column."""
    r = t.rng
    H = int(r.randint(*h) * scale)
    top = t.trunk(H, 1)
    t.roots(1)
    for y in range(3, H + 3):
        frac = (y - 3) / (H)
        rad = 2.3 * scale * math.sin(math.pi * min(1, frac * 1.05)) ** 0.6 + 0.6
        t.blob((top[0], y, top[2]), rad, 1.2, rad, density=0.95)
        if y % 4 == 0 and y < H:
            d = r.choice(list(DIR_VEC))
            t.twigs(t.branch(t.at(y), d, 1, rise_every=0), d, 1)


def willow(t, scale):
    r = t.rng
    H = int(r.randint(10, 12) * scale)
    top = t.trunk(H, 1, lean=r.choice(list(DIR_VEC)), lean_every=4)
    t.roots(2)
    for d, diag in horizontal_dirs(r, max(4, int(5 * scale))):
        end = t.branch(t.at(H * r.uniform(0.6, 0.9)), d,
                       int(r.randint(3, 5) * scale), rise_every=2, diag=diag)
        t.branch_detail(end, d)
        t.blob((end[0], end[1] + 1, end[2]), 3 * scale, 1.6 * scale, 3 * scale,
               hang=int(6 * scale), hang_chance=0.55)
    t.blob((top[0], top[1] + 1, top[2]), 4.5 * scale, 2.2 * scale, 4.5 * scale,
           hang=int(7 * scale), hang_chance=0.6)


def umbrella(t, scale):
    """Ebony: tall bare trunk splitting into wide, flat-topped canopies."""
    r = t.rng
    H = int(r.randint(11, 14) * scale)
    top = t.trunk(H, 1)
    t.roots(2)
    for d, diag in horizontal_dirs(r, max(3, int(4 * scale))):
        end = t.branch(t.at(H * 0.7), d, int(r.randint(4, 6) * scale),
                       rise_every=1, diag=diag)
        t.branch_detail(end, d)
        t.blob((end[0], end[1] + 1, end[2]), 3.6 * scale, 1.3, 3.6 * scale, flat_bottom=True, hang=1)
    t.blob((top[0], top[1] + 1, top[2]), 4.5 * scale, 1.5, 4.5 * scale, flat_bottom=True, hang=1)


def palm(t, scale):
    r = t.rng
    H = int(r.randint(12, 15) * scale)
    lean = r.choice(list(DIR_VEC))
    top = t.trunk(H, 1, lean=lean, lean_every=r.choice((3, 4)))
    t.roots(1)
    crown = (top[0], top[1] + 1, top[2])
    t.g.set(crown, blk(f"{NS}:{t.wood}_leaves_dark"))
    t.blob(crown, 1.5, 1, 1.5)
    arms = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
    for ax, az in arms:
        L = int(r.randint(4, 6) * scale)
        x, y, z = crown
        for i in range(1, L + 1):
            x, z = x + ax, z + az
            if i in (L // 2 + 1, L):
                y -= 1
            t.leaf((x, y, z), 0.5)
            if i > 1:
                # frond edges and drooping tips
                t.leaf((x + az, y, z - ax), -0.5) if r.random() < 0.6 else None
                t.leaf((x - az, y, z + ax), -0.5) if r.random() < 0.6 else None
        t.leaf((x, y - 1, z), -1)
    # coconuts: walnut wood blocks under the crown
    for ax, az in r.sample(arms[:4], 2):
        t.g.set((crown[0] + ax, crown[1] - 1, crown[2] + az), log("walnut", bark=True), P_WOOD)


def blossom(t, scale):
    """Rosewood: short trunk forking into a wide, flat, flowery canopy."""
    r = t.rng
    H = int(r.randint(7, 9) * scale)
    top = t.trunk(H, 1)
    t.roots(2)
    for d, diag in horizontal_dirs(r, max(3, int(4 * scale))):
        end = t.branch(t.at(H - 2), d, int(r.randint(3, 5) * scale),
                       rise_every=1, diag=diag)
        t.branch_detail(end, d)
        t.blob((end[0], end[1] + 1, end[2]), 3.3 * scale, 1.8 * scale, 3.3 * scale,
               hang=2, hang_chance=0.3)
    t.blob((top[0], top[1] + 2, top[2]), 3.5 * scale, 2.2 * scale, 3.5 * scale, hang=2)


def dome(t, scale):
    """Plumwood: tall trunk with a big mushroom-like dome and a drooping rim."""
    r = t.rng
    H = int(r.randint(11, 13) * scale)
    top = t.trunk(H, 1)
    t.roots(2)
    R = 4.8 * scale
    for x in range(-int(R) - 1, int(R) + 2):
        for z in range(-int(R) - 1, int(R) + 2):
            d = math.hypot(x, z)
            if d > R + r.uniform(-0.4, 0.3):
                continue
            hgt = int(round(math.sqrt(max(0.0, R * R - d * d)) * 0.55))
            for y in range(0, hgt + 1):
                t.leaf((top[0] + x, top[1] + y, top[2] + z), (y - hgt / 2) / max(1, hgt), inner=y < hgt - 1)
            if d > R - 1.3:   # drooping rim
                for k in range(1, r.randint(1, 3) + 1):
                    t.leaf((top[0] + x, top[1] - k, top[2] + z), -1)
    for d in DIR_VEC:   # ribs under the dome
        end = t.branch((top[0], top[1] - 1, top[2]), d, int(R * 0.6), rise_every=0)
        t.twigs(end, d, 1)


def tiers(t, scale):
    """Azurewood: tall trunk with stacked round puffs."""
    r = t.rng
    H = int(r.randint(14, 17) * scale)
    top = t.trunk(H, 1)
    t.roots(2)
    y = int(H * 0.4)
    rad = 3.4 * scale
    while y <= H:
        for d in r.sample(list(DIR_VEC), 2):
            end = t.branch(t.at(y), d, max(1, int(rad - 1.5)), rise_every=0)
            t.twigs(end, d, 1)
        t.blob((top[0], y + 1, top[2]), rad, 1.6, rad, hang=1)
        y += 4
        rad = max(1.6, rad - 0.7)
    t.blob((top[0], H + 2, top[2]), 1.6, 1.6, 1.6)


def twisted(t, scale):
    """Ghostwood: crooked, many-branched, with sparse pale foliage."""
    r = t.rng
    H = int(r.randint(13, 16) * scale)
    top = t.trunk(H, 1, lean=r.choice(list(DIR_VEC)), lean_every=3)
    t.roots(2)
    for d, diag in horizontal_dirs(r, max(5, int(7 * scale))):
        y = int(H * r.uniform(0.35, 0.95))
        end = t.branch(t.at(y), d, int(r.randint(2, 5) * scale), rise_every=r.choice((1, 2)), diag=diag)
        t.twigs(end, d, n=3)
        if r.random() < 0.75:
            t.blob((end[0], end[1] + 1, end[2]), 2.2 * scale, 1.4, 2.2 * scale, density=0.75, hang=2)
    t.blob((top[0], top[1] + 1, top[2]), 2.8 * scale, 1.8, 2.8 * scale, density=0.8, hang=2)


# species -> (shape function, kwargs, twig fence, accent leaves)
SPECIES = {
    "maple": (broadleaf, dict(h=(13, 16), crown=(4.2, 3.0), branches=(5, 6)), "spruce_fence",
              [blk(f"{NS}:willow_leaves"), blk(f"{NS}:rosewood_leaves_dark")]),
    "redwood": (conifer, dict(h=(20, 26), base_r=4.8, width=2), "mangrove_fence", [leaf_v("spruce_leaves")]),
    "ebony": (umbrella, {}, "dark_oak_fence", [leaf_v("dark_oak_leaves")]),
    "willow": (willow, {}, "spruce_fence", [leaf_v("azalea_leaves")]),
    "ash": (broadleaf, dict(h=(16, 19), crown=(3.4, 4.0), branches=(4, 5), blen=(2, 4)), "pale_oak_fence",
            [leaf_v("birch_leaves")]),
    "azure": (tiers, {}, "dark_oak_fence", [blk(f"{NS}:ghostwood_leaves")]),
    "walnut": (broadleaf, dict(h=(13, 16), crown=(4.6, 3.2), branches=(6, 7), blen=(4, 6), width=2),
               "dark_oak_fence", [leaf_v("oak_leaves")]),
    "rosewood": (blossom, {}, "crimson_fence",
                 [leaf_v("cherry_leaves"), blk(f"{NS}:ghostwood_leaves"), leaf_v("azalea_leaves_flowered")]),
    "palm": (palm, {}, "jungle_fence", [leaf_v("jungle_leaves")]),
    "ironwood": (column, {}, "spruce_fence", [leaf_v("spruce_leaves")]),
    "ghostwood": (twisted, {}, "pale_oak_fence", [leaf_v("pale_oak_leaves")]),
    "plumwood": (dome, {}, "crimson_fence", [blk(f"{NS}:rosewood_leaves")]),
}

SIZES = [("small", 0.85), ("medium", 1.1), ("large", 1.45)]


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

    # ---- trees: every wood in 3 sizes
    for wi, (wood, (shape, kwargs, fence, accent)) in enumerate(SPECIES.items()):
        for si, (size_name, scale) in enumerate(SIZES):
            rng = random.Random(5000 + wi * 31 + si * 7)
            t = Tree(rng, wood, {"fence": fence, "accent": accent})
            shape(t, scale, **kwargs) if kwargs else shape(t, scale)
            _save(bp, "trees", f"{wood}_tree_{size_name}", t.g, made)

    # ---- bushes
    def L(w, dark=False):
        return blk(f"{NS}:{w}_leaves" + ("_dark" if dark else ""))

    bushes = [
        ("maple_bush", L("maple"), L("maple", True), L("willow"), 1.0, log("maple"), None),
        ("willow_bush", L("willow"), L("willow", True), leaf_v("azalea_leaves"), 1.0, None, None),
        ("rosewood_bush", L("rosewood"), L("rosewood", True), L("ghostwood"), 1.0, log("rosewood"), None),
        ("azure_bush", L("azure"), L("azure", True), L("ghostwood"), 0.9, None, None),
        ("plumwood_bush", L("plumwood"), L("plumwood", True), L("rosewood"), 1.1, log("plumwood"), None),
        ("ghostwood_bush", L("ghostwood"), L("ghostwood", True), None, 0.9, None, None),
        ("walnut_bush_large", L("walnut"), L("walnut", True), leaf_v("oak_leaves"), 1.5, log("walnut"), None),
        ("redwood_shrub", L("redwood"), L("redwood", True), leaf_v("spruce_leaves"), 1.2, log("redwood"), None),
        ("azalea_bush", leaf_v("azalea_leaves"), L("willow", True), leaf_v("azalea_leaves_flowered"), 1.2,
         None, blk("minecraft:moss_carpet")),
        ("ash_hedge", L("ash"), L("ash", True), leaf_v("birch_leaves"), 1.3, None, None),
        ("palm_shrub", L("palm"), L("palm", True), leaf_v("jungle_leaves"), 0.8, None, None),
        ("ironwood_bush", L("ironwood"), L("ironwood", True), None, 1.0, log("ironwood"), None),
    ]
    for i, (name, main, dark, acc, size, stem, flowers) in enumerate(bushes):
        rng = random.Random(7000 + i * 13)
        _save(bp, "bushes", name, bush(rng, main, dark, acc, size, stem, flowers), made)

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
    """/function mbb/showcase lays every structure out in rows in front of you."""
    lines = ["say Placing every More Building Blocks structure... stand back!"]
    z = 6
    for group in ("trees", "bushes", "rocks"):
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
