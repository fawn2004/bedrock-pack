"""Builds Factions Core.

Generates everything in packs/FactionsCore_BP (except scripts/, which is
hand-written) and packs/FactionsCore_RP, then zips dist/FactionsCore.mcaddon.

    python3 tools/build_factions.py
"""
import json
import os
import shutil
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art  # noqa: E402
import icons  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BP = os.path.join(ROOT, "packs", "FactionsCore_BP")
RP = os.path.join(ROOT, "packs", "FactionsCore_RP")
DIST = os.path.join(ROOT, "dist")

def _version():
    """3.0.<n>: n grows with every commit, so each update is a new version.

    Minecraft ignores an imported pack whose ID and version are already
    installed, so the version must change every time the add-on changes.
    """
    import subprocess
    try:
        n = int(subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=os.path.dirname(os.path.abspath(__file__)),
                               capture_output=True, text=True, check=True).stdout.strip())
    except Exception:
        n = 0
    return [3, 0, n + 1]


VERSION = _version()
MIN_ENGINE = [1, 26, 20]
BP_UUID, BP_DATA, BP_SCRIPT = "e01294d7-65a4-4856-b137-a27734420e64", "7c286f51-a204-4948-abc2-3b1d04b1e28e", "e4e9690b-5e9d-4009-983a-8c39d4a3dc8d"
RP_UUID, RP_RES = "d769002a-fc35-4aa5-a76f-c532c897e981", "8bcc7ff2-873a-4ac4-a141-a71353d3b7f6"
CHAT = os.path.join(ROOT, "packs", "FactionsCoreChat_BP")
CHAT_UUID, CHAT_DATA, CHAT_SCRIPT = "2331762e-ee4e-4e36-91a6-d998ec1b1c83", "f9a86162-020f-43f4-842a-c3fcafa13ea2", "1bb89d32-6a09-49b9-a639-856b477ad81c"
# Beta API for chat. Each Minecraft version has its own beta number:
# 1.26.20 -> 2.8.0-beta, 1.26.30 -> 2.9.0-beta, 1.26.40 -> 2.10.0-beta, 1.26.50 -> 2.11.0-beta, 1.26.60 -> 2.12.0-beta
CHAT_BETA = "2.12.0-beta"

RARITIES = ["common", "rare", "epic", "legendary", "mythic"]
RARITY_NAME = {"common": "Common", "rare": "Rare", "epic": "Epic", "legendary": "Legendary", "mythic": "Mythic"}
RARITY_CODE = {"common": "§f", "rare": "§9", "epic": "§5", "legendary": "§6", "mythic": "§c"}
SPAWNERS = {"pig": "Pig", "chicken": "Chicken", "cow": "Cow", "zombie": "Zombie", "spider": "Spider", "skeleton": "Skeleton",
            "creeper": "Creeper", "blaze": "Blaze", "enderman": "Enderman", "iron_golem": "Iron Golem"}
# Bosses reuse a vanilla mob's model and animations, scaled up and tinted.
# tier: (identifier, name, vanilla client entity, hp, damage, speed, scale, (width, height), tint rgba)
BOSSES = {
    1: ("fc:boss_warlord", "Undead Warlord", "zombie", 500, 9, 0.28, 2.0, (1.2, 3.8), (0.25, 0.95, 0.3, 0.35)),
    2: ("fc:boss_tyrant", "Bone Tyrant", "wither_skeleton", 900, 12, 0.3, 1.6, (1.1, 3.8), (0.85, 0.1, 0.1, 0.3)),
    3: ("fc:boss_golem", "Infernal Golem", "iron_golem", 1500, 16, 0.26, 1.6, (2.2, 4.6), (1.0, 0.45, 0.05, 0.45)),
    4: ("fc:boss_ravager", "Void Ravager", "ravager", 2500, 22, 0.3, 1.5, (2.9, 3.3), (0.55, 0.15, 0.9, 0.45)),
}
CRAWLERS = {"coal": ("Coal Crawler", "common"), "iron": ("Iron Crawler", "common"), "gold": ("Gold Crawler", "rare"),
            "diamond": ("Diamond Crawler", "epic"), "emerald": ("Emerald Crawler", "legendary"), "netherite": ("Netherite Crawler", "mythic")}



def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def save_png(img, *parts):
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


# ================================================================ behavior pack

def item(identifier, name, icon, stack=64, glint=False, hand=False):
    comps = {
        "minecraft:icon": {"textures": {"default": icon}},
        "minecraft:display_name": {"value": name},
        "minecraft:max_stack_size": stack,
    }
    if glint:
        comps["minecraft:glint"] = True
    if hand:
        comps["minecraft:hand_equipped"] = True
    return {"format_version": "1.21.60", "minecraft:item": {"description": {"identifier": identifier, "menu_category": {"category": "items"}}, "components": comps}}


def block(identifier, textures, seconds, resistance, light, color, sound_tags=()):
    mats = {"*": {"texture": textures["side"], "render_method": "opaque"}}
    if "up" in textures:
        mats["up"] = {"texture": textures["up"], "render_method": "opaque"}
    if "down" in textures:
        mats["down"] = {"texture": textures["down"], "render_method": "opaque"}
    return {"format_version": "1.26.20", "minecraft:block": {
        "description": {"identifier": identifier, "menu_category": {"category": "items"}},
        "components": {
            "minecraft:destructible_by_mining": {"seconds_to_destroy": seconds},
            "minecraft:destructible_by_explosion": {"explosion_resistance": resistance},
            "minecraft:geometry": "minecraft:geometry.full_block",
            "minecraft:material_instances": mats,
            "minecraft:light_emission": light,
            "minecraft:map_color": color,
            "minecraft:loot": "loot_tables/empty.json",
            "minecraft:tags": list(sound_tags),
        }}}


def build_bp():
    with open(os.path.join(BP, "scripts", "version.js"), "w", encoding="utf-8") as f:
        f.write(f'// Written by tools/factions/build.py.\nexport const VERSION = "{".".join(map(str, VERSION))}";\n')
    for sub in ("items", "blocks", "entities", "loot_tables"):
        shutil.rmtree(os.path.join(BP, sub), ignore_errors=True)
    write_json(os.path.join(BP, "loot_tables", "empty.json"), {"pools": []})
    items = {
        "crystal": item("fc:crystal", "§bFaction Crystal", "fc_crystal", 64, True),
        "bank_note": item("fc:bank_note", "§aBank Note", "fc_bank_note", 1),
        "sell_wand": item("fc:sell_wand", "§6Sell Wand", "fc_sell_wand", 1, True, True),
        "genbucket": item("fc:genbucket", "§7Cobblestone Genbucket", "fc_genbucket", 16),
        "genbucket_obsidian": item("fc:genbucket_obsidian", "§5Obsidian Genbucket", "fc_genbucket_obsidian", 16),
        "genbucket_sand": item("fc:genbucket_sand", "§eSand Genbucket", "fc_genbucket_sand", 16),
        "chunk_buster": item("fc:chunk_buster", "§dChunk Buster", "fc_chunk_buster", 16, True),
        "xp_shard": item("fc:xp_shard", "§aXP Shard", "fc_xp_shard", 64, True),
        "power_shard": item("fc:power_shard", "§cPower Shard", "fc_power_shard", 16, True),
        "mystery_spawner": item("fc:mystery_spawner", "§dMystery Spawner", "fc_mystery_spawner", 16, True),
        "menu": item("fc:menu", "§b§lServer Menu", "fc_menu", 1, True),
    }
    for r in RARITIES:
        items[f"key_{r}"] = item(f"fc:key_{r}", f"{RARITY_CODE[r]}{RARITY_NAME[r]} Crate Key", f"fc_key_{r}", 16, r in ("legendary", "mythic"))
        items[f"book_{r}"] = item(f"fc:book_{r}", f"{RARITY_CODE[r]}{RARITY_NAME[r]} Enchant Book", f"fc_book_{r}", 1, True)
    for t, (_, name, *_rest) in BOSSES.items():
        items[f"boss_egg_{t}"] = item(f"fc:boss_egg_{t}", f"§4Boss Egg - {name}", f"fc_boss_egg_{t}", 16, True)
    for t, (name, r) in CRAWLERS.items():
        items[f"crawler_{t}"] = item(f"fc:crawler_{t}", f"{RARITY_CODE[r]}{name}", f"fc_crawler_{t}", 1, r in ("legendary", "mythic"))
    for k, v in items.items():
        write_json(os.path.join(BP, "items", f"{k}.json"), v)

    for t in SPAWNERS:
        write_json(os.path.join(BP, "blocks", f"spawner_{t}.json"),
                   block(f"fc:spawner_{t}", {"side": f"fc_spawner_{t}"}, 4, 6, 5, "#1e2230", ["minecraft:is_pickaxe_item_destructible", "metal"]))
    for r in RARITIES:
        write_json(os.path.join(BP, "blocks", f"crate_{r}.json"),
                   block(f"fc:crate_{r}", {"side": f"fc_crate_{r}_side", "up": f"fc_crate_{r}_top", "down": f"fc_crate_{r}_bottom"}, 1000, 3600000, 9, "#6b4a2a"))
    write_json(os.path.join(BP, "blocks", "supply_drop.json"),
               block("fc:supply_drop", {"side": "fc_supply_side", "up": "fc_supply_top", "down": "fc_supply_top"}, 0.6, 3600000, 12, "#c0c4d0"))

    invulnerable = {"triggers": [{"cause": "all", "deals_damage": "no"}]}
    write_json(os.path.join(BP, "entities", "crawler.json"), {"format_version": "1.21.60", "minecraft:entity": {
        "description": {"identifier": "fc:crawler", "is_spawnable": False, "is_summonable": True,
                        "properties": {"fc:tier": {"type": "int", "range": [0, 5], "default": 0, "client_sync": True}}},
        "components": {
            "minecraft:type_family": {"family": ["fc_crawler", "inanimate"]},
            "minecraft:health": {"value": 100, "max": 100},
            "minecraft:damage_sensor": invulnerable,
            "minecraft:collision_box": {"width": 0.8, "height": 0.7},
            "minecraft:physics": {},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:persistent": {},
            "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": False},
            "minecraft:knockback_resistance": {"value": 1.0},
            "minecraft:fire_immune": {},
            "minecraft:movement": {"value": 0.12},
            "minecraft:movement.basic": {},
            "minecraft:jump.static": {},
            "minecraft:navigation.walk": {"can_walk": True, "avoid_water": True, "avoid_damage_blocks": True, "can_open_doors": False},
            "minecraft:home": {"restriction_radius": 4, "restriction_type": "random_movement"},
            "minecraft:behavior.move_towards_home_restriction": {"priority": 3, "speed_multiplier": 1.0},
            "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 1.0, "xz_dist": 3, "y_dist": 1, "interval": 60},
            "minecraft:behavior.random_look_around": {"priority": 7},
        }}})
    write_json(os.path.join(BP, "entities", "npc.json"), {"format_version": "1.21.60", "minecraft:entity": {
        "description": {"identifier": "fc:npc", "is_spawnable": False, "is_summonable": True,
                        "properties": {"fc:skin": {"type": "int", "range": [0, len(art.NPC_SKINS) - 1], "default": 0, "client_sync": True}}},
        "components": {
            "minecraft:type_family": {"family": ["fc_npc", "inanimate"]},
            "minecraft:health": {"value": 20, "max": 20},
            "minecraft:damage_sensor": invulnerable,
            "minecraft:collision_box": {"width": 0.6, "height": 1.8},
            "minecraft:physics": {},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:persistent": {},
            "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": False},
            "minecraft:knockback_resistance": {"value": 1.0},
            "minecraft:fire_immune": {},
            "minecraft:movement": {"value": 0},
            "minecraft:behavior.look_at_player": {"priority": 1, "look_distance": 8, "probability": 1.0},
        }}})
    write_json(os.path.join(BP, "entities", "hologram.json"), {"format_version": "1.21.60", "minecraft:entity": {
        "description": {"identifier": "fc:hologram", "is_spawnable": False, "is_summonable": True},
        "components": {
            "minecraft:health": {"value": 1, "max": 1},
            "minecraft:damage_sensor": invulnerable,
            "minecraft:collision_box": {"width": 0.01, "height": 0.01},
            "minecraft:physics": {"has_gravity": False, "has_collision": False},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:persistent": {},
            "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": False},
            "minecraft:knockback_resistance": {"value": 1.0},
            "minecraft:fire_immune": {},
        }}})

    for t, (ident, name, _v, hp, dmg, speed, scale, (w, h), _tint) in BOSSES.items():
        write_json(os.path.join(BP, "entities", f"boss_{t}.json"), {"format_version": "1.21.60", "minecraft:entity": {
            "description": {"identifier": ident, "is_spawnable": False, "is_summonable": True},
            "components": {
                "minecraft:type_family": {"family": ["fc_boss", "monster", "mob"]},
                "minecraft:health": {"value": hp, "max": hp},
                "minecraft:attack": {"damage": dmg},
                "minecraft:movement": {"value": speed},
                "minecraft:movement.basic": {},
                "minecraft:navigation.walk": {"can_path_over_water": True, "avoid_water": False, "can_open_doors": False},
                "minecraft:jump.static": {},
                "minecraft:can_climb": {},
                "minecraft:physics": {},
                "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
                "minecraft:collision_box": {"width": w, "height": h},
                "minecraft:scale": {"value": scale},
                "minecraft:knockback_resistance": {"value": 1.0},
                "minecraft:fire_immune": {},
                "minecraft:persistent": {},
                "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": False},
                "minecraft:boss": {"name": name, "hud_range": 64, "should_darken_sky": t >= 3},
                "minecraft:follow_range": {"value": 48, "max": 48},
                "minecraft:experience_reward": {"on_death": str(100 * t)},
                "minecraft:breathable": {"total_supply": 15, "suffocate_time": 0, "breathes_water": True},
                "minecraft:damage_sensor": {"triggers": [{"cause": c, "deals_damage": "no"} for c in ("fall", "drowning", "suffocation", "lightning", "fire", "fire_tick", "lava")]},
                "minecraft:behavior.float": {"priority": 0},
                "minecraft:behavior.nearest_attackable_target": {"priority": 1, "must_see": False, "reselect_targets": True, "within_radius": 40,
                                                                 "entity_types": [{"filters": {"test": "is_family", "subject": "other", "value": "player"}, "max_dist": 40}]},
                "minecraft:behavior.hurt_by_target": {"priority": 1},
                "minecraft:behavior.melee_attack": {"priority": 2, "speed_multiplier": 1.2, "track_target": True},
                "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.8},
                "minecraft:behavior.look_at_player": {"priority": 7, "look_distance": 12},
                "minecraft:behavior.random_look_around": {"priority": 8},
            }}})

    write_json(os.path.join(BP, "manifest.json"), {
        "format_version": 2,
        "header": {"name": "Factions Core 3", "description": "The complete factions server core: factions, land, power, raids, economy, shop, auction house, crates, custom enchants, spawners, ore crawlers, KOTH, envoys and a styled UI. Type /menu.",
                   "uuid": BP_UUID, "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [{"type": "data", "uuid": BP_DATA, "version": VERSION},
                    {"type": "script", "language": "javascript", "uuid": BP_SCRIPT, "entry": "scripts/main.js", "version": VERSION}],
        "dependencies": [{"uuid": RP_UUID, "version": VERSION},
                         {"uuid": CHAT_UUID, "version": VERSION},
                         {"module_name": "@minecraft/server", "version": "2.7.0"},
                         {"module_name": "@minecraft/server-ui", "version": "2.0.0"}],
    })
    save_png(icons.build_logo(256), BP, "pack_icon.png")


# ================================================================ resource pack: art

def build_chat():
    write_json(os.path.join(CHAT, "manifest.json"), {
        "format_version": 2,
        "header": {"name": "Factions Core 3 Chat", "description": "Ranks and factions in normal chat. Needs the Beta APIs experiment; turned on automatically with Factions Core 3.",
                   "uuid": CHAT_UUID, "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [{"type": "data", "uuid": CHAT_DATA, "version": VERSION},
                    {"type": "script", "language": "javascript", "uuid": CHAT_SCRIPT, "entry": "scripts/main.js", "version": VERSION}],
        "dependencies": [{"module_name": "@minecraft/server", "version": CHAT_BETA}],
    })
    save_png(icons.build_logo(256), CHAT, "pack_icon.png")


def build_rp_art():
    shutil.rmtree(os.path.join(RP, "textures"), ignore_errors=True)
    ic = icons.build_icons()
    for name, img in ic.items():
        save_png(img, RP, "textures", "fc", "ui", "icons", f"{name}.png")
    save_png(icons.build_logo(128), RP, "textures", "fc", "ui", "logo.png")
    for kind in ("lumberjack", "miner", "farmer", "monster", "questmaster", "rebirth"):
        save_png(icons.scene(kind), RP, "textures", "fc", "ui", "banners", f"{kind}.png")

    for name, (img, nine, base) in art.ui_textures().items():
        save_png(img, RP, "textures", "fc", "ui", f"{name}.png")
        if nine:
            write_json(os.path.join(RP, "textures", "fc", "ui", f"{name}.json"), {"nineslice_size": nine, "base_size": [base, base]})
    from PIL import Image
    save_png(Image.new("RGBA", (4, 4), (0, 0, 0, 255)), RP, "textures", "fc", "ui", "dim.png")

    item_tex = {}
    for name, img in art.item_textures(ic).items():
        save_png(img, RP, "textures", "fc", "items", f"{name}.png")
        item_tex[f"fc_{name}"] = {"textures": f"textures/fc/items/{name}"}
    write_json(os.path.join(RP, "textures", "item_texture.json"), {"resource_pack_name": "factions", "texture_name": "atlas.items", "texture_data": item_tex})

    terrain = {}
    for t in SPAWNERS:
        save_png(art.spawner_texture(t), RP, "textures", "fc", "blocks", f"spawner_{t}.png")
        terrain[f"fc_spawner_{t}"] = {"textures": f"textures/fc/blocks/spawner_{t}"}
    for r in RARITIES:
        side, top, bottom = art.crate_textures(r)
        for part, img in (("side", side), ("top", top), ("bottom", bottom)):
            save_png(img, RP, "textures", "fc", "blocks", f"crate_{r}_{part}.png")
            terrain[f"fc_crate_{r}_{part}"] = {"textures": f"textures/fc/blocks/crate_{r}_{part}"}
    side, top = art.supply_textures()
    save_png(side, RP, "textures", "fc", "blocks", "supply_side.png")
    save_png(top, RP, "textures", "fc", "blocks", "supply_top.png")
    terrain["fc_supply_side"] = {"textures": "textures/fc/blocks/supply_side"}
    terrain["fc_supply_top"] = {"textures": "textures/fc/blocks/supply_top"}
    write_json(os.path.join(RP, "textures", "terrain_texture.json"), {"resource_pack_name": "factions", "texture_name": "atlas.terrain", "padding": 8, "num_mip_levels": 4, "texture_data": terrain})

    for t in CRAWLERS:
        save_png(art.crawler_texture(t), RP, "textures", "fc", "entity", f"crawler_{t}.png")
    save_png(art.blank(16), RP, "textures", "fc", "entity", "hologram.png")
    for spec in art.NPC_SKINS:
        save_png(art.npc_skin(spec), RP, "textures", "fc", "entity", "npc", f"{spec[0]}.png")
    return ic


# ================================================================ resource pack: models, entities, text

def build_rp_entities():
    for sub in ("entity", "models", "animations", "render_controllers"):
        shutil.rmtree(os.path.join(RP, sub), ignore_errors=True)
    B = art.CRAWLER_BOXES

    def cube(origin, name, mirror=False):
        u, v, w, h, d = B[name]
        c = {"origin": origin, "size": [w, h, d], "uv": [u, v]}
        if mirror:
            c["mirror"] = True
        return c

    write_json(os.path.join(RP, "models", "entity", "crawler.geo.json"), {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.fc_crawler", "texture_width": 64, "texture_height": 64,
                        "visible_bounds_width": 2, "visible_bounds_height": 2, "visible_bounds_offset": [0, 0.5, 0]},
        "bones": [
            {"name": "root", "pivot": [0, 0, 0]},
            {"name": "body", "parent": "root", "pivot": [0, 4, 0], "cubes": [
                cube([-6, 0, -7], "tread"), cube([3, 0, -7], "tread", True), cube([-4, 3, -6], "chassis"),
                cube([-3, 7, -1], "cab"), cube([1.5, 12, 3], "antenna"), cube([1, 16, 2.5], "lamp")]},
            {"name": "drill", "parent": "body", "pivot": [0, 5, -6], "cubes": [
                cube([-2.5, 2.5, -9], "drill_base"), cube([-1.5, 3.5, -12], "drill_mid"), cube([-0.5, 4.5, -14], "drill_tip")]},
        ]}]})
    write_json(os.path.join(RP, "models", "entity", "hologram.geo.json"), {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.fc_hologram", "texture_width": 16, "texture_height": 16,
                        "visible_bounds_width": 1, "visible_bounds_height": 1, "visible_bounds_offset": [0, 0, 0]},
        "bones": [{"name": "root", "pivot": [0, 0, 0]}]}]})

    write_json(os.path.join(RP, "animations", "crawler.animation.json"), {"format_version": "1.8.0", "animations": {
        "animation.fc_crawler.idle": {"loop": True, "bones": {
            "drill": {"rotation": [0, 0, "q.anim_time * 540"]},
            "body": {"position": [0, "math.sin(q.anim_time * 400) * 0.2", 0]}}},
        "animation.fc_crawler.walk": {"loop": True, "bones": {
            "body": {"rotation": ["math.sin(q.anim_time * 1100) * 2.5", 0, "math.cos(q.anim_time * 1100) * 1.5"]}}},
        "animation.fc_crawler.dig": {"animation_length": 0.6, "bones": {
            "drill": {"position": {"0.0": [0, 0, 0], "0.15": [0, 0, -1.5], "0.3": [0, 0, 0], "0.45": [0, 0, -1.5], "0.6": [0, 0, 0]}},
            "body": {"rotation": {"0.0": [0, 0, 0], "0.15": [7, 0, 0], "0.3": [0, 0, 0], "0.45": [7, 0, 0], "0.6": [0, 0, 0]}}}},
    }})

    tiers = list(CRAWLERS)
    write_json(os.path.join(RP, "render_controllers", "crawler.render_controllers.json"), {"format_version": "1.10.0", "render_controllers": {
        "controller.render.fc_crawler": {
            "arrays": {"textures": {"Array.skins": [f"Texture.{t}" for t in tiers]}},
            "geometry": "Geometry.default",
            "materials": [{"*": "Material.default"}],
            "textures": ["Array.skins[math.clamp(q.property('fc:tier'), 0, 5)]"],
        },
        "controller.render.fc_hologram": {
            "geometry": "Geometry.default", "materials": [{"*": "Material.default"}], "textures": ["Texture.default"],
        },
    }})

    write_json(os.path.join(RP, "entity", "crawler.entity.json"), {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "fc:crawler",
        "materials": {"default": "entity_alphatest"},
        "textures": {t: f"textures/fc/entity/crawler_{t}" for t in tiers},
        "geometry": {"default": "geometry.fc_crawler"},
        "animations": {"idle": "animation.fc_crawler.idle", "walk": "animation.fc_crawler.walk", "dig": "animation.fc_crawler.dig"},
        "scripts": {"animate": ["idle", {"walk": "q.modified_move_speed > 0.05"}]},
        "render_controllers": ["controller.render.fc_crawler"],
        "spawn_egg": {"base_color": "#3a3f4f", "overlay_color": "#46c3ff"},
    }}})
    skins = [s[0] for s in art.NPC_SKINS]
    write_json(os.path.join(RP, "animations", "npc.animation.json"), {"format_version": "1.8.0", "animations": {
        "animation.fc_npc.idle": {"loop": True, "bones": {
            "head": {"rotation": ["q.target_x_rotation", "q.target_y_rotation", 0]},
            "rightArm": {"rotation": ["math.sin(q.life_time * 60) * 3", 0, "2 + math.cos(q.life_time * 50) * 2"]},
            "leftArm": {"rotation": ["-math.sin(q.life_time * 60) * 3", 0, "-2 - math.cos(q.life_time * 50) * 2"]}}},
    }})
    write_json(os.path.join(RP, "render_controllers", "npc.render_controllers.json"), {"format_version": "1.10.0", "render_controllers": {
        "controller.render.fc_npc": {
            "arrays": {"textures": {"Array.skins": [f"Texture.{s}" for s in skins]}},
            "geometry": "Geometry.default",
            "materials": [{"*": "Material.default"}],
            "textures": [f"Array.skins[math.clamp(q.property('fc:skin'), 0, {len(skins) - 1})]"],
        }}})
    write_json(os.path.join(RP, "entity", "npc.entity.json"), {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "fc:npc",
        "materials": {"default": "entity_alphatest"},
        "textures": {s: f"textures/fc/entity/npc/{s}" for s in skins},
        "geometry": {"default": "geometry.humanoid.custom"},
        "animations": {"idle": "animation.fc_npc.idle"},
        "scripts": {"animate": ["idle"]},
        "render_controllers": ["controller.render.fc_npc"],
    }}})
    write_json(os.path.join(RP, "entity", "hologram.entity.json"), {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "fc:hologram",
        "materials": {"default": "entity_alphatest"},
        "textures": {"default": "textures/fc/entity/hologram"},
        "geometry": {"default": "geometry.fc_hologram"},
        "render_controllers": ["controller.render.fc_hologram"],
    }}})

    # Bosses: vanilla models and textures (already in the game) with our own
    # simple animations, so nothing depends on vanilla's internal Molang variables.
    walk = "math.cos(q.modified_distance_moved * 38.17) * 40 * math.min(q.modified_move_speed * 4, 1)"
    golem_walk = "math.cos(q.modified_distance_moved * 13.5) * 25 * math.min(q.modified_move_speed * 4, 1)"
    look = {"rotation": ["q.target_x_rotation", "q.target_y_rotation", 0]}
    write_json(os.path.join(RP, "animations", "boss.animation.json"), {"format_version": "1.8.0", "animations": {
        "animation.fc_boss.humanoid": {"loop": True, "bones": {
            "head": look,
            "rightArm": {"rotation": ["-90 + math.sin(q.life_time * 180) * 4", 0, 0]},
            "leftArm": {"rotation": ["-90 - math.sin(q.life_time * 180) * 4", 0, 0]},
            "rightLeg": {"rotation": [walk, 0, 0]},
            "leftLeg": {"rotation": [f"-({walk})", 0, 0]}}},
        "animation.fc_boss.golem": {"loop": True, "bones": {
            "head": look,
            "arm0": {"rotation": [f"-({golem_walk})", 0, 0]},
            "arm1": {"rotation": [golem_walk, 0, 0]},
            "leg0": {"rotation": [golem_walk, 0, 0]},
            "leg1": {"rotation": [f"-({golem_walk})", 0, 0]}}},
        "animation.fc_boss.ravager": {"loop": True, "bones": {
            "head": {"rotation": ["q.target_x_rotation * 0.5", "q.target_y_rotation * 0.5", 0]},
            "leg0": {"rotation": [walk, 0, 0]},
            "leg1": {"rotation": [f"-({walk})", 0, 0]},
            "leg2": {"rotation": [f"-({walk})", 0, 0]},
            "leg3": {"rotation": [walk, 0, 0]}}},
    }})
    MODELS = {
        "zombie": ("zombie", "textures/entity/zombie/zombie", "geometry.zombie.v1.8", "animation.fc_boss.humanoid"),
        "wither_skeleton": ("skeleton", "textures/entity/skeleton/wither_skeleton", "geometry.skeleton.v1.8", "animation.fc_boss.humanoid"),
        "iron_golem": ("iron_golem", "textures/entity/iron_golem", "geometry.irongolem", "animation.fc_boss.golem"),
        "ravager": ("ravager", "textures/entity/illager/ravager", "geometry.ravager", "animation.fc_boss.ravager"),
    }
    controllers = {}
    for t, (ident, name, vanilla, *_rest, tint) in BOSSES.items():
        material, texture, geo, anim = MODELS[vanilla]
        rc = f"controller.render.fc_boss_{t}"
        r, g, b, a = tint
        controllers[rc] = {"geometry": "Geometry.default", "materials": [{"*": "Material.default"}], "textures": ["Texture.default"],
                           "overlay_color": {"r": r, "g": g, "b": b, "a": a}}
        write_json(os.path.join(RP, "entity", f"boss_{t}.entity.json"), {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
            "identifier": ident,
            "materials": {"default": material},
            "textures": {"default": texture},
            "geometry": {"default": geo},
            "animations": {"body": anim},
            "scripts": {"animate": ["body"]},
            "render_controllers": [rc],
        }}})
    write_json(os.path.join(RP, "render_controllers", "boss.render_controllers.json"), {"format_version": "1.8.0", "render_controllers": controllers})

    blocks = {"format_version": "1.1.0"}
    for t in SPAWNERS:
        blocks[f"fc:spawner_{t}"] = {"sound": "metal"}
    for r in RARITIES:
        blocks[f"fc:crate_{r}"] = {"sound": "wood"}
    blocks["fc:supply_drop"] = {"sound": "metal"}
    write_json(os.path.join(RP, "blocks.json"), blocks)

    lang = ["pack.name=Factions Core 3 RP", "pack.description=Menus, HUD, items, blocks and models for Factions Core 3"]
    for t, n in SPAWNERS.items():
        lang.append(f"tile.fc:spawner_{t}.name={n} Spawner")
    for r in RARITIES:
        lang.append(f"tile.fc:crate_{r}.name={RARITY_NAME[r]} Crate")
    for t, (ident, name, *_rest) in BOSSES.items():
        lang.append(f"entity.{ident}.name={name}")
    lang += ["entity.fc:npc.name=NPC"]
    lang += ["tile.fc:supply_drop.name=Supply Drop", "entity.fc:crawler.name=Ore Crawler", "entity.fc:hologram.name=Hologram",
             "item.spawn_egg.entity.fc:crawler.name=Spawn Ore Crawler"]
    os.makedirs(os.path.join(RP, "texts"), exist_ok=True)
    with open(os.path.join(RP, "texts", "en_US.lang"), "w", encoding="utf-8") as f:
        f.write("\n".join(lang) + "\n")
    write_json(os.path.join(RP, "texts", "languages.json"), ["en_US"])

    write_json(os.path.join(RP, "manifest.json"), {
        "format_version": 2,
        "header": {"name": "Factions Core 3 RP", "description": "Menus, HUD, items, blocks and models for Factions Core 3.",
                   "uuid": RP_UUID, "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [{"type": "resources", "uuid": RP_RES, "version": VERSION}],
    })
    save_png(icons.build_logo(256), RP, "pack_icon.png")


# ================================================================ resource pack: JSON UI

def build_rp_ui():
    import ui
    shutil.rmtree(os.path.join(RP, "ui"), ignore_errors=True)
    for name, data in ui.files().items():
        write_json(os.path.join(RP, "ui", name), data)


# ================================================================ packaging

def zip_dir(z, folder, prefix):
    for base, _, files in os.walk(folder):
        for name in sorted(files):
            full = os.path.join(base, name)
            z.write(full, os.path.join(prefix, os.path.relpath(full, folder)))


def package():
    os.makedirs(DIST, exist_ok=True)
    old = os.path.join(DIST, "FactionsCore.mcpack")
    if os.path.exists(old):
        os.remove(old)
    for folder, name in ((BP, "FactionsCore_BP"), (RP, "FactionsCore_RP"), (CHAT, "FactionsCoreChat_BP")):
        with zipfile.ZipFile(os.path.join(DIST, name + ".mcpack"), "w", zipfile.ZIP_DEFLATED) as z:
            zip_dir(z, folder, "")
    # The version is in the file name so it's clear which download is newest.
    for old in os.listdir(DIST):
        if old.startswith("FactionsCore") and old.endswith(".mcaddon"):
            os.remove(os.path.join(DIST, old))
    with zipfile.ZipFile(os.path.join(DIST, f"FactionsCore3_v{'.'.join(map(str, VERSION))}.mcaddon"), "w", zipfile.ZIP_DEFLATED) as z:
        zip_dir(z, BP, "FactionsCore_BP")
        zip_dir(z, RP, "FactionsCore_RP")
        zip_dir(z, CHAT, "FactionsCoreChat_BP")


def main():
    build_bp()
    build_chat()
    build_rp_art()
    build_rp_entities()
    build_rp_ui()
    package()
    print(f"built Factions Core 3 v{'.'.join(map(str, VERSION))}: packs/FactionsCore_BP, packs/FactionsCore_RP, packs/FactionsCoreChat_BP and dist/FactionsCore3_v{'.'.join(map(str, VERSION))}.mcaddon")


if __name__ == "__main__":
    main()
