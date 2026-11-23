// Factions Core - daily quests. Everyone gets 3 new quests each day;
// finishing one pays out right away, finishing all 3 gives a bonus crate key.
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";

export const POOL = [
  { id: "ores", event: "mine_ore", text: "Mine {n} ores", n: [32, 64, 128], pay: 40 },
  { id: "dig", event: "mine", text: "Break {n} blocks", n: [250, 500, 1000], pay: 6 },
  { id: "mobs", event: "kill_mob", text: "Kill {n} mobs", n: [25, 50, 100], pay: 60 },
  { id: "pvp", event: "kill_player", text: "Kill {n} players", n: [1, 3, 5], pay: 2500 },
  { id: "sell", event: "sell", text: "Sell {n} worth of items", n: [5000, 20000, 75000], pay: 0.15, money: true },
  { id: "crates", event: "crate", text: "Open {n} crates", n: [1, 2, 3], pay: 1500 },
  { id: "claim", event: "claim", text: "Claim {n} chunks", n: [1, 3, 5], pay: 800 },
  { id: "build", event: "place", text: "Place {n} blocks", n: [100, 300, 600], pay: 8 },
  { id: "crawl", event: "crawler", text: "Collect {n} items from crawlers", n: [64, 256, 512], pay: 10 },
  { id: "stack", event: "stack_kill", text: "Kill {n} spawner mobs", n: [50, 150, 300], pay: 25 },
];

export const today = () => Math.floor((Date.now() + CONFIG.timezoneOffsetHours * 3600000) / 86400000);

/** Today's quests for a player, rolled fresh when the day changes. */
export function questsOf(p) {
  const d = today();
  if (p.quests.day !== d) {
    const pool = POOL.slice();
    const list = [];
    for (let i = 0; i < 3; i++) {
      const q = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const tier = Math.min(2, Math.floor(Math.random() * 3));
      list.push({ id: q.id, goal: q.n[tier], tier, progress: 0, done: false });
    }
    p.quests = { day: d, list, bonus: false };
    S.savePlayer(p);
  }
  return p.quests;
}

export const questDef = (id) => POOL.find((q) => q.id === id);
export const questText = (q) => questDef(q.id).text.replace("{n}", questDef(q.id).money ? E.money(q.goal) : String(q.goal));

export function questReward(q) {
  const d = questDef(q.id);
  const cash = Math.floor(d.money ? q.goal * d.pay : q.goal * d.pay);
  return { cash, xp: 60 + q.tier * 60, crystals: 2 + q.tier * 2 };
}

let rewardGiver = null;
export const setQuestRewardGiver = (fn) => { rewardGiver = fn; };

/** Called by the rest of the addon whenever something quest-worthy happens. */
export function questEvent(player, event, amount = 1) {
  if (!player) return;
  const p = S.playerData(player);
  const qs = questsOf(p);
  let changed = false;
  for (const q of qs.list) {
    if (q.done || questDef(q.id).event !== event) continue;
    q.progress = Math.min(q.goal, q.progress + amount);
    changed = true;
    if (q.progress >= q.goal) {
      q.done = true;
      const r = questReward(q);
      E.addMoney(p, r.cash);
      E.addCrystals(p, r.crystals);
      R.tell(player, `§a✔ Quest complete:§r ${questText(q)} §7(+${E.money(r.cash)}, +${r.crystals} crystals, +${r.xp} XP)`);
      R.sound(player, "random.levelup", 1.4);
      E.addXp(player, p, r.xp);
    }
  }
  if (changed && !qs.bonus && qs.list.every((q) => q.done)) {
    qs.bonus = true;
    R.tell(player, "§6§lAll daily quests done!§r Bonus: an §5Epic crate key§r.");
    if (rewardGiver) rewardGiver(player, "key:epic");
  }
  if (changed) S.savePlayer(p);
}
