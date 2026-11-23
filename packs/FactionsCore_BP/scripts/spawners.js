// Factions Core - stackable spawners and stacked mobs.
// Spawners are custom blocks (fc:spawner_<type>). The script spawns their
// mobs near players and merges them into one "stacked" mob with a count.
import { system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import { SPAWNERS, spawnerItem, giveItem } from "./items.js";
import { questEvent } from "./quests.js";

export const MAX_SPAWNER_STACK = 100;
export const spawnerTypeOf = (typeId) => (typeId?.startsWith("fc:spawner_") ? typeId.slice(11) : undefined);

export function spawnerAt(block) {
  return S.spawnersT.get(S.blockKey(block.dimension.id, block.location));
}

/** Interval for one spawner, sped up by the faction's upgrade. */
export function spawnerInterval(s) {
  const f = S.getFaction(s.fid);
  return CONFIG.spawnerIntervalSeconds * (1 - 0.1 * R.upgradeLevel(f, "spawners"));
}

export function addToStack(player, block, amount) {
  const s = spawnerAt(block);
  if (!s) return;
  const add = Math.min(amount, MAX_SPAWNER_STACK - s.stack);
  if (add <= 0) { R.tell(player, `§cThis spawner is full (${MAX_SPAWNER_STACK}).`); return 0; }
  s.stack += add;
  S.spawnersT.set(S.blockKey(block.dimension.id, block.location), s);
  player.onScreenDisplay.setActionBar(`§a+${add} §f${SPAWNERS[s.type].name} Spawner §7(stack §e${s.stack}§7)`);
  R.sound(player, "random.anvil_use", 1.4, 0.5);
  return add;
}

/** Breaks a spawner and gives the whole stack to the player. */
export function pickUp(player, block) {
  const key = S.blockKey(block.dimension.id, block.location);
  const s = S.spawnersT.get(key);
  const type = s?.type ?? spawnerTypeOf(block.typeId);
  const n = s?.stack ?? 1;
  block.setType("minecraft:air");
  S.spawnersT.delete(key);
  if (type) giveItem(player, spawnerItem(type, n));
  R.tell(player, `Picked up §e${n}x ${SPAWNERS[type]?.name ?? "?"} Spawner§r.`);
}

function stackLabel(type, n) {
  return `§e§l${n}x §r§f${SPAWNERS[type].name}`;
}

function setStack(ent, type, n) {
  ent.setDynamicProperty("fc:stack", n);
  ent.setDynamicProperty("fc:stype", type);
  ent.nameTag = stackLabel(type, n);
}

function spawnFor(key, s) {
  const pos = S.parseBlockKey(key);
  const dim = world.getDimension(pos.dim);
  const center = { x: pos.x + 0.5, y: pos.y + 1, z: pos.z + 0.5 };
  if (!dim.getPlayers({ location: center, maxDistance: CONFIG.spawnerActivationRange }).length) return;
  const block = dim.getBlock(pos);
  if (!block) return; // not loaded
  if (block.typeId !== `fc:spawner_${s.type}`) { S.spawnersT.delete(key); return; }
  const def = SPAWNERS[s.type];
  const count = s.stack * (1 + Math.floor(Math.random() * 2));
  const near = dim.getEntities({ type: def.mob, location: center, maxDistance: 10, tags: ["fc_stack"] });
  const target = near.find((e) => Number(e.getDynamicProperty("fc:stack") ?? 0) < CONFIG.maxMobStack);
  if (target) {
    setStack(target, s.type, Math.min(CONFIG.maxMobStack, Number(target.getDynamicProperty("fc:stack") ?? 1) + count));
    return;
  }
  for (let tries = 0; tries < 6; tries++) {
    const l = { x: pos.x + Math.floor(Math.random() * 7) - 3 + 0.5, y: pos.y, z: pos.z + Math.floor(Math.random() * 7) - 3 + 0.5 };
    for (let dy = 1; dy >= -1; dy--) {
      const at = dim.getBlock({ x: l.x, y: l.y + dy, z: l.z });
      const head = at?.above();
      if (at?.isAir && head?.isAir && !at.below()?.isAir) {
        const ent = dim.spawnEntity(def.mob, { x: l.x, y: l.y + dy, z: l.z });
        ent.addTag("fc_stack");
        setStack(ent, s.type, count);
        dim.spawnParticle("minecraft:basic_flame_particle", center);
        return;
      }
    }
  }
}

const nextRun = new Map();

export function setupSpawners() {
  world.afterEvents.playerPlaceBlock.subscribe(({ block, player }) => {
    const type = spawnerTypeOf(block.typeId);
    if (!type) return;
    const fid = S.ownerAt(block.dimension.id, block.location) ?? null;
    S.spawnersT.set(S.blockKey(block.dimension.id, block.location), { type, stack: 1, fid, owner: player.id });
    player.onScreenDisplay.setActionBar(`§aPlaced a ${SPAWNERS[type].name} Spawner§7 - use more on it to stack`);
  });

  // Stacked mobs die one at a time.
  world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
    let n = 0;
    let type;
    try {
      if (!deadEntity.hasTag("fc_stack")) return;
      n = Number(deadEntity.getDynamicProperty("fc:stack") ?? 1);
      type = deadEntity.getDynamicProperty("fc:stype");
    } catch { return; }
    const killer = damageSource.damagingEntity;
    if (killer?.typeId === "minecraft:player") questEvent(killer, "stack_kill");
    if (n <= 1 || !SPAWNERS[type]) return;
    try {
      const ent = deadEntity.dimension.spawnEntity(SPAWNERS[type].mob, deadEntity.location);
      ent.addTag("fc_stack");
      setStack(ent, type, n - 1);
    } catch { /* unloaded */ }
  });

  // Explosions: each spawner in a stack has a 50% chance to drop.
  world.beforeEvents.explosion.subscribe((e) => {
    const blocks = e.getImpactedBlocks();
    const hit = blocks.filter((b) => spawnerTypeOf(b.typeId));
    if (!hit.length) return;
    e.setImpactedBlocks(blocks.filter((b) => !spawnerTypeOf(b.typeId)));
    const dimId = e.dimension.id;
    const spots = hit.map((b) => ({ ...b.location, type: spawnerTypeOf(b.typeId) }));
    system.run(() => {
      const dim = world.getDimension(dimId);
      for (const l of spots) {
        const key = S.blockKey(dimId, l);
        const n = S.spawnersT.get(key)?.stack ?? 1;
        let drop = 0;
        for (let i = 0; i < n; i++) if (Math.random() < 0.5) drop++;
        try { dim.setBlockType(l, "minecraft:air"); } catch { continue; }
        S.spawnersT.delete(key);
        if (drop) dim.spawnItem(spawnerItem(l.type, drop), { x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5 });
      }
    });
  });

  system.runInterval(() => {
    const now = Date.now();
    for (const [key, s] of S.spawnersT.entries()) {
      if ((nextRun.get(key) ?? 0) > now) continue;
      nextRun.set(key, now + spawnerInterval(s) * 1000);
      try { spawnFor(key, s); } catch { /* unloaded */ }
    }
  }, 20);
}
