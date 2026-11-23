// Factions Core - teleports: faction home, player homes, spawn, warps and /wild.
// Every teleport has a short warmup (don't move!) and is blocked in combat.
import { system, world, Player } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { isTagged, tagLeft } from "./combat.js";
import { spawnPoint } from "./events.js";

const pending = new Map(); // player id -> { target, start, left, label }
const cooldown = new Map(); // player id -> time it ends

/** Teleport after the warmup. `target` = { dim, x, y, z } or a function run instead. */
export function teleport(player, target, label) {
  if (isTagged(player)) E.fail(`You're in combat! Wait ${tagLeft(player)}s.`);
  const until = cooldown.get(player.id) ?? 0;
  if (until > Date.now() && !R.hasBypass(player)) E.fail(`Wait ${Math.ceil((until - Date.now()) / 1000)}s before teleporting again.`);
  const left = R.hasBypass(player) ? 0 : CONFIG.homeWarmupSeconds;
  if (left <= 0) return arrive(player, target, label);
  pending.set(player.id, { target, start: { ...player.location }, left, label });
  R.tell(player, `Teleporting to §e${label}§r in §e${left}s§r. Don't move or get hurt.`);
}

function arrive(player, target, label) {
  cooldown.set(player.id, Date.now() + CONFIG.homeCooldownSeconds * 1000);
  if (typeof target === "function") return target(player);
  player.teleport({ x: target.x, y: target.y, z: target.z }, { dimension: world.getDimension(target.dim) });
  player.onScreenDisplay.setActionBar(`§aWelcome to ${label}`);
  R.sound(player, "mob.endermen.portal", 1.2, 0.6);
}

function tick() {
  for (const [id, h] of pending) {
    const player = world.getEntity(id);
    if (!(player instanceof Player)) { pending.delete(id); continue; }
    const l = player.location;
    if (Math.hypot(l.x - h.start.x, l.y - h.start.y, l.z - h.start.z) > 1) {
      pending.delete(id);
      R.tell(player, "§cTeleport cancelled: you moved.");
      continue;
    }
    h.left--;
    if (h.left <= 0) {
      pending.delete(id);
      try { arrive(player, h.target, h.label); } catch (e) { R.tell(player, `§c${e.message ?? e}`); }
    } else {
      player.onScreenDisplay.setActionBar(`§eTeleporting in ${h.left}...`);
      R.sound(player, "note.hat", 1 + (5 - h.left) * 0.1, 0.5);
    }
  }
}

// ------------------------------------------------------------ destinations

export function factionHome(player) {
  const p = S.playerData(player);
  const f = S.getFaction(p.faction);
  if (!f) E.fail("You are not in a faction.");
  if (!f.home) E.fail("Your faction has no home. An officer can use §e/f sethome§r.");
  teleport(player, f.home, `${f.name}'s home`);
}

export function home(player, name = "home") {
  const p = S.playerData(player);
  const h = p.homes[name.toLowerCase()];
  if (!h) E.fail(Object.keys(p.homes).length ? `No home called ${name}. Your homes: ${Object.keys(p.homes).join(", ")}` : "You have no homes. Use §e/sethome§r.");
  teleport(player, h, `home ${name}`);
}

export function setHome(player, name = "home") {
  const p = S.playerData(player);
  name = name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 12) || "home";
  const max = E.maxHomes(p);
  if (!p.homes[name] && Object.keys(p.homes).length >= max) E.fail(`You can have ${max} home${max > 1 ? "s" : ""} (one more every 10 levels).`);
  const owner = S.ownerAt(player.dimension.id, player.location);
  if (owner && owner !== p.faction && !S.getFaction(owner)?.system && R.relation(p.faction, owner) !== "ally") E.fail("You can't set a home on another faction's land.");
  const l = player.location;
  p.homes[name] = { dim: player.dimension.id, x: Math.floor(l.x) + 0.5, y: Math.floor(l.y), z: Math.floor(l.z) + 0.5 };
  S.savePlayer(p);
  R.tell(player, `Home §e${name}§r set.`);
}

export function delHome(player, name = "home") {
  const p = S.playerData(player);
  if (!p.homes[name.toLowerCase()]) E.fail(`No home called ${name}.`);
  delete p.homes[name.toLowerCase()];
  S.savePlayer(p);
  R.tell(player, `Home §e${name}§r deleted.`);
}

export function spawn(player) {
  teleport(player, spawnPoint(), "spawn");
}

export const warps = () => S.kv.get("warps", {});
export function setWarp(player, name) {
  const w = warps();
  const l = player.location;
  w[name.toLowerCase()] = { dim: player.dimension.id, x: l.x, y: l.y, z: l.z };
  S.kv.set("warps", w);
  R.tell(player, `Warp §e${name}§r set.`);
}
export function delWarp(player, name) {
  const w = warps();
  if (!w[name.toLowerCase()]) E.fail(`No warp called ${name}.`);
  delete w[name.toLowerCase()];
  S.kv.set("warps", w);
  R.tell(player, `Warp §e${name}§r deleted.`);
}
export function warp(player, name) {
  const w = warps()[String(name).toLowerCase()];
  if (!w) E.fail(`No warp called ${name}.`);
  teleport(player, w, name);
}

/** Random teleport into the wilderness. Drops you from the sky, then finds the ground. */
export function wild(player) {
  teleport(player, (pl) => {
    const dim = world.getDimension("minecraft:overworld");
    const sp = spawnPoint();
    let x = 0;
    let z = 0;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = CONFIG.wildMinRadius + Math.random() * (CONFIG.wildRadius - CONFIG.wildMinRadius);
      x = Math.floor(sp.x + Math.cos(a) * r);
      z = Math.floor(sp.z + Math.sin(a) * r);
      if (!S.ownerAt(dim.id, { x, z })) break;
    }
    pl.addEffect("slow_falling", 200, { showParticles: false });
    pl.addEffect("resistance", 200, { amplifier: 4, showParticles: false });
    pl.teleport({ x: x + 0.5, y: 250, z: z + 0.5 }, { dimension: dim });
    R.tell(pl, `Off you go! §7(${x}, ${z})`);
    let tries = 0;
    const id = system.runInterval(() => {
      tries++;
      try {
        const top = dim.getTopmostBlock({ x, z });
        if (top) {
          system.clearRun(id);
          if (top.isLiquid) { R.tell(pl, "§7You landed over water - swim for shore!"); }
          pl.teleport({ x: x + 0.5, y: top.y + 1, z: z + 0.5 }, { dimension: dim });
          pl.removeEffect("slow_falling");
          return;
        }
      } catch { /* not loaded yet */ }
      if (tries > 20) system.clearRun(id);
    }, 10);
  }, "the wild");
}

export function setupTeleports() {
  system.runInterval(tick, 20);
  world.afterEvents.entityHurt.subscribe(({ hurtEntity }) => {
    if (pending.delete(hurtEntity.id) && hurtEntity instanceof Player) R.tell(hurtEntity, "§cTeleport cancelled: you were hurt.");
  });
  world.afterEvents.playerLeave.subscribe(({ playerId }) => pending.delete(playerId));
}
