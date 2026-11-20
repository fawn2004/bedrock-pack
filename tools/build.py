#!/usr/bin/env python3
"""Generates the More Building Blocks add-on (behavior + resource pack).

Run:  python3 tools/build.py
Outputs:
  packs/MoreBuildingBlocks_BP/ , packs/MoreBuildingBlocks_RP/   (unzipped source)
  dist/MoreBuildingBlocks.mcaddon       (double-click to import both packs)
  dist/MoreBuildingBlocks_BP.mcpack, dist/MoreBuildingBlocks_RP.mcpack
"""
import json
import os
import shutil
import sys
import uuid
import zipfile

sys.path.insert(0, os.path.dirname(__file__))
import textures as T  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NS = "mbb"
PACK = "MoreBuildingBlocks1"
VERSION = [1, 0, 3]
BLOCK_FMT = "1.26.20"
ITEM_FMT = "1.21.60"
MIN_ENGINE = [1, 26, 20]
SCRIPT_API = "2.7.0"

BP = os.path.join(ROOT, "packs", PACK + "_BP")
RP = os.path.join(ROOT, "packs", PACK + "_RP")
DIST = os.path.join(ROOT, "dist")


def uid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "mbb-addon/" + name))


# ------------------------------------------------------------ materials
# (id, display name, base colour, dye used in its recipe, texture builder)
WOODS = [
    ("maple", "Maple", (192, 104, 56), "orange_dye"),
    ("redwood", "Redwood", (138, 56, 42), "red_dye"),
    ("ebony", "Ebony", (54, 42, 38), "black_dye"),
    ("willow", "Willow", (178, 172, 108), "lime_dye"),
    ("ash", "Ash", (206, 190, 164), "white_dye"),
    ("azure", "Azurewood", (72, 112, 152), "light_blue_dye"),
]

STONES = [
    ("marble", "Marble", (226, 224, 218), "white_dye",
     lambda s: T.marble((226, 224, 218), (150, 150, 158), s)),
    ("slate_tiles", "Slate Tiles", (78, 88, 102), "blue_dye",
     lambda s: T.tiles((78, 88, 102), (44, 48, 56), s)),
    ("limestone_bricks", "Limestone Bricks", (214, 200, 160), "yellow_dye",
     lambda s: T.bricks((214, 200, 160), (160, 148, 118), s)),
    ("red_granite_bricks", "Red Granite Bricks", (160, 82, 70), "red_dye",
     lambda s: T.bricks((160, 82, 70), (96, 60, 56), s)),
    ("jade_bricks", "Jade Bricks", (72, 150, 108), "green_dye",
     lambda s: T.bricks((72, 150, 108), (40, 86, 64), s, rows=2)),
    ("polished_onyx", "Polished Onyx", (58, 44, 70), "purple_dye",
     lambda s: T.polished((58, 44, 70), s)),
]

# Rotation of a model built "facing north" so it faces the given direction.
# +90 on Y turns north -> west (matches the vanilla-style trapdoor template).
DIR_ROT = {"north": 0, "south": 180, "west": 90, "east": -90}
DIRS = ["north", "south", "west", "east"]


def norm(a):
    a = ((a + 180) % 360) - 180
    return 180 if a == -180 else a


# ------------------------------------------------------------ helpers

def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def hexcol(rgb):
    return "#%02x%02x%02x" % tuple(rgb)


def face_uvs(origin, size):
    """World-aligned UVs (pixel coords on a 16x16 texture) like vanilla."""
    x0, y0, z0 = origin[0] + 8, origin[1], origin[2] + 8
    w, h, d = size
    top = 16 - (y0 + h)
    return {
        "north": {"uv": [16 - (x0 + w), top], "uv_size": [w, h]},
        "south": {"uv": [x0, top], "uv_size": [w, h]},
        "east": {"uv": [16 - (z0 + d), top], "uv_size": [d, h]},
        "west": {"uv": [z0, top], "uv_size": [d, h]},
        "up": {"uv": [x0, z0], "uv_size": [w, d]},
        "down": {"uv": [x0, 16 - (z0 + d)], "uv_size": [w, d]},
    }


def cube(origin, size, uv=None):
    return {"origin": origin, "size": size, "uv": uv or face_uvs(origin, size)}


def geo(identifier, bones):
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": identifier,
                "texture_width": 16,
                "texture_height": 16,
                "visible_bounds_width": 2,
                "visible_bounds_height": 2.5,
                "visible_bounds_offset": [0, 0.75, 0],
            },
            "bones": [{"name": n, "pivot": [0, 0, 0], "cubes": c} for n, c in bones],
        }],
    }


def box(origin, size):
    return {"origin": origin, "size": size}


# ------------------------------------------------------------ geometry

QUARTERS = {  # x0, z0 of each 8x8 quarter (model faces north = -z)
    "nw": (-8, -8), "ne": (0, -8), "sw": (-8, 0), "se": (0, 0),
}
# which upper quarters exist for each stair corner state (vanilla shapes)
CORNER_QUARTERS = {
    "none": ["nw", "ne"],
    "outer_left": ["nw"],
    "outer_right": ["ne"],
    "inner_left": ["nw", "ne", "sw"],
    "inner_right": ["nw", "ne", "se"],
}


def build_geometry():
    models = os.path.join(RP, "models", "blocks")
    # Slab: two halves, shown by state (both = double slab)
    write_json(os.path.join(models, "mbb_slab.geo.json"), geo("geometry.mbb_slab", [
        ("bottom", [cube([-8, 0, -8], [16, 8, 16])]),
        ("top", [cube([-8, 8, -8], [16, 8, 16])]),
    ]))
    # Stairs: full half-slab base + four step quarters for each half
    bones = [
        ("base_bottom", [cube([-8, 0, -8], [16, 8, 16])]),
        ("base_top", [cube([-8, 8, -8], [16, 8, 16])]),
    ]
    for q, (x, z) in QUARTERS.items():
        bones.append(("upper_" + q, [cube([x, 8, z], [8, 8, 8])]))
        bones.append(("lower_" + q, [cube([x, 0, z], [8, 8, 8])]))
    write_json(os.path.join(models, "mbb_stairs.geo.json"), geo("geometry.mbb_stairs", bones))
    # Door: 3px panel on the north edge of the block (same as vanilla)
    full = {"uv": [0, 0], "uv_size": [16, 16]}
    door_uv = {
        "north": full, "south": {"uv": [16, 0], "uv_size": [-16, 16]},
        "east": {"uv": [0, 0], "uv_size": [3, 16]},
        "west": {"uv": [13, 0], "uv_size": [3, 16]},
        "up": {"uv": [0, 0], "uv_size": [16, 3]},
        "down": {"uv": [0, 13], "uv_size": [16, 3]},
    }
    def with_mat(name):
        return {f: dict(v, material_instance=name) for f, v in door_uv.items()}
    write_json(os.path.join(models, "mbb_door.geo.json"), geo("geometry.mbb_door", [
        ("lower", [cube([-8, 0, -8], [16, 16, 3], with_mat("door_bottom"))]),
        ("upper", [cube([-8, 0, -8], [16, 16, 3], with_mat("door_top"))]),
    ]))


def stairs_bone_visibility():
    half = "q.block_state('minecraft:vertical_half')"
    corner = "q.block_state('minecraft:corner')"
    vis = {
        "base_bottom": f"{half} == 'bottom'",
        "base_top": f"{half} == 'top'",
    }
    for q in QUARTERS:
        corners = [c for c, qs in CORNER_QUARTERS.items() if q in qs]
        cond = " || ".join(f"{corner} == '{c}'" for c in corners)
        vis["upper_" + q] = f"{half} == 'bottom' && ({cond})"
        vis["lower_" + q] = f"{half} == 'top' && ({cond})"
    return vis


def stairs_collision(half, corner):
    if half == "bottom":
        boxes = [box([-8, 0, -8], [16, 8, 16])]
        y = 8
    else:
        boxes = [box([-8, 8, -8], [16, 8, 16])]
        y = 0
    qs = CORNER_QUARTERS[corner]
    # merge quarters into as few boxes as possible
    if set(["nw", "ne"]).issubset(qs):
        boxes.append(box([-8, y, -8], [16, 8, 8]))
        rest = [q for q in qs if q not in ("nw", "ne")]
    else:
        rest = qs
    for q in rest:
        x, z = QUARTERS[q]
        boxes.append(box([x, y, z], [8, 8, 8]))
    return boxes


# ------------------------------------------------------------ blocks

def common_components(kind, mat_kind, color):
    c = {
        "minecraft:map_color": hexcol(color),
        "minecraft:tags": [f"{NS}:{mat_kind}", f"{NS}:{kind}"],
    }
    if mat_kind == "wood":
        c["minecraft:destructible_by_mining"] = {"seconds_to_destroy": 2 if kind != "door" else 3}
        c["minecraft:destructible_by_explosion"] = {"explosion_resistance": 3}
        c["minecraft:flammable"] = {"catch_chance_modifier": 5, "destroy_chance_modifier": 20}
        c["minecraft:tags"] += ["wood", "minecraft:is_axe_item_destructible"]
    else:
        c["minecraft:destructible_by_mining"] = {"seconds_to_destroy": 2.5 if kind != "door" else 4}
        c["minecraft:destructible_by_explosion"] = {"explosion_resistance": 6}
        c["minecraft:tags"] += ["stone", "minecraft:is_pickaxe_item_destructible"]
    c["minecraft:tags"] += {"slab": ["slab"], "stairs": ["minecraft:cornerable_stairs"],
                            "door": ["door"]}.get(kind, [])
    if kind != "full":
        c["minecraft:light_dampening"] = 0
    return c


def mat(texture, method="opaque"):
    return {"*": {"texture": texture, "render_method": method}}


def block_file(ident, description, components, permutations=None):
    data = {"format_version": BLOCK_FMT, "minecraft:block": {
        "description": dict(identifier=ident, **description),
        "components": components,
    }}
    if permutations:
        data["minecraft:block"]["permutations"] = permutations
    write_json(os.path.join(BP, "blocks", ident.split(":")[1] + ".json"), data)


def full_block(mid, mat_kind, color, tex):
    ident = f"{NS}:{mid}"
    comps = common_components("full", mat_kind, color)
    comps.update({
        "minecraft:geometry": "minecraft:geometry.full_block",
        "minecraft:material_instances": mat(tex),
    })
    group = "minecraft:itemGroup.name.planks" if mat_kind == "wood" else None
    mc = {"category": "construction"}
    if group:
        mc["group"] = group
    block_file(ident, {"menu_category": mc}, comps)
    return ident


def slab_block(base, mat_kind, color, tex):
    ident = f"{NS}:{base}_slab"
    comps = common_components("slab", mat_kind, color)
    half = "q.block_state('minecraft:vertical_half')"
    dbl = f"q.block_state('{NS}:double')"
    comps.update({
        "minecraft:geometry": {
            "identifier": "geometry.mbb_slab",
            "bone_visibility": {
                "bottom": f"{half} == 'bottom' || {dbl}",
                "top": f"{half} == 'top' || {dbl}",
            },
        },
        "minecraft:material_instances": mat(tex),
        "minecraft:collision_box": [box([-8, 0, -8], [16, 8, 16])],
        "minecraft:selection_box": box([-8, 0, -8], [16, 8, 16]),
    })
    perms = [
        {"condition": f"{half} == 'top' && !{dbl}", "components": {
            "minecraft:collision_box": [box([-8, 8, -8], [16, 8, 16])],
            "minecraft:selection_box": box([-8, 8, -8], [16, 8, 16]),
        }},
        {"condition": dbl, "components": {
            "minecraft:collision_box": [box([-8, 0, -8], [16, 16, 16])],
            "minecraft:selection_box": box([-8, 0, -8], [16, 16, 16]),
            "minecraft:light_dampening": 15,
            "minecraft:loot": f"loot_tables/blocks/{NS}_{base}_slab_double.json",
        }},
    ]
    block_file(ident, {
        "menu_category": {"category": "construction", "group": "minecraft:itemGroup.name.slab"},
        "states": {f"{NS}:double": [False, True]},
        "traits": {"minecraft:placement_position": {"enabled_states": ["minecraft:vertical_half"]}},
    }, comps, perms)
    write_json(os.path.join(BP, "loot_tables", "blocks", f"{NS}_{base}_slab_double.json"), {
        "pools": [{"rolls": 1, "entries": [{"type": "item", "name": ident, "weight": 1,
                   "functions": [{"function": "set_count", "count": 2}]}]}]
    })
    return ident


def stairs_block(base, mat_kind, color, tex):
    ident = f"{NS}:{base}_stairs"
    comps = common_components("stairs", mat_kind, color)
    comps.update({
        "minecraft:geometry": {
            "identifier": "geometry.mbb_stairs",
            "bone_visibility": stairs_bone_visibility(),
        },
        "minecraft:material_instances": mat(tex),
        "minecraft:collision_box": stairs_collision("bottom", "none"),
        "minecraft:selection_box": box([-8, 0, -8], [16, 16, 16]),
    })
    perms = []
    for d in DIRS:
        for half in ("bottom", "top"):
            for corner in CORNER_QUARTERS:
                perms.append({
                    "condition": (f"q.block_state('minecraft:cardinal_direction') == '{d}' && "
                                  f"q.block_state('minecraft:vertical_half') == '{half}' && "
                                  f"q.block_state('minecraft:corner') == '{corner}'"),
                    "components": {
                        "minecraft:transformation": {"rotation": [0, DIR_ROT[d], 0]},
                        "minecraft:collision_box": stairs_collision(half, corner),
                    },
                })
    block_file(ident, {
        "menu_category": {"category": "construction", "group": "minecraft:itemGroup.name.stairs"},
        "traits": {
            "minecraft:placement_direction": {
                "enabled_states": ["minecraft:corner_and_cardinal_direction"],
                "blocks_to_corner_with": [
                    {"tags": f"q.any_tag('{NS}:stairs', 'minecraft:cornerable_stairs')"}
                ],
            },
            "minecraft:placement_position": {"enabled_states": ["minecraft:vertical_half"]},
        },
    }, comps, perms)
    return ident


def door_block(base, display, mat_kind, color, tex_top, tex_bottom, icon):
    ident = f"{NS}:{base}_door"
    comps = common_components("door", mat_kind, color)
    upper = f"q.block_state('{NS}:upper')"
    comps.update({
        # one block per door half; the script places/removes the top half
        "minecraft:geometry": {
            "identifier": "geometry.mbb_door",
            "bone_visibility": {"lower": f"!{upper}", "upper": upper},
        },
        "minecraft:material_instances": {
            "*": {"texture": tex_bottom, "render_method": "alpha_test"},
            "door_bottom": {"texture": tex_bottom, "render_method": "alpha_test"},
            "door_top": {"texture": tex_top, "render_method": "alpha_test"},
        },
        "minecraft:collision_box": [box([-8, 0, -8], [16, 16, 3])],
        "minecraft:selection_box": box([-8, 0, -8], [16, 16, 3]),
        # drops are handled by the script so a door always drops exactly one item
        "minecraft:loot": "loot_tables/empty.json",
        f"{NS}:door": {},
    })
    perms = []
    for d in DIRS:
        for open_ in (False, True):
            for hinge_right in (False, True):
                rot = DIR_ROT[d]
                if open_:
                    rot += -90 if hinge_right else 90
                cond = (f"q.block_state('minecraft:cardinal_direction') == '{d}' && "
                        f"{'' if open_ else '!'}q.block_state('{NS}:open') && "
                        f"{'' if hinge_right else '!'}q.block_state('{NS}:hinge_right')")
                perms.append({"condition": cond, "components": {
                    "minecraft:transformation": {"rotation": [0, norm(rot), 0]}}})
    block_file(ident, {
        "menu_category": {"category": "none"},
        "states": {f"{NS}:open": [False, True], f"{NS}:hinge_right": [False, True],
                   f"{NS}:upper": [False, True]},
        "traits": {
            "minecraft:placement_direction": {"enabled_states": ["minecraft:cardinal_direction"]},
        },
    }, comps, perms)
    # The door item (like vanilla, the door is placed from an item)
    write_json(os.path.join(BP, "items", f"{base}_door.json"), {
        "format_version": ITEM_FMT,
        "minecraft:item": {
            "description": {
                "identifier": ident,
                "menu_category": {"category": "construction", "group": "minecraft:itemGroup.name.door"},
            },
            "components": {
                "minecraft:icon": {"textures": {"default": icon}},
                "minecraft:display_name": {"value": f"{display} Door"},
                "minecraft:max_stack_size": 64,
                "minecraft:block_placer": {"block": ident, "replace_block_item": True},
            },
        },
    })
    return ident


# ------------------------------------------------------------ recipes

def shaped(ident, pattern, key, result, count, unlock):
    name = ident.split(":")[1]
    write_json(os.path.join(BP, "recipes", name + ".json"), {
        "format_version": "1.21.50",
        "minecraft:recipe_shaped": {
            "description": {"identifier": ident},
            "tags": ["crafting_table"],
            "pattern": pattern,
            "key": key,
            "unlock": [unlock],
            "result": {"item": result, "count": count},
        },
    })


def stonecut(ident, ingredient, result, count):
    name = ident.split(":")[1]
    write_json(os.path.join(BP, "recipes", name + ".json"), {
        "format_version": "1.21.50",
        "minecraft:recipe_shapeless": {
            "description": {"identifier": ident},
            "tags": ["stonecutter"],
            "ingredients": [{"item": ingredient}],
            "unlock": [{"item": ingredient}],
            "result": {"item": result, "count": count},
        },
    })


def material_recipes(mid, mat_kind, dye, block, slab, stairs, door):
    base_ing = {"tag": "minecraft:planks"} if mat_kind == "wood" else {"item": "minecraft:stone"}
    dye_item = "minecraft:" + dye
    shaped(f"{NS}:{mid}_from_dye", ["###", "#D#", "###"],
           {"#": base_ing, "D": {"item": dye_item}}, block, 8, {"item": dye_item})
    b = {"item": block}
    shaped(f"{NS}:{mid}_slab_craft", ["###"], {"#": b}, slab, 6, b)
    shaped(f"{NS}:{mid}_stairs_craft", ["#  ", "## ", "###"], {"#": b}, stairs, 4, b)
    shaped(f"{NS}:{mid}_door_craft", ["##", "##", "##"], {"#": b}, door, 3, b)
    if mat_kind == "stone":
        stonecut(f"{NS}:{mid}_slab_stonecutting", block, slab, 2)
        stonecut(f"{NS}:{mid}_stairs_stonecutting", block, stairs, 1)


# ------------------------------------------------------------ main

def save_png(img, rel):
    path = os.path.join(RP, rel + ".png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


def main():
    for d in (BP, RP, DIST):
        shutil.rmtree(d, ignore_errors=True)

    terrain, items, blocks_json, lang = {}, {}, {"format_version": "1.1.0"}, []
    slabs, doors, icon_tiles = [], [], []

    mats = [(w[0], w[1], w[2], w[3], "wood", None) for w in WOODS] + \
           [(s[0], s[1], s[2], s[3], "stone", s[4]) for s in STONES]

    for i, (mid, display, color, dye, kind, builder) in enumerate(mats):
        seed = 1000 + i * 17
        if kind == "wood":
            full_id, full_name = f"{mid}_planks", f"{display} Planks"
            img = T.planks(color, seed)
            base = mid
        else:
            full_id, full_name = mid, display
            img = builder(seed)
            # "marble_slab", "slate_tile_slab", "limestone_brick_slab", ...
            base = mid[:-1] if mid.endswith("s") else mid
        icon_tiles.append(img)
        tex = f"{NS}_{full_id}"
        save_png(img, f"textures/blocks/{NS}/{full_id}")
        terrain[tex] = {"textures": f"textures/blocks/{NS}/{full_id}"}

        dcol = T.shade(color, 0.92) if kind == "wood" else T.shade(color, 0.85)
        top = T.door_half(dcol, seed, True, stone=(kind == "stone"))
        bottom = T.door_half(dcol, seed, False, stone=(kind == "stone"))
        save_png(top, f"textures/blocks/{NS}/{base}_door_top")
        save_png(bottom, f"textures/blocks/{NS}/{base}_door_bottom")
        save_png(T.door_item(top, bottom), f"textures/items/{NS}/{base}_door")
        terrain[f"{NS}_{base}_door_top"] = {"textures": f"textures/blocks/{NS}/{base}_door_top"}
        terrain[f"{NS}_{base}_door_bottom"] = {"textures": f"textures/blocks/{NS}/{base}_door_bottom"}
        items[f"{NS}_{base}_door"] = {"textures": f"textures/items/{NS}/{base}_door"}

        block = full_block(full_id, kind, color, tex)
        slab = slab_block(base, kind, color, tex)
        stairs = stairs_block(base, kind, color, tex)
        door = door_block(base, display.replace(" Bricks", " Brick").replace(" Tiles", " Tile"),
                          kind, color, f"{NS}_{base}_door_top", f"{NS}_{base}_door_bottom",
                          f"{NS}_{base}_door")
        slabs.append(slab)
        doors.append(door)
        material_recipes(base, kind, dye, block, slab, stairs, door)

        short = display.replace(" Bricks", " Brick").replace(" Tiles", " Tile")
        snd = "wood" if kind == "wood" else "stone"
        for ident, name in ((block, full_name), (slab, f"{short} Slab"),
                            (stairs, f"{short} Stairs"), (door, f"{short} Door")):
            blocks_json[ident] = {"sound": snd}
            lang.append(f"tile.{ident}.name={name}")
        lang.append(f"item.{door}.name={short} Door")
        lang.append(f"item.{door}={short} Door")

    write_json(os.path.join(BP, "loot_tables", "empty.json"), {"pools": []})
    build_geometry()

    # ---- script
    script_src = open(os.path.join(ROOT, "tools", "main.js"), encoding="utf-8").read()
    mat_lookup = {d: ("wood" if any(d == f"{NS}:{w[0]}_door" for w in WOODS) else "stone") for d in doors}
    script_src = script_src.replace("__SLABS__", json.dumps(slabs)).replace(
        "__DOORS__", json.dumps(mat_lookup))
    os.makedirs(os.path.join(BP, "scripts"), exist_ok=True)
    with open(os.path.join(BP, "scripts", "main.js"), "w", encoding="utf-8") as f:
        f.write(script_src)

    # ---- RP files
    write_json(os.path.join(RP, "textures", "terrain_texture.json"), {
        "resource_pack_name": NS, "texture_name": "atlas.terrain",
        "padding": 8, "num_mip_levels": 4, "texture_data": terrain})
    write_json(os.path.join(RP, "textures", "item_texture.json"), {
        "resource_pack_name": NS, "texture_name": "atlas.items", "texture_data": items})
    write_json(os.path.join(RP, "blocks.json"), blocks_json)
    for pack_dir, label in ((RP, "RP"), (BP, "BP")):
        os.makedirs(os.path.join(pack_dir, "texts"), exist_ok=True)
        with open(os.path.join(pack_dir, "texts", "en_US.lang"), "w", encoding="utf-8") as f:
            f.write(f"pack.name=More Building Blocks 1 {label}\n")
            f.write("pack.description=6 new woods and 6 new stones with slabs, stairs and doors\n")
            if pack_dir == RP:
                f.write("\n".join(lang) + "\n")
        write_json(os.path.join(pack_dir, "texts", "languages.json"), ["en_US"])

    # ---- pack icon (4x3 grid of the full block textures)
    icon = Image.new("RGBA", (128, 128), (30, 30, 34, 255))
    for i, t in enumerate(icon_tiles):
        x, y = (i % 4) * 32, 16 + (i // 4) * 32
        icon.paste(t.resize((32, 32), Image.NEAREST), (x, y))
    for d in (BP, RP):
        icon.save(os.path.join(d, "pack_icon.png"))

    # ---- manifests
    desc = "6 new woods + 6 new stones, each with slabs, stairs and doors."
    write_json(os.path.join(RP, "manifest.json"), {
        "format_version": 2,
        "header": {"name": "More Building Blocks 1 (Resources)", "description": desc,
                   "uuid": uid("rp-header"), "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [{"type": "resources", "uuid": uid("rp-module"), "version": VERSION}],
    })
    write_json(os.path.join(BP, "manifest.json"), {
        "format_version": 2,
        "header": {"name": "More Building Blocks 1", "description": desc,
                   "uuid": uid("bp-header"), "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [
            {"type": "data", "uuid": uid("bp-data"), "version": VERSION},
            {"type": "script", "language": "javascript", "uuid": uid("bp-script"),
             "entry": "scripts/main.js", "version": VERSION},
        ],
        "dependencies": [
            {"uuid": uid("rp-header"), "version": VERSION},
            {"module_name": "@minecraft/server", "version": SCRIPT_API},
        ],
    })

    # ---- zip
    os.makedirs(DIST, exist_ok=True)

    def add_dir(z, src, prefix):
        for dp, _, files in sorted(os.walk(src)):
            for fn in sorted(files):
                full = os.path.join(dp, fn)
                z.write(full, os.path.join(prefix, os.path.relpath(full, src)))

    for src, name in ((BP, PACK + "_BP"), (RP, PACK + "_RP")):
        with zipfile.ZipFile(os.path.join(DIST, name + ".mcpack"), "w", zipfile.ZIP_DEFLATED) as z:
            add_dir(z, src, "")
    with zipfile.ZipFile(os.path.join(DIST, PACK + ".mcaddon"), "w", zipfile.ZIP_DEFLATED) as z:
        add_dir(z, BP, PACK + "_BP")
        add_dir(z, RP, PACK + "_RP")
    n_blocks = len(os.listdir(os.path.join(BP, "blocks")))
    print(f"built {n_blocks} blocks -> {DIST}")


if __name__ == "__main__":
    main()
