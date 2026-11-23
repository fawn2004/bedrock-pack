// Factions Core - server ranks, chat modes and mutes.
//
// Ranks are plain player tags, so the vanilla /tag command manages them:
//   /tag Steve add Owner                 built-in rank (Owner, Admin, Mod, Helper, MVP, VIP)
//   /tag Steve add Builder               a custom rank made with /fadmin rank create
//   /tag Steve add "rank:&d&lBuilder"    a one-off rank, styled with & colour codes
//   /tag Steve remove Owner              take it away again
//
// Ranks are only a name in front of the player's name in chat - no perks.
// A player shows one rank at a time: the highest one they have (built-ins in
// the order below, then custom ranks in the order they were made, then
// one-off "rank:" tags). Every couple of seconds it's copied into a few "fc..."
// tags that the Factions Core Chat pack (beta APIs) uses to format chat.
import { system, world } from "@minecraft/server";
import * as S from "./store.js";
import { Fail } from "./economy.js";

/** Built-in ranks, highest first. */
export const BUILTIN_RANKS = [
  { name: "Owner", display: "§4§lOWNER" },
  { name: "Admin", display: "§c§lADMIN" },
  { name: "Mod", display: "§9§lMOD" },
  { name: "Helper", display: "§3§lHELPER" },
  { name: "MVP", display: "§b§lMVP§6+" },
  { name: "VIP", display: "§a§lVIP" },
];

/** "&c&lHi" -> "§c§lHi" */
export const colorize = (s) => String(s ?? "").replace(/&([0-9a-v])/gi, "§$1");

export const customRanks = () => S.kv.get("ranks", []);

/** The rank a single tag stands for, or undefined. */
export function rankFromTag(tag) {
  if (tag.toLowerCase().startsWith("rank:")) {
    const display = colorize(tag.slice(5)).trim();
    return display ? { name: display.replace(/§./g, ""), display, order: 500 } : undefined;
  }
  const t = tag.toLowerCase();
  const b = BUILTIN_RANKS.findIndex((r) => r.name.toLowerCase() === t);
  if (b >= 0) return { ...BUILTIN_RANKS[b], order: b };
  const customs = customRanks();
  const c = customs.findIndex((r) => r.name.toLowerCase() === t);
  if (c >= 0) return { name: customs[c].name, display: customs[c].display, order: 100 + c };
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

/** The one rank a player shows: their highest, or undefined. */
export const topRank = (player) => ranksOf(player)[0];

/** "[OWNER] " for chat ("" with no rank). Only ever one rank. */
export function rankPrefix(player) {
  const r = topRank(player);
  return r ? `§8[${r.display}§r§8] ` : "";
}

// ------------------------------------------------------------ custom ranks (admin)

export function createRank(name, displayText) {
  name = String(name ?? "").trim();
  if (!/^[A-Za-z0-9_+-]{1,16}$/.test(name)) throw new Fail("Rank names are 1-16 letters, numbers, _ + or -.");
  if (BUILTIN_RANKS.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new Fail(`${name} is a built-in rank.`);
  const list = customRanks().filter((r) => r.name.toLowerCase() !== name.toLowerCase());
  list.push({ name, display: colorize(displayText || `&f${name}`) });
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

  const sig = topRank(player)?.display ?? "";
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
