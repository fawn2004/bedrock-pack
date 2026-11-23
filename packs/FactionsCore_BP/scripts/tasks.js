// Factions Core - things that happen over time: territory titles, autoclaim,
// home warmups, power regen and power loss on death.
import { system, world, Player } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as A from "./actions.js";

export const autoclaimers = new Set();
const lastLand = new Map(); // player id -> owner id ("" = wilderness)
const homes = new Map(); // player id -> { home, start, left }
const homeCooldown = new Map(); // player id -> time it ends

export function startHome(player) {
  const home = A.homeTarget(player);
  const until = homeCooldown.get(player.id) ?? 0;
  if (until > Date.now()) throw new A.Fail(`Wait ${Math.ceil((until - Date.now()) / 1000)}s before using home again.`);
  const left = CONFIG.homeWarmupSeconds;
  if (left <= 0) return teleportHome(player, home);
  homes.set(player.id, { home, start: { ...player.location }, left });
  R.tell(player, `Teleporting home in §e${left}s§r. Don't move or get hurt.`);
}

function teleportHome(player, home) {
  homeCooldown.set(player.id, Date.now() + CONFIG.homeCooldownSeconds * 1000);
  player.teleport({ x: home.x, y: home.y, z: home.z }, { dimension: world.getDimension(home.dim) });
  player.onScreenDisplay.setActionBar("§aWelcome home");
}

function tickHomes() {
  for (const [id, h] of homes) {
    const player = world.getEntity(id);
    if (!(player instanceof Player)) { homes.delete(id); continue; }
    const l = player.location;
    if (Math.hypot(l.x - h.start.x, l.y - h.start.y, l.z - h.start.z) > 1) {
      homes.delete(id);
      R.tell(player, "§cTeleport cancelled: you moved.");
      continue;
    }
    h.left--;
    if (h.left <= 0) { homes.delete(id); teleportHome(player, h.home); }
    else player.onScreenDisplay.setActionBar(`§eTeleporting home in ${h.left}...`);
  }
}

function tickTerritory() {
  for (const player of world.getAllPlayers()) {
    const owner = S.ownerAt(player.dimension.id, player.location) ?? "";
    if (lastLand.get(player.id) === owner) continue;
    const first = !lastLand.has(player.id);
    lastLand.set(player.id, owner);
    if (!owner && autoclaimers.has(player.id)) {
      try { if (A.autoClaimHere(player)) { lastLand.set(player.id, S.playerData(player).faction ?? ""); continue; } } catch { /* ignore */ }
    }
    if (first || !CONFIG.territoryTitles) continue;
    const f = S.getFaction(owner);
    const name = R.colorName(f, S.playerData(player).faction);
    const sub = f ? `§7${f.desc}${R.isRaidable(f.id) ? " §c(raidable)" : ""}` : "§7Free land";
    player.onScreenDisplay.setTitle(name, { subtitle: sub, fadeInDuration: 5, stayDuration: 30, fadeOutDuration: 10 });
  }
}

function regenPower() {
  for (const player of world.getAllPlayers()) R.addPower(S.playerData(player), CONFIG.regenPerMinute);
}

export function setupTasks() {
  world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (!initialSpawn) return;
    const p = S.playerData(player);
    R.refreshNametag(player);
    const f = S.getFaction(p.faction);
    if (f) {
      R.tell(player, `Welcome back to ${R.colorName(f, f.id)}§r. ${R.onlineMembers(f.id).length} member(s) online.`);
    } else {
      R.tell(player, "This server has factions! Type §e/f§r to open the menu or §e/f help§r.");
      const inv = A.invitesFor(player);
      if (inv.length) R.tell(player, `You have invites from: §a${inv.map((x) => x.name).join(", ")}`);
    }
  });

  world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    lastLand.delete(playerId);
    homes.delete(playerId);
    autoclaimers.delete(playerId);
  });

  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (!(deadEntity instanceof Player)) return;
    homes.delete(deadEntity.id);
    if (CONFIG.noPowerLossInWarzone && S.ownerAt(deadEntity.dimension.id, deadEntity.location) === S.WARZONE) return;
    const p = S.playerData(deadEntity);
    R.addPower(p, -CONFIG.deathPowerLoss);
    R.tell(deadEntity, `You lost §c${CONFIG.deathPowerLoss}§r power. You now have §e${p.power}§r / ${CONFIG.maxPower}.`);
    const f = S.getFaction(p.faction);
    if (f && R.isRaidable(f.id)) R.tellFaction(f.id, "§c§lWarning:§r§c your faction is now raidable! Enemies can blow up and take your land.");
  });

  world.afterEvents.entityHurt.subscribe(({ hurtEntity }) => {
    if (homes.delete(hurtEntity.id) && hurtEntity instanceof Player) R.tell(hurtEntity, "§cTeleport cancelled: you were hurt.");
  });

  system.runInterval(tickTerritory, 10);
  system.runInterval(tickHomes, 20);
  system.runInterval(regenPower, 1200);
}
