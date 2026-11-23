// Factions Core - the rules: power, relations and who may do what where.
import { world } from "@minecraft/server";
import { CONFIG, COLOR, RANK_LEVEL } from "./config.js";
import * as S from "./store.js";

// ------------------------------------------------------------ power

export function factionPower(fid) {
  return S.membersOf(fid).reduce((sum, p) => sum + p.power, 0);
}

export function factionMaxPower(fid) {
  return S.membersOf(fid).length * CONFIG.maxPower;
}

/** How many chunks this faction is allowed to hold. */
export function landLimit(fid) {
  return Math.max(0, Math.floor(factionPower(fid)));
}

/** A faction holding more land than its power allows can be raided. */
export function isRaidable(fid) {
  const f = S.getFaction(fid);
  if (!f || f.system) return false;
  return S.claimsOf(fid) > landLimit(fid);
}

export function addPower(p, amount) {
  const next = Math.min(CONFIG.maxPower, Math.max(CONFIG.minPower, p.power + amount));
  if (next !== p.power) { p.power = Math.round(next * 100) / 100; S.savePlayer(p); }
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

export function alliesOf(fid) {
  return S.allFactions().filter((f) => relation(fid, f.id) === "ally");
}

/** Faction name coloured for how the viewer's faction sees it. */
export function colorName(f, viewerFid) {
  if (!f) return `${COLOR.wilderness}Wilderness`;
  if (f.id === S.SAFEZONE) return `${COLOR.safezone}${f.name}`;
  if (f.id === S.WARZONE) return `${COLOR.warzone}${f.name}`;
  return `${COLOR[relation(viewerFid, f.id)]}${f.name}`;
}

// ------------------------------------------------------------ permissions

export function hasBypass(player) {
  return player.getDynamicProperty("fc:bypass") === true;
}

export function rankAtLeast(p, rank) {
  return p?.faction && RANK_LEVEL[p.rank] >= RANK_LEVEL[rank];
}

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
  const f = S.getFaction(owner);
  if (f?.id === S.SAFEZONE || f?.id === S.WARZONE) return true; // doors in admin zones are fine
  return CONFIG.alliesCanUseDoors && relation(S.playerData(player).faction, owner) === "ally";
}

// ------------------------------------------------------------ messaging

export const PREFIX = "§8[§6F§8]§r ";

export function tell(player, msg) {
  player.sendMessage(PREFIX + msg);
}

export function onlineMembers(fid) {
  return world.getAllPlayers().filter((pl) => S.playerData(pl).faction === fid);
}

export function tellFaction(fid, msg) {
  for (const pl of onlineMembers(fid)) pl.sendMessage(PREFIX + msg);
}

export function onlinePlayer(name) {
  const n = String(name ?? "").toLowerCase();
  return world.getAllPlayers().find((pl) => pl.name.toLowerCase() === n);
}

/** Refresh the [Faction] tag above a player's head. */
export function refreshNametag(player) {
  if (!CONFIG.nametagPrefix) return;
  const f = S.getFaction(S.playerData(player).faction);
  try {
    player.nameTag = f ? `§7[§e${f.name}§7]§r ${player.name}` : player.name;
  } catch { /* player left */ }
}

export function refreshFactionNametags(fid) {
  for (const pl of onlineMembers(fid)) refreshNametag(pl);
}
