"""Renders preview pictures of the Factions Core menus (docs/factions/*.png).

It follows the same layout as tools/factions/ui.py, using the real textures
and icons, at a typical 480x270 GUI size. Text uses DejaVu Sans instead of
the Minecraft font, so it is an approximation.

    python3 tools/factions/preview.py
"""
import os
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEX = os.path.join(ROOT, "packs", "FactionsCore_RP", "textures", "fc", "ui")
OUT = os.path.join(ROOT, "docs", "factions")
SC = 3
GUI_W, GUI_H = 480, 270

COLORS = {"0": (0, 0, 0), "1": (0, 0, 170), "2": (0, 170, 0), "3": (0, 170, 170), "4": (170, 0, 0), "5": (170, 0, 170),
          "6": (255, 170, 0), "7": (170, 170, 170), "8": (85, 85, 85), "9": (85, 85, 255), "a": (85, 255, 85), "b": (85, 255, 255),
          "c": (255, 85, 85), "d": (255, 85, 255), "e": (255, 255, 85), "f": (255, 255, 255), "g": (221, 214, 5)}
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT_B if bold else FONT, size)
    except OSError:
        return ImageFont.load_default()


def tex(name):
    return Image.open(os.path.join(TEX, name + ".png")).convert("RGBA")


def nine(img, box, name, slice_px):
    t = tex(name)
    x0, y0, x1, y1 = [int(v * SC) for v in box]
    w, h = x1 - x0, y1 - y0
    s = slice_px
    S = s * SC
    tw, th = t.size
    if not s:
        img.alpha_composite(t.resize((w, h), Image.NEAREST), (x0, y0))
        return
    parts = [
        ((0, 0, s, s), (0, 0, S, S)), ((tw - s, 0, tw, s), (w - S, 0, w, S)), ((0, th - s, s, th), (0, h - S, S, h)), ((tw - s, th - s, tw, th), (w - S, h - S, w, h)),
        ((s, 0, tw - s, s), (S, 0, w - S, S)), ((s, th - s, tw - s, th), (S, h - S, w - S, h)), ((0, s, s, th - s), (0, S, S, h - S)),
        ((tw - s, s, tw, th - s), (w - S, S, w, h - S)), ((s, s, tw - s, th - s), (S, S, w - S, h - S)),
    ]
    for src, dst in parts:
        dw, dh = dst[2] - dst[0], dst[3] - dst[1]
        if dw <= 0 or dh <= 0:
            continue
        img.alpha_composite(t.crop(src).resize((dw, dh), Image.NEAREST), (x0 + dst[0], y0 + dst[1]))


def text(img, xy, s, size=7, base=(230, 245, 255), shadow=True, max_w=None):
    """Draws Minecraft-formatted text (with § codes) at GUI coordinates. Returns lines used."""
    d = ImageDraw.Draw(img)
    x0, y = xy[0] * SC, xy[1] * SC
    line_h = int(size * SC * 1.32)
    lines = 0
    for raw in s.split("\n"):
        x = x0
        color, bold = base, False
        for part in re.split(r"(§.)", raw):
            if part.startswith("§") and len(part) == 2:
                c = part[1]
                if c in COLORS:
                    color, bold = COLORS[c], False
                elif c == "l":
                    bold = True
                elif c == "r":
                    color, bold = base, False
                continue
            if not part:
                continue
            f = font(int(size * SC), bold)
            if shadow:
                d.text((x + SC, y + SC), part, font=f, fill=(20, 20, 30))
            d.text((x, y), part, font=f, fill=color)
            x += d.textlength(part, font=f)
        y += line_h
        lines += 1
    return lines


def icon(img, name, box):
    path = os.path.join(TEX, "icons", name + ".png")
    x0, y0, size = box
    ic = Image.open(path).convert("RGBA").resize((int(size * SC), int(size * SC)), Image.LANCZOS)
    img.alpha_composite(ic, (int(x0 * SC), int(y0 * SC)))


def background():
    img = Image.new("RGBA", (GUI_W * SC, GUI_H * SC))
    d = ImageDraw.Draw(img)
    for y in range(GUI_H * SC):
        t = y / (GUI_H * SC)
        d.line([(0, y), (GUI_W * SC, y)], fill=(int(110 - 40 * t), int(150 - 50 * t), int(110 - 50 * t), 255))
    for k in range(0, GUI_W * SC, 48):
        d.rectangle((k, GUI_H * SC * 0.62, k + 46, GUI_H * SC), fill=(95 + (k // 48 % 3) * 8, 70, 45, 255))
    dim = Image.new("RGBA", img.size, (0, 0, 0, 128))
    img.alpha_composite(dim)
    return img


def window(img, max_w, max_h):
    w, h = min(GUI_W - 16, max_w), min(GUI_H - 12, max_h)
    x, y = (GUI_W - w) / 2, (GUI_H - h) / 2
    nine(img, (x, y, x + w, y + h), "panel", 8)
    return x + 6, y + 6, w - 12, h - 12


def header(img, x, y, w, title):
    nine(img, (x, y, x + w, y + 22), "header", 4)
    icon(img, "../logo", (x + 3, y + 3, 16)) if False else img.alpha_composite(tex("logo").resize((16 * SC, 16 * SC), Image.LANCZOS), (int((x + 3) * SC), int((y + 3) * SC)))
    text(img, (x + 25, y + 6), title, 8, (115, 210, 255))
    nine(img, (x + w - 19, y + 3, x + w - 3, y + 19), "close", 0)


def button(img, box, label, sub, ic, tex_name="btn", chevron=True, icon_size=22, size=6.5):
    x0, y0, x1, y1 = box
    nine(img, box, tex_name, 4)
    icon(img, ic, (x0 + 4, y0 + (y1 - y0 - icon_size) / 2, icon_size))
    tx = x0 + 4 + icon_size + 5
    if sub:
        text(img, (tx, y0 + (y1 - y0) / 2 - size * 1.3), f"§l{label}§r\n§7{sub}", size)
    else:
        text(img, (tx, y0 + (y1 - y0) / 2 - size * 0.65), f"§l{label}", size)
    if chevron:
        text(img, (x1 - 9, y0 + (y1 - y0) / 2 - 4.5), ">", 7, (115, 210, 255))


def hub():
    img = background()
    x, y, w, h = window(img, 480, 280)
    lw = w * 0.33
    # left column
    img.alpha_composite(tex("logo").resize((58 * SC, 58 * SC), Image.LANCZOS), (int((x + lw / 2 - 29) * SC), int((y + 1) * SC)))
    ry = y + 63
    nine(img, (x, ry, x + lw, y + h), "inner", 4)
    rail = [("FACTIONS", "Dashboard & Stats", "faction"), ("SERVER SHOP", "Buy & Sell Items", "shop"), ("CRATES", "Open Rare Loot", "crate"),
            ("ENCHANTER", "Custom Enchants", "enchant"), ("F-TOP", "Faction Rankings", "ftop"), ("DAILY REWARDS", "Claim Rewards", "daily"),
            ("QUESTS", "Complete Tasks", "quests")]
    by = ry + 5
    for k, (a, b, c) in enumerate(rail):
        if by + 28 > y + h - 2:
            break
        button(img, (x + 4, by, x + lw - 9, by + 27), a, b, c, "btn_hover" if k == 1 else "btn", icon_size=21, size=6)
        by += 28
    nine(img, (x + lw - 6, ry + 4, x + lw - 3, ry + 60), "card_hover", 0)
    # right column
    rx = x + lw + 5
    rw = w - lw - 5
    header(img, rx, y, rw, "MAIN MENU")
    cards = [("PLAYER", "§fSteve", "player"), ("BALANCE", "§a$1.04m", "coin"), ("CRYSTALS", "§b86", "crystal"), ("FACTION", "§aWolves", "faction"),
             ("LEVEL", "§a11", "level"), ("PLAYERS", "§a14 online", "players"), ("WORLD", "§fOverworld", "world"), ("POSITION", "§f800, 1787", "position")]
    cy = y + 26
    cw = rw / 4
    for k, (a, b, c) in enumerate(cards):
        cx = rx + (k % 4) * cw
        yy = cy + (k // 4) * 32
        nine(img, (cx, yy, cx + cw - 3, yy + 29), "card", 4)
        icon(img, c, (cx + 3, yy + 5.5, 18))
        text(img, (cx + 24, yy + 5), f"§l{a}§r\n{b}", 5.6)
    by = cy + 67
    nine(img, (rx, by, rx + rw, y + h), "inner", 4)
    body = ("§lLEVEL 11§r  §a1,234 / 2,010 XP\n" + "§a" + "|" * 26 + "§8" + "|" * 14 + "\n"
            "§aSHIELDED §7drops in 5h 0m\n\n"
            "§b§lWelcome to FACTIONS!\n§fClaim land, fill the treasury and climb the §bF-TOP§f board.\n§fPick a page from the rail on the left.\n\n"
            "§b§lQUICK TIPS\n§f- Sell ores and drops in the §bSERVER SHOP§f for fast cash.\n§f- Place §bOre Crawlers§f and §bSpawners§f to grow F-Top value.")
    text(img, (rx + 6, by + 5), body, 6)
    return img


def list_screen():
    img = background()
    x, y, w, h = window(img, 460, 270)
    header(img, x, y, w, "FACTION | §aWolves")
    by = y + 26
    bw = w * 0.45
    nine(img, (x, by, x + bw, y + h), "inner", 4)
    body = ("§6---- §aWolves §6----\n§7Raid first, ask later.\n§7Leader: §fSteve  §7Joining: §cinvite only\n"
            "§7Land / Power / Max: §f42 / 58.5 / 80\n§7Treasury: §a$2.4m   §7Home: §aset\n§7Shield: §aUP§7 (drops in 5h 0m)\n"
            "§7Allies: §dNorthwind\n§7Enemies: §cRavens, Blight\n§7F-Top: §f#1  §7Value: §a$14.2m\n§7Spawners: §f38  §7Crawlers: §f6\n\n"
            "§b§lRECENT ACTIVITY\n§8Alex bought Spawner Speed 2\n§8Sam deposited $250k")
    text(img, (x + 6, by + 5), body, 5.8)
    lx = x + bw + 5
    nine(img, (lx, by, x + w, y + h), "inner", 4)
    items = [("Members", "8/20 members", "members"), ("Faction Home", "Teleport home", "home"), ("Treasury", "$2.4m", "coin"),
             ("Upgrades", "Spend the treasury", "upgrade"), ("Land", "42/80 chunks", "claim"), ("Relations", "Allies & enemies", "relations"), ("Shield", "Daily raid protection", "shield")]
    yy = by + 5
    for k, (a, b, c) in enumerate(items):
        if yy + 30 > y + h - 2:
            break
        button(img, (lx + 5, yy, x + w - 9, yy + 29), a, b, c, "btn_hover" if k == 3 else "btn", icon_size=24, size=6.5)
        yy += 30
    return img


def hud():
    img = background()
    lines = ("§b§lFACTIONS\n§8Season I\n\n§3§lPROFILE\n§7Balance §a$1.04m\n§7Crystals §b86\n§7Level §f11 §862%\n§7K/D §f42§8/§f17  §7Streak §f3\n"
             "§7Power §f8.5§8/10\n\n§3§lFACTION\n§aWolves\n§7Online §f5§8/8\n§7Land §f42§8/58\n§7F-Top §f#1\n§7Shield §aUP §85h\n\n§7Land: §aWolves\n\n§6§lKOTH\n§eSteve §f74§8/120s")
    n = lines.count("\n") + 1
    hgt = n * (6 * 0.75 * 1.2) * 1.32 + 10
    x1 = GUI_W - 8
    x0 = x1 - 92
    y0 = GUI_H / 2 - 12 - hgt / 2
    nine(img, (x0, y0, x1, y0 + hgt), "hud_panel", 4)
    text(img, (x0 + 6, y0 + 5), lines, 6 * 0.75 * 1.2)
    # hotbar hint
    d = ImageDraw.Draw(img)
    d.rectangle((150 * SC, 248 * SC, 330 * SC, 268 * SC), fill=(30, 30, 30, 200), outline=(200, 200, 200, 255), width=SC)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (("menu_hub", hub), ("menu_list", list_screen), ("hud_sidebar", hud)):
        img = fn().convert("RGB")
        img = img.resize((img.width * 2 // 3, img.height * 2 // 3), Image.LANCZOS)
        img.save(os.path.join(OUT, name + ".png"))
    sheet = Image.new("RGBA", (10 * 72 + 8, 8 * 72 + 8), (14, 26, 54, 255))
    names = sorted(n[:-4] for n in os.listdir(os.path.join(TEX, "icons")))
    for k, n in enumerate(names):
        sheet.alpha_composite(Image.open(os.path.join(TEX, "icons", n + ".png")).convert("RGBA"), (8 + (k % 10) * 72, 8 + (k // 10) * 72))
    sheet.convert("RGB").save(os.path.join(OUT, "icons.png"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
