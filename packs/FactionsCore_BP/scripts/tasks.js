// Factions Core - background work: territory messages, autoclaim, power
// regen, playtime, first-join kit, and XP/quests from mining and mob kills.
import { system, world, Player } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import * as A from "./actions.js";
import { giveItem, menuItem, keyItem, countItems } from "./items.js";
import { questEvent } from "./quests.js";
import { onMine, plunderBonus } from "./enchants.js";
import { refreshHud } from "./hud.js";

export const autoclaimers = new Set();
const lastLand = new Map(); // player id -> owner id ("" = wilderness)

function tickTerritory() {
  for (const player of world.getAllPlayers()) {
    const owner = S.ownerAt(player.dimension.id, player.location) ?? "";
    if (lastLand.get(player.id) === owner) continue;
    const first = !lastLand.has(player.id);
    lastLand.set(player.id, owner);
    if (!owner && autoclaimers.has(player.id)) {
      try { if (A.autoClaimHere(player)) { lastLand.set(player.id, S.playerData(player).faction ?? ""); continue; } } catch { /* ignore */ }
    }
    if (first || !CONFIG.territoryMessages) continue;
    const f = S.getFaction(owner);
    const p = S.playerData(player);
    const name = R.colorName(f, p.faction);
    const extra = f && !f.system ? `§7 - ${f.desc}${R.isShielded(f.id) ? " §a[SHIELDED]" : ""}${R.isRaidable(f.id) ? " §c[RAIDABLE]" : ""}` : f ? `§7 - ${f.desc}` : "";
    player.onScreenDisplay.setActionBar(`§l${name}§r${extra}`);
    R.sound(player, "note.bell", f ? 1.2 : 0.8, 0.4);
  }
}

function everyMinute() {
  for (const player of world.getAllPlayers()) {
    const p = S.playerData(player);
    p.playMinutes++;
    R.addPower(p, CONFIG.regenPerMinute);
    S.savePlayer(p);
  }
}

// XP for mining ores.
/** @type {[RegExp, number][]} */
const ORE_XP = [
  [/ancient_debris$/, 25], [/emerald_ore$/, 12], [/diamond_ore$/, 10], [/gold_ore$/, 4], [/lapis_ore$/, 3],
  [/iron_ore$/, 3], [/redstone_ore$/, 2], [/copper_ore$/, 2], [/coal_ore$/, 2], [/quartz_ore$/, 2],
];

export function setupTasks() {
  world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (!initialSpawn) return;
    const p = S.playerData(player);
    R.refreshNametag(player);
    refreshHud(player);
    if (p.isNew) {
      delete p.isNew;
      S.savePlayer(p);
      giveItem(player, menuItem());
      giveItem(player, keyItem("common", 2));
      player.onScreenDisplay.setTitle(`§b§l${CONFIG.serverName}`, { subtitle: "§fWelcome! Tap the menu item to begin", fadeInDuration: 10, stayDuration: 80, fadeOutDuration: 20 });
      R.broadcast(`Welcome §e${player.name}§r to the server for the first time!`);
      R.tell(player, `You got a §bServer Menu§r item, §a${E.money(p.money)}§r and 2 §fCommon Crate Keys§r. Type §e/f§r or §e/menu§r any time.`);
      return;
    }
    if (countItems(player, "fc:menu") === 0) giveItem(player, menuItem());
    const f = S.getFaction(p.faction);
    if (f) R.tell(player, `Welcome back to §${f.color}${f.name}§r. ${R.onlineMembers(f.id).length} member(s) online.`);
    else R.tell(player, "Welcome back! You're not in a faction yet - type §e/f§r to find one.");
    if (p.mail.length) R.tell(player, `§eYou have ${p.mail.length} item(s) waiting in your mailbox§r (Menu > Auction House).`);
  });

  world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    lastLand.delete(playerId);
    autoclaimers.delete(playerId);
  });

  world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation, itemStackBeforeBreak }) => {
    const p = S.playerData(player);
    const id = brokenBlockPermutation.type.id;
    p.mined++;
    let xp = 0;
    for (const [re, n] of ORE_XP) if (re.test(id)) { xp = n; break; }
    const bonus = onMine(player, block, itemStackBeforeBreak, id);
    if (xp) {
      E.addXp(player, p, Math.ceil(xp * (1 + bonus)));
      questEvent(player, "mine_ore");
    } else S.savePlayer(p);
    questEvent(player, "mine");
  });

  world.afterEvents.playerPlaceBlock.subscribe(({ player }) => questEvent(player, "place"));

  world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
    const killer = damageSource.damagingEntity;
    if (!(killer instanceof Player) || deadEntity instanceof Player) return;
    const p = S.playerData(killer);
    p.mobKills++;
    E.addXp(killer, p, 3);
    const plunder = plunderBonus(killer);
    if (plunder && Math.random() < 0.02 * plunder * 4) {
      E.addCrystals(p, 1);
      killer.onScreenDisplay.setActionBar("§b+1 crystal §7(Plunder)");
    }
    questEvent(killer, "kill_mob");
  });

  system.runInterval(tickTerritory, 10);
  system.runInterval(everyMinute, 1200);
}
