// Factions Core - the server shop: buy and sell prices, selling helpers.
import { ItemStack } from "@minecraft/server";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { giveItem, spawnerItem, crawlerItem, SPAWNERS, CRAWLERS, keyItem, bookItem, genbucketItem, busterItem, wandItem, xpShardItem, powerShardItem, mysteryItem } from "./items.js";
import { questEvent } from "./quests.js";

// [item, buy price (0 = can't buy), sell price (0 = can't sell)]
export const CATEGORIES = {
  blocks: {
    name: "Building Blocks", icon: "blocks", items: [
      ["stone", 12, 1], ["cobblestone", 8, 1], ["dirt", 6, 0.5], ["grass_block", 20, 0], ["sand", 10, 1], ["gravel", 10, 1],
      ["oak_log", 30, 3], ["spruce_log", 30, 3], ["glass", 25, 0], ["stone_bricks", 25, 0], ["smooth_stone", 25, 0],
      ["quartz_block", 120, 0], ["glowstone", 90, 0], ["sea_lantern", 150, 0], ["obsidian", 400, 20], ["end_stone", 60, 0],
      ["deepslate_bricks", 40, 0], ["black_concrete", 40, 0], ["white_concrete", 40, 0], ["cyan_concrete", 40, 0],
    ],
  },
  ores: {
    name: "Ores & Minerals", icon: "ores", items: [
      ["coal", 30, 6], ["copper_ingot", 40, 8], ["raw_copper", 0, 6], ["iron_ingot", 80, 18], ["raw_iron", 0, 14],
      ["gold_ingot", 110, 24], ["raw_gold", 0, 18], ["redstone", 30, 5], ["lapis_lazuli", 40, 8], ["quartz", 40, 7],
      ["amethyst_shard", 50, 9], ["diamond", 550, 120], ["emerald", 700, 160], ["netherite_scrap", 0, 900], ["netherite_ingot", 18000, 4000],
    ],
  },
  farming: {
    name: "Farming", icon: "farming", items: [
      ["wheat_seeds", 10, 0], ["wheat", 0, 4], ["carrot", 15, 3], ["potato", 15, 3], ["beetroot", 0, 4], ["melon_slice", 0, 2],
      ["pumpkin", 0, 10], ["sugar_cane", 20, 4], ["cactus", 20, 4], ["cocoa_beans", 20, 5], ["nether_wart", 30, 6], ["bamboo", 10, 1],
      ["kelp", 10, 1], ["bone_meal", 20, 0], ["bread", 25, 0], ["cooked_beef", 40, 0], ["golden_carrot", 120, 0],
    ],
  },
  mobs: {
    name: "Mob Drops", icon: "mobs", items: [
      ["rotten_flesh", 0, 3], ["bone", 30, 6], ["string", 30, 6], ["spider_eye", 0, 6], ["gunpowder", 60, 14], ["ender_pearl", 220, 45],
      ["blaze_rod", 180, 40], ["slime_ball", 100, 18], ["leather", 50, 8], ["feather", 0, 3], ["beef", 0, 5], ["porkchop", 0, 5],
      ["chicken", 0, 4], ["magma_cream", 0, 20], ["ghast_tear", 0, 120], ["phantom_membrane", 0, 40], ["ink_sac", 0, 4],
    ],
  },
  raiding: {
    name: "Raiding & PvP", icon: "raid", items: [
      ["tnt", 1800, 0], ["redstone_block", 300, 0], ["repeater", 120, 0], ["dispenser", 250, 0], ["observer", 200, 0],
      ["water_bucket", 150, 0], ["lava_bucket", 250, 0], ["cobweb", 120, 0], ["flint_and_steel", 100, 0], ["arrow", 8, 0],
      ["golden_apple", 1500, 0], ["enchanted_golden_apple", 60000, 0], ["totem_of_undying", 80000, 0], ["experience_bottle", 150, 0],
    ],
  },
};

/** Things bought with money that aren't plain vanilla items. @type {any[]} */
export const SPECIALS = [
  ...Object.keys(SPAWNERS).map((t) => ({ id: `spawner:${t}`, name: `${SPAWNERS[t].name} Spawner`, price: SPAWNERS[t].value, icon: "spawner", give: (n) => spawnerItem(t, n) })),
  ...Object.keys(CRAWLERS).map((t) => ({ id: `crawler:${t}`, name: CRAWLERS[t].name, price: CRAWLERS[t].value, icon: "crawler", give: () => crawlerItem(t), single: true })),
];

/** Bought with crystals. */
export const CRYSTAL_SHOP = [
  { id: "key_common", name: "Common Crate Key", price: 15, icon: "key_common", give: (n) => keyItem("common", n) },
  { id: "key_rare", name: "Rare Crate Key", price: 40, icon: "key_rare", give: (n) => keyItem("rare", n) },
  { id: "key_epic", name: "Epic Crate Key", price: 120, icon: "key_epic", give: (n) => keyItem("epic", n) },
  { id: "key_legendary", name: "Legendary Crate Key", price: 400, icon: "key_legendary", give: (n) => keyItem("legendary", n) },
  { id: "book_rare", name: "Random Rare Book", price: 30, icon: "book_rare", give: () => bookItem("rare"), single: true },
  { id: "book_epic", name: "Random Epic Book", price: 90, icon: "book_epic", give: () => bookItem("epic"), single: true },
  { id: "book_legendary", name: "Random Legendary Book", price: 300, icon: "book_legendary", give: () => bookItem("legendary"), single: true },
  { id: "genbucket", name: "Cobble Genbucket", price: 2, icon: "genbucket", give: (n) => genbucketItem("cobble", n) },
  { id: "genbucket_obsidian", name: "Obsidian Genbucket", price: 6, icon: "genbucket_obsidian", give: (n) => genbucketItem("obsidian", n) },
  { id: "genbucket_sand", name: "Sand Genbucket", price: 3, icon: "genbucket_sand", give: (n) => genbucketItem("sand", n) },
  { id: "buster", name: "Chunk Buster", price: 150, icon: "chunk_buster", give: (n) => busterItem(n) },
  { id: "wand", name: "Sell Wand (100 uses)", price: 60, icon: "sell_wand", give: () => wandItem(100), single: true },
  { id: "xpshard", name: "XP Shard", price: 8, icon: "xp_shard", give: (n) => xpShardItem(n) },
  { id: "power", name: "Power Shard", price: 25, icon: "power_shard", give: (n) => powerShardItem(n) },
  { id: "mystery", name: "Mystery Spawner", price: 500, icon: "mystery_spawner", give: (n) => mysteryItem(n) },
];

const SELL = new Map();
const BUY = new Map();
for (const c of Object.values(CATEGORIES)) for (const [id, buy, sell] of c.items) {
  if (sell) SELL.set(`minecraft:${id}`, sell);
  if (buy) BUY.set(`minecraft:${id}`, buy);
}

/** Sell price for one of this item, or 0. Named or enchanted items can't be sold. */
export function sellPrice(item) {
  if (!item) return 0;
  const price = SELL.get(item.typeId) ?? 0;
  if (!price) return 0;
  try { if (item.nameTag || item.getLore().length) return 0; } catch { /* */ }
  return price;
}
export const sellPriceOf = (typeId) => SELL.get(typeId) ?? 0;

/** Sells everything sellable in a container. Returns { total, count }. */
export function sellContainer(container, filterSlot) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < container.size; i++) {
    if (filterSlot !== undefined && i !== filterSlot) continue;
    const it = container.getItem(i);
    const price = sellPrice(it);
    if (!price) continue;
    total += price * it.amount;
    count += it.amount;
    container.setItem(i, undefined);
  }
  return { total: Math.floor(total), count };
}

export function paySale(player, total) {
  if (total <= 0) return;
  const p = S.playerData(player);
  E.addMoney(p, total);
  questEvent(player, "sell", total);
  R.sound(player, "random.orb", 1.2);
}

export function sellHand(player) {
  const inv = player.getComponent("minecraft:inventory").container;
  const r = sellContainer(inv, player.selectedSlotIndex);
  if (!r.count) E.fail("You can't sell what you're holding.");
  paySale(player, r.total);
  R.tell(player, `Sold §e${r.count}§r items for §a${E.money(r.total)}§r.`);
}

export function sellAll(player) {
  const inv = player.getComponent("minecraft:inventory").container;
  const r = sellContainer(inv);
  if (!r.count) E.fail("You have nothing to sell. Ores, crops and mob drops sell well!");
  paySale(player, r.total);
  R.tell(player, `Sold §e${r.count}§r items for §a${E.money(r.total)}§r.`);
}

export function buyVanilla(player, id, amount) {
  const price = BUY.get(`minecraft:${id}`);
  if (!price) E.fail("That can't be bought.");
  const p = S.playerData(player);
  E.takeMoney(p, price * amount, `${amount} ${id.replace(/_/g, " ")}`);
  let left = amount;
  while (left > 0) {
    const stack = new ItemStack(`minecraft:${id}`, 1);
    const n = Math.min(left, stack.maxAmount);
    stack.amount = n;
    giveItem(player, stack);
    left -= n;
  }
  R.tell(player, `Bought §e${amount}x ${id.replace(/_/g, " ")}§r for §c${E.money(price * amount)}§r.`);
  R.sound(player, "random.pop");
}

export function buySpecial(player, entry, amount, crystals) {
  const p = S.playerData(player);
  if (entry.single) amount = 1;
  const cost = entry.price * amount;
  if (crystals) E.takeCrystals(p, cost, entry.name);
  else E.takeMoney(p, cost, entry.name);
  if (entry.single) giveItem(player, entry.give(1));
  else giveItem(player, entry.give(amount));
  R.tell(player, `Bought §e${amount}x ${entry.name}§r for ${crystals ? `§b${cost} crystals` : `§c${E.money(cost)}`}§r.`);
  R.sound(player, "random.levelup", 1.6, 0.6);
}
