// Factions Core - daily login rewards with a 7-day streak.
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { giveReward } from "./items.js";
import { today } from "./quests.js";

export const DAYS = [
  ["money:2500", "crystals:3"],
  ["money:5000", "key:common"],
  ["money:7500", "crystals:8"],
  ["money:10000", "key:rare"],
  ["money:15000", "book:rare", "crystals:10"],
  ["money:25000", "key:epic"],
  ["money:50000", "key:legendary", "crystals:25"],
];

/** { canClaim, day (0-6 index of the next reward), streak } */
export function dailyState(p) {
  const d = today();
  const broke = p.daily.last < d - 1;
  const streak = broke ? 0 : p.daily.streak;
  return { canClaim: p.daily.last !== d, day: streak % 7, streak };
}

export function claimDaily(player) {
  const p = S.playerData(player);
  const st = dailyState(p);
  if (!st.canClaim) E.fail("You already claimed today's reward. Come back tomorrow!");
  const got = DAYS[st.day].map((spec) => giveReward(player, spec));
  p.daily = { last: today(), streak: st.streak + 1 };
  S.savePlayer(p);
  R.tell(player, `§6Day ${st.day + 1} reward:§r ${got.join("§r, ")}§r. Streak: §e${p.daily.streak}§r day(s).`);
  R.sound(player, "random.levelup", 1.2);
}
