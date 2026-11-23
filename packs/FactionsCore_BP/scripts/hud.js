// Factions Core - the profile sidebar on the right of the screen.
// The text is sent as a title starting with "fchud:"; the resource pack
// hides that title and keeps showing its text in a styled side panel.
import { system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { ftopRank } from "./ftop.js";
import { hudEventLines } from "./events.js";
import { isTagged } from "./combat.js";
import { ranksOf } from "./ranks.js";

export const HUD_MARK = "fchud:";
const lastSent = new Map();
const lockedUntil = new Map();

/** Stop HUD updates for a moment so a real title (crate roll...) isn't replaced. */
export function lockTitle(player, ms) {
  lockedUntil.set(player.id, Date.now() + ms);
}

function shortDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
}

export function hudText(player) {
  const p = S.playerData(player);
  if (!p.hud) return "";
  const need = E.xpForLevel(p.level);
  const lines = [
    `§b§l${CONFIG.serverName}`,
    `§8${CONFIG.season}`,
    "",
    "§3§lPROFILE",
    ...(ranksOf(player).length ? [`§7Rank ${ranksOf(player).map((r) => r.display).join("§r §7")}`] : []),
    `§7Balance §a${E.money(p.money)}`,
    `§7Crystals §b${E.fmt(p.crystals)}`,
    `§7Level §f${p.level} §8${Math.floor((p.xp / need) * 100)}%`,
    `§7K/D §f${p.kills}§8/§f${p.deaths}  §7Streak §f${p.streak}`,
    `§7Power §f${Math.round(p.power * 10) / 10}§8/${CONFIG.maxPower}`,
  ];
  const f = S.getFaction(p.faction);
  lines.push("", "§3§lFACTION");
  if (f) {
    const sh = R.shieldState(f);
    const rank = ftopRank(f.id);
    lines.push(
      `§${f.color}${f.name}`,
      `§7Online §f${R.onlineMembers(f.id).length}§8/${S.membersOf(f.id).length}`,
      `§7Land §f${S.claimsOf(f.id)}§8/${R.landLimit(f.id)}${R.isRaidable(f.id) ? " §cRAID" : ""}`,
      `§7F-Top §f${rank ? `#${rank}` : "-"}`,
      `§7Shield ${sh.none ? "§cnone" : sh.active ? `§aUP §8${shortDur(sh.ms)}` : `§cDOWN §8${shortDur(sh.ms)}`}`,
    );
  } else {
    lines.push("§7None yet", "§8Type /f to start");
  }
  const owner = S.getFaction(S.ownerAt(player.dimension.id, player.location));
  lines.push("", `§7Land: ${R.colorName(owner, p.faction)}`);
  if (isTagged(player)) lines.push("§c§lCOMBAT TAGGED");
  const ev = hudEventLines(player);
  if (ev.length) lines.push("", ...ev);
  return lines.join("\n");
}

function tick() {
  const now = Date.now();
  for (const player of world.getAllPlayers()) {
    try {
      if ((lockedUntil.get(player.id) ?? 0) > now) continue;
      const text = hudText(player);
      if (lastSent.get(player.id) === text) continue;
      lastSent.set(player.id, text);
      player.onScreenDisplay.setTitle(HUD_MARK + text, { fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 });
    } catch { /* player left */ }
  }
}

/** Force a resend (after the player toggles it or rejoins). */
export const refreshHud = (player) => lastSent.delete(player.id);

export function setupHud() {
  system.runInterval(tick, 20);
  world.afterEvents.playerLeave.subscribe(({ playerId }) => { lastSent.delete(playerId); lockedUntil.delete(playerId); });
}
