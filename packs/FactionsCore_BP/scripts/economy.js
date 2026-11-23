// Factions Core - money, crystals, XP and levels.
import { world } from "@minecraft/server";
import * as S from "./store.js";
import * as R from "./rules.js";

export class Fail extends Error {}
export const fail = (msg) => { throw new Fail(msg); };

/** 1234 -> "1,234"; 1500000 -> "1.5m". */
export function fmt(n) {
  n = Math.floor(Number(n) || 0);
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2).replace(/\.?0+$/, "") + "t";
  if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "b";
  if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "m";
  if (a >= 1e5) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toLocaleString("en-US");
}
export const money = (n) => `$${fmt(n)}`;

/** Parses "1500", "1.5k", "2m". */
export function parseAmount(s) {
  const m = String(s ?? "").trim().toLowerCase().match(/^\$?([0-9]*\.?[0-9]+)\s*([kmb]?)$/);
  if (!m) return NaN;
  const mult = { "": 1, k: 1e3, m: 1e6, b: 1e9 }[m[2]];
  return Math.floor(parseFloat(m[1]) * mult);
}

export const playerRecord = (player) => S.playerData(player);

export function addMoney(p, amount) {
  p.money = Math.max(0, Math.floor(p.money + amount));
  if (amount > 0) p.earned += Math.floor(amount);
  S.savePlayer(p);
}

export function takeMoney(p, amount, what = "that") {
  amount = Math.floor(amount);
  if (p.money < amount) fail(`You need ${money(amount)} for ${what}. You have ${money(p.money)}.`);
  p.money -= amount;
  S.savePlayer(p);
}

export function addCrystals(p, n) {
  p.crystals = Math.max(0, p.crystals + n);
  S.savePlayer(p);
}

export function takeCrystals(p, n, what = "that") {
  if (p.crystals < n) fail(`You need §b${n} crystals§r for ${what}. You have ${p.crystals}.`);
  p.crystals -= n;
  S.savePlayer(p);
}

// ------------------------------------------------------------ levels

export const xpForLevel = (level) => Math.floor(40 + level * 22 + Math.pow(level, 1.6) * 6);
export const maxHomes = (p) => Math.min(6, 1 + Math.floor(p.level / 10));

/** Gives XP (with the faction Wisdom bonus) and handles level-ups. */
export function addXp(player, p, amount) {
  const f = S.getFaction(p.faction);
  amount = Math.floor(amount * (1 + R.upgradeLevel(f, "xp") * 0.1));
  if (amount <= 0) return;
  p.xp += amount;
  let ups = 0;
  while (p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level++;
    ups++;
    levelReward(player, p);
  }
  S.savePlayer(p);
  if (ups && player) {
    player.onScreenDisplay.setActionBar(`§b§lLEVEL UP! §r§fYou are now level §b${p.level}`);
    R.sound(player, "random.levelup");
    R.refreshNametag(player);
  }
}

// Late-loaded to avoid a circular import with items.js.
let giveReward = null;
export const setRewardGiver = (fn) => { giveReward = fn; };

function levelReward(player, p) {
  const cash = 500 * p.level;
  addMoney(p, cash);
  let extra = "";
  if (p.level % 5 === 0) { addCrystals(p, 5 + p.level); extra += `, §b${5 + p.level} crystals`; }
  if (p.level % 10 === 0 && giveReward && player) { giveReward(player, p.level % 50 === 0 ? "key:legendary" : p.level % 20 === 0 ? "key:epic" : "key:rare"); extra += ", a crate key"; }
  if (player) R.tell(player, `§bLevel ${p.level}!§r Reward: §a${money(cash)}§r${extra}.`);
  if (p.level % 25 === 0) R.broadcast(`§e${p.name}§r reached §blevel ${p.level}§r!`);
}

/** A text progress bar for chat and the HUD. */
export function bar(fraction, width = 20, on = "§a", off = "§8") {
  const n = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return on + "|".repeat(n) + off + "|".repeat(width - n);
}

export function pay(player, targetName, amountText) {
  const p = S.playerData(player);
  const amount = parseAmount(amountText);
  if (!(amount > 0)) fail("Give an amount, like §e/pay Steve 5k§r.");
  const t = S.findPlayerRecord(targetName);
  if (!t) fail(`No player called ${targetName} has played here.`);
  if (t.id === p.id) fail("You can't pay yourself.");
  takeMoney(p, amount, "this payment");
  addMoney(t, amount);
  R.tell(player, `You paid §e${t.name} §a${money(amount)}§r.`);
  const online = R.onlineById(t.id);
  if (online) { R.tell(online, `§e${player.name}§r paid you §a${money(amount)}§r.`); R.sound(online, "random.orb"); }
}

export function leaderboard(field, n = 10) {
  return S.allPlayerRecords().slice().sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0)).slice(0, n);
}

export const onlineCount = () => world.getAllPlayers().length;
