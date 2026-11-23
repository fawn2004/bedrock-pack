// Factions Core - custom enchants.
// Custom enchants live in an item's lore ("Lifesteal III") so they show on
// hover and survive trading, anvils and chests. Books apply them.
import { system, world, EquipmentSlot, EntityDamageCause, ItemStack, Player } from "@minecraft/server";
import { RARITY } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";

const ROMAN = ["", "I", "II", "III", "IV", "V"];
export const roman = (n) => ROMAN[n] ?? String(n);

const W = ["sword", "axe", "mace", "trident"];
const T = ["pickaxe", "shovel", "axe", "hoe"];

/** Every custom enchant. `on` = which items take it. */
export const ENCHANTS = {
  // ---- weapons
  lifesteal: { name: "Lifesteal", rarity: "rare", max: 3, on: W, desc: "Chance to heal when you hit" },
  frostbite: { name: "Frostbite", rarity: "common", max: 3, on: W, desc: "Chance to slow your target" },
  venom: { name: "Venom", rarity: "common", max: 3, on: W, desc: "Chance to poison your target" },
  blaze: { name: "Blaze", rarity: "rare", max: 2, on: W, desc: "Sets your target on fire" },
  blind: { name: "Blind", rarity: "rare", max: 2, on: W, desc: "Chance to blind your target" },
  executioner: { name: "Executioner", rarity: "epic", max: 3, on: W, desc: "More damage to low-health targets" },
  wither: { name: "Withering", rarity: "epic", max: 2, on: W, desc: "Chance to wither your target" },
  plunder: { name: "Plunder", rarity: "epic", max: 3, on: W, desc: "More money and crystals from kills" },
  thunder: { name: "Thunderstrike", rarity: "legendary", max: 3, on: W, desc: "Chance to call down lightning" },
  obliterate: { name: "Obliterate", rarity: "mythic", max: 1, on: W, desc: "10% chance to deal double damage" },
  swiftness: { name: "Swiftness", rarity: "rare", max: 2, on: W, desc: "Speed while you hold it" },
  rage: { name: "Rage", rarity: "epic", max: 2, on: W, desc: "Strength while you hold it" },
  // ---- tools
  telepathy: { name: "Telepathy", rarity: "common", max: 1, on: T, desc: "Drops go straight to your inventory" },
  haste: { name: "Haste", rarity: "common", max: 3, on: T, desc: "Haste while held" },
  autosmelt: { name: "Autosmelt", rarity: "rare", max: 1, on: T, desc: "Smelts what you mine" },
  experience: { name: "Experience", rarity: "rare", max: 3, on: T, desc: "More level XP from mining" },
  treasure: { name: "Treasure Hunter", rarity: "epic", max: 3, on: T, desc: "Find crystals and keys while mining" },
  explosive: { name: "Explosive", rarity: "legendary", max: 3, on: ["pickaxe", "shovel"], desc: "Chance to mine 3x3" },
  // ---- armor
  nightvision: { name: "Night Vision", rarity: "common", max: 1, on: ["helmet"], desc: "See in the dark" },
  aquatic: { name: "Aquatic", rarity: "common", max: 1, on: ["helmet"], desc: "Breathe underwater" },
  berserk: { name: "Berserk", rarity: "epic", max: 2, on: ["helmet"], desc: "Strength when below 40% health" },
  fireshield: { name: "Fire Shield", rarity: "epic", max: 1, on: ["chestplate"], desc: "Fire resistance" },
  regen: { name: "Regeneration", rarity: "legendary", max: 2, on: ["chestplate"], desc: "Constant regeneration" },
  overload: { name: "Overload", rarity: "legendary", max: 3, on: ["chestplate"], desc: "Extra hearts" },
  armored: { name: "Armored", rarity: "rare", max: 3, on: ["leggings"], desc: "Take less damage" },
  dodge: { name: "Dodge", rarity: "epic", max: 3, on: ["leggings"], desc: "Chance to dodge a hit" },
  reflect: { name: "Reflect", rarity: "epic", max: 3, on: ["leggings"], desc: "Reflect damage back" },
  jump: { name: "Leaper", rarity: "common", max: 2, on: ["boots"], desc: "Jump boost" },
  speed: { name: "Gears", rarity: "rare", max: 2, on: ["boots"], desc: "Speed" },
  // ---- anything
  soulbound: { name: "Soulbound", rarity: "mythic", max: 1, on: ["*"], desc: "Keep this item when you die" },
};

const BY_NAME = Object.fromEntries(Object.entries(ENCHANTS).map(([id, e]) => [e.name.toLowerCase(), id]));
const strip = (s) => s.replace(/§./g, "");

/** What kind of gear an item id is (sword, pickaxe, helmet...), or undefined. */
export function gearKind(typeId) {
  const n = typeId.split(":")[1] ?? "";
  for (const k of ["pickaxe", "shovel", "sword", "axe", "hoe", "helmet", "chestplate", "leggings", "boots", "mace", "trident"]) {
    if (n === k || n.endsWith("_" + k)) return k;
  }
  return undefined;
}

export const fits = (enchId, typeId) => {
  const e = ENCHANTS[enchId];
  const kind = gearKind(typeId);
  return !!kind && (e.on.includes("*") || e.on.includes(kind));
};

/** { enchantId: level } read from an item's lore. */
export function readEnchants(item) {
  const out = {};
  if (!item) return out;
  let lore;
  try { lore = item.getLore(); } catch { return out; }
  for (const line of lore) {
    const m = strip(line).match(/^(.+) ([IVX]+)$/);
    if (!m) continue;
    const id = BY_NAME[m[1].toLowerCase()];
    if (id) out[id] = ROMAN.indexOf(m[2]);
  }
  return out;
}

export const enchantLine = (id, lvl) => `§r${RARITY[ENCHANTS[id].rarity].color}${ENCHANTS[id].name} ${roman(lvl)}`;

/** Writes enchants back into lore (keeping any other lore lines). */
export function writeEnchants(item, map) {
  const other = item.getLore().filter((l) => {
    const m = strip(l).match(/^(.+) ([IVX]+)$/);
    return !(m && BY_NAME[m[1].toLowerCase()]);
  });
  const ids = Object.keys(map).sort((a, b) => RARITY[ENCHANTS[b].rarity].order - RARITY[ENCHANTS[a].rarity].order);
  item.setLore([...ids.map((id) => enchantLine(id, map[id])), ...other]);
  if (map.soulbound) item.keepOnDeath = true;
}

export const MAX_CUSTOM_ENCHANTS = 6;

/** Applies a book to an item. Returns a message. */
export function applyBook(item, enchId, level, successRate) {
  const map = readEnchants(item);
  if (!fits(enchId, item.typeId)) return { ok: false, msg: `${ENCHANTS[enchId].name} can't go on that item.` };
  if ((map[enchId] ?? 0) >= level) return { ok: false, msg: `That item already has ${ENCHANTS[enchId].name} ${roman(map[enchId])}.` };
  if (!map[enchId] && Object.keys(map).length >= MAX_CUSTOM_ENCHANTS) return { ok: false, msg: `Items can hold ${MAX_CUSTOM_ENCHANTS} custom enchants.` };
  if (Math.random() * 100 >= successRate) return { ok: true, failed: true, msg: "§cThe enchant failed and the book crumbled." };
  map[enchId] = level;
  writeEnchants(item, map);
  return { ok: true, msg: `§aApplied ${ENCHANTS[enchId].name} ${roman(level)}!` };
}

// ------------------------------------------------------------ effects

const chance = (pct) => Math.random() * 100 < pct;
const equip = (e) => e.getComponent("minecraft:equippable");
const SLOTS = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];

function armorEnchants(entity) {
  const out = {};
  const eq = equip(entity);
  if (!eq) return out;
  for (const s of SLOTS) {
    try { Object.assign(out, readEnchants(eq.getEquipment(s))); } catch { /* no slot */ }
  }
  return out;
}

export const heldItem = (player) => {
  try { return equip(player)?.getEquipment(EquipmentSlot.Mainhand); } catch { return undefined; }
};

function health(e) {
  const h = e.getComponent("minecraft:health");
  return h ? { cur: h.currentValue, max: h.effectiveMax, comp: h } : undefined;
}

export function setupEnchants() {
  // Damage changes have to happen in the before event; effects run a tick later.
  world.beforeEvents.entityHurt.subscribe((e) => {
    if (e.cancel) return;
    const attacker = e.damageSource.damagingEntity;
    const victim = e.hurtEntity;
    const later = [];

    if (attacker instanceof Player && !e.damageSource.damagingProjectile) {
      const ench = readEnchants(heldItem(attacker));
      const hp = health(victim);
      const procs = [];
      if (ench.executioner && hp && hp.cur / hp.max < 0.3) { e.damage *= 1 + 0.15 * ench.executioner; procs.push("executioner"); }
      if (ench.obliterate && chance(10)) { e.damage *= 2; procs.push("obliterate"); }
      if (ench.lifesteal && chance(15 + ench.lifesteal * 8)) { procs.push("lifesteal"); later.push(() => { const h = health(attacker); if (h) h.comp.setCurrentValue(Math.min(h.max, h.cur + ench.lifesteal)); }); }
      if (ench.frostbite && chance(12 + ench.frostbite * 8)) { procs.push("frostbite"); later.push(() => victim.addEffect("slowness", 40 + ench.frostbite * 20, { amplifier: ench.frostbite - 1 })); }
      if (ench.venom && chance(10 + ench.venom * 8)) { procs.push("venom"); later.push(() => victim.addEffect("poison", 40 + ench.venom * 20, { amplifier: ench.venom - 1 })); }
      if (ench.wither && chance(10 + ench.wither * 7)) { procs.push("wither"); later.push(() => victim.addEffect("wither", 60, { amplifier: ench.wither - 1 })); }
      if (ench.blind && chance(8 + ench.blind * 6)) { procs.push("blind"); later.push(() => victim.addEffect("blindness", 40 + ench.blind * 20)); }
      if (ench.blaze && chance(25 + ench.blaze * 15)) { procs.push("blaze"); later.push(() => victim.setOnFire(2 + ench.blaze * 2, true)); }
      if (ench.thunder && chance(ench.thunder * 4)) { procs.push("thunder"); later.push(() => { victim.dimension.spawnEntity("minecraft:lightning_bolt", victim.location); }); }
      if (procs.length) later.push(() => showProcs(attacker, victim, procs));
    }

    if (victim instanceof Player) {
      const arm = armorEnchants(victim);
      if (arm.dodge && chance(arm.dodge * 4)) {
        e.cancel = true;
        system.run(() => { try { victim.onScreenDisplay.setActionBar("§b§lDODGED!"); R.sound(victim, "mob.bat.takeoff"); } catch { /* */ } });
        return;
      }
      if (arm.armored) e.damage *= 1 - 0.06 * arm.armored;
      if (arm.reflect && attacker && attacker.id !== victim.id && chance(arm.reflect * 7)) {
        const dmg = e.damage * 0.3;
        later.push(() => {
          attacker.applyDamage(dmg, { cause: EntityDamageCause.thorns, damagingEntity: victim });
          victim.onScreenDisplay.setActionBar("§5§lREFLECT!");
          R.sound(victim, "random.anvil_land", 1.8, 0.3);
        });
      }
    }

    if (later.length) system.run(() => { for (const fn of later) { try { fn(); } catch { /* entity gone */ } } });
  });

  // Armor and held-tool passives, plus faction territory perks.
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      try { passives(player); } catch { /* ignore */ }
    }
  }, 40);
}

// What each enchant looks and sounds like when it triggers: [label, sound, pitch, particle]
const PROC_FX = {
  executioner: ["§4§lEXECUTIONER!", "mob.wither.hurt", 1.6, "minecraft:critical_hit_emitter"],
  obliterate: ["§c§lOBLITERATE!", "random.explode", 1.4, "minecraft:huge_explosion_emitter"],
  lifesteal: ["§c§lLIFESTEAL!", "random.drink", 1.4, "minecraft:heart_particle"],
  frostbite: ["§b§lFROSTBITE!", "random.glass", 1.3, "minecraft:snowflake_particle"],
  venom: ["§2§lVENOM!", "mob.spider.say", 1.6, "minecraft:villager_angry"],
  wither: ["§8§lWITHERING!", "mob.wither.shoot", 1.6, "minecraft:soul_particle"],
  blind: ["§7§lBLIND!", "mob.bat.hurt", 0.8, "minecraft:basic_smoke_particle"],
  blaze: ["§6§lBLAZE!", "mob.ghast.fireball", 1.4, "minecraft:basic_flame_particle"],
  thunder: ["§e§lTHUNDERSTRIKE!", "ambient.weather.thunder", 1.2, "minecraft:electric_spark_particle"],
};

const lastProcBar = new Map();

/** Tells the attacker which enchants just triggered, with a sound and particles on the target. */
function showProcs(attacker, victim, procs) {
  const now = Date.now();
  const labels = procs.map((id) => PROC_FX[id]?.[0] ?? ENCHANTS[id].name);
  // Don't let a fast-clicking player spam the action bar; the newest procs win.
  if ((lastProcBar.get(attacker.id) ?? 0) < now - 300 || procs.includes("obliterate")) {
    attacker.onScreenDisplay.setActionBar(labels.join(" §8| "));
    lastProcBar.set(attacker.id, now);
  }
  const top = procs[procs.length - 1];
  const fx = PROC_FX[top];
  if (fx) R.sound(attacker, fx[1], fx[2], 0.6);
  const at = { x: victim.location.x, y: victim.location.y + 1, z: victim.location.z };
  for (const id of procs) {
    const particle = PROC_FX[id]?.[3];
    if (!particle) continue;
    try { victim.dimension.spawnParticle(particle, at); } catch { /* unknown particle or unloaded */ }
  }
}

/** Swords with a Legendary or Mythic enchant are "Empowered": Speed I while held. */
export function isEmpowered(ench) {
  return Object.keys(ench).some((id) => ["legendary", "mythic"].includes(ENCHANTS[id].rarity) && ENCHANTS[id].on === W);
}

function effect(player, id, amp, dur = 80) {
  const cur = player.getEffect(id);
  if (cur && cur.amplifier === amp && cur.duration > 40) return;
  player.addEffect(id, dur, { amplifier: amp, showParticles: false });
}

function passives(player) {
  const arm = armorEnchants(player);
  const held = readEnchants(heldItem(player));
  // Held-weapon effects are short so they fade a couple of seconds after you switch away.
  const speed = Math.max(arm.speed ?? 0, held.swiftness ?? 0, isEmpowered(held) ? 1 : 0);
  if (speed) effect(player, "speed", speed - 1, speed > (arm.speed ?? 0) ? 50 : 80);
  if (held.rage) effect(player, "strength", held.rage - 1, 50);
  if (arm.jump) effect(player, "jump_boost", arm.jump - 1);
  if (arm.nightvision) effect(player, "night_vision", 0, 400);
  if (arm.aquatic) effect(player, "water_breathing", 0);
  if (arm.fireshield) effect(player, "fire_resistance", 0);
  if (arm.regen) effect(player, "regeneration", arm.regen - 1);
  if (arm.overload) {
    const cur = player.getEffect("health_boost");
    if (!cur || cur.amplifier !== arm.overload - 1) player.addEffect("health_boost", 20 * 600, { amplifier: arm.overload - 1, showParticles: false });
  }
  if (arm.berserk) {
    const h = health(player);
    if (h && h.cur / h.max < 0.4 && (held.rage ?? 0) < arm.berserk) effect(player, "strength", arm.berserk - 1);
  }
  if (held.haste) effect(player, "haste", held.haste - 1);

  // Faction land perks.
  const p = S.playerData(player);
  if (p.faction && S.ownerAt(player.dimension.id, player.location) === p.faction) {
    const f = S.getFaction(p.faction);
    const hasteLvl = R.upgradeLevel(f, "haste");
    if (hasteLvl && !held.haste) effect(player, "haste", hasteLvl - 1);
    if (R.upgradeLevel(f, "speed") && !speed) effect(player, "speed", 0);
  }
}

// ------------------------------------------------------------ mining enchants

const SMELT = {
  "minecraft:raw_iron": "minecraft:iron_ingot",
  "minecraft:raw_gold": "minecraft:gold_ingot",
  "minecraft:raw_copper": "minecraft:copper_ingot",
  "minecraft:cobblestone": "minecraft:stone",
  "minecraft:cobbled_deepslate": "minecraft:deepslate",
  "minecraft:sand": "minecraft:glass",
  "minecraft:ancient_debris": "minecraft:netherite_scrap",
  "minecraft:iron_ore": "minecraft:iron_ingot",
  "minecraft:gold_ore": "minecraft:gold_ingot",
  "minecraft:clay_ball": "minecraft:brick",
  "minecraft:netherrack": "minecraft:netherbrick",
};

const EXPLOSIVE_OK = /(stone|ore|deepslate|netherrack|granite|diorite|andesite|tuff|basalt|calcite|end_stone|dirt|grass_block|gravel|sand|clay|soul_soil|mud|terracotta)$/;
const NEVER = /(bedrock|spawner|chest|barrel|shulker|furnace|hopper|portal|fc:|obsidian|command|structure|jigsaw)/;

/** Called after a player breaks a block. Returns extra XP fraction from Experience. */
export function onMine(player, block, tool, brokenTypeId) {
  const ench = readEnchants(tool);
  if (!Object.keys(ench).length) return 0;
  const dim = player.dimension;
  const at = { ...block.location };
  const spots = [at];

  if (ench.explosive && chance(20 * ench.explosive) && EXPLOSIVE_OK.test(brokenTypeId)) {
    const pitch = player.getRotation().x;
    const view = player.getViewDirection();
    const axis = Math.abs(pitch) > 50 ? "y" : Math.abs(view.x) > Math.abs(view.z) ? "x" : "z";
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (a === 0 && b === 0) continue;
      const l = axis === "y" ? { x: at.x + a, y: at.y, z: at.z + b } : axis === "x" ? { x: at.x, y: at.y + a, z: at.z + b } : { x: at.x + a, y: at.y + b, z: at.z };
      try {
        const nb = dim.getBlock(l);
        if (!nb || nb.isAir || nb.isLiquid || NEVER.test(nb.typeId) || !EXPLOSIVE_OK.test(nb.typeId)) continue;
        if (!R.canBuild(player, dim.id, l)) continue;
        dim.runCommand(`setblock ${l.x} ${l.y} ${l.z} air destroy`);
        spots.push(l);
      } catch { /* unloaded */ }
    }
    R.sound(player, "random.explode", 1.6, 0.4);
  }

  if (ench.treasure && /(stone|ore|deepslate|netherrack)$/.test(brokenTypeId)) {
    if (chance(0.6 * ench.treasure)) {
      dim.spawnItem(new ItemStack("fc:crystal", 1), { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 });
      player.onScreenDisplay.setActionBar("§b✦ Treasure Hunter found a crystal!");
    } else if (chance(0.03 * ench.treasure)) {
      dim.spawnItem(new ItemStack("fc:key_rare", 1), { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 });
      R.tell(player, "§9Treasure Hunter dug up a Rare crate key!");
    }
  }

  if (ench.telepathy || ench.autosmelt) {
    system.run(() => {
      const inv = player.getComponent("minecraft:inventory")?.container;
      for (const l of spots) {
        let items = [];
        try { items = dim.getEntities({ type: "minecraft:item", location: { x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5 }, maxDistance: 1.3 }); } catch { continue; }
        for (const ent of items) {
          const comp = ent.getComponent("minecraft:item");
          if (!comp) continue;
          let stack = comp.itemStack;
          if (ench.autosmelt && SMELT[stack.typeId]) stack = new ItemStack(SMELT[stack.typeId], stack.amount);
          if (ench.telepathy && inv) {
            const left = inv.addItem(stack);
            ent.remove();
            if (left) dim.spawnItem(left, player.location);
          } else if (stack.typeId !== comp.itemStack.typeId) {
            const loc = ent.location;
            ent.remove();
            dim.spawnItem(stack, loc);
          }
        }
      }
    });
  }
  return ench.experience ? 0.25 * ench.experience : 0;
}

/** Plunder bonus multiplier for kills made with the held weapon. */
export const plunderBonus = (player) => (readEnchants(heldItem(player)).plunder ?? 0) * 0.25;
