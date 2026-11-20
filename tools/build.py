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
import nature  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NS = "mbb"
PACK = "MoreBuildingBlocks1"
VERSION = [1, 6, 0]
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
# Woods: (id, leaf colour, name, plank colour, bark colour, dye for recipes, bark style)
WOODS = [
    ("maple", (206, 92, 40), "Maple", (192, 104, 56), (92, 66, 52), "orange_dye", "furrow"),
    ("redwood", (56, 104, 58), "Redwood", (138, 56, 42), (90, 44, 36), "red_dye", "furrow"),
    ("ebony", (44, 86, 52), "Ebony", (58, 45, 40), (38, 34, 33), "black_dye", "furrow"),
    ("willow", (140, 176, 72), "Willow", (178, 172, 108), (96, 92, 70), "lime_dye", "furrow"),
    ("ash", (100, 152, 72), "Ash", (206, 190, 164), (130, 122, 110), "white_dye", "smooth"),
    ("azure", (74, 136, 206), "Azurewood", (72, 112, 152), (54, 60, 80), "light_blue_dye", "furrow"),
    ("walnut", (82, 132, 62), "Walnut", (112, 74, 48), (66, 50, 40), "brown_dye", "furrow"),
    ("rosewood", (238, 150, 184), "Rosewood", (176, 88, 96), (98, 58, 62), "pink_dye", "furrow"),
    ("palm", (96, 164, 62), "Palm", (210, 178, 120), (140, 116, 84), "yellow_dye", "rings"),
    ("ironwood", (108, 132, 112), "Ironwood", (128, 124, 118), (78, 76, 74), "gray_dye", "furrow"),
    ("ghostwood", (206, 228, 238), "Ghostwood", (214, 222, 226), (176, 184, 190), "light_gray_dye", "smooth"),
    ("plumwood", (156, 84, 176), "Plumwood", (112, 64, 112), (66, 46, 70), "purple_dye", "furrow"),
]

# Stones: (id, name, map colour, recipe, texture builder)
# recipe is a dye (8 stone around it) or ("2x2", block id) for cut variants.
STONES = [
    ("marble", "Marble", (226, 224, 218), "white_dye",
     lambda s: T.marble((230, 228, 222), (128, 130, 144), s)),
    ("slate_tiles", "Slate Tiles", (78, 88, 102), "blue_dye",
     lambda s: T.tiles((80, 90, 106), (40, 44, 52), s)),
    ("limestone_bricks", "Limestone Bricks", (214, 200, 160), "yellow_dye",
     lambda s: T.bricks((216, 202, 162), (150, 138, 110), s)),
    ("red_granite_bricks", "Red Granite Bricks", (160, 82, 70), "red_dye",
     lambda s: T.gabbro((160, 82, 70), (90, 56, 52), s)),
    ("jade_bricks", "Jade Bricks", (72, 150, 108), "green_dye",
     lambda s: T.bricks((72, 150, 108), (36, 80, 60), s, rows=2)),
    ("polished_onyx", "Polished Onyx", (58, 44, 70), "purple_dye",
     lambda s: T.polished((60, 46, 74), s)),
    ("travertine", "Travertine", (210, 190, 150), "brown_dye",
     lambda s: T.travertine((212, 192, 152), s)),
    ("gabbro_bricks", "Gabbro Bricks", (60, 64, 62), "black_dye",
     lambda s: T.gabbro((64, 68, 66), (30, 32, 32), s)),
    ("rose_quartz_bricks", "Rose Quartz Bricks", (224, 170, 180), "pink_dye",
     lambda s: T.bricks((226, 172, 182), (168, 118, 128), s)),
    ("chalk_tiles", "Chalk Tiles", (236, 234, 226), "light_gray_dye",
     lambda s: T.chalk_tiles((238, 236, 228), (194, 190, 180), s)),
    ("shale_bricks", "Shale Bricks", (96, 88, 80), "gray_dye",
     lambda s: T.shale_bricks((98, 90, 82), (58, 52, 48), s)),
    ("marble_bricks", "Marble Bricks", (226, 224, 218), ("2x2", "marble"),
     lambda s: T.bricks((230, 228, 222), (172, 172, 180), s)),
]

DIRS = ["north", "south", "west", "east"]
OPP = {"north": "south", "south": "north", "east": "west", "west": "east"}
CCW = {"north": "west", "west": "south", "south": "east", "east": "north"}  # player's left
CW = {v: k for k, v in CCW.items()}                                           # player's right
# Logs: rotate the pillar to match the face it was placed against.
LOG_ROT = {"north": [90, 0, 0], "south": [90, 0, 0], "east": [0, 0, 90], "west": [0, 0, 90]}


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

QUARTERS = {  # world-space x0, z0 of each 8x8 quarter (north = -z, east = +x)
    "nw": (-8, -8), "ne": (0, -8), "sw": (-8, 0), "se": (0, 0),
}
STAIR_SHAPES = ["straight", "inner_left", "inner_right", "outer_left", "outer_right"]


def quarter(a, b):
    ns = a if a in ("north", "south") else b
    we = b if ns == a else a
    return ns[0] + we[0]


def stair_quarters(d, shape):
    """World-space quarters of the step part, using vanilla's stair shapes.
    d is the direction the stairs go up towards (where the player looked)."""
    front, back, left, right = d, OPP[d], CCW[d], CW[d]
    both = [quarter(front, left), quarter(front, right)]
    return {
        "straight": both,
        "outer_left": [quarter(front, left)],
        "outer_right": [quarter(front, right)],
        "inner_left": both + [quarter(back, left)],
        "inner_right": both + [quarter(back, right)],
    }[shape]


# Door panel positions (3px thick) on each edge of the block.
DOOR_PANELS = {
    "north": ([-8, 0, -8], [16, 16, 3]),
    "south": ([-8, 0, 5], [16, 16, 3]),
    "west": ([-8, 0, -8], [3, 16, 16]),
    "east": ([5, 0, -8], [3, 16, 16]),
}


def door_edge(d, open_, hinge_right):
    """Vanilla: a closed door sits on the edge nearest the player who placed
    it, and swings open to the hinge side (player's left by default)."""
    if not open_:
        return OPP[d]
    return CW[d] if hinge_right else CCW[d]


def build_geometry():
    models = os.path.join(RP, "models", "blocks")
    write_json(os.path.join(models, "mbb_slab.geo.json"), geo("geometry.mbb_slab", [
        ("bottom", [cube([-8, 0, -8], [16, 8, 16])]),
        ("top", [cube([-8, 8, -8], [16, 8, 16])]),
    ]))
    bones = [
        ("base_bottom", [cube([-8, 0, -8], [16, 8, 16])]),
        ("base_top", [cube([-8, 8, -8], [16, 8, 16])]),
    ]
    for q, (x, z) in QUARTERS.items():
        bones.append(("upper_" + q, [cube([x, 8, z], [8, 8, 8])]))
        bones.append(("lower_" + q, [cube([x, 0, z], [8, 8, 8])]))
    write_json(os.path.join(models, "mbb_stairs.geo.json"), geo("geometry.mbb_stairs", bones))
    bones = []
    for half, mat_name in (("lower", "door_bottom"), ("upper", "door_top")):
        for edge, (origin, size) in DOOR_PANELS.items():
            def f(uv, size_):
                return {"uv": uv, "uv_size": size_, "material_instance": mat_name}
            if edge in ("north", "south"):
                uv = {"north": f([0, 0], [16, 16]), "south": f([16, 0], [-16, 16]),
                      "east": f([0, 0], [3, 16]), "west": f([13, 0], [3, 16]),
                      "up": f([0, 0], [16, 3]), "down": f([0, 13], [16, 3])}
            else:
                uv = {"east": f([0, 0], [16, 16]), "west": f([16, 0], [-16, 16]),
                      "north": f([0, 0], [3, 16]), "south": f([13, 0], [3, 16]),
                      "up": f([0, 0], [3, 16]), "down": f([13, 0], [3, 16])}
            bones.append((f"{half}_{edge}", [cube(origin, size, uv)]))
    write_json(os.path.join(models, "mbb_door.geo.json"), geo("geometry.mbb_door", bones))


def stairs_bone_visibility():
    half = "q.block_state('minecraft:vertical_half')"
    vis = {"base_bottom": f"{half} == 'bottom'", "base_top": f"{half} == 'top'"}
    for q in QUARTERS:
        terms = []
        for d in DIRS:
            shapes = [sh for sh in STAIR_SHAPES if q in stair_quarters(d, sh)]
            if not shapes:
                continue
            sh_cond = " || ".join(f"q.block_state('{NS}:shape') == '{sh}'" for sh in shapes)
            terms.append(f"(q.block_state('minecraft:cardinal_direction') == '{d}' && ({sh_cond}))")
        any_cond = " || ".join(terms)
        vis["upper_" + q] = f"{half} == 'bottom' && ({any_cond})"
        vis["lower_" + q] = f"{half} == 'top' && ({any_cond})"
    return vis


def stairs_collision(d, half, shape):
    y_base, y_step = (0, 8) if half == "bottom" else (8, 0)
    boxes = [box([-8, y_base, -8], [16, 8, 16])]
    for q in stair_quarters(d, shape):
        x, z = QUARTERS[q]
        boxes.append(box([x, y_step, z], [8, 8, 8]))
    return boxes


# ------------------------------------------------------------ blocks

def common_components(kind, mat_kind, color):
    c = {
        "minecraft:map_color": hexcol(color),
        "minecraft:tags": [f"{NS}:{mat_kind}", f"{NS}:{kind}"] + (["log"] if kind == "log" else []),
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
        "minecraft:collision_box": stairs_collision("south", "bottom", "straight"),
        "minecraft:selection_box": box([-8, 0, -8], [16, 16, 16]),
    })
    perms = []
    for d in DIRS:
        for half in ("bottom", "top"):
            for shape in STAIR_SHAPES:
                perms.append({
                    "condition": (f"q.block_state('minecraft:cardinal_direction') == '{d}' && "
                                  f"q.block_state('minecraft:vertical_half') == '{half}' && "
                                  f"q.block_state('{NS}:shape') == '{shape}'"),
                    "components": {"minecraft:collision_box": stairs_collision(d, half, shape)},
                })
    block_file(ident, {
        "menu_category": {"category": "construction", "group": "minecraft:itemGroup.name.stairs"},
        # corner shapes are worked out by the script, exactly like vanilla stairs
        "states": {f"{NS}:shape": STAIR_SHAPES},
        "traits": {
            "minecraft:placement_direction": {"enabled_states": ["minecraft:cardinal_direction"]},
            "minecraft:placement_position": {"enabled_states": ["minecraft:vertical_half"]},
        },
    }, comps, perms)
    return ident


def leaves_block(ident, color, tex):
    block_file(ident, {
        "menu_category": {"category": "nature", "group": "minecraft:itemGroup.name.leaves"},
    }, {
        "minecraft:map_color": hexcol(color),
        "minecraft:tags": ["leaves", f"{NS}:leaves", "minecraft:is_hoe_item_destructible",
                           "minecraft:is_shears_item_destructible"],
        "minecraft:geometry": "minecraft:geometry.full_block",
        "minecraft:material_instances": mat(tex, "alpha_test"),
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.3},
        "minecraft:destructible_by_explosion": {"explosion_resistance": 0.2},
        "minecraft:flammable": {"catch_chance_modifier": 30, "destroy_chance_modifier": 60},
        "minecraft:light_dampening": 1,
        "minecraft:loot": "loot_tables/blocks/mbb_leaves.json",
    })
    return ident


def log_block(ident, mat_kind, color, side_tex, end_tex):
    comps = common_components("log", mat_kind, color)
    comps.update({
        "minecraft:geometry": "minecraft:geometry.full_block",
        "minecraft:material_instances": {
            "*": {"texture": side_tex, "render_method": "opaque"},
            "up": {"texture": end_tex, "render_method": "opaque"},
            "down": {"texture": end_tex, "render_method": "opaque"},
        },
    })
    perms = [{"condition": " || ".join(f"q.block_state('minecraft:block_face') == '{f}'" for f in fs),
              "components": {"minecraft:transformation": {"rotation": LOG_ROT[fs[0]]}}}
             for fs in (("north", "south"), ("east", "west"))]
    block_file(ident, {
        "menu_category": {"category": "nature", "group": "minecraft:itemGroup.name.log"},
        "traits": {"minecraft:placement_position": {"enabled_states": ["minecraft:block_face"]}},
    }, comps, perms)
    return ident


def door_block(base, display, mat_kind, color, tex_top, tex_bottom, icon):
    ident = f"{NS}:{base}_door"
    comps = common_components("door", mat_kind, color)
    upper = f"q.block_state('{NS}:upper')"
    upper = f"q.block_state('{NS}:upper')"
    vis = {}
    for half, cond in (("lower", f"!{upper}"), ("upper", upper)):
        for edge in DOOR_PANELS:
            combos = [(d, o, h) for d in DIRS for o in (False, True) for h in (False, True)
                      if door_edge(d, o, h) == edge]
            terms = " || ".join(
                f"(q.block_state('minecraft:cardinal_direction') == '{d}' && "
                f"{'' if o else '!'}q.block_state('{NS}:open') && "
                f"{'' if h else '!'}q.block_state('{NS}:hinge_right'))" for d, o, h in combos)
            vis[f"{half}_{edge}"] = f"{cond} && ({terms})"
    comps.update({
        # one block per door half; the script places/removes the top half
        "minecraft:geometry": {"identifier": "geometry.mbb_door", "bone_visibility": vis},
        "minecraft:material_instances": {
            "*": {"texture": tex_bottom, "render_method": "alpha_test"},
            "door_bottom": {"texture": tex_bottom, "render_method": "alpha_test"},
            "door_top": {"texture": tex_top, "render_method": "alpha_test"},
        },
        "minecraft:collision_box": [box(*DOOR_PANELS["north"])],
        "minecraft:selection_box": box(*DOOR_PANELS["north"]),
        # drops are handled by the script so a door always drops exactly one item
        "minecraft:loot": "loot_tables/empty.json",
        f"{NS}:door": {},
    })
    perms = []
    for d in DIRS:
        for open_ in (False, True):
            for hinge_right in (False, True):
                edge = door_edge(d, open_, hinge_right)
                cond = (f"q.block_state('minecraft:cardinal_direction') == '{d}' && "
                        f"{'' if open_ else '!'}q.block_state('{NS}:open') && "
                        f"{'' if hinge_right else '!'}q.block_state('{NS}:hinge_right')")
                perms.append({"condition": cond, "components": {
                    "minecraft:collision_box": [box(*DOOR_PANELS[edge])],
                    "minecraft:selection_box": box(*DOOR_PANELS[edge]),
                }})
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


def shapeless(ident, ingredient, result, count):
    name = ident.split(":")[1]
    write_json(os.path.join(BP, "recipes", name + ".json"), {
        "format_version": "1.21.50",
        "minecraft:recipe_shapeless": {
            "description": {"identifier": ident},
            "tags": ["crafting_table"],
            "ingredients": [{"item": ingredient}],
            "unlock": [{"item": ingredient}],
            "result": {"item": result, "count": count},
        },
    })


def material_recipes(mid, mat_kind, recipe, block, slab, stairs, door, log=None, stripped=None):
    if isinstance(recipe, tuple):            # e.g. marble bricks from 4 marble
        src = {"item": f"{NS}:{recipe[1]}"}
        shaped(f"{NS}:{mid}_from_{recipe[1]}", ["##", "##"], {"#": src}, block, 4, src)
        stonecut(f"{NS}:{mid}_from_{recipe[1]}_stonecutting", src["item"], block, 1)
    else:
        base_ing = {"tag": "minecraft:planks"} if mat_kind == "wood" else {"item": "minecraft:stone"}
        dye_item = {"item": "minecraft:" + recipe}
        shaped(f"{NS}:{mid}_from_dye", ["###", "#D#", "###"],
               {"#": base_ing, "D": dye_item}, block, 8, dye_item)
        if log:
            shaped(f"{NS}:{mid}_log_from_dye", ["###", "#D#", "###"],
                   {"#": {"tag": "minecraft:logs"}, "D": dye_item}, log, 8, dye_item)
    if log:
        shapeless(f"{NS}:{mid}_planks_from_log", log, block, 4)
        shapeless(f"{NS}:{mid}_planks_from_stripped_log", stripped, block, 4)
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

    stairs_ids, logs, wood_slabs, leaf_ids = [], {}, [], []
    mats = [dict(mid=w[0], leaf=w[1], display=w[2], color=w[3], bark=w[4], recipe=w[5], style=w[6], kind="wood")
            for w in WOODS] + \
           [dict(mid=s_[0], display=s_[1], color=s_[2], recipe=s_[3], builder=s_[4], kind="stone")
            for s_ in STONES]

    def add_tex(name, img, folder="blocks"):
        save_png(img, f"textures/{folder}/{NS}/{name}")
        (terrain if folder == "blocks" else items)[f"{NS}_{name}"] = {
            "textures": f"textures/{folder}/{NS}/{name}"}
        return f"{NS}_{name}"

    for i, m in enumerate(mats):
        mid, display, color, kind = m["mid"], m["display"], m["color"], m["kind"]
        seed = 1000 + i * 17
        snd = "wood" if kind == "wood" else "stone"
        names = []
        if kind == "wood":
            full_id, full_name, base = f"{mid}_planks", f"{display} Planks", mid
            img = T.planks(color, seed)
        else:
            full_id, full_name = mid, display
            img = m["builder"](seed)
            # "marble_slab", "slate_tile_slab", "limestone_brick_slab", ...
            base = mid[:-1] if mid.endswith("s") else mid
        icon_tiles.append(img)
        tex = add_tex(full_id, img)

        if kind == "wood":
            door_col, metal = T.shade(color, 0.92), (196, 180, 110)
        else:
            door_col, metal = T.shade(color, 0.88), (92, 92, 98)
        top = T.door_half(door_col, seed, True, stone=(kind == "stone"), metal=metal)
        bottom = T.door_half(door_col, seed, False, stone=(kind == "stone"), metal=metal)
        tex_top = add_tex(f"{base}_door_top", top)
        tex_bottom = add_tex(f"{base}_door_bottom", bottom)
        icon_name = add_tex(f"{base}_door", T.door_item(top, bottom), "items")

        short = display.replace(" Bricks", " Brick").replace(" Tiles", " Tile")
        block = full_block(full_id, kind, color, tex)
        slab = slab_block(base, kind, color, tex)
        stairs = stairs_block(base, kind, color, tex)
        door = door_block(base, short, kind, color, tex_top, tex_bottom, icon_name)
        slabs.append(slab)
        doors.append(door)
        stairs_ids.append(stairs)
        names += [(block, full_name), (slab, f"{short} Slab"), (stairs, f"{short} Stairs"),
                  (door, f"{short} Door")]

        log = stripped = None
        if kind == "wood":
            side = add_tex(f"{mid}_log", T.bark(m["bark"], seed, m["style"]))
            end = add_tex(f"{mid}_log_top", T.log_top(color, m["bark"], seed))
            s_side = add_tex(f"stripped_{mid}_log", T.stripped_side(color, seed))
            s_end = add_tex(f"stripped_{mid}_log_top", T.log_top(color, m["bark"], seed, with_bark=False))
            log = log_block(f"{NS}:{mid}_log", kind, m["bark"], side, end)
            stripped = log_block(f"{NS}:stripped_{mid}_log", kind, color, s_side, s_end)
            logs[log] = stripped
            names += [(log, f"{display} Log"), (stripped, f"Stripped {display} Log")]
            # bark wood + bark stairs/slab (used for roots and branch brackets)
            bark_wood = log_block(f"{NS}:{mid}_wood", kind, m["bark"], side, side)
            bark_slab = slab_block(f"{mid}_bark", kind, m["bark"], side)
            bark_stairs = stairs_block(f"{mid}_bark", kind, m["bark"], side)
            slabs.append(bark_slab)
            stairs_ids.append(bark_stairs)
            wood_slabs.append(bark_slab)
            names += [(bark_wood, f"{display} Wood"), (bark_slab, f"{display} Bark Slab"),
                      (bark_stairs, f"{display} Bark Stairs")]
            bw = {"item": bark_wood}
            lg = {"item": log}
            shaped(f"{NS}:{mid}_wood_craft", ["##", "##"], {"#": lg}, bark_wood, 3, lg)
            shaped(f"{NS}:{mid}_bark_slab_craft", ["###"], {"#": bw}, bark_slab, 6, bw)
            shaped(f"{NS}:{mid}_bark_stairs_craft", ["#  ", "## ", "###"], {"#": bw}, bark_stairs, 4, bw)
            shapeless(f"{NS}:{mid}_planks_from_wood", bark_wood, block, 4)
            # leaves: a main colour and a darker shade for depth
            for dark in (False, True):
                lid = f"{mid}_leaves" + ("_dark" if dark else "")
                ltex = add_tex(lid, T.leaves(m["leaf"], seed, dark))
                leaves_block(f"{NS}:{lid}", m["leaf"], ltex)
                names.append((f"{NS}:{lid}", ("Dark " if dark else "") + f"{display} Leaves"))
                leaf_ids.append(f"{NS}:{lid}")
            wood_slabs.append(slab)

        material_recipes(base, kind, m["recipe"], block, slab, stairs, door, log, stripped)
        for ident, name in names:
            blocks_json[ident] = {"sound": "grass" if ident in leaf_ids else snd}
            lang.append(f"tile.{ident}.name={name}")


    write_json(os.path.join(BP, "loot_tables", "empty.json"), {"pools": []})
    write_json(os.path.join(BP, "loot_tables", "blocks", "mbb_leaves.json"), {"pools": [{
        "rolls": 1, "entries": [
            {"type": "item", "name": "minecraft:stick", "weight": 1},
            {"type": "empty", "weight": 9}]}]})
    structures = nature.build(BP)
    build_geometry()

    # ---- script
    script_src = open(os.path.join(ROOT, "tools", "main.js"), encoding="utf-8").read()
    mat_lookup = {d: ("wood" if any(d == f"{NS}:{w[0]}_door" for w in WOODS) else "stone") for d in doors}
    script_src = (script_src.replace("__SLABS__", json.dumps(slabs))
                  .replace("__DOORS__", json.dumps(mat_lookup))
                  .replace("__STAIRS__", json.dumps(stairs_ids))
                  .replace("__LOGS__", json.dumps(logs))
                  .replace("__WOOD_SLABS__", json.dumps(wood_slabs)))
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
            f.write("pack.description=12 woods and 12 stones with logs, leaves, slabs, stairs, doors and ready-made trees, bushes and rocks\n")
            if pack_dir == RP:
                f.write("\n".join(lang) + "\n")
        write_json(os.path.join(pack_dir, "texts", "languages.json"), ["en_US"])

    # ---- pack icon (6x4 grid of the full block textures)
    icon = Image.new("RGBA", (128, 128), (30, 30, 34, 255))
    for i, t in enumerate(icon_tiles):
        x, y = 1 + (i % 6) * 21, 22 + (i // 6) * 21
        icon.paste(t.resize((21, 21), Image.NEAREST), (x, y))
    for d in (BP, RP):
        icon.save(os.path.join(d, "pack_icon.png"))

    # ---- manifests
    desc = "12 woods + 12 stones with logs, leaves, slabs, stairs, doors, plus ready-made trees, bushes and rocks."
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
    print(f"built {n_blocks} blocks and {len(structures)} structures -> {DIST}")


if __name__ == "__main__":
    main()
