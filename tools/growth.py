"""Organic tree growth for the structure generator.

Broadleaf crowns are grown with the space-colonisation algorithm: random
"light" points fill the crown shape, and branch tips repeatedly grow one
block towards the points nearest them, splitting naturally where points pull
in different directions. Conifers are grown as whorls of drooping branches.

Branch thickness follows the pipe model (a limb is as thick as everything it
carries), so trunks taper into limbs, limbs into logs and logs into fence
twigs. A smoothing pass fills every diagonal step with stairs, and leaves
are placed as many small clumps around the twig tips, each with its own
light/dark bias.
"""
import math

import numpy as np

DIRS = {"east": (1, 0), "west": (-1, 0), "south": (0, 1), "north": (0, -1)}
OPP = {"east": "west", "west": "east", "north": "south", "south": "north"}


# ---------------------------------------------------------------- skeleton

class Skeleton:
    def __init__(self):
        self.pos = []      # np.array([x, y, z]) per node
        self.parent = []   # parent index or -1
        self.kind = []     # "trunk" | "branch" | "root" | "dead"

    def add(self, p, parent, kind="branch"):
        self.pos.append(np.asarray(p, dtype=float))
        self.parent.append(parent)
        self.kind.append(kind)
        return len(self.pos) - 1

    def children(self):
        ch = [[] for _ in self.pos]
        for i, p in enumerate(self.parent):
            if p >= 0:
                ch[p].append(i)
        return ch

    def weights(self):
        """Number of branch tips each node carries (pipe model)."""
        ch = self.children()
        w = [0] * len(self.pos)
        order = sorted(range(len(self.pos)), key=lambda i: self.depth(i), reverse=True)
        for i in order:
            w[i] = 1 if not ch[i] else sum(w[c] for c in ch[i])
        return w, ch

    def depth(self, i):
        d = 0
        while self.parent[i] >= 0:
            i = self.parent[i]
            d += 1
        return d


def grow_trunk(sk, rng, height, lean=(0.0, 0.0), wobble=0.12):
    x = z = 0.0
    prev = -1
    for y in range(height + 1):
        prev = sk.add((x, y, z), prev, "trunk")
        x += lean[0] + rng.uniform(-wobble, wobble)
        z += lean[1] + rng.uniform(-wobble, wobble)
    return prev


def colonise(sk, rng, points, start_from, step=1.0, influence=6.0, kill=1.7,
             tropism=(0.0, 0.15, 0.0), noise=0.25, max_iter=90):
    """Space colonisation. start_from: node indices allowed to sprout."""
    attract = np.asarray(points, dtype=float)
    active = set(start_from)
    trop = np.asarray(tropism, dtype=float)
    for _ in range(max_iter):
        if len(attract) == 0:
            break
        idx = np.array(sorted(active))
        nodes = np.array([sk.pos[i] for i in idx])
        d = np.linalg.norm(attract[:, None, :] - nodes[None, :, :], axis=2)
        nearest = d.argmin(axis=1)
        nd = d[np.arange(len(attract)), nearest]
        influenced = nd < influence
        if not influenced.any():
            break
        grew = False
        for k in np.unique(nearest[influenced]):
            sel = influenced & (nearest == k)
            node = nodes[k]
            vec = attract[sel] - node
            vec = vec / np.maximum(np.linalg.norm(vec, axis=1, keepdims=True), 1e-6)
            dirn = vec.sum(axis=0)
            dirn = dirn / max(np.linalg.norm(dirn), 1e-6)
            dirn = dirn + trop + np.array([rng.uniform(-noise, noise) for _ in range(3)])
            dirn = dirn / max(np.linalg.norm(dirn), 1e-6)
            new = node + dirn * step
            # don't stack nodes on top of each other
            if min(np.linalg.norm(sk.pos[j] - new) for j in idx[max(0, k - 40):k + 40]) < 0.45:
                continue
            ni = sk.add(new, int(idx[k]), "branch")
            active.add(ni)
            grew = True
        killed = (np.linalg.norm(attract[:, None, :] - np.array([sk.pos[i] for i in sorted(active)])[None],
                                 axis=2).min(axis=1) < kill)
        attract = attract[~killed]
        if not grew:
            break


def crown_points(rng, shape, n, center, rx, ry, rz, lumps=8, lump_r=0.45):
    """Random attraction points inside a crown shape. Points are gathered
    into lumps so the canopy grows as separate masses with gaps between."""
    cx, cy, cz = center

    def inside(x, y, z):
        dx, dy, dz = (x - cx) / rx, (y - cy) / ry, (z - cz) / rz
        if shape == "ellipsoid":
            return dx * dx + dy * dy + dz * dz <= 1
        if shape == "dome":
            return dy >= -0.25 and dx * dx + dy * dy + dz * dz <= 1
        if shape == "disc":
            return abs(dy) <= 1 and dx * dx + dz * dz <= 1
        if shape == "cone":
            h = (dy + 1) / 2   # 0 bottom .. 1 top
            return 0 <= h <= 1 and dx * dx + dz * dz <= (1 - h) ** 2
        return False

    centres = []
    while len(centres) < lumps:
        p = (cx + rng.uniform(-rx, rx), cy + rng.uniform(-ry, ry), cz + rng.uniform(-rz, rz))
        if inside(*p):
            centres.append(p)
    pts = []
    tries = 0
    while len(pts) < n and tries < n * 60:
        tries += 1
        c = centres[rng.randrange(len(centres))]
        p = (c[0] + rng.gauss(0, rx * lump_r), c[1] + rng.gauss(0, ry * lump_r), c[2] + rng.gauss(0, rz * lump_r))
        if inside(*p):
            pts.append(p)
    return pts


def whorls(sk, rng, trunk_nodes, start_y, top_y, max_len, per_whorl=(5, 7), gap=(2, 3),
           droop=0.1, up_start=0.25, profile="cone", side_twigs=True):
    """Conifer branches: rings of branches around the trunk, longest at the
    bottom, each starting slightly upward and drooping towards the tip."""
    y = start_y
    ring = 0
    while y <= top_y:
        frac = (y - start_y) / max(1, top_y - start_y)
        if profile == "cone":
            length = max(1.0, max_len * (1 - frac) ** 0.9 + 0.8)
        else:   # pine: short tufted branches
            length = max(1.0, max_len * (0.55 + 0.45 * (1 - frac)))
        n = rng.randint(*per_whorl)
        a0 = rng.uniform(0, math.tau) + ring * 0.6
        base = trunk_nodes[min(int(y), len(trunk_nodes) - 1)]
        for k in range(n):
            ang = a0 + k * math.tau / n + rng.uniform(-0.25, 0.25)
            L = length * rng.uniform(0.75, 1.1)
            vx, vz = math.cos(ang), math.sin(ang)
            vy = up_start
            prev = base
            p = sk.pos[base].copy()
            steps = max(1, int(round(L)))
            for i in range(steps):
                p = p + np.array([vx, vy, vz])
                vy -= droop
                prev = sk.add(p.copy(), prev, "branch")
                if side_twigs and i >= 1 and rng.random() < 0.55:
                    side = 1 if rng.random() < 0.5 else -1
                    q = p + np.array([-vz * side, -0.15, vx * side]) * rng.uniform(0.9, 1.4)
                    sk.add(q, prev, "branch")
        y += rng.randint(*gap)
        ring += 1


def roots(sk, rng, base_node, count, reach, spread=0.4):
    for k in range(count):
        ang = k * math.tau / count + rng.uniform(-spread, spread)
        vx, vz = math.cos(ang), math.sin(ang)
        p = sk.pos[base_node].copy() + np.array([0, 1.2, 0])
        prev = base_node
        L = rng.uniform(reach * 0.5, reach)
        steps = max(1, int(round(L)))
        for i in range(steps):
            p = p + np.array([vx, -0.45 if i < 2 else -0.1, vz])
            p[1] = max(p[1], -1.0)
            prev = sk.add(p.copy(), prev, "root")


# ---------------------------------------------------------------- voxelising

def _line(a, b):
    """6-connected voxel path from a to b (steps one axis at a time,
    horizontal moves before vertical so steps read as stairs)."""
    a = tuple(int(round(v)) for v in a)
    b = tuple(int(round(v)) for v in b)
    out = [a]
    cur = list(a)
    n = max(abs(b[i] - a[i]) for i in range(3))
    for s in range(1, n + 1):
        target = [int(round(a[i] + (b[i] - a[i]) * s / n)) for i in range(3)]
        for axis in (0, 2, 1):
            if cur[axis] != target[axis]:
                cur[axis] = target[axis]
                out.append(tuple(cur))
    return out


def axis_of(v):
    ax = int(np.argmax(np.abs(v)))
    return "x" if ax == 0 else ("y" if ax == 1 else "z")


def voxelise(tree, sk, rmax, twig_r=0.3, fence_chance=0.45):
    """Turns the skeleton into blocks on the Tree's grid."""
    w, ch = sk.weights()
    W = max(w[i] for i in range(len(w)) if sk.kind[i] == "trunk") if "trunk" in sk.kind else max(w)
    radius = []
    top_y = max(float(sk.pos[i][1]) for i in range(len(w)) if sk.kind[i] == "trunk") if "trunk" in sk.kind else 1
    for i in range(len(w)):
        r = rmax * (w[i] / W) ** 0.5
        if sk.kind[i] == "trunk":
            yy = float(sk.pos[i][1]) / max(1.0, top_y)
            r = rmax * (1.0 - 0.45 * yy) * (w[i] / W) ** 0.25
            if sk.pos[i][1] < 1.5:
                r += 0.2
        if sk.kind[i] == "root":
            r = max(0.45, rmax * 0.55)
        if sk.kind[i] == "dead":
            r = 0.2
        radius.append(r)
    for i, par in enumerate(sk.parent):
        if par < 0:
            continue
        a, b = sk.pos[par], sk.pos[i]
        r = (radius[i] + radius[par]) / 2 if sk.kind[i] != "root" else radius[i]
        v = b - a
        ax = axis_of(v)
        if r >= 0.8:
            # thick trunk / limb: fill a disc round the axis
            steps = max(1, int(np.linalg.norm(v) * 3))
            for s in range(steps + 1):
                c = a + v * s / steps
                rr = int(math.ceil(r))
                for dx in range(-rr, rr + 1):
                    for dz in range(-rr, rr + 1):
                        if dx * dx + dz * dz <= r * r + 0.3:
                            tree.wood_at((int(round(c[0])) + dx, int(round(c[1])), int(round(c[2])) + dz), ax)
            continue
        cells = _line(a, b)
        for j, p in enumerate(cells):
            if r < twig_r:
                if j > 0 and tree.rng.random() < fence_chance:
                    tree.fence(p)
            else:
                step_ax = ax
                if j > 0:
                    d = np.subtract(p, cells[j - 1])
                    step_ax = axis_of(d)
                tree.wood_at(p, step_ax)
    return w, ch, radius


def smooth_steps(tree, chance=0.85):
    """Fill the corner of every diagonal step in the woodwork with a stair,
    so branches and roots read as smooth slopes instead of blocky zig-zags."""
    rng = tree.rng
    wood_set = set(p for p, (b, prio) in tree.g.b.items() if prio == 3)
    wood = sorted(wood_set)
    for (x, y, z) in wood:
        for d, (dx, dz) in DIRS.items():
            if (x + dx, y + 1, z + dz) not in wood_set:
                continue
            above, beside = (x, y + 1, z), (x + dx, y, z + dz)
            if above in wood_set and beside in wood_set:
                continue
            if rng.random() > chance:
                continue
            if above not in wood_set and not tree.g.has(above):
                tree.stairs(above, d)                 # ramp up towards the next block
            if beside not in wood_set and not tree.g.has(beside):
                tree.stairs(beside, OPP[d], top=True)  # bracket underneath it


def leaves_at_tips(tree, sk, w, ch, radius, leaf_r=1.8, along=0.35, max_w=3, density=0.9,
                   hang=0, hang_chance=0.25, flat=0.75, skip=0.0):
    """Small leaf clumps round every twig tip (and along the finest twigs),
    each with its own tone bias so the canopy shows light and shadow."""
    rng = tree.rng
    for i in range(len(sk.pos)):
        if sk.kind[i] not in ("branch",) or w[i] > max_w:
            continue
        is_tip = not ch[i]
        if not is_tip and rng.random() > along:
            continue
        if rng.random() < skip:
            continue
        c = sk.pos[i] + np.array([rng.uniform(-0.4, 0.4), rng.uniform(0.1, 0.6), rng.uniform(-0.4, 0.4)])
        r = leaf_r * rng.uniform(0.7, 1.15) * (1.0 if is_tip else 0.75)
        bias = rng.uniform(-0.45, 0.45)
        tree.clump(c, r, r * flat, bias=bias, density=density, hang=hang, hang_chance=hang_chance)
