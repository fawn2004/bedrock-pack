// Factions Core - combat tag, kill stats, streaks, bounties and death penalties.
import { world, Player } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { questEvent } from "./quests.js";
import { plunderBonus } from "./enchants.js";

const tagged = new Map(); // player id -> time the tag ends
const lastHitBy = new Map(); // victim id -> { id, time }

export const isTagged = (player) => (tagged.get(player.id) ?? 0) > Date.now();
export const tagLeft = (player) => Math.max(0, Math.ceil(((tagged.get(player.id) ?? 0) - Date.now()) / 1000));

function tag(player) {
  const was = isTagged(player);
  tagged.set(player.id, Date.now() + CONFIG.combatTagSeconds * 1000);
  if (!was) R.tell(player, `§cYou are in combat! Don't log out for ${CONFIG.combatTagSeconds}s.`);
}

export function placeBounty(player, targetName, amountText) {
  const p = S.playerData(player);
  const amount = E.parseAmount(amountText);
  if (!(amount >= CONFIG.minBounty)) E.fail(`Bounties start at ${E.money(CONFIG.minBounty)}.`);
  const t = S.findPlayerRecord(targetName);
  if (!t) E.fail(`No player called ${targetName} has played here.`);
  if (t.id === p.id) E.fail("You can't put a bounty on yourself.");
  E.takeMoney(p, amount, "the bounty");
  t.bounty += amount;
  S.savePlayer(t);
  R.broadcast(`§e${player.name}§r put a §c${E.money(amount)}§r bounty on §e${t.name}§r! §7(total ${E.money(t.bounty)})`);
}

export function setupCombat() {
  world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
    const attacker = damageSource.damagingEntity;
    if (!(hurtEntity instanceof Player) || !(attacker instanceof Player) || attacker.id === hurtEntity.id) return;
    tag(hurtEntity);
    tag(attacker);
    lastHitBy.set(hurtEntity.id, { id: attacker.id, time: Date.now() });
  });

  world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
    if (!(deadEntity instanceof Player)) return;
    tagged.delete(deadEntity.id);
    const victim = S.playerData(deadEntity);
    victim.deaths++;
    const lost = victim.streak;
    victim.streak = 0;

    // Power loss.
    const inWarzone = S.ownerAt(deadEntity.dimension.id, deadEntity.location) === S.WARZONE;
    if (!(CONFIG.noPowerLossInWarzone && inWarzone)) {
      R.addPower(victim, -CONFIG.deathPowerLoss);
      R.tell(deadEntity, `You lost §c${CONFIG.deathPowerLoss}§r power (now §e${victim.power}§r/${CONFIG.maxPower}).`);
      const f = S.getFaction(victim.faction);
      if (f && R.isRaidable(f.id)) R.tellFaction(f.id, "§c§lWarning:§r§c your faction has more land than power! Enemies can take your land.");
    }

    // Who killed them? A direct hit, or whoever hit them in the last 10s.
    let killer = damageSource.damagingEntity instanceof Player ? damageSource.damagingEntity : undefined;
    if (!killer) {
      const last = lastHitBy.get(deadEntity.id);
      if (last && Date.now() - last.time < 10000) killer = R.onlineById(last.id);
    }
    lastHitBy.delete(deadEntity.id);
    S.savePlayer(victim);
    if (!killer || killer.id === deadEntity.id) return;

    const k = S.playerData(killer);
    k.kills++;
    k.streak++;
    k.bestStreak = Math.max(k.bestStreak, k.streak);
    const bonus = 1 + plunderBonus(killer);
    let reward = Math.floor(CONFIG.killReward * bonus);
    const bounty = victim.bounty;
    if (bounty > 0) {
      reward += bounty;
      victim.bounty = 0;
      S.savePlayer(victim);
      R.broadcast(`§e${killer.name}§r claimed the §c${E.money(bounty)}§r bounty on §e${deadEntity.name}§r!`);
    }
    E.addMoney(k, reward);
    E.addCrystals(k, Math.floor(CONFIG.killCrystals * bonus));
    S.savePlayer(k);
    E.addXp(killer, k, 40);
    killer.onScreenDisplay.setActionBar(`§c⚔ §fKilled §e${deadEntity.name} §a+${E.money(reward)}`);
    R.sound(killer, "random.orb", 0.8);
    questEvent(killer, "kill_player");
    if (k.streak >= 5 && k.streak % 5 === 0) R.broadcast(`§e${killer.name}§r is on a §c§l${k.streak} KILL STREAK§r!`);
    if (lost >= 5) R.broadcast(`§e${killer.name}§r ended §e${deadEntity.name}§r's §c${lost}§r kill streak!`);
  });

  // Logging out in combat: you'll die when you come back.
  world.beforeEvents.playerLeave.subscribe(({ player }) => {
    if (isTagged(player)) {
      const p = S.playerData(player);
      p.combatLogged = true;
      S.savePlayer(p);
    }
  });
  world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (!initialSpawn) return;
    const p = S.playerData(player);
    if (!p.combatLogged) return;
    p.combatLogged = false;
    S.savePlayer(p);
    try { player.kill(); } catch { /* */ }
    R.tell(player, "§cYou logged out during combat, so you died.");
  });
}
