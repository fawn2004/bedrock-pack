// Factions Core - every player action. Commands and menus both call these.
// An action throws Fail("reason") to stop and tell the player why.
import { world } from "@minecraft/server";
import { CONFIG, COLOR, RANKS, RANK_LEVEL, RANK_ICON } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";

export class Fail extends Error {}
const fail = (msg) => { throw new Fail(msg); };

// ------------------------------------------------------------ helpers

function me(player) {
  return S.playerData(player);
}

/** The player's faction, or stop with a message. */
function myFaction(player, minRank) {
  const p = me(player);
  const f = S.getFaction(p.faction);
  if (!f) fail("You are not in a faction. §e/f create <name>§r or §e/f join <name>");
  if (minRank && !R.rankAtLeast(p, minRank)) fail(`You need to be ${minRank} or higher to do that.`);
  return { p, f };
}

function checkName(name, ignoreId) {
  name = String(name ?? "").trim();
  if (!name) fail("Give a faction name.");
  if (name.length < CONFIG.nameMin || name.length > CONFIG.nameMax) fail(`Names are ${CONFIG.nameMin}-${CONFIG.nameMax} characters.`);
  if (!/^[A-Za-z0-9_]+$/.test(name)) fail("Names can only use letters, numbers and _.");
  const taken = S.findFaction(name);
  if (taken && taken.id !== ignoreId) fail(`${name} is already taken.`);
  return name;
}

function target(name, f) {
  const t = S.findPlayerRecord(name);
  if (!t) fail(`No player called ${name} has played here.`);
  if (f && t.faction !== f.id) fail(`${t.name} is not in your faction.`);
  return t;
}

function setRank(t, rank) {
  t.rank = rank;
  S.savePlayer(t);
}

const fmtPower = (n) => (Math.round(n * 10) / 10).toString();

// ------------------------------------------------------------ faction lifecycle

export function create(player, name) {
  const p = me(player);
  if (p.faction) fail("Leave your faction first.");
  name = checkName(name);
  const f = S.createFaction(name, p.id);
  p.faction = f.id;
  p.rank = "leader";
  S.savePlayer(p);
  R.refreshNametag(player);
  world.sendMessage(`${R.PREFIX}§e${player.name}§r founded the faction §a${name}§r!`);
  R.tell(player, "Next: §e/f claim§r to claim this chunk, §e/f invite <player>§r to add friends.");
}

export function disband(player) {
  const { f } = myFaction(player, "leader");
  const online = R.onlineMembers(f.id);
  S.deleteFaction(f.id);
  for (const pl of online) R.refreshNametag(pl);
  world.sendMessage(`${R.PREFIX}The faction §c${f.name}§r was disbanded by §e${player.name}§r.`);
}

export function invite(player, name) {
  const { f } = myFaction(player, "officer");
  const t = S.findPlayerRecord(name);
  const shown = t?.name ?? name;
  if (t?.faction === f.id) fail(`${shown} is already in your faction.`);
  f.invites[shown.toLowerCase()] = Date.now() + CONFIG.inviteMinutes * 60000;
  S.saveFaction(f);
  R.tellFaction(f.id, `§e${player.name}§r invited §e${shown}§r.`);
  const online = R.onlinePlayer(shown);
  if (online) R.tell(online, `§a${f.name}§r invited you. Type §e/f join ${f.name}§r (${CONFIG.inviteMinutes} min).`);
}

export function uninvite(player, name) {
  const { f } = myFaction(player, "officer");
  const key = String(name).toLowerCase();
  if (!f.invites[key]) fail(`${name} has no invite.`);
  delete f.invites[key];
  S.saveFaction(f);
  R.tellFaction(f.id, `§e${player.name}§r took back the invite for §e${name}§r.`);
}

function isInvited(f, name) {
  const until = f.invites[name.toLowerCase()];
  return until && until > Date.now();
}

/** Factions that have a live invite for this player. */
export function invitesFor(player) {
  return S.allFactions().filter((f) => isInvited(f, player.name));
}

export function join(player, name) {
  const p = me(player);
  if (p.faction) fail("Leave your faction first.");
  const f = S.findFaction(name);
  if (!f || f.system) fail(`There is no faction called ${name}.`);
  if (!f.open && !isInvited(f, player.name)) fail(`${f.name} is invite only.`);
  if (S.membersOf(f.id).length >= CONFIG.maxMembers) fail(`${f.name} is full.`);
  delete f.invites[player.name.toLowerCase()];
  S.saveFaction(f);
  p.faction = f.id;
  p.rank = "recruit";
  S.savePlayer(p);
  R.refreshNametag(player);
  R.tellFaction(f.id, `§e${player.name}§r joined the faction!`);
}

export function leave(player) {
  const { p, f } = myFaction(player);
  if (p.rank === "leader") {
    if (S.membersOf(f.id).length > 1) fail("You're the leader. Pass it on with §e/f leader <player>§r or use §e/f disband§r.");
    return disband(player);
  }
  p.faction = null;
  p.rank = null;
  S.savePlayer(p);
  R.refreshNametag(player);
  R.tell(player, `You left §e${f.name}§r.`);
  R.tellFaction(f.id, `§e${player.name}§r left the faction.`);
}

export function kick(player, name) {
  const { p, f } = myFaction(player, "officer");
  const t = target(name, f);
  if (t.id === p.id) fail("Use §e/f leave§r to leave.");
  if (RANK_LEVEL[t.rank] >= RANK_LEVEL[p.rank]) fail(`You can't kick a ${t.rank}.`);
  t.faction = null;
  t.rank = null;
  S.savePlayer(t);
  R.tellFaction(f.id, `§e${player.name}§r kicked §e${t.name}§r.`);
  const online = R.onlinePlayer(t.name);
  if (online) { R.refreshNametag(online); R.tell(online, `You were kicked from §e${f.name}§r.`); }
}

export function promote(player, name) {
  const { p, f } = myFaction(player, "officer");
  const t = target(name, f);
  const i = RANKS.indexOf(t.rank);
  const next = RANKS[i - 1];
  if (next === "leader") fail("Use §e/f leader <player>§r to hand over leadership.");
  if (RANK_LEVEL[next] >= RANK_LEVEL[p.rank]) fail(`Only the leader can make ${next}s.`);
  setRank(t, next);
  R.tellFaction(f.id, `§e${t.name}§r was promoted to §a${next}§r.`);
}

export function demote(player, name) {
  const { p, f } = myFaction(player, "officer");
  const t = target(name, f);
  if (RANK_LEVEL[t.rank] >= RANK_LEVEL[p.rank]) fail(`You can't demote a ${t.rank}.`);
  const next = RANKS[RANKS.indexOf(t.rank) + 1];
  if (!next) fail(`${t.name} is already a recruit.`);
  setRank(t, next);
  R.tellFaction(f.id, `§e${t.name}§r was demoted to §c${next}§r.`);
}

export function leader(player, name) {
  const { p, f } = myFaction(player, "leader");
  const t = target(name, f);
  if (t.id === p.id) fail("You are already the leader.");
  setRank(p, "officer");
  setRank(t, "leader");
  f.leader = t.id;
  S.saveFaction(f);
  R.tellFaction(f.id, `§e${t.name}§r is the new leader of §a${f.name}§r!`);
}

export function rename(player, name) {
  const { f } = myFaction(player, "leader");
  const old = f.name;
  f.name = checkName(name, f.id);
  S.saveFaction(f);
  R.refreshFactionNametags(f.id);
  world.sendMessage(`${R.PREFIX}§e${old}§r is now called §e${f.name}§r.`);
}

export function describe(player, text) {
  const { f } = myFaction(player, "officer");
  text = String(text ?? "").trim().slice(0, CONFIG.descMax);
  if (!text) fail("Give a description.");
  f.desc = text;
  S.saveFaction(f);
  R.tellFaction(f.id, `Description set: §7${text}`);
}

export function toggleOpen(player) {
  const { f } = myFaction(player, "officer");
  f.open = !f.open;
  S.saveFaction(f);
  R.tellFaction(f.id, f.open ? "The faction is now §aopen§r: anyone can join." : "The faction is now §cinvite only§r.");
}

// ------------------------------------------------------------ information

export function infoLines(f, viewerFid) {
  const members = S.membersOf(f.id).sort((a, b) => RANK_LEVEL[b.rank] - RANK_LEVEL[a.rank]);
  const onlineIds = new Set(world.getAllPlayers().map((pl) => pl.id));
  const claimsN = S.claimsOf(f.id);
  const lines = [`§6---- ${R.colorName(f, viewerFid)} §6----`, `§7${f.desc || "No description"}`];
  if (f.system) {
    lines.push(`§7Land: §f${claimsN}§7 chunks`);
    return lines;
  }
  const leaderRec = S.getPlayerRecord(f.leader);
  lines.push(`§7Leader: §f${leaderRec?.name ?? "?"}   §7Joining: ${f.open ? "§aopen" : "§cinvite only"}`);
  lines.push(`§7Land / Power / Max: §f${claimsN} / ${fmtPower(R.factionPower(f.id))} / ${R.factionMaxPower(f.id)}`);
  if (R.isRaidable(f.id)) lines.push("§c§lRAIDABLE§r §7(more land than power)");
  lines.push(`§7Home: ${f.home ? "§aset" : "§cnot set"}`);
  const rel = { ally: [], truce: [], enemy: [] };
  for (const o of S.allFactions()) {
    const r = R.relation(f.id, o.id);
    if (rel[r]) rel[r].push(o.name);
  }
  if (rel.ally.length) lines.push(`§7Allies: ${COLOR.ally}${rel.ally.join(", ")}`);
  if (rel.truce.length) lines.push(`§7Truces: ${COLOR.truce}${rel.truce.join(", ")}`);
  if (rel.enemy.length) lines.push(`§7Enemies: ${COLOR.enemy}${rel.enemy.join(", ")}`);
  const list = members.map((m) => `${onlineIds.has(m.id) ? "§a" : "§7"}${RANK_ICON[m.rank]}${m.name}`);
  lines.push(`§7Members (${members.length}/${CONFIG.maxMembers}): ${list.join("§7, ")}`);
  return lines;
}

export function info(player, name) {
  const p = me(player);
  let f;
  if (name) {
    f = S.findFaction(name);
    if (!f) {
      const rec = S.findPlayerRecord(name);
      f = S.getFaction(rec?.faction);
    }
    if (!f) fail(`No faction or player called ${name}.`);
  } else {
    f = S.getFaction(p.faction);
    if (!f) fail("You are not in a faction. Try §e/f info <faction>§r.");
  }
  player.sendMessage(infoLines(f, p.faction).join("\n"));
}

export function list(player, page) {
  const p = me(player);
  const online = world.getAllPlayers().map((pl) => S.playerData(pl).faction);
  const rows = S.allFactions().map((f) => ({
    f,
    online: online.filter((id) => id === f.id).length,
    members: S.membersOf(f.id).length,
    power: R.factionPower(f.id),
  }));
  rows.sort((a, b) => b.online - a.online || b.power - a.power);
  const per = 8;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const n = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)));
  const lines = [`§6---- Factions (page ${n}/${pages}) ----`];
  for (const r of rows.slice((n - 1) * per, n * per)) {
    lines.push(`${R.colorName(r.f, p.faction)}§7  ${r.online}/${r.members} online  land ${S.claimsOf(r.f.id)}/${Math.floor(r.power)}${R.isRaidable(r.f.id) ? " §cRAIDABLE" : ""}`);
  }
  if (rows.length === 0) lines.push("§7No factions yet. Be the first: §e/f create <name>");
  player.sendMessage(lines.join("\n"));
}

export function power(player, name) {
  const t = name ? S.findPlayerRecord(name) : me(player);
  if (!t) fail(`No player called ${name} has played here.`);
  R.tell(player, `§e${t.name}§r has §a${fmtPower(t.power)}§r / ${CONFIG.maxPower} power.`);
}

export function who(player, name) {
  const t = S.findPlayerRecord(name);
  if (!t) fail(`No player called ${name} has played here.`);
  const f = S.getFaction(t.faction);
  R.tell(player, `§e${t.name}§r: ${f ? `${R.colorName(f, me(player).faction)}§r (${t.rank})` : "no faction"}, power ${fmtPower(t.power)}/${CONFIG.maxPower}`);
}

// ------------------------------------------------------------ land

const neighbours = (cx, cz) => [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]];

/** Try to claim one chunk. Returns undefined on success or a reason. */
function claimChunk(f, dimId, cx, cz, admin) {
  const key = S.chunkKey(dimId, cx, cz);
  const owner = S.ownerOfChunk(dimId, cx, cz);
  if (owner === f.id) return "already yours";
  if (admin) { S.setClaim(key, f.id); return undefined; }

  let overclaim = false;
  if (owner) {
    const o = S.getFaction(owner);
    if (o?.system) return `that is ${o.name}`;
    if (!R.isRaidable(owner)) return `${o?.name} owns that chunk`;
    if (R.relation(f.id, owner) !== "enemy") return `you must be enemies with ${o?.name} to take their land`;
    overclaim = true;
  }
  if (S.claimsOf(f.id) + 1 > R.landLimit(f.id)) return "not enough power (one chunk per power)";
  if (CONFIG.claimsMustConnect && S.claimsOf(f.id) > 0 && !overclaim) {
    if (!neighbours(cx, cz).some(([x, z]) => S.ownerOfChunk(dimId, x, z) === f.id)) return "claims must connect to your land";
  }
  const b = CONFIG.bufferChunks;
  if (b > 0 && !overclaim) {
    for (let dx = -b; dx <= b; dx++) for (let dz = -b; dz <= b; dz++) {
      const o = S.ownerOfChunk(dimId, cx + dx, cz + dz);
      if (o && o !== f.id && !S.getFaction(o)?.system) return `too close to ${S.getFaction(o)?.name}`;
    }
  }
  S.setClaim(key, f.id);
  if (overclaim) R.tellFaction(owner, `§c${f.name} took a chunk of your land at ${cx * 16}, ${cz * 16}!`);
  return undefined;
}

/** Claims a square around the player. `fid` lets admins claim for SafeZone/WarZone. */
export function claim(player, radius, fid) {
  const admin = !!fid;
  const f = admin ? S.getFaction(fid) : myFaction(player, "officer").f;
  const r = Math.max(0, Math.min(admin ? 10 : CONFIG.maxClaimRadius, Math.floor(Number(radius) || 0)));
  const dimId = player.dimension.id;
  const c = S.chunkOf(player.location);
  // Closest chunks first, and keep passing so "must connect" can grow outward.
  const todo = [];
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) todo.push([c.x + dx, c.z + dz]);
  todo.sort((a, b) => Math.hypot(a[0] - c.x, a[1] - c.z) - Math.hypot(b[0] - c.x, b[1] - c.z));
  let done = 0;
  let lastReason;
  let progress = true;
  while (progress && todo.length) {
    progress = false;
    for (let i = 0; i < todo.length; i++) {
      const [x, z] = todo[i];
      const why = claimChunk(f, dimId, x, z, admin);
      if (why === undefined) { done++; progress = true; todo.splice(i--, 1); }
      else if (why === "already yours") todo.splice(i--, 1);
      else lastReason = why;
    }
  }
  if (done === 0) fail(`Couldn't claim: ${lastReason ?? "this land is already yours"}.`);
  const msg = `§e${player.name}§r claimed §a${done}§r chunk${done === 1 ? "" : "s"} for ${R.colorName(f, f.id)}§r.`;
  if (admin) R.tell(player, msg);
  else R.tellFaction(f.id, msg + (todo.length && lastReason ? ` §7(${todo.length} skipped: ${lastReason})` : ""));
}

/** Silent single-chunk claim used by autoclaim. Returns true if claimed. */
export function autoClaimHere(player) {
  const p = me(player);
  const f = S.getFaction(p.faction);
  if (!f || !R.rankAtLeast(p, "officer")) return false;
  const c = S.chunkOf(player.location);
  const why = claimChunk(f, player.dimension.id, c.x, c.z, false);
  if (why === undefined) { R.tell(player, `Auto-claimed §a${c.x * 16}, ${c.z * 16}§r.`); return true; }
  return false;
}

export function unclaim(player, arg, admin) {
  const dimId = player.dimension.id;
  const c = S.chunkOf(player.location);
  if (admin) {
    const r = Math.max(0, Math.min(10, Math.floor(Number(arg) || 0)));
    let n = 0;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (S.ownerOfChunk(dimId, c.x + dx, c.z + dz)) { S.setClaim(S.chunkKey(dimId, c.x + dx, c.z + dz), undefined); n++; }
    }
    return R.tell(player, `Unclaimed §a${n}§r chunks.`);
  }
  const { p, f } = myFaction(player, "officer");
  if (String(arg).toLowerCase() === "all") {
    if (!R.rankAtLeast(p, "leader")) fail("Only the leader can unclaim all land.");
    const keys = S.claimKeysOf(f.id);
    for (const k of keys) S.setClaim(k, undefined);
    return R.tellFaction(f.id, `§e${player.name}§r unclaimed all §c${keys.length}§r chunks.`);
  }
  if (S.ownerOfChunk(dimId, c.x, c.z) !== f.id) fail("Your faction doesn't own this chunk.");
  S.setClaim(S.chunkKey(dimId, c.x, c.z), undefined);
  R.tellFaction(f.id, `§e${player.name}§r unclaimed the chunk at ${c.x * 16}, ${c.z * 16}.`);
}

export function mapLines(player) {
  const p = me(player);
  const dimId = player.dimension.id;
  const c = S.chunkOf(player.location);
  const W = 12; // half width in chunks
  const H = 5; // half height
  const seen = new Map();
  const here = S.getFaction(S.ownerOfChunk(dimId, c.x, c.z));
  const lines = [`§6---- Map (${c.x * 16}, ${c.z * 16}) ${R.colorName(here, p.faction)} §6---- §7north is up`];
  for (let dz = -H; dz <= H; dz++) {
    let row = "";
    for (let dx = -W; dx <= W; dx++) {
      if (dx === 0 && dz === 0) { row += "§e■"; continue; }
      const owner = S.ownerOfChunk(dimId, c.x + dx, c.z + dz);
      const f = S.getFaction(owner);
      if (!f) { row += "§8■"; continue; }
      const color = R.colorName(f, p.faction).slice(0, 2);
      seen.set(f.id, `${color}■ ${f.name}`);
      row += color + "■";
    }
    lines.push(row);
  }
  lines.push(`§e■ you  §8■ wilderness  ${[...seen.values()].join("  ")}`);
  return lines;
}

export function map(player) {
  player.sendMessage(mapLines(player).join("\n"));
}

// ------------------------------------------------------------ home

export function setHome(player) {
  const { f } = myFaction(player, "officer");
  const dimId = player.dimension.id;
  const loc = player.location;
  if (S.ownerAt(dimId, loc) !== f.id) fail("Your home must be on your own land.");
  const c = S.chunkOf(loc);
  f.home = { x: loc.x, y: loc.y, z: loc.z, dim: dimId, key: S.chunkKey(dimId, c.x, c.z) };
  S.saveFaction(f);
  R.tellFaction(f.id, `§e${player.name}§r set the faction home.`);
}

/** Returns the home to teleport to; the warmup itself is in tasks.js. */
export function homeTarget(player) {
  const { f } = myFaction(player);
  if (!f.home) fail("Your faction has no home. An officer can use §e/f sethome§r.");
  return f.home;
}

// ------------------------------------------------------------ relations

export function setRelation(player, rel, name) {
  const { f } = myFaction(player, "officer");
  rel = String(rel).toLowerCase();
  if (!R.RELATIONS.includes(rel)) fail("Relation must be ally, truce, neutral or enemy.");
  const o = S.findFaction(name);
  if (!o || o.system) fail(`There is no faction called ${name}.`);
  if (o.id === f.id) fail("That's you!");
  const before = R.relation(f.id, o.id);
  if ((f.wishes[o.id] ?? "neutral") === rel) fail(`You already want ${rel} with ${o.name}.`);
  if (rel === "ally" && (o.wishes[f.id] === "ally")) {
    if (R.alliesOf(f.id).length >= CONFIG.maxAllies) fail(`You can have at most ${CONFIG.maxAllies} allies.`);
    if (R.alliesOf(o.id).length >= CONFIG.maxAllies) fail(`${o.name} already has ${CONFIG.maxAllies} allies.`);
  }
  if (rel === "neutral") delete f.wishes[o.id];
  else f.wishes[o.id] = rel;
  S.saveFaction(f);
  const after = R.relation(f.id, o.id);
  if (after !== before) {
    const text = `${COLOR[after]}${after}§r`;
    R.tellFaction(f.id, `You are now ${text} with ${COLOR[after]}${o.name}§r.`);
    R.tellFaction(o.id, `You are now ${text} with ${COLOR[after]}${f.name}§r.`);
  } else {
    R.tellFaction(f.id, `You asked ${o.name} for ${COLOR[rel]}${rel}§r. They need to do the same.`);
    R.tellFaction(o.id, `${COLOR[rel]}${f.name}§r wants ${COLOR[rel]}${rel}§r. Type §e/f ${rel} ${f.name}§r to accept.`);
  }
}

// ------------------------------------------------------------ chat

export function chat(player, text, toAllies) {
  const { p, f } = myFaction(player);
  text = String(text ?? "").trim();
  if (!text) fail(toAllies ? "Usage: /fa <message>" : "Usage: /fc <message>");
  const line = toAllies
    ? `${COLOR.ally}[Ally] §7[${f.name}] §f${player.name}: ${COLOR.ally}${text}`
    : `§a[Faction] §7${RANK_ICON[p.rank]}§f${player.name}: §a${text}`;
  const targets = new Set([f.id]);
  if (toAllies) for (const a of R.alliesOf(f.id)) targets.add(a.id);
  for (const pl of world.getAllPlayers()) {
    if (targets.has(S.playerData(pl).faction)) pl.sendMessage(line);
  }
}

// ------------------------------------------------------------ help

export const HELP = [
  ["/f", "open the factions menu"],
  ["/f create <name>", "start a faction"],
  ["/f join <name>", "join an open faction or one that invited you"],
  ["/f info [faction|player]", "faction details"],
  ["/f list [page]", "all factions"],
  ["/f map", "map of nearby land"],
  ["/f claim [radius]", "claim this chunk (or a square)"],
  ["/f unclaim [all]", "give up this chunk (or everything)"],
  ["/f autoclaim", "claim as you walk"],
  ["/f invite|uninvite <player>", "manage invites"],
  ["/f kick|promote|demote <player>", "manage members"],
  ["/f leader <player>", "hand over leadership"],
  ["/f sethome  /f home", "faction home"],
  ["/f ally|truce|neutral|enemy <faction>", "relations"],
  ["/f open", "toggle invite only"],
  ["/f rename <name>  /f desc <text>", "change name/description"],
  ["/f power [player]  /f who <player>", "player info"],
  ["/f leave  /f disband", "leave or end your faction"],
  ["/fc <msg>  /fa <msg>", "faction chat / ally chat"],
];

export function help(player) {
  player.sendMessage(["§6---- Factions help ----", ...HELP.map(([c, d]) => `§e${c}§7 - ${d}`)].join("\n"));
}
