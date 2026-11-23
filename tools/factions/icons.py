"""Smooth, glossy UI icons for the Factions Core menus.

Every icon is drawn as vector shapes on a 256px canvas (gradient fill,
dark outline, soft top highlight), then scaled down to 64px.
"""
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 256
OUT = 64
INK = (12, 16, 32, 255)

# (top colour, bottom colour)
GOLD = ((255, 214, 80), (205, 120, 18))
CYAN = ((130, 236, 255), (25, 135, 225))
BLUE = ((110, 170, 255), (30, 70, 190))
RED = ((255, 120, 105), (185, 30, 45))
GREEN = ((150, 245, 115), (35, 150, 60))
PURPLE = ((215, 150, 255), (115, 45, 200))
WHITE = ((255, 255, 255), (185, 198, 222))
BROWN = ((210, 145, 85), (115, 65, 30))
GRAY = ((210, 215, 228), (105, 112, 130))
DARK = ((90, 96, 120), (28, 30, 44))
SKIN = ((255, 214, 170), (220, 160, 110))
ORANGE = ((255, 180, 80), (220, 90, 20))
PINK = ((255, 160, 220), (205, 60, 150))
LIME = ((200, 255, 120), (90, 190, 40))

RARITY = {
    "common": WHITE, "rare": BLUE, "epic": PURPLE, "legendary": GOLD, "mythic": RED,
}


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # very old Pillow
        return ImageFont.load_default()


class Icon:
    def __init__(self):
        self.img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    def shape(self, draw_fn, colors, outline=8, gloss=True):
        """Fill a shape (drawn in white on a mask) with a vertical gradient."""
        m = Image.new("L", (S, S), 0)
        draw_fn(ImageDraw.Draw(m))
        box = m.getbbox()
        if not box:
            return m
        if outline:
            ring = m.filter(ImageFilter.MaxFilter(outline * 2 + 1))
            self.img.paste(Image.new("RGBA", (S, S), INK), (0, 0), ring)
        top, bottom = colors
        y0, y1 = box[1], box[3]
        grad = Image.new("RGBA", (S, S))
        gd = ImageDraw.Draw(grad)
        for y in range(S):
            t = 0 if y <= y0 else 1 if y >= y1 else (y - y0) / max(1, y1 - y0)
            gd.line([(0, y), (S, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
        self.img.paste(grad, (0, 0), m)
        if gloss:
            hl = Image.new("L", (S, S), 0)
            hd = ImageDraw.Draw(hl)
            mid = y0 + (y1 - y0) * 0.45
            for y in range(y0, int(mid)):
                hd.line([(0, y), (S, y)], fill=int(70 * (1 - (y - y0) / max(1, mid - y0))))
            from PIL import ImageChops
            hl = ImageChops.multiply(hl, m)
            self.img.paste(Image.new("RGBA", (S, S), (255, 255, 255, 255)), (0, 0), hl)
        return m

    def lines(self, pts_list, color, width):
        d = ImageDraw.Draw(self.img)
        for pts in pts_list:
            d.line(pts, fill=color, width=width, joint="curve")

    def text(self, s, center, size, color=(255, 255, 255, 255), stroke=6):
        d = ImageDraw.Draw(self.img)
        f = font(size)
        d.text(center, s, font=f, fill=color, anchor="mm", stroke_width=stroke, stroke_fill=INK)

    def done(self, size=OUT):
        a = self.img.split()[3]
        ring = a.filter(ImageFilter.MaxFilter(9))
        base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        base.paste(Image.new("RGBA", (S, S), INK), (0, 0), ring)
        base.alpha_composite(self.img)
        return base.resize((size, size), Image.LANCZOS)


def poly(pts):
    return lambda d: d.polygon(pts, fill=255)


def ell(box):
    return lambda d: d.ellipse(box, fill=255)


def rrect(box, r):
    return lambda d: d.rounded_rectangle(box, r, fill=255)


def star_pts(cx, cy, r1, r2, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        r = r1 if i % 2 == 0 else r2
        a = math.radians(rot + i * 180 / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# ---------------------------------------------------------------- shapes

def shield(c1=BLUE, c2=WHITE, emblem="star"):
    i = Icon()
    i.shape(poly([(128, 18), (226, 50), (218, 140), (128, 238), (38, 140), (30, 50)]), c1)
    i.shape(poly([(128, 52), (192, 72), (186, 134), (128, 200), (70, 134), (64, 72)]), c2, outline=4)
    if emblem == "star":
        i.shape(poly(star_pts(128, 126, 46, 20)), GOLD, outline=5)
    elif emblem == "check":
        i.lines([[(96, 126), (120, 152), (164, 100)]], INK[:3] + (255,), 26)
        i.lines([[(96, 126), (120, 152), (164, 100)]], (60, 200, 90, 255), 14)
    return i


def coin(c=GOLD, sym="$"):
    i = Icon()
    i.shape(ell((30, 30, 226, 226)), c)
    i.shape(ell((62, 62, 194, 194)), (c[1], c[0]), outline=4, gloss=False)
    i.text(sym, (128, 132), 110, (255, 246, 200, 255), 5)
    return i


def gem(c=CYAN):
    i = Icon()
    i.shape(poly([(78, 34), (178, 34), (230, 96), (128, 230), (26, 96)]), c)
    d = ImageDraw.Draw(i.img)
    lc = (255, 255, 255, 150)
    d.line([(26, 96), (230, 96)], fill=lc, width=5)
    d.line([(78, 34), (104, 96), (128, 230)], fill=lc, width=4)
    d.line([(178, 34), (152, 96), (128, 230)], fill=lc, width=4)
    d.line([(104, 96), (128, 34), (152, 96)], fill=lc, width=4)
    return i


def person(i, ox=0, oy=0, sc=1.0, body=BLUE):
    def t(x, y):
        return (128 + (x - 128) * sc + ox, 128 + (y - 128) * sc + oy)
    i.shape(lambda d: d.rounded_rectangle([t(46, 138), t(210, 236)], int(50 * sc), fill=255), body)
    i.shape(lambda d: d.ellipse([t(82, 26), t(174, 118)], fill=255), SKIN)


def player():
    i = Icon()
    person(i)
    return i


def players():
    i = Icon()
    person(i, 44, -10, 0.8, GREEN)
    person(i, -30, 10, 0.86, BLUE)
    return i


def bars():
    i = Icon()
    for k, (x, h) in enumerate([(34, 80), (100, 130), (166, 190)]):
        i.shape(rrect((x, 226 - h, x + 56, 226), 10), GREEN)
    return i


def globe():
    i = Icon()
    i.shape(ell((24, 24, 232, 232)), BLUE)
    i.shape(poly([(70, 60), (120, 50), (138, 90), (110, 120), (120, 160), (90, 196), (70, 150), (50, 110)]), GREEN, outline=3)
    i.shape(poly([(160, 70), (200, 100), (206, 150), (170, 180), (150, 140), (168, 110)]), GREEN, outline=3)
    return i


def pin():
    i = Icon()
    i.shape(lambda d: (d.ellipse((50, 18, 206, 174), fill=255), d.polygon([(64, 130), (192, 130), (128, 240)], fill=255)), RED)
    i.shape(ell((96, 64, 160, 128)), WHITE, outline=4, gloss=False)
    return i


def bag():
    i = Icon()
    i.lines([[(84, 92), (84, 60), (128, 30), (172, 60), (172, 92)]], INK, 24)
    i.lines([[(84, 92), (84, 60), (128, 30), (172, 60), (172, 92)]], (240, 200, 120, 255), 12)
    i.shape(rrect((36, 84, 220, 232), 30), ORANGE)
    i.shape(poly(star_pts(128, 158, 42, 18)), GOLD, outline=5)
    return i


def chest(c=BROWN, trim=GOLD):
    i = Icon()
    i.shape(rrect((26, 104, 230, 228), 12), c)
    i.shape(rrect((26, 40, 230, 112), 26), (c[0], c[1]))
    i.shape(rrect((26, 100, 230, 120), 4), trim, outline=4)
    i.shape(rrect((106, 92, 150, 150), 8), trim, outline=5)
    return i


def book(c=PURPLE, sparkle=True):
    i = Icon()
    i.shape(rrect((54, 30, 210, 226), 10), WHITE)
    i.shape(rrect((40, 22, 194, 218), 14), c)
    i.shape(rrect((40, 22, 70, 218), 8), (c[1], c[1]), outline=3, gloss=False)
    i.shape(poly(star_pts(132, 118, 40, 16, 4, -90)), GOLD, outline=5)
    if sparkle:
        i.shape(poly(star_pts(210, 46, 26, 8, 4)), WHITE, outline=4)
    return i


def podium():
    i = Icon()
    i.shape(rrect((92, 98, 164, 232), 6), GOLD)
    i.shape(rrect((24, 140, 96, 232), 6), GRAY)
    i.shape(rrect((160, 166, 232, 232), 6), ORANGE)
    i.shape(poly(star_pts(128, 52, 42, 18)), GOLD, outline=6)
    return i


def gift():
    i = Icon()
    i.shape(rrect((40, 106, 216, 232), 10), RED)
    i.shape(rrect((28, 76, 228, 114), 10), RED)
    i.shape(rrect((112, 76, 144, 232), 2), GOLD, outline=4)
    i.shape(lambda d: (d.ellipse((60, 30, 128, 82), fill=255), d.ellipse((128, 30, 196, 82), fill=255)), GOLD)
    return i


def scroll():
    i = Icon()
    i.shape(rrect((52, 40, 204, 216), 8), ((250, 232, 190), (215, 180, 120)))
    i.shape(rrect((34, 26, 222, 54), 14), ((230, 200, 140), (170, 120, 60)))
    i.shape(rrect((34, 204, 222, 232), 14), ((230, 200, 140), (170, 120, 60)))
    d = ImageDraw.Draw(i.img)
    for y in (90, 122, 154, 182):
        d.line([(80, y), (176 if y != 182 else 140, y)], fill=(120, 80, 40, 255), width=10)
    return i


def gavel():
    i = Icon()
    i.shape(rrect((40, 196, 216, 232), 8), BROWN)
    i.shape(poly([(120, 118), (138, 100), (230, 192), (212, 210)]), ((180, 120, 70), (110, 60, 25)))
    i.shape(poly([(60, 60), (120, 0 + 22), (176, 78), (116, 136)]), GOLD)
    return i


def house():
    i = Icon()
    i.shape(rrect((56, 118, 200, 232), 6), WHITE)
    i.shape(poly([(128, 22), (238, 126), (18, 126)]), RED)
    i.shape(rrect((106, 164, 150, 232), 6), BROWN, outline=5)
    i.shape(rrect((156, 140, 186, 168), 4), CYAN, outline=4, gloss=False)
    return i


def skull():
    i = Icon()
    i.shape(lambda d: (d.ellipse((38, 22, 218, 182), fill=255), d.rounded_rectangle((78, 150, 178, 226), 16, fill=255)), WHITE)
    d = ImageDraw.Draw(i.img)
    d.ellipse((72, 82, 120, 132), fill=INK)
    d.ellipse((136, 82, 184, 132), fill=INK)
    d.polygon([(128, 136), (114, 160), (142, 160)], fill=INK)
    for x in (98, 128, 158):
        d.line([(x, 186), (x, 226)], fill=INK, width=8)
    return i


def flag(c=RED):
    i = Icon()
    i.shape(rrect((44, 20, 64, 236), 6), GRAY)
    i.shape(poly([(64, 30), (150, 22), (226, 50), (226, 132), (150, 112), (64, 126)]), c)
    return i


def trophy():
    i = Icon()
    i.lines([[(70, 60), (34, 70), (40, 112), (82, 130)], [(186, 60), (222, 70), (216, 112), (174, 130)]], INK, 26)
    i.lines([[(70, 60), (34, 70), (40, 112), (82, 130)], [(186, 60), (222, 70), (216, 112), (174, 130)]], (235, 170, 40, 255), 12)
    i.shape(lambda d: (d.rectangle((62, 28, 194, 90), fill=255), d.chord((62, 20, 194, 170), 0, 180, fill=255)), GOLD)
    i.shape(rrect((112, 160, 144, 200), 4), GOLD)
    i.shape(rrect((70, 196, 186, 232), 8), BROWN)
    i.shape(poly(star_pts(128, 84, 30, 13)), WHITE, outline=4)
    return i


def gear(c=GRAY):
    i = Icon()
    pts = []
    for k in range(32):
        a = math.radians(k * 360 / 32)
        r = 110 if (k // 2) % 2 == 0 else 84
        pts.append((128 + r * math.cos(a), 128 + r * math.sin(a)))
    i.shape(poly(pts), c)
    d = ImageDraw.Draw(i.img)
    d.ellipse((92, 92, 164, 164), fill=INK)
    d.ellipse((104, 104, 152, 152), fill=(0, 0, 0, 0))
    return i


def wrench():
    i = Icon()
    i.shape(poly([(60, 210), (40, 190), (150, 80), (170, 100)]), GRAY)
    i.shape(lambda d: (d.ellipse((130, 22, 234, 126), fill=255)), GRAY)
    d = ImageDraw.Draw(i.img)
    d.polygon([(180, 30), (226, 30), (226, 76), (190, 76)], fill=(0, 0, 0, 0))
    i.shape(poly(star_pts(70, 70, 40, 16)), RED, outline=5)
    return i


def arrow(direction="right", c=CYAN):
    i = Icon()
    pts = [(30, 100), (130, 100), (130, 40), (226, 128), (130, 216), (130, 156), (30, 156)]
    if direction == "left":
        pts = [(256 - x, y) for x, y in pts]
    elif direction == "up":
        pts = [(y, 256 - x) for x, y in pts]
    elif direction == "down":
        pts = [(y, x) for x, y in pts]
    i.shape(poly(pts), c)
    return i


def check():
    i = Icon()
    i.shape(poly([(24, 132), (64, 92), (104, 132), (196, 40), (236, 80), (104, 212)]), GREEN)
    return i


def cross(c=RED):
    i = Icon()
    i.shape(lambda d: (d.line([(52, 52), (204, 204)], fill=255, width=52), d.line([(204, 52), (52, 204)], fill=255, width=52)), c)
    return i


def plus(c=GREEN):
    i = Icon()
    i.shape(lambda d: (d.rounded_rectangle((100, 30, 156, 226), 14, fill=255), d.rounded_rectangle((30, 100, 226, 156), 14, fill=255)), c)
    return i


def swords(two=True):
    i = Icon()

    def sword(flip):
        def f(x, y):
            return (256 - x, y) if flip else (x, y)
        i.shape(poly([f(40, 40), f(70, 30), f(190, 150), f(160, 180)]), WHITE)
        i.shape(poly([f(150, 196), f(196, 150), f(208, 162), f(162, 208)]), GOLD)
        i.shape(poly([f(176, 190), f(190, 176), f(232, 218), f(218, 232)]), BROWN)
    sword(False)
    if two:
        sword(True)
    return i


def door():
    i = Icon()
    i.shape(rrect((40, 22, 150, 234), 8), BROWN)
    i.shape(ell((120, 120, 138, 138)), GOLD, outline=3)
    i.shape(poly([(130, 104), (190, 104), (190, 70), (240, 128), (190, 186), (190, 152), (130, 152)]), RED)
    return i


def crown():
    i = Icon()
    i.shape(poly([(28, 70), (82, 120), (128, 40), (174, 120), (228, 70), (206, 200), (50, 200)]), GOLD)
    i.shape(rrect((44, 196, 212, 230), 8), GOLD)
    for x in (82, 128, 174):
        i.shape(ell((x - 13, 150, x + 13, 176)), RED, outline=3)
    return i


def mapicon():
    i = Icon()
    i.shape(poly([(24, 50), (92, 30), (164, 50), (232, 30), (232, 206), (164, 226), (92, 206), (24, 226)]), ((250, 236, 200), (210, 180, 120)))
    d = ImageDraw.Draw(i.img)
    d.line([(92, 30), (92, 206)], fill=(150, 110, 60, 255), width=5)
    d.line([(164, 50), (164, 226)], fill=(150, 110, 60, 255), width=5)
    d.line([(50, 180), (100, 140), (140, 160), (180, 100)], fill=(40, 120, 220, 255), width=8)
    i.lines([[(170, 70), (206, 106)], [(206, 70), (170, 106)]], (220, 40, 40, 255), 12)
    return i


def note():
    i = Icon()
    i.shape(rrect((14, 60, 242, 196), 12), GREEN)
    i.shape(ell((92, 86, 164, 170)), LIME, outline=4)
    i.text("$", (128, 130), 72, (255, 255, 255, 255), 4)
    return i


def coins():
    i = Icon()
    for k, y in enumerate((170, 128, 86)):
        i.shape(ell((40, y - 30, 216, y + 40)), GOLD)
    i.text("$", (128, 98), 60, (255, 246, 200, 255), 4)
    return i


def cube(top=((150, 220, 90), (90, 170, 50)), left=((150, 110, 70), (110, 75, 45)), right=((120, 85, 55), (80, 55, 30)), specks=None):
    i = Icon()
    i.shape(poly([(128, 24), (226, 76), (128, 128), (30, 76)]), top)
    i.shape(poly([(30, 76), (128, 128), (128, 236), (30, 184)]), left)
    i.shape(poly([(226, 76), (128, 128), (128, 236), (226, 184)]), right)
    if specks:
        for (x, y) in [(70, 140), (90, 180), (160, 150), (190, 120), (176, 190)]:
            i.shape(poly([(x, y - 14), (x + 12, y), (x, y + 14), (x - 12, y)]), specks, outline=3, gloss=False)
    return i


def wheat():
    i = Icon()
    i.lines([[(128, 236), (128, 60)]], INK, 20)
    i.lines([[(128, 236), (128, 60)]], (120, 170, 60, 255), 10)
    for k in range(5):
        y = 60 + k * 32
        for side in (-1, 1):
            cx = 128 + side * 30
            i.shape(ell((cx - 22, y - 14, cx + 22, y + 14)), GOLD, outline=4)
    i.shape(ell((106, 22, 150, 66)), GOLD, outline=4)
    return i


def zombie():
    i = Icon()
    i.shape(rrect((36, 36, 220, 220), 16), ((120, 200, 100), (50, 120, 50)))
    d = ImageDraw.Draw(i.img)
    d.rectangle((70, 100, 110, 130), fill=INK)
    d.rectangle((146, 100, 186, 130), fill=INK)
    d.rectangle((96, 160, 160, 182), fill=(40, 80, 40, 255))
    return i


def tnt(c=RED, label="TNT"):
    i = Icon()
    i.shape(rrect((44, 24, 212, 232), 12), c)
    i.shape(rrect((44, 98, 212, 158), 4), WHITE, outline=4)
    i.text(label, (128, 129), 44, (30, 30, 30, 255), 0)
    i.lines([[(128, 24), (140, 6)]], INK, 10)
    return i


def cage(inner=((255, 150, 60), (200, 50, 20)), q=False):
    i = Icon()
    i.shape(rrect((30, 30, 226, 226), 12), DARK)
    d = ImageDraw.Draw(i.img)
    d.rectangle((52, 52, 204, 204), fill=(10, 12, 22, 255))
    i.shape(poly([(128, 70), (172, 150), (154, 194), (102, 194), (84, 150)]), inner, outline=3)
    for x in (70, 104, 138, 172):
        d.line([(x + 6, 40), (x + 6, 216)], fill=(150, 160, 180, 255), width=8)
    for y in (90, 150):
        d.line([(40, y), (216, y)], fill=(150, 160, 180, 255), width=8)
    if q:
        i.text("?", (128, 128), 140, (255, 120, 255, 255), 8)
    return i


def robot(c=GRAY, eye=CYAN):
    i = Icon()
    i.lines([[(128, 58), (128, 22)]], INK, 18)
    i.lines([[(128, 58), (128, 22)]], (200, 200, 210, 255), 8)
    i.shape(ell((110, 8, 146, 44)), RED, outline=4)
    i.shape(rrect((40, 54, 216, 180), 30), c)
    i.shape(rrect((62, 84, 194, 146), 18), DARK, outline=4, gloss=False)
    i.shape(ell((80, 96, 118, 134)), eye, outline=3)
    i.shape(ell((138, 96, 176, 134)), eye, outline=3)
    i.shape(rrect((24, 186, 232, 232), 20), DARK)
    d = ImageDraw.Draw(i.img)
    for x in range(44, 220, 26):
        d.line([(x, 194), (x, 224)], fill=(130, 135, 150, 255), width=6)
    return i


def key(c=GOLD):
    i = Icon()
    i.shape(lambda d: (d.ellipse((20, 20, 120, 120), fill=255), d.line([(90, 90), (220, 220)], fill=255, width=34),
                       d.polygon([(168, 168), (196, 140), (214, 158), (186, 186)], fill=255),
                       d.polygon([(196, 196), (224, 168), (240, 184), (212, 212)], fill=255)), c)
    d = ImageDraw.Draw(i.img)
    d.ellipse((50, 50, 90, 90), fill=INK)
    d.ellipse((58, 58, 82, 82), fill=(0, 0, 0, 0))
    return i


def bucket(content=GRAY):
    i = Icon()
    i.lines([[(56, 90), (70, 30), (186, 30), (200, 90)]], INK, 20)
    i.lines([[(56, 90), (70, 30), (186, 30), (200, 90)]], (190, 195, 210, 255), 8)
    i.shape(poly([(36, 80), (220, 80), (196, 230), (60, 230)]), GRAY)
    i.shape(ell((40, 64, 216, 104)), content, outline=4)
    return i


def wand():
    i = Icon()
    i.shape(poly([(30, 210), (46, 226), (170, 102), (154, 86)]), BROWN)
    i.shape(poly(star_pts(178, 78, 64, 28)), GOLD)
    return i


def shard(c=GREEN):
    i = Icon()
    i.shape(poly([(128, 16), (196, 96), (164, 236), (92, 236), (60, 96)]), c)
    d = ImageDraw.Draw(i.img)
    d.line([(128, 16), (128, 236)], fill=(255, 255, 255, 120), width=5)
    return i


def lightning():
    i = Icon()
    i.shape(poly([(150, 14), (52, 140), (118, 140), (92, 242), (204, 104), (136, 104), (172, 14)]), GOLD)
    return i


def pickaxe(c=CYAN):
    i = Icon()
    i.shape(poly([(56, 226), (34, 204), (170, 70), (192, 92)]), BROWN)

    def head(d):
        d.ellipse((30, 20, 236, 226), fill=255)
        d.ellipse((30, 62, 236, 268), fill=0)
        d.rectangle((0, 150, 256, 256), fill=0)
    i.shape(head, c)
    return i


def envelope():
    i = Icon()
    i.shape(rrect((20, 56, 236, 206), 12), WHITE)
    i.lines([[(24, 64), (128, 146), (232, 64)]], (120, 130, 160, 255), 10)
    i.shape(ell((168, 30, 232, 94)), RED, outline=4)
    return i


def beacon():
    i = Icon()
    i.shape(poly([(100, 20), (156, 20), (170, 160), (86, 160)]), ((200, 255, 255), (80, 220, 255)), outline=4)
    i.shape(rrect((48, 156, 208, 232), 12), CYAN)
    return i


def tree():
    i = Icon()
    i.shape(rrect((108, 140, 148, 236), 8), BROWN)
    i.shape(lambda d: (d.ellipse((40, 30, 216, 170), fill=255), d.ellipse((22, 90, 130, 180), fill=255), d.ellipse((126, 90, 234, 180), fill=255)), GREEN)
    return i


def portal():
    i = Icon()
    i.shape(rrect((40, 16, 216, 240), 10), ((70, 40, 110), (25, 15, 45)))
    i.shape(rrect((72, 48, 184, 208), 6), PURPLE, outline=4)
    return i


def eye():
    i = Icon()
    i.shape(ell((28, 28, 228, 228)), ((120, 220, 160), (30, 120, 90)))
    i.shape(ell((92, 70, 164, 186)), DARK, outline=3, gloss=False)
    return i


def star4(c=CYAN):
    i = Icon()
    i.shape(poly(star_pts(128, 128, 116, 34, 4)), c)
    i.shape(ell((100, 100, 156, 156)), WHITE, outline=4)
    return i


def boot():
    i = Icon()
    i.shape(poly([(70, 24), (150, 24), (150, 150), (230, 180), (230, 232), (60, 232)]), BLUE)
    i.lines([[(20, 90), (60, 90)], [(10, 130), (56, 130)], [(20, 170), (56, 170)]], (130, 230, 255, 255), 12)
    return i


def chestplate(c=BLUE):
    i = Icon()
    i.shape(poly([(64, 26), (104, 26), (128, 52), (152, 26), (192, 26), (236, 70), (204, 112), (186, 100), (186, 230), (70, 230), (70, 100), (52, 112), (20, 70)]), c)
    i.shape(poly(star_pts(128, 140, 34, 14)), GOLD, outline=5)
    return i


def horned_skull():
    i = Icon()
    i.shape(poly([(56, 90), (18, 20), (88, 62)]), WHITE)
    i.shape(poly([(200, 90), (238, 20), (168, 62)]), WHITE)
    i.shape(lambda d: (d.ellipse((46, 40, 210, 190), fill=255), d.rounded_rectangle((84, 160, 172, 232), 16, fill=255)), RED)
    d = ImageDraw.Draw(i.img)
    d.polygon([(78, 104), (120, 118), (112, 142), (80, 132)], fill=(255, 220, 60, 255))
    d.polygon([(178, 104), (136, 118), (144, 142), (176, 132)], fill=(255, 220, 60, 255))
    d.polygon([(128, 146), (116, 168), (140, 168)], fill=INK)
    for x in (104, 128, 152):
        d.line([(x, 190), (x, 226)], fill=INK, width=8)
    return i


def egg(c=GREEN, spot=WHITE):
    i = Icon()
    i.shape(lambda d: d.ellipse((46, 14, 210, 240), fill=255), c)
    for (x, y, r) in [(96, 80, 18), (156, 110, 22), (110, 170, 20), (168, 182, 14), (82, 132, 12)]:
        i.shape(ell((x - r, y - r, x + r, y + r)), spot, outline=3, gloss=False)
    return i


BOSS_EGGS = {1: (((120, 210, 90), (40, 110, 40)), ((60, 40, 30), (30, 20, 15))),
             2: (((90, 90, 100), (25, 25, 32)), ((230, 225, 210), (170, 165, 150))),
             3: (((255, 150, 50), (190, 50, 10)), ((255, 235, 120), (230, 160, 40))),
             4: (((170, 90, 255), (60, 20, 120)), ((20, 10, 40), (5, 0, 15)))}


def build_icons():
    """Returns {name: 64x64 RGBA image}."""
    icons = {
        "player": player(), "players": players(), "members": players(), "coin": coin(), "crystal": gem(),
        "faction": shield(), "shield": shield(CYAN, WHITE, "check"), "level": bars(), "world": globe(),
        "position": pin(), "shop": bag(), "crate": chest(), "chest": chest(DARK, GRAY), "enchant": book(),
        "ftop": podium(), "daily": gift(), "quests": scroll(), "auction": gavel(), "home": house(),
        "bounty": skull(), "event": flag(PURPLE), "claim": flag(GREEN), "trophy": trophy(), "settings": gear(),
        "admin": wrench(), "back": arrow("left"), "next": arrow("right"), "upgrade": arrow("up", GREEN),
        "down": arrow("down", RED), "check": check(), "close": cross(), "create": plus(), "relations": swords(),
        "sword": swords(False), "leave": door(), "crown": crown(), "map": mapicon(), "note": note(), "sell": coins(),
        "blocks": cube(), "ores": cube(((200, 205, 215), (130, 135, 150)), ((150, 155, 165), (100, 105, 115)), ((120, 125, 135), (80, 85, 95)), CYAN),
        "farming": wheat(), "mobs": zombie(), "raid": tnt(), "spawner": cage(), "crawler": robot(),
        "mystery_spawner": cage(PINK, True), "genbucket": bucket(GRAY), "genbucket_obsidian": bucket(((90, 50, 140), (30, 15, 50))),
        "genbucket_sand": bucket(((255, 235, 160), (220, 190, 100))), "chunk_buster": tnt(PURPLE, "CB"), "sell_wand": wand(),
        "xp_shard": shard(LIME), "power_shard": shard(RED), "haste": pickaxe(), "speed": boot(), "mail": envelope(),
        "spawn": beacon(), "wild": tree(), "nether": portal(), "end": eye(), "menu": star4(), "power": lightning(),
        "kit": chestplate(), "boss": horned_skull(),
    }
    for t, (c, s) in BOSS_EGGS.items():
        icons[f"boss_egg_{t}"] = egg(c, s)
    for r, c in RARITY.items():
        icons[f"key_{r}"] = key(c)
        icons[f"book_{r}"] = book(c)
    return {k: v.done() for k, v in icons.items()}


def build_logo(size=128):
    """The menu emblem: a crest with crossed swords and a star."""
    i = Icon()
    i.shape(poly([(128, 10), (236, 62), (236, 170), (128, 246), (20, 170), (20, 62)]), ((40, 90, 170), (12, 30, 70)), outline=10)
    i.shape(poly([(128, 30), (216, 74), (216, 160), (128, 224), (40, 160), (40, 74)]), ((22, 50, 105), (8, 20, 50)), outline=4, gloss=False)
    for flip in (False, True):
        def f(x, y, flip=flip):
            return (256 - x, y) if flip else (x, y)
        i.shape(poly([f(58, 52), f(80, 44), f(190, 170), f(170, 190)]), WHITE, outline=6)
        i.shape(poly([f(160, 196), f(196, 160), f(206, 170), f(170, 206)]), GOLD, outline=5)
    i.shape(poly(star_pts(128, 116, 58, 24)), CYAN, outline=7)
    i.shape(poly(star_pts(128, 116, 26, 11)), WHITE, outline=0)
    for (x, y) in [(64, 120), (192, 120), (128, 214)]:
        i.shape(poly(star_pts(x, y, 14, 5, 4)), ((200, 240, 255), (120, 200, 255)), outline=3, gloss=False)
    return i.done(size)
