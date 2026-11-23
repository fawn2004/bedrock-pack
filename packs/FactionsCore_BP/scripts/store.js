// Factions Core - saved data.
// Everything is kept in world dynamic properties so it survives restarts:
//   fc:f:<factionId>   faction JSON
//   fc:p:<playerId>    player JSON
//   fc:c:<d>|<x>|<z>   owning faction id of one chunk (d = o/n/e)
// The whole lot is loaded into memory once and written back on every change.
import { system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const F = "fc:f:";
const P = "fc:p:";
const C = "fc:c:";

export const SAFEZONE = "safezone";
export const WARZONE = "warzone";

/** @type {Map<string, any>} */ const factions = new Map();
/** @type {Map<string, any>} */ const players = new Map();
/** @type {Map<string, string>} */ const claims = new Map(); // chunk key -> faction id
/** @type {Map<string, number>} */ const claimCount = new Map();
let loaded = false;

/** Write a property now, or next tick if we're inside a read-only "before" event. */
function write(id, value) {
  try {
    world.setDynamicProperty(id, value);
  } catch {
    system.run(() => world.setDynamicProperty(id, value));
  }
}

// ------------------------------------------------------------ loading

export function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  for (const id of world.getDynamicPropertyIds()) {
    try {
      const v = world.getDynamicProperty(id);
      if (typeof v !== "string") continue;
      if (id.startsWith(F)) factions.set(id.slice(F.length), JSON.parse(v));
      else if (id.startsWith(P)) players.set(id.slice(P.length), JSON.parse(v));
      else if (id.startsWith(C)) claims.set(id.slice(C.length), v);
    } catch (e) {
      console.warn(`[Factions] could not read ${id}: ${e}`);
    }
  }
  // Drop claims whose faction is gone, then count the rest.
  for (const [key, fid] of claims) {
    if (!factions.has(fid)) { claims.delete(key); write(C + key, undefined); continue; }
    claimCount.set(fid, (claimCount.get(fid) ?? 0) + 1);
  }
  for (const [id, name] of [[SAFEZONE, "SafeZone"], [WARZONE, "WarZone"]]) {
    if (!factions.has(id)) {
      saveFaction(newFaction(id, name, { system: true, desc: id === SAFEZONE ? "No fighting, no building" : "Fight at your own risk", open: false }));
    }
  }
}

// ------------------------------------------------------------ factions

function newFaction(id, name, extra = {}) {
  return { id, name, desc: "", open: false, leader: null, created: Date.now(), home: null, wishes: {}, invites: {}, system: false, ...extra };
}

export function createFaction(name, leaderId) {
  ensureLoaded();
  const id = "f" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const f = newFaction(id, name, { leader: leaderId, desc: "A new faction" });
  saveFaction(f);
  return f;
}

export function saveFaction(f) {
  factions.set(f.id, f);
  write(F + f.id, JSON.stringify(f));
}

export function deleteFaction(fid) {
  ensureLoaded();
  for (const [key, owner] of claims) if (owner === fid) setClaim(key, undefined);
  for (const p of players.values()) {
    if (p.faction === fid) { p.faction = null; p.rank = null; savePlayer(p); }
  }
  for (const f of factions.values()) {
    if (f.wishes[fid]) { delete f.wishes[fid]; saveFaction(f); }
  }
  factions.delete(fid);
  claimCount.delete(fid);
  write(F + fid, undefined);
}

export function getFaction(fid) {
  ensureLoaded();
  return fid ? factions.get(fid) : undefined;
}

export function findFaction(name) {
  ensureLoaded();
  const n = String(name ?? "").toLowerCase();
  for (const f of factions.values()) if (f.name.toLowerCase() === n) return f;
  return undefined;
}

export function allFactions(includeSystem = false) {
  ensureLoaded();
  return [...factions.values()].filter((f) => includeSystem || !f.system);
}

// ------------------------------------------------------------ players

/** The saved record for an online player, created on first sight. */
export function playerData(player) {
  ensureLoaded();
  let p = players.get(player.id);
  if (!p) {
    p = { id: player.id, name: player.name, faction: null, rank: null, power: CONFIG.startPower };
    savePlayer(p);
  } else if (p.name !== player.name) {
    p.name = player.name;
    savePlayer(p);
  }
  return p;
}

export function savePlayer(p) {
  players.set(p.id, p);
  write(P + p.id, JSON.stringify(p));
}

export function getPlayerRecord(id) {
  ensureLoaded();
  return players.get(id);
}

export function findPlayerRecord(name) {
  ensureLoaded();
  const n = String(name ?? "").toLowerCase();
  for (const p of players.values()) if (p.name.toLowerCase() === n) return p;
  return undefined;
}

export function membersOf(fid) {
  ensureLoaded();
  return [...players.values()].filter((p) => p.faction === fid);
}

// ------------------------------------------------------------ claims

const DIM_SHORT = { "minecraft:overworld": "o", "minecraft:nether": "n", "minecraft:the_end": "e" };
const DIM_LONG = { o: "minecraft:overworld", n: "minecraft:nether", e: "minecraft:the_end" };

export const chunkOf = (loc) => ({ x: Math.floor(loc.x) >> 4, z: Math.floor(loc.z) >> 4 });
export const chunkKey = (dimId, cx, cz) => `${DIM_SHORT[dimId] ?? dimId}|${cx}|${cz}`;
export const dimFromKey = (key) => DIM_LONG[key.split("|")[0]] ?? key.split("|")[0];

/** Faction id owning the chunk at a location in a dimension, or undefined. */
export function ownerAt(dimId, loc) {
  ensureLoaded();
  const c = chunkOf(loc);
  return claims.get(chunkKey(dimId, c.x, c.z));
}

export function ownerOfChunk(dimId, cx, cz) {
  ensureLoaded();
  return claims.get(chunkKey(dimId, cx, cz));
}

export function setClaim(key, fid) {
  ensureLoaded();
  const old = claims.get(key);
  if (old === fid) return;
  if (old) claimCount.set(old, (claimCount.get(old) ?? 1) - 1);
  if (fid) {
    claims.set(key, fid);
    claimCount.set(fid, (claimCount.get(fid) ?? 0) + 1);
    write(C + key, fid);
  } else {
    claims.delete(key);
    write(C + key, undefined);
  }
  // A faction home that is no longer on its own land is lost.
  if (old) {
    const f = factions.get(old);
    if (f?.home && f.home.key === key) { f.home = null; saveFaction(f); }
  }
}

export function claimsOf(fid) {
  ensureLoaded();
  return claimCount.get(fid) ?? 0;
}

export function claimKeysOf(fid) {
  ensureLoaded();
  return [...claims].filter(([, owner]) => owner === fid).map(([k]) => k);
}
