// Factions Core - the rules: power, relations, shields and who may do what where.
import { world } from "@minecraft/server";
import { CONFIG, COLOR, RANK_LEVEL } from "./config.js";
import * as S from "./store.js";

// ------------------------------------------------------------ power & limits

export const factionPower = (fid) => S.membersOf(fid).reduce((sum, p) => sum + p.power, 0);
export const factionMaxPower = (fid) => S.membersOf(fid).length * CONFIG.maxPower;
export const upgradeLevel = (f, id) => f?.upgrades?.[id] ?? 0;

/** How many chunks this faction is allowed to hold. */
export function landLimit(fid) {
  const f = S.getFaction(fid);
  return Math.max(0, Math.floor(factionPower(fid))) + upgradeLevel(f, "land") * 10;
}

export const maxMembers = (f) => CONFIG.maxMembers + upgradeLevel(f, "members") * 5;

/** A faction holding more land than its power allows can be overclaimed. */
export function isRaidable(fid) {
  const f = S.getFaction(fid);
  if (!f || f.system) return false;
  return S.claimsOf(fid) > landLimit(fid);
}

export function addPower(p, amount) {
  const next = Math.min(CONFIG.maxPower, Math.max(CONFIG.minPower, p.power + amount));
  if (next !== p.power) { p.power = Math.round(next * 100) / 100; S.savePlayer(p); }
}

// ------------------------------------------------------------ shield
// A faction picks a daily start hour; for shieldHours after it their land
// can't be blown up or overclaimed.

export const shieldLength = (f) => CONFIG.shieldHours + upgradeLevel(f, "shield") * 2;

/** { active, ms } where ms is time until it drops (active) or rises (inactive). */
export function shieldState(f, now = Date.now()) {
  if (!f || f.shieldStart === null || f.shieldStart === undefined) return { active: false, ms: 0, none: true };
  const H = 3600000;
  const local = now + CONFIG.timezoneOffsetHours * H;
  const dayStart = Math.floor(local / (24 * H)) * 24 * H;
  const len = shieldLength(f) * H;
  for (const start of [dayStart - 24 * H + f.shieldStart * H, dayStart + f.shieldStart * H]) {
    if (local >= start && local < start + len) return { active: true, ms: start + len - local };
  }
  let next = dayStart + f.shieldStart * H;
  if (next <= local) next += 24 * H;
  return { active: false, ms: next - local };
}

export const isShielded = (fid) => shieldState(S.getFaction(fid)).active;

/** May explosions break blocks on this faction's land right now? */
export function explosionsAllowed(fid) {
  const f = S.getFaction(fid);
  if (!f) return true;
  if (f.system) return false;
  switch (CONFIG.explosionsInClaims) {
    case "always": return true;
    case "never": return false;
    case "raidable": return isRaidable(fid);
    default: return !isShielded(fid);
  }
}

// ------------------------------------------------------------ relations
// Each faction keeps a "wish" for every other faction. Enemy is one-sided,
// ally and truce need both sides to agree.

export const RELATIONS = ["ally", "truce", "neutral", "enemy"];

export function relation(aId, bId) {
  if (!aId || !bId) return "neutral";
  if (aId === bId) return "own";
  const a = S.getFaction(aId);
  const b = S.getFaction(bId);
  if (!a || !b) return "neutral";
  const ab = a.wishes[bId] ?? "neutral";
  const ba = b.wishes[aId] ?? "neutral";
  if (ab === "enemy" || ba === "enemy") return "enemy";
  if (ab === "ally" && ba === "ally") return "ally";
  if ((ab === "ally" || ab === "truce") && (ba === "ally" || ba === "truce")) return "truce";
  return "neutral";
}

export const alliesOf = (fid) => S.allFactions().filter((f) => relation(fid, f.id) === "ally");

/** Faction name coloured for how the viewer's faction sees it. */
export function colorName(f, viewerFid) {
  if (!f) return `${COLOR.wilderness}Wilderness`;
  if (f.id === S.SAFEZONE) return `${COLOR.safezone}${f.name}`;
  if (f.id === S.WARZONE) return `${COLOR.warzone}${f.name}`;
  return `${COLOR[relation(viewerFid, f.id)]}${f.name}`;
}

// ------------------------------------------------------------ permissions

export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

export const hasBypass = (player) => player.getDynamicProperty("fc:bypass") === true;
export const rankAtLeast = (p, rank) => !!p?.faction && RANK_LEVEL[p.rank] >= RANK_LEVEL[rank];

/** May this player break/place blocks here? */
export function canBuild(player, dimId, loc) {
  if (hasBypass(player)) return true;
  const owner = S.ownerAt(dimId, loc);
  if (!owner) return true;
  const f = S.getFaction(owner);
  if (!f || f.system) return false;
  const mine = S.playerData(player).faction;
  if (mine === owner) return true;
  return CONFIG.alliesCanBuild && relation(mine, owner) === "ally";
}

/** May this player use blocks (doors, chests, buttons...) here? */
export function canUse(player, dimId, loc, isDoorLike) {
  if (canBuild(player, dimId, loc)) return true;
  if (!isDoorLike) return false;
  const owner = S.ownerAt(dimId, loc);
  if (owner === S.SAFEZONE || owner === S.WARZONE) return true;
  return CONFIG.alliesCanUseDoors && relation(S.playerData(player).faction, owner) === "ally";
}

// ------------------------------------------------------------ messaging

export const PREFIX = "§8[§bF§8]§r ";

export const tell = (player, msg) => player.sendMessage(PREFIX + msg);
export const broadcast = (msg) => world.sendMessage(PREFIX + msg);

export const onlineMembers = (fid) => world.getAllPlayers().filter((pl) => S.playerData(pl).faction === fid);

export function tellFaction(fid, msg) {
  for (const pl of onlineMembers(fid)) pl.sendMessage(PREFIX + msg);
}

export function onlinePlayer(name) {
  const n = String(name ?? "").toLowerCase();
  return world.getAllPlayers().find((pl) => pl.name.toLowerCase() === n);
}

export const onlineById = (id) => world.getAllPlayers().find((pl) => pl.id === id);

export function sound(player, id, pitch = 1, volume = 1) {
  try { player.playSound(id, { pitch, volume }); } catch { /* left */ }
}

/** Refresh the [Faction] tag and level above a player's head. */
export function refreshNametag(player) {
  if (!CONFIG.nametagPrefix) return;
  const p = S.playerData(player);
  const f = S.getFaction(p.faction);
  try {
    player.nameTag = `${f ? `§7[§${f.color}${f.name}§7] ` : ""}§f${player.name}\n§b✦ §7Lv.§f${p.level}`;
  } catch { /* player left */ }
}

export const refreshFactionNametags = (fid) => onlineMembers(fid).forEach(refreshNametag);
