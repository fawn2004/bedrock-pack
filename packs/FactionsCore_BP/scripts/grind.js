// Factions Core - mob grinding: frozen spawner mobs and the grinding
// enchants (Greed, Scholar, Looter, Crystal Seeker, Mass Slayer).
import { system, world, Player } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { readEnchants, heldItem } from "./enchants.js";
import { questEvent } from "./quests.js";

// ------------------------------------------------------------ frozen spawner mobs

/** Pins a spawner mob in place: max Slowness, and it's put back if it drifts. */
export function freeze(ent) {
  if (!CONFIG.freezeSpawnerMobs) return;
  try {
    ent.setDynamicProperty("fc:anchor", { x: ent.location.x, y: ent.location.y, z: ent.location.z });
    ent.addEffect("slowness", 20000000, { amplifier: 255, showParticles: false });
  } catch { /* gone */ }
}

function holdFrozenMobs() {
  for (const dimId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    let list = [];
    try { list = world.getDimension(dimId).getEntities({ tags: ["fc_stack"] }); } catch { continue; }
    for (const ent of list) {
      try {
        const a = ent.getDynamicProperty("fc:anchor");
        if (!a || typeof a !== "object") { freeze(ent); continue; }
        const l = ent.location;
        if ((l.x - a.x) ** 2 + (l.y - a.y) ** 2 + (l.z - a.z) ** 2 > 0.36) ent.teleport(a);
        if (!ent.getEffect("slowness")) ent.addEffect("slowness", 20000000, { amplifier: 255, showParticles: false });
      } catch { /* */ }
    }
  }
}

// ------------------------------------------------------------ grinding enchants

const pending = new Map(); // dead entity id -> how many mobs that one hit killed

/** Mass Slayer: how many extra mobs a hit takes from a stack. */
export function extraStackKills(killer, available) {
  if (!(killer instanceof Player)) return 0;
  const lvl = readEnchants(heldItem(killer)).mass_slayer ?? 0;
  return Math.max(0, Math.min(lvl, available));
}
export const recordKills = (deadId, n) => pending.set(deadId, n);

const pretty = (typeId) => typeId.split(":")[1].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// When each dropped item appeared, so only a kill's own fresh loot is copied
// (never old piles lying in a grinder).
const itemBorn = new Map(); // item entity id -> tick it appeared

/** Copies the loot a mob just dropped `copies` times. */
function copyDrops(dim, at, deathTick, copies) {
  if (copies <= 0) return;
  system.runTimeout(() => {
    let items = [];
    try { items = dim.getEntities({ type: "minecraft:item", location: at, maxDistance: 3 }); } catch { return; }
    for (const ent of items) {
      const born = itemBorn.get(ent.id);
      if (born === undefined || born < deathTick - 1 || ent.hasTag("fc_drop")) continue;
      ent.addTag("fc_drop");
      const stack = ent.getComponent("minecraft:item")?.itemStack;
      if (!stack) continue;
      for (let i = 0; i < copies; i++) {
        try { dim.spawnItem(stack.clone(), ent.location).addTag("fc_drop"); } catch { /* */ }
      }
    }
  }, 2);
}

const lastBar = new Map();

/** Rewards for killing a (non-player) mob. Called once per death. */
export function onMobKill(killer, dead) {
  const killed = pending.get(dead.id) ?? 1;
  pending.delete(dead.id);
  const p = S.playerData(killer);
  const ench = readEnchants(heldItem(killer));
  p.mobKills += killed;
  const parts = [];

  let xp = 3 * killed;
  if (ench.scholar) {
    xp += 2 * ench.scholar * killed;
    for (let i = 0; i < ench.scholar; i++) {
      try { dead.dimension.spawnEntity("minecraft:xp_orb", dead.location); } catch { /* */ }
    }
  }
  if (ench.greed) {
    const cash = (4 + 4 * ench.greed) * killed;
    E.addMoney(p, cash);
    parts.push(`§a+${E.money(cash)}`);
  }
  if (ench.crystal_seeker || ench.plunder) {
    const chance = 0.015 * (ench.crystal_seeker ?? 0) + 0.02 * (ench.plunder ?? 0);
    let found = 0;
    for (let i = 0; i < killed; i++) if (Math.random() < chance) found++;
    if (found) {
      E.addCrystals(p, found);
      parts.push(`§b+${found} crystal${found > 1 ? "s" : ""}`);
      if (p.procChat !== false) killer.sendMessage(`§8[§dEnchant§8] §bCrystal Seeker §7found §b${found} crystal${found > 1 ? "s" : ""}§7 on a §f${pretty(dead.typeId)}§7.`);
    }
  }
  let copies = killed - 1;
  if (ench.looter && Math.random() < 0.2 * ench.looter) {
    copies += killed;
    parts.push("§6x2 drops");
  }
  if (killed > 1) parts.push(`§c${killed} kills`);
  E.addXp(killer, p, xp);
  if (ench.scholar) parts.push(`§e+${xp} XP`);
  S.savePlayer(p);

  if (copies > 0) copyDrops(dead.dimension, { ...dead.location }, system.currentTick, copies);
  const now = Date.now();
  if (parts.length && (lastBar.get(killer.id) ?? 0) < now - 400) {
    lastBar.set(killer.id, now);
    killer.onScreenDisplay.setActionBar(parts.join(" §8| "));
  }
  questEvent(killer, "kill_mob", killed);
}

export function setupGrind() {
  system.runInterval(holdFrozenMobs, 20);
  world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    try { if (entity.typeId === "minecraft:item") itemBorn.set(entity.id, system.currentTick); } catch { /* */ }
  });
  system.runInterval(() => {
    const old = system.currentTick - 200;
    for (const [id, t] of itemBorn) if (t < old) itemBorn.delete(id);
  }, 200);
}
