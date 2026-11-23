// Factions Core - bosses. Boss eggs (only from Mythic crates) summon one of
// four bosses. Each has special attacks, gets angrier below half health and
// drops loot you can't get anywhere else.
import { system, world, ItemStack, Player, EntityDamageCause } from "@minecraft/server";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { GEAR, gearItem, keyItem, bookItem, spawnerItem, crawlerItem, crystalItem, noteItem, rewardLabel } from "./items.js";

/** @type {Record<number, { tier: number, id: string, name: string, color: string, summary: string, crystals: number, money: number, rolls: number, loot: [number, string][], abilities: string[] }>} */
export const BOSSES = {
  1: {
    tier: 1, id: "fc:boss_warlord", name: "§2§lUndead Warlord", color: "§2", summary: "A giant zombie king that calls his horde.",
    crystals: 50, money: 250000, rolls: 1,
    loot: [[40, "gear:warlord_cleaver"], [40, "gear:warlord_helm"], [20, "key:legendary"]],
    abilities: ["summon_zombies", "slam", "rally"],
  },
  2: {
    tier: 2, id: "fc:boss_tyrant", name: "§8§lBone Tyrant", color: "§8", summary: "A towering wither skeleton that rots everything near it.",
    crystals: 100, money: 500000, rolls: 1,
    loot: [[35, "gear:tyrant_blade"], [35, "gear:tyrant_greaves"], [20, "book:mythic"], [10, "spawner:enderman"]],
    abilities: ["wither_aura", "summon_skeletons", "slam"],
  },
  3: {
    tier: 3, id: "fc:boss_golem", name: "§6§lInfernal Golem", color: "§6", summary: "A molten golem that sets the ground on fire and throws you around.",
    crystals: 200, money: 1000000, rolls: 2,
    loot: [[35, "gear:molten_core"], [35, "gear:magma_drill"], [15, "crawler:emerald"], [15, "spawner:iron_golem"]],
    abilities: ["fire_aura", "slam", "launch"],
  },
  4: {
    tier: 4, id: "fc:boss_ravager", name: "§5§lVoid Ravager", color: "§5", summary: "A beast from the void that drags you in and calls down lightning.",
    crystals: 500, money: 3000000, rolls: 2,
    loot: [[30, "gear:void_reaver"], [30, "gear:void_striders"], [20, "gear:void_wings"], [10, "crawler:netherite"], [10, "key:mythic:2"]],
    abilities: ["void_pull", "lightning", "roar", "slam"],
  },
};
export const BOSS_IDS = new Set(Object.values(BOSSES).map((b) => b.id));
export const bossOf = (typeId) => Object.values(BOSSES).find((b) => b.id === typeId);

// ------------------------------------------------------------ summoning

/** Uses a boss egg on a block. */
export function summon(player, block, tier) {
  const def = BOSSES[tier];
  if (!def) return;
  const dim = player.dimension;
  const at = { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 };
  const owner = S.ownerAt(dim.id, at);
  if (owner === S.SAFEZONE) E.fail("Bosses can't be summoned in the SafeZone.");
  if (owner !== S.WARZONE && !R.canBuild(player, dim.id, at)) E.fail("You can only summon bosses on your land, in the wilderness or in the WarZone.");
  // Use up the egg.
  const inv = player.getComponent("minecraft:inventory").container;
  const held = inv.getItem(player.selectedSlotIndex);
  if (held?.typeId !== `fc:boss_egg_${tier}`) return;
  if (held.amount > 1) { held.amount--; inv.setItem(player.selectedSlotIndex, held); } else inv.setItem(player.selectedSlotIndex, undefined);

  const boss = dim.spawnEntity(def.id, at);
  boss.nameTag = def.name;
  boss.setDynamicProperty("fc:summoner", player.name);
  dim.spawnParticle("minecraft:huge_explosion_emitter", at);
  dim.playSound("mob.wither.spawn", at, { volume: 2 });
  R.broadcast(`§e${player.name}§r summoned the ${def.name}§r (Tier ${tier}) at §e${Math.floor(at.x)}, ${Math.floor(at.z)}§r! Kill it for exclusive loot.`);
}

// ------------------------------------------------------------ abilities

const nearPlayers = (boss, r) => boss.dimension.getPlayers({ location: boss.location, maxDistance: r }).filter((p) => {
  const gm = p.getGameMode();
  return gm !== "Creative" && gm !== "Spectator";
});

function hit(boss, pl, dmg) {
  try { pl.applyDamage(dmg, { cause: EntityDamageCause.entityAttack, damagingEntity: boss }); } catch { /* */ }
}

function push(boss, pl, strength, up, toward = false) {
  const dx = pl.location.x - boss.location.x;
  const dz = pl.location.z - boss.location.z;
  const len = Math.hypot(dx, dz) || 1;
  const s = toward ? -strength : strength;
  try { pl.applyKnockback({ x: (dx / len) * s, z: (dz / len) * s }, up); } catch { /* */ }
}

function minions(boss, type, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const l = { x: boss.location.x + Math.cos(a) * 3, y: boss.location.y, z: boss.location.z + Math.sin(a) * 3 };
    try {
      const m = boss.dimension.spawnEntity(type, l);
      m.addTag("fc_minion");
      boss.dimension.spawnParticle("minecraft:large_explosion", l);
    } catch { /* */ }
  }
}

const ABILITY = {
  slam: { cd: 9, run: (boss, ps, def) => {
    boss.dimension.spawnParticle("minecraft:huge_explosion_emitter", boss.location);
    boss.dimension.playSound("random.explode", boss.location, { volume: 1.5, pitch: 0.7 });
    for (const pl of ps) if (R.dist2(pl.location, boss.location) < 49) { hit(boss, pl, 4 + def.tier * 2); push(boss, pl, 2.2, 0.7); }
    return "§cGROUND SLAM!";
  } },
  summon_zombies: { cd: 20, run: (boss) => { minions(boss, "minecraft:zombie", 3); return "§2Rise, my horde!"; } },
  summon_skeletons: { cd: 20, run: (boss) => { minions(boss, "minecraft:skeleton", 3); return "§8The bones answer my call!"; } },
  rally: { cd: 25, run: (boss) => { boss.addEffect("strength", 200, { amplifier: 1 }); boss.addEffect("speed", 200, { amplifier: 1 }); return "§2The Warlord rallies!"; } },
  wither_aura: { cd: 8, run: (boss, ps) => { for (const pl of ps) if (R.dist2(pl.location, boss.location) < 64) pl.addEffect("wither", 80, { amplifier: 1 }); boss.dimension.spawnParticle("minecraft:soul_particle", boss.location); return "§8A rotting aura spreads..."; } },
  fire_aura: { cd: 7, run: (boss, ps) => { for (const pl of ps) if (R.dist2(pl.location, boss.location) < 64) pl.setOnFire(5, true); boss.dimension.spawnParticle("minecraft:mobflame_emitter", boss.location); return "§6The ground burns!"; } },
  launch: { cd: 12, run: (boss, ps) => { const t = ps[Math.floor(Math.random() * ps.length)]; if (t) { push(boss, t, 0.5, 2.2); hit(boss, t, 6); } return "§6Up you go!"; } },
  void_pull: { cd: 11, run: (boss, ps) => { for (const pl of ps) { push(boss, pl, 2.5, 0.3, true); pl.addEffect("slowness", 60, { amplifier: 1 }); } return "§5The void pulls you in!"; } },
  lightning: { cd: 10, run: (boss, ps) => { for (const pl of ps.slice(0, 3)) boss.dimension.spawnEntity("minecraft:lightning_bolt", pl.location); return "§5Lightning strikes!"; } },
  roar: { cd: 15, run: (boss, ps) => { boss.dimension.playSound("mob.ravager.roar", boss.location, { volume: 2 }); for (const pl of ps) if (R.dist2(pl.location, boss.location) < 100) { push(boss, pl, 3, 0.5); pl.addEffect("weakness", 100); } return "§5ROAR!"; } },
};

const cooldowns = new Map(); // boss id -> { ability: time it's ready }
const enraged = new Set();
const damage = new Map(); // boss id -> Map(player name -> damage)

function health(e) {
  const h = e.getComponent("minecraft:health");
  return h ? { cur: h.currentValue, max: h.effectiveMax } : { cur: 1, max: 1 };
}

function tickBoss(boss) {
  const def = bossOf(boss.typeId);
  if (!def) return;
  const ps = nearPlayers(boss, 24);
  if (!ps.length) return;
  const hp = health(boss);
  if (hp.cur / hp.max < 0.5 && !enraged.has(boss.id)) {
    enraged.add(boss.id);
    boss.addEffect("speed", 20 * 600, { amplifier: 1 });
    boss.addEffect("strength", 20 * 600, { amplifier: 1 });
    boss.dimension.playSound("mob.enderdragon.growl", boss.location, { volume: 2 });
    for (const pl of ps) pl.onScreenDisplay.setActionBar(`${def.name}§r §c§lIS ENRAGED!`);
  }
  const now = Date.now();
  const cd = cooldowns.get(boss.id) ?? {};
  const speed = enraged.has(boss.id) ? 0.6 : 1;
  for (const name of def.abilities) {
    if ((cd[name] ?? now + 3000) > now) { cd[name] ??= now + 3000 + Math.random() * 4000; continue; }
    const a = ABILITY[name];
    cd[name] = now + a.cd * 1000 * speed;
    try {
      const msg = a.run(boss, ps, def);
      if (msg) for (const pl of ps) pl.onScreenDisplay.setActionBar(msg);
    } catch { /* */ }
    break; // one ability per second
  }
  cooldowns.set(boss.id, cd);
}

// ------------------------------------------------------------ loot

function rollLoot(def) {
  const total = def.loot.reduce((s, [w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [w, spec] of def.loot) { r -= w; if (r <= 0) return spec; }
  return def.loot[0][1];
}

function lootItem(spec) {
  const [kind, a, b] = spec.split(":");
  switch (kind) {
    case "gear": return gearItem(a);
    case "key": return keyItem(a, +(b ?? 1));
    case "book": return bookItem(a);
    case "spawner": return spawnerItem(a, +(b ?? 1));
    case "crawler": return crawlerItem(a);
    default: return new ItemStack("minecraft:diamond", 1);
  }
}

function dropLoot(boss, def) {
  const dim = boss.dimension;
  const at = { x: boss.location.x, y: boss.location.y + 1, z: boss.location.z };
  const drops = [crystalItem(def.crystals), noteItem(def.money)];
  const won = [];
  for (let i = 0; i < def.rolls; i++) {
    const spec = rollLoot(def);
    won.push(rewardLabel(spec));
    drops.push(lootItem(spec));
  }
  for (const it of drops) dim.spawnItem(it, at);
  dim.spawnParticle("minecraft:totem_particle", at);
  return won;
}

export function setupBosses() {
  world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource, damage: dmg }) => {
    if (!BOSS_IDS.has(hurtEntity.typeId)) return;
    const pl = damageSource.damagingEntity;
    if (!(pl instanceof Player)) return;
    const m = damage.get(hurtEntity.id) ?? new Map();
    m.set(pl.name, (m.get(pl.name) ?? 0) + dmg);
    damage.set(hurtEntity.id, m);
  });

  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    let def;
    try { def = bossOf(deadEntity.typeId); } catch { return; }
    if (!def) return;
    const won = dropLoot(deadEntity, def);
    const dmg = [...(damage.get(deadEntity.id) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]);
    damage.delete(deadEntity.id);
    enraged.delete(deadEntity.id);
    cooldowns.delete(deadEntity.id);
    const top = dmg.slice(0, 3).map(([n, d], i) => `§7#${i + 1} §e${n} §7(${Math.round(d)})`).join("  ");
    R.broadcast(`${def.name}§r was slain! It dropped §b${def.crystals} crystals§r, §a${E.money(def.money)}§r and ${won.join("§r, ")}§r.${top ? `\n§7Top damage: ${top}` : ""}`);
    for (const pl of world.getAllPlayers()) R.sound(pl, "random.totem", 0.8, 0.5);
  });

  system.runInterval(() => {
    for (const dimId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
      let dim;
      try { dim = world.getDimension(dimId); } catch { continue; }
      for (const id of BOSS_IDS) {
        let list = [];
        try { list = dim.getEntities({ type: id }); } catch { continue; }
        for (const boss of list) { try { tickBoss(boss); } catch { /* */ } }
      }
    }
  }, 20);
}

/** Lines for the bosses info page. */
export function bossInfo() {
  return Object.values(BOSSES).flatMap((b) => [
    `${b.name} §7(Tier ${b.tier})`,
    `§7${b.summary}`,
    `§7Always drops §b${b.crystals} crystals§7 and a §a${E.money(b.money)}§7 bank note, plus ${b.rolls} of:`,
    ...b.loot.map(([w, s]) => `  ${rewardLabel(String(s))} §8(${Math.round((Number(w) / b.loot.reduce((t, x) => t + Number(x[0]), 0)) * 100)}%)`),
    "",
  ]);
}

export { GEAR };
