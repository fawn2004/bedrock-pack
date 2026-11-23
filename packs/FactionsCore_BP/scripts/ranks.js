// Factions Core - server ranks, chat modes and mutes.
//
// Ranks are plain player tags, so the vanilla /tag command manages them:
//   /tag Steve add Owner                 built-in rank (Owner, Admin, Mod, Helper, MVP, VIP)
//   /tag Steve add Builder               a custom rank made with /fadmin rank create
//   /tag Steve add "rank:&d&lBuilder"    a one-off rank, styled with & colour codes
//   /tag Steve remove Owner              take it away again
//
// Every couple of seconds the ranks are read from tags and copied onto the
// nametag, the sidebar and a few "fc..." tags that the Factions Core Chat
// pack (beta APIs) uses to format normal chat.
import { system, world } from "@minecraft/server";
import * as S from "./store.js";
import { Fail } from "./economy.js";

/** Built-in ranks, highest first. `homes` = extra homes, `fastTp` = no teleport warmup, `staff` = can /mute. */
export const BUILTIN_RANKS = [
  { name: "Owner", display: "§4§lOWNER", homes: 5, fastTp: true, staff: true },
  { name: "Admin", display: "§c§lADMIN", homes: 5, fastTp: true, staff: true },
  { name: "Mod", display: "§9§lMOD", homes: 3, fastTp: true, staff: true },
  { name: "Helper", display: "§3§lHELPER", homes: 2, fastTp: false, staff: true },
  { name: "MVP", display: "§b§lMVP§6+", homes: 3, fastTp: true, staff: false },
  { name: "VIP", display: "§a§lVIP", homes: 1, fastTp: false, staff: false },
];

/** "&c&lHi" -> "§c§lHi" */
export const colorize = (s) => String(s ?? "").replace(/&([0-9a-v])/gi, "§$1");

export const customRanks = () => S.kv.get("ranks", []);

/** The rank a single tag stands for, or undefined. */
export function rankFromTag(tag) {
  if (tag.toLowerCase().startsWith("rank:")) {
    const display = colorize(tag.slice(5)).trim();
    return display ? { name: display.replace(/§./g, ""), display, homes: 0, fastTp: false, staff: false, order: 500 } : undefined;
  }
  const t = tag.toLowerCase();
  const b = BUILTIN_RANKS.findIndex((r) => r.name.toLowerCase() === t);
  if (b >= 0) return { ...BUILTIN_RANKS[b], order: b };
  const customs = customRanks();
  const c = customs.findIndex((r) => r.name.toLowerCase() === t);
  if (c >= 0) return { homes: 0, fastTp: false, staff: false, ...customs[c], order: 100 + c };
  return undefined;
}

/** All of a player's ranks, highest first. */
export function ranksOf(player) {
  let tags = [];
  try { tags = player.getTags(); } catch { return []; }
  const seen = new Set();
  const out = [];
  for (const t of tags) {
    const r = rankFromTag(t);
    if (r && !seen.has(r.name.toLowerCase())) { seen.add(r.name.toLowerCase()); out.push(r); }
  }
  return out.sort((a, b) => a.order - b.order);
}

/** "[OWNER] [BUILDER] " for chat and nametags ("" with no ranks). */
export function rankPrefix(player) {
  const list = ranksOf(player);
  return list.length ? list.map((r) => `§8[${r.display}§r§8]`).join("") + " " : "";
}

export const isStaff = (player) => ranksOf(player).some((r) => r.staff);

// ------------------------------------------------------------ custom ranks (admin)

export function createRank(name, displayText, homes) {
  name = String(name ?? "").trim();
  if (!/^[A-Za-z0-9_+-]{1,16}$/.test(name)) throw new Fail("Rank names are 1-16 letters, numbers, _ + or -.");
  if (BUILTIN_RANKS.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new Fail(`${name} is a built-in rank.`);
  const list = customRanks().filter((r) => r.name.toLowerCase() !== name.toLowerCase());
  list.push({ name, display: colorize(displayText || `&f${name}`), homes: Math.max(0, Math.min(10, Math.floor(Number(homes) || 0))) });
  S.kv.set("ranks", list);
  return list[list.length - 1];
}

export function deleteRank(name) {
  const list = customRanks();
  const left = list.filter((r) => r.name.toLowerCase() !== String(name).toLowerCase());
  if (left.length === list.length) throw new Fail(`No custom rank called ${name}.`);
  S.kv.set("ranks", left);
}

export const allRankNames = () => [...BUILTIN_RANKS, ...customRanks()].map((r) => r.name);

// ------------------------------------------------------------ chat modes & mutes

export const CHAT_MODES = ["public", "faction", "ally"];
let alliesRef = (_fid) => [];

/** Re-sync a player's chat tags right away (after a mode change or mute). */
function syncNow(id) {
  const pl = world.getAllPlayers().find((x) => x.id === id);
  if (pl) { try { syncPlayer(pl, alliesRef); } catch { /* left */ } }
}

export function setChatMode(player, mode) {
  const p = S.playerData(player);
  const next = CHAT_MODES.includes(mode) ? mode : CHAT_MODES[(CHAT_MODES.indexOf(p.chatMode ?? "public") + 1) % CHAT_MODES.length];
  if (next !== "public" && !p.faction) throw new Fail("Join a faction to use faction or ally chat.");
  p.chatMode = next;
  S.savePlayer(p);
  syncNow(player.id);
  return next;
}

export function mute(name, minutes) {
  const p = S.findPlayerRecord(name);
  if (!p) throw new Fail(`No player called ${name} has played here.`);
  const m = Math.max(1, Math.floor(Number(minutes) || 10));
  p.mutedUntil = Date.now() + m * 60000;
  S.savePlayer(p);
  syncNow(p.id);
  return { p, m };
}

export function unmute(name) {
  const p = S.findPlayerRecord(name);
  if (!p) throw new Fail(`No player called ${name} has played here.`);
  p.mutedUntil = 0;
  S.savePlayer(p);
  syncNow(p.id);
  return p;
}

// ------------------------------------------------------------ syncing to tags

const CHAT_TAG = /^fc(prefix|mode|fac|allies|muted):/;
const lastSig = new Map();
/** @type {(player: any, first: boolean) => void} */
let onRanksChanged = () => {};
export const setOnRanksChanged = (fn) => { onRanksChanged = fn; };

/** Everything the chat pack needs, as tags. `alliesOf` comes from rules.js. */
export function chatTagsFor(player, alliesOf) {
  const p = S.playerData(player);
  const f = S.getFaction(p.faction);
  const tags = [`fcprefix:${rankPrefix(player)}${f ? `§7[§${f.color}${f.name}§7] ` : ""}`];
  const mode = f ? p.chatMode ?? "public" : "public";
  tags.push(`fcmode:${mode}`);
  if (f) {
    tags.push(`fcfac:${f.id}`);
    const allies = alliesOf(f.id).map((a) => a.id);
    if (allies.length) tags.push(`fcallies:${allies.join(",")}`);
  }
  if ((p.mutedUntil ?? 0) > Date.now()) tags.push(`fcmuted:${p.mutedUntil}`);
  return tags;
}

export function syncPlayer(player, alliesOf) {
  const want = chatTagsFor(player, alliesOf);
  const have = player.getTags().filter((t) => CHAT_TAG.test(t));
  for (const t of have) if (!want.includes(t)) player.removeTag(t);
  for (const t of want) if (!have.includes(t)) player.addTag(t);

  // Keep perks on the saved record so they work everywhere (and offline).
  const ranks = ranksOf(player);
  const p = S.playerData(player);
  const homes = ranks.reduce((m, r) => Math.max(m, r.homes ?? 0), 0);
  const fastTp = ranks.some((r) => r.fastTp);
  if (p.rankHomes !== homes || p.fastTp !== fastTp) { p.rankHomes = homes; p.fastTp = fastTp; S.savePlayer(p); }
  const sig = ranks.map((r) => r.display).join("|");
  if (lastSig.get(player.id) !== sig) {
    const first = !lastSig.has(player.id);
    lastSig.set(player.id, sig);
    onRanksChanged(player, first);
  }
}

export function setupRanks(alliesOf) {
  alliesRef = alliesOf;
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      try { syncPlayer(player, alliesOf); } catch { /* player left */ }
    }
  }, 40);
  world.afterEvents.playerLeave.subscribe(({ playerId }) => lastSig.delete(playerId));
}
