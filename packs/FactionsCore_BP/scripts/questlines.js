// Factions Core - quest lines, Quest Levels and rebirth.
//
// Every item you SELL to the server counts toward its quest line. Each item
// has 5 tiers; every tier reached is worth 1 Quest Level. Quest Levels 1-100
// each have a reward to claim at the Quest Master. At Quest Level 100 (with
// all 100 rewards claimed) you can rebirth: quest progress resets, you keep
// money and items, and get big rewards plus a permanent sell bonus.
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { giveReward, rewardLabel } from "./items.js";

export const TIERS = [1, 3, 8, 20, 50]; // x base amount for Tier I-V
export const TIER_NAMES = ["I", "II", "III", "IV", "V"];
export const MAX_LEVEL = 100;

const B = "textures/blocks/";
const IT = "textures/items/";

/** Quest lines. `match` lists every item id that counts (raw and smelted both count). */
export const LINES = [
  {
    id: "lumberjack", name: "Lumberjack", title: "Wood Quests", icon: "lumberjack", banner: "banner_lumberjack", rank: "rank:&6&lLUMBERJACK",
    items: [
      { id: "oak_log", name: "Oak Log", base: 400, icon: B + "log_oak", match: ["oak_log"] },
      { id: "spruce_log", name: "Spruce Log", base: 400, icon: B + "log_spruce", match: ["spruce_log"] },
      { id: "mangrove_log", name: "Mangrove Log", base: 400, icon: B + "mangrove_log_side", match: ["mangrove_log"] },
      { id: "cherry_log", name: "Cherry Log", base: 400, icon: B + "cherry_log_side", match: ["cherry_log"] },
      { id: "crimson_stem", name: "Crimson Stem", base: 300, icon: B + "huge_fungus/crimson_log_side", match: ["crimson_stem"] },
      { id: "warped_stem", name: "Warped Stem", base: 300, icon: B + "huge_fungus/warped_stem_side", match: ["warped_stem"] },
    ],
  },
  {
    id: "miner", name: "Miner", title: "Ore Quests", icon: "haste", banner: "banner_miner", rank: "rank:&b&lMINER",
    items: [
      { id: "copper", name: "Copper", base: 300, icon: IT + "copper_ingot", match: ["copper_ingot", "raw_copper"] },
      { id: "amethyst", name: "Amethyst", base: 150, icon: IT + "amethyst_shard", match: ["amethyst_shard"] },
      { id: "iron", name: "Iron", base: 400, icon: IT + "iron_ingot", match: ["iron_ingot", "raw_iron"] },
      { id: "quartz", name: "Quartz", base: 300, icon: IT + "quartz", match: ["quartz"] },
      { id: "emerald", name: "Emerald", base: 100, icon: IT + "emerald", match: ["emerald"] },
    ],
  },
  {
    id: "farmer", name: "Farmer", title: "Farming Quests", icon: "farming", banner: "banner_farmer", rank: "rank:&a&lFARMER",
    items: [
      { id: "bamboo", name: "Bamboo", base: 2000, icon: IT + "bamboo", match: ["bamboo"] },
      { id: "nether_wart", name: "Nether Wart", base: 800, icon: IT + "nether_wart", match: ["nether_wart"] },
      { id: "beetroot", name: "Beetroot", base: 600, icon: IT + "beetroot", match: ["beetroot"] },
      { id: "pumpkin", name: "Pumpkin", base: 300, icon: B + "pumpkin_face_off", match: ["pumpkin"] },
      { id: "carrot", name: "Carrot", base: 600, icon: IT + "carrot", match: ["carrot"] },
      { id: "potato", name: "Potato", base: 600, icon: IT + "potato", match: ["potato"] },
      { id: "cactus", name: "Cactus", base: 500, icon: B + "cactus_side", match: ["cactus"] },
    ],
  },
  {
    id: "monster", name: "Monster Hunter", title: "Mob Drop Quests", icon: "bounty", banner: "banner_monster", rank: "rank:&c&lMONSTER HUNTER",
    items: [
      { id: "leather", name: "Leather", base: 300, icon: IT + "leather", match: ["leather"] },
      { id: "feather", name: "Feather", base: 400, icon: IT + "feather", match: ["feather"] },
      { id: "slime_ball", name: "Slime Ball", base: 300, icon: IT + "slimeball", match: ["slime_ball"] },
      { id: "rabbit_hide", name: "Rabbit Hide", base: 150, icon: IT + "rabbit_hide", match: ["rabbit_hide"] },
      { id: "bone", name: "Bone", base: 500, icon: IT + "bone", match: ["bone"] },
      { id: "beef", name: "Beef", base: 400, icon: IT + "beef_raw", match: ["beef"] },
      { id: "gunpowder", name: "Gunpowder", base: 400, icon: IT + "gunpowder", match: ["gunpowder"] },
      { id: "porkchop", name: "Porkchop", base: 400, icon: IT + "porkchop_raw", match: ["porkchop"] },
      { id: "spider_eye", name: "Spider Eye", base: 300, icon: IT + "spider_eye", match: ["spider_eye"] },
      { id: "honeycomb", name: "Honeycomb", base: 150, icon: IT + "honeycomb", match: ["honeycomb"] },
    ],
  },
];

const BY_TYPE = new Map(); // "minecraft:oak_log" -> [line, item]
for (const line of LINES) for (const item of line.items) for (const m of item.match) BY_TYPE.set(`minecraft:${m}`, [line, item]);
export const lineById = (id) => LINES.find((l) => l.id === id);
export const totalTiers = (line) => line.items.length * TIERS.length;

export const QUEST_RANKS = [[0, "§7Rookie"], [9, "§aElite"], [25, "§bVeteran"], [50, "§dMaster"], [75, "§6Champion"], [100, "§c§lLegend"]];

// ------------------------------------------------------------ progress

export function ql(p) {
  p.ql ??= { sold: {}, claimed: 0 };
  p.rebirths ??= 0;
  return p.ql;
}

export const soldOf = (p, item) => ql(p).sold[item.id] ?? 0;
export const tierOf = (sold, item) => TIERS.filter((m) => sold >= item.base * m).length;
export const nextTarget = (sold, item) => { const t = tierOf(sold, item); return t >= TIERS.length ? undefined : item.base * TIERS[t]; };
export const lineTiers = (p, line) => line.items.reduce((s, it) => s + tierOf(soldOf(p, it), it), 0);
export const lineDone = (p, line) => lineTiers(p, line) === totalTiers(line);
export const questLevel = (p) => Math.min(MAX_LEVEL, LINES.reduce((s, l) => s + lineTiers(p, l), 0));
export const questRank = (level) => QUEST_RANKS.filter(([at]) => level >= at).pop()[1];
export const nextRank = (level) => QUEST_RANKS.find(([at]) => at > level);
export const sellMultiplier = (p) => Math.min(6, 1 + (p.rebirths ?? 0));

/** The item closest to its next tier, as text. */
export function closest(p, line) {
  let best;
  for (const it of line.items) {
    const sold = soldOf(p, it);
    const target = nextTarget(sold, it);
    if (target === undefined) continue;
    const left = target - sold;
    if (!best || left / target < best.frac) best = { it, left, frac: left / target, tier: tierOf(sold, it) };
  }
  return best ? `${best.it.name} Tier ${TIER_NAMES[best.tier]}, ${E.fmt(best.left)} to go` : "Every item is MAXED!";
}

/** Count items sold to the server. `player` (if online) gets tier-up messages. */
export function recordSold(p, typeId, n, player) {
  const hit = BY_TYPE.get(typeId);
  if (!hit || n <= 0) return;
  const [line, item] = hit;
  const q = ql(p);
  const beforeTier = tierOf(q.sold[item.id] ?? 0, item);
  const wasDone = lineDone(p, line);
  q.sold[item.id] = (q.sold[item.id] ?? 0) + n;
  const afterTier = tierOf(q.sold[item.id], item);
  if (afterTier > beforeTier && player) {
    R.tell(player, `§a${item.name} reached Tier ${TIER_NAMES[afterTier - 1]}!§r §7(${line.name}) §b+${afterTier - beforeTier} Quest Level${afterTier - beforeTier > 1 ? "s" : ""}§r - claim it at the §eQuest Master§r.`);
    R.sound(player, "random.levelup", 1.5);
  }
  if (!wasDone && lineDone(p, line)) {
    R.broadcast(`§e${p.name}§r maxed the §6${line.name}§r quest line and earned the ${line.rank.slice(5).replace(/&([0-9a-v])/g, "§$1")}§r chat rank!`);
    if (player) player.addTag(line.rank);
  }
}

// ------------------------------------------------------------ rewards

/** Rewards for reaching Quest Level L. */
export function levelRewards(L) {
  const r = [];
  if (L % 10 === 0) r.push("key:legendary", `money:${L * 20000}`, "crystals:25");
  else if (L % 5 === 0) r.push("key:epic", `money:${L * 10000}`);
  else if (L % 2 === 0) r.push("key:rare", `money:${L * 5000}`);
  else r.push("key:common", `money:${L * 2500}`);
  if (L === 50) r.push("key:mythic");
  if (L === 100) r.push("key:mythic:2", "bossegg:1");
  return r;
}

export const levelRewardText = (L) => levelRewards(L).map((s) => rewardLabel(s).replace(/§./g, "")).join(" + ");

export function claimLevels(player) {
  const p = S.playerData(player);
  const q = ql(p);
  const level = questLevel(p);
  if (q.claimed >= level) E.fail(level >= MAX_LEVEL ? "You've claimed every reward. Visit the Rebirth Oracle!" : "Nothing to claim yet. Sell items to the server to level up your quest lines.");
  const got = [];
  for (let L = q.claimed + 1; L <= level; L++) for (const spec of levelRewards(L)) got.push(giveReward(player, spec));
  const n = level - q.claimed;
  q.claimed = level;
  S.savePlayer(p);
  R.tell(player, `§6Claimed ${n} Quest Level reward${n > 1 ? "s" : ""}:§r ${got.slice(0, 8).join("§r, ")}${got.length > 8 ? `§r and ${got.length - 8} more` : ""}`);
  R.sound(player, "random.levelup", 1.2);
}

// ------------------------------------------------------------ rebirth

export const REBIRTH_REWARDS = (n) => [
  { label: "Money $25M", icon: "coin", spec: "money:25000000" },
  { label: "Spawners x16", icon: "spawner", spec: ["spawner:skeleton:4", "spawner:creeper:4", "spawner:blaze:4", "spawner:enderman:4"] },
  { label: "Mythic Keys x8", icon: "key_mythic", spec: "key:mythic:8" },
  { label: `Sells pay x${Math.min(6, n + 1)}`, icon: "sell" },
  { label: "Epic Keys x16", icon: "key_epic", spec: "key:epic:16" },
  { label: `Chat badge R${n}`, icon: "rebirth" },
];

export const canRebirth = (p) => questLevel(p) >= MAX_LEVEL && ql(p).claimed >= MAX_LEVEL;

export function rebirth(player) {
  const p = S.playerData(player);
  if (!canRebirth(p)) E.fail(`Reach Quest Level ${MAX_LEVEL} and claim every reward first (you're at ${questLevel(p)}, claimed ${ql(p).claimed}).`);
  p.rebirths = (p.rebirths ?? 0) + 1;
  for (const r of REBIRTH_REWARDS(p.rebirths)) for (const spec of [r.spec ?? []].flat()) giveReward(player, spec);
  p.ql = { sold: {}, claimed: 0 };
  S.savePlayer(p);
  R.broadcast(`§6§l${player.name} REBIRTHED!§r They are now §6Rebirth ${p.rebirths}§r and sales pay §ax${sellMultiplier(p)}§r.`);
  for (const pl of player.dimension.getPlayers()) R.sound(pl, "random.totem", 1, 0.6);
}
