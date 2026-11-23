// Factions Core - saved data.
// Everything lives in world dynamic properties so it survives restarts:
//   fc:f:<id>   factions        fc:p:<id>   players
//   fc:c:<key>  claimed chunks  fc:s:<key>  spawners
//   fc:a:<id>   auctions        fc:k:<key>  misc (spawn, koth, holograms...)
// Everything is loaded into memory once and written back on every change.
import { system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

/** Write a property now, or next tick if we're inside a read-only "before" event. */
function write(id, value) {
  try {
    world.setDynamicProperty(id, value);
  } catch {
    system.run(() => world.setDynamicProperty(id, value));
  }
}

class Table {
  constructor(prefix, json = true) {
    this.prefix = prefix;
    this.json = json;
    /** @type {Map<string, any>} */ this.map = new Map();
  }
  get(id) { ensureLoaded(); return id === undefined || id === null ? undefined : this.map.get(id); }
  has(id) { ensureLoaded(); return this.map.has(id); }
  set(id, v) {
    ensureLoaded();
    this.map.set(id, v);
    write(this.prefix + id, this.json ? JSON.stringify(v) : v);
  }
  delete(id) {
    ensureLoaded();
    this.map.delete(id);
    write(this.prefix + id, undefined);
  }
  values() { ensureLoaded(); return [...this.map.values()]; }
  entries() { ensureLoaded(); return [...this.map.entries()]; }
}

export const factionsT = new Table("fc:f:");
export const playersT = new Table("fc:p:");
export const claimsT = new Table("fc:c:", false);
export const spawnersT = new Table("fc:s:");
export const auctionsT = new Table("fc:a:");
export const kvT = new Table("fc:k:");
const TABLES = [factionsT, playersT, claimsT, spawnersT, auctionsT, kvT];

export const SAFEZONE = "safezone";
export const WARZONE = "warzone";

/** @type {Map<string, number>} */ const claimCount = new Map();
let loaded = false;

// ------------------------------------------------------------ loading

export function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  for (const id of world.getDynamicPropertyIds()) {
    const t = TABLES.find((x) => id.startsWith(x.prefix));
    if (!t) continue;
    try {
      const v = world.getDynamicProperty(id);
      if (typeof v !== "string") continue;
      t.map.set(id.slice(t.prefix.length), t.json ? JSON.parse(v) : v);
    } catch (e) {
      console.warn(`[Factions] could not read ${id}: ${e}`);
    }
  }
  for (const [key, fid] of claimsT.map) {
    if (!factionsT.map.has(fid)) { claimsT.delete(key); continue; }
    claimCount.set(fid, (claimCount.get(fid) ?? 0) + 1);
  }
  for (const [id, name] of [[SAFEZONE, "SafeZone"], [WARZONE, "WarZone"]]) {
    if (!factionsT.map.has(id)) {
      saveFaction(newFaction(id, name, { system: true, desc: id === SAFEZONE ? "No fighting, no building" : "Fight at your own risk" }));
    }
  }
  for (const f of factionsT.map.values()) factionDefaults(f);
  for (const p of playersT.map.values()) playerDefaults(p);
}

// ------------------------------------------------------------ misc key/value

export const kv = {
  get: (k, fallback) => kvT.get(k) ?? fallback,
  set: (k, v) => (v === undefined ? kvT.delete(k) : kvT.set(k, v)),
};

// ------------------------------------------------------------ factions

function factionDefaults(f) {
  f.wishes ??= {};
  f.invites ??= {};
  f.treasury ??= 0;
  f.upgrades ??= {};
  f.shieldStart ??= null; // hour of day, or null = no shield
  f.shieldChanged ??= 0;
  f.log ??= [];
  f.color ??= "e";
  return f;
}

function newFaction(id, name, extra = {}) {
  return factionDefaults({ id, name, desc: "", open: false, leader: null, created: Date.now(), home: null, system: false, ...extra });
}

export function createFaction(name, leaderId) {
  const id = "f" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const f = newFaction(id, name, { leader: leaderId, desc: "A new faction" });
  saveFaction(f);
  return f;
}

export const saveFaction = (f) => factionsT.set(f.id, f);
export const getFaction = (fid) => factionsT.get(fid);

export function deleteFaction(fid) {
  for (const [key, owner] of claimsT.entries()) if (owner === fid) setClaim(key, undefined);
  for (const p of playersT.values()) {
    if (p.faction === fid) { p.faction = null; p.rank = null; savePlayer(p); }
  }
  for (const f of factionsT.values()) {
    if (f.wishes[fid]) { delete f.wishes[fid]; saveFaction(f); }
  }
  for (const [key, s] of spawnersT.entries()) if (s.fid === fid) { s.fid = null; spawnersT.set(key, s); }
  factionsT.delete(fid);
  claimCount.delete(fid);
}

export function findFaction(name) {
  const n = String(name ?? "").toLowerCase();
  return factionsT.values().find((f) => f.name.toLowerCase() === n);
}

export const allFactions = (includeSystem = false) => factionsT.values().filter((f) => includeSystem || !f.system);

/** Keep a short history shown in the faction dashboard. */
export function factionLog(f, text) {
  f.log.unshift(`${new Date().toISOString().slice(5, 16).replace("T", " ")} ${text}`);
  f.log.length = Math.min(f.log.length, 15);
  saveFaction(f);
}

// ------------------------------------------------------------ players

function playerDefaults(p) {
  p.money ??= CONFIG.startMoney;
  p.crystals ??= 0;
  p.xp ??= 0;
  p.level ??= 1;
  p.kills ??= 0;
  p.deaths ??= 0;
  p.streak ??= 0;
  p.bestStreak ??= 0;
  p.mobKills ??= 0;
  p.mined ??= 0;
  p.playMinutes ??= 0;
  p.firstJoin ??= Date.now();
  p.homes ??= {};
  p.daily ??= { last: -1, streak: 0 };
  p.quests ??= { day: -1, list: [] };
  p.bounty ??= 0;
  p.hud ??= true;
  p.mail ??= []; // items waiting to be collected (auction returns etc.)
  p.cratesOpened ??= 0;
  p.earned ??= 0;
  return p;
}

/** The saved record for an online player, created on first sight. */
export function playerData(player) {
  let p = playersT.get(player.id);
  if (!p) {
    p = playerDefaults({ id: player.id, name: player.name, faction: null, rank: null, power: CONFIG.startPower, isNew: true });
    savePlayer(p);
  } else if (p.name !== player.name) {
    p.name = player.name;
    savePlayer(p);
  }
  return p;
}

export const savePlayer = (p) => playersT.set(p.id, p);
export const getPlayerRecord = (id) => playersT.get(id);
export const allPlayerRecords = () => playersT.values();

export function findPlayerRecord(name) {
  const n = String(name ?? "").toLowerCase();
  return playersT.values().find((p) => p.name.toLowerCase() === n);
}

export const membersOf = (fid) => playersT.values().filter((p) => p.faction === fid);

// ------------------------------------------------------------ claims

const DIM_SHORT = { "minecraft:overworld": "o", "minecraft:nether": "n", "minecraft:the_end": "e" };
const DIM_LONG = { o: "minecraft:overworld", n: "minecraft:nether", e: "minecraft:the_end" };
export const DIM_NAME = { "minecraft:overworld": "Overworld", "minecraft:nether": "Nether", "minecraft:the_end": "The End" };

export const chunkOf = (loc) => ({ x: Math.floor(loc.x) >> 4, z: Math.floor(loc.z) >> 4 });
export const chunkKey = (dimId, cx, cz) => `${DIM_SHORT[dimId] ?? dimId}|${cx}|${cz}`;
export const dimFromKey = (key) => DIM_LONG[key.split("|")[0]] ?? key.split("|")[0];
export const blockKey = (dimId, l) => `${DIM_SHORT[dimId] ?? dimId}|${Math.floor(l.x)}|${Math.floor(l.y)}|${Math.floor(l.z)}`;
export function parseBlockKey(key) {
  const [d, x, y, z] = key.split("|");
  return { dim: DIM_LONG[d] ?? d, x: +x, y: +y, z: +z };
}

/** Faction id owning the chunk at a location in a dimension, or undefined. */
export function ownerAt(dimId, loc) {
  const c = chunkOf(loc);
  return claimsT.get(chunkKey(dimId, c.x, c.z));
}

export const ownerOfChunk = (dimId, cx, cz) => claimsT.get(chunkKey(dimId, cx, cz));

export function setClaim(key, fid) {
  const old = claimsT.get(key);
  if (old === fid) return;
  if (old) claimCount.set(old, (claimCount.get(old) ?? 1) - 1);
  if (fid) {
    claimsT.set(key, fid);
    claimCount.set(fid, (claimCount.get(fid) ?? 0) + 1);
  } else {
    claimsT.delete(key);
  }
  if (old) {
    const f = factionsT.get(old);
    if (f?.home && f.home.key === key) { f.home = null; saveFaction(f); }
  }
}

export function claimsOf(fid) {
  ensureLoaded();
  return claimCount.get(fid) ?? 0;
}

export const claimKeysOf = (fid) => claimsT.entries().filter(([, owner]) => owner === fid).map(([k]) => k);
