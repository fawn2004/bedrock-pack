// Factions Core - floating leaderboards (holograms) admins can place at spawn.
import { system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as E from "./economy.js";
import { ftop } from "./ftop.js";

export const HOLO = "fc:hologram";
export const HOLO_TYPES = ["ftop", "money", "kills", "level", "streak", "welcome"];

const medal = (i) => ["§6#1", "§7#2", "§c#3"][i] ?? `§8#${i + 1}`;

export function holoText(type) {
  switch (type) {
    case "ftop": return [`§b§l- F-TOP -`, "§7Richest factions", ...ftop().slice(0, 10).map((r, i) => `${medal(i)} §${r.color}${r.name} §a${E.money(r.value)}`), ftop().length ? "" : "§8No factions yet"].join("\n");
    case "money": return ["§a§l- RICHEST PLAYERS -", ...E.leaderboard("money").map((p, i) => `${medal(i)} §f${p.name} §a${E.money(p.money)}`)].join("\n");
    case "kills": return ["§c§l- TOP KILLERS -", ...E.leaderboard("kills").map((p, i) => `${medal(i)} §f${p.name} §c${p.kills} kills`)].join("\n");
    case "level": return ["§b§l- HIGHEST LEVELS -", ...E.leaderboard("level").map((p, i) => `${medal(i)} §f${p.name} §bLv.${p.level}`)].join("\n");
    case "streak": return ["§6§l- BEST STREAKS -", ...E.leaderboard("bestStreak").map((p, i) => `${medal(i)} §f${p.name} §6${p.bestStreak}`)].join("\n");
    default: return [`§b§l${CONFIG.serverName}`, `§7${CONFIG.season}`, "", "§fTap your §bmenu item§f or type §e/f", "§fto get started!", "", "§7Claim land • Build spawners", "§7Raid enemies • Climb F-Top"].join("\n");
  }
}

export function placeHolo(player, type) {
  if (!HOLO_TYPES.includes(type)) throw new E.Fail(`Types: ${HOLO_TYPES.join(", ")}`);
  const l = player.location;
  const ent = player.dimension.spawnEntity(HOLO, { x: l.x, y: l.y + 1.5, z: l.z });
  ent.setDynamicProperty("fc:holo", type);
  ent.nameTag = holoText(type);
}

export function removeNearestHolo(player) {
  const near = player.dimension.getEntities({ type: HOLO, location: player.location, maxDistance: 6, closest: 1 });
  if (!near.length) throw new E.Fail("No hologram within 6 blocks.");
  near[0].remove();
}

export function setupHolograms() {
  system.runInterval(() => {
    for (const dimId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
      let ents = [];
      try { ents = world.getDimension(dimId).getEntities({ type: HOLO }); } catch { continue; }
      for (const ent of ents) {
        try { ent.nameTag = holoText(ent.getDynamicProperty("fc:holo") ?? "welcome"); } catch { /* */ }
      }
    }
  }, 600);
}
