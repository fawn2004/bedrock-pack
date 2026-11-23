// Factions Core - custom items, legendary gear and rewards.
import { ItemStack, EnchantmentTypes, ItemLockMode } from "@minecraft/server";
import { RARITY, RARITIES } from "./config.js";
import * as E from "./economy.js";
import { ENCHANTS, enchantLine, roman, writeEnchants } from "./enchants.js";

// ------------------------------------------------------------ item builder

/**
 * Makes an ItemStack with a name, lore and (for stack-1 items) data.
 * @param {string} id
 * @param {{ amount?: number, name?: string, lore?: string[], data?: Record<string, any>, keep?: boolean, lock?: boolean }} [o]
 */
export function makeItem(id, o = {}) {
  const { amount = 1, name, lore, data, keep, lock } = o;
  const it = new ItemStack(id, amount);
  if (name) it.nameTag = name;
  if (lore) it.setLore(lore);
  if (data) it.setDynamicProperties(data);
  if (keep) it.keepOnDeath = true;
  if (lock) it.lockMode = ItemLockMode.inventory;
  return it;
}

/** Puts an item in a player's inventory, dropping what doesn't fit at their feet. */
export function giveItem(player, item) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const left = inv ? inv.addItem(item) : item;
  if (left) player.dimension.spawnItem(left, player.location);
}

/** Removes `amount` of an item type from a player's inventory. Returns how many were taken. */
export function takeItems(player, typeId, amount) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return 0;
  let need = amount;
  for (let i = 0; i < inv.size && need > 0; i++) {
    const it = inv.getItem(i);
    if (!it || it.typeId !== typeId) continue;
    const n = Math.min(need, it.amount);
    need -= n;
    if (n === it.amount) inv.setItem(i, undefined);
    else { it.amount -= n; inv.setItem(i, it); }
  }
  return amount - need;
}

export function countItems(player, typeId) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  let n = 0;
  if (inv) for (let i = 0; i < inv.size; i++) { const it = inv.getItem(i); if (it?.typeId === typeId) n += it.amount; }
  return n;
}

// ------------------------------------------------------------ custom items

export const KEY = (r) => `fc:key_${r}`;
export const BOOK = (r) => `fc:book_${r}`;

export function crystalItem(n = 1) {
  return makeItem("fc:crystal", { amount: n, lore: ["§r§7A rare gem. Right-click to", "§r§7add it to your crystal balance."] });
}

export function keyItem(rarity, n = 1) {
  const r = RARITY[rarity];
  return makeItem(KEY(rarity), { amount: n, name: `${r.color}§l${r.name} Crate Key`, lore: [`§r§7Opens a ${r.color}${r.name} Crate§7.`, "§r§7Right-click to open, or use", "§r§7it on a crate at spawn."] });
}

/** An enchant book. Random enchant of that rarity unless one is given. */
export function bookItem(rarity, enchId, level) {
  const pool = Object.entries(ENCHANTS).filter(([, e]) => e.rarity === rarity);
  if (!enchId) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    enchId = pick[0];
    level = 1 + Math.floor(Math.random() * pick[1].max);
  }
  const e = ENCHANTS[enchId];
  level = Math.min(level ?? e.max, e.max);
  const rate = 25 + Math.floor(Math.random() * 76);
  const r = RARITY[e.rarity];
  return makeItem(BOOK(e.rarity), {
    name: `${r.color}§l${e.name} ${roman(level)}`,
    lore: [
      `§r§7${e.desc}.`,
      `§r§7Goes on: §f${e.on.includes("*") ? "anything" : e.on.join(", ")}`,
      `§r§aSuccess rate: ${rate}%`,
      `§r${r.color}${r.name} Enchant Book`,
      "§r§8Right-click to apply to an item.",
    ],
    data: { ench: enchId, lvl: level, rate },
  });
}

export function noteItem(value) {
  return makeItem("fc:bank_note", { name: `§a§lBank Note §r§f${E.money(value)}`, lore: ["§r§7Right-click to deposit", `§r§7${E.money(value)} into your balance.`], data: { value } });
}

export function wandItem(uses) {
  return makeItem("fc:sell_wand", { name: "§6§lSell Wand", lore: ["§r§7Right-click a chest to sell", "§r§7everything inside it.", `§r§eUses left: ${uses}`], data: { uses } });
}

export const SPAWNERS = {
  pig: { name: "Pig", mob: "minecraft:pig", value: 25000, rarity: "common" },
  chicken: { name: "Chicken", mob: "minecraft:chicken", value: 25000, rarity: "common" },
  cow: { name: "Cow", mob: "minecraft:cow", value: 35000, rarity: "common" },
  zombie: { name: "Zombie", mob: "minecraft:zombie", value: 75000, rarity: "rare" },
  spider: { name: "Spider", mob: "minecraft:spider", value: 100000, rarity: "rare" },
  skeleton: { name: "Skeleton", mob: "minecraft:skeleton", value: 110000, rarity: "rare" },
  creeper: { name: "Creeper", mob: "minecraft:creeper", value: 180000, rarity: "epic" },
  blaze: { name: "Blaze", mob: "minecraft:blaze", value: 400000, rarity: "epic" },
  enderman: { name: "Enderman", mob: "minecraft:enderman", value: 550000, rarity: "legendary" },
  iron_golem: { name: "Iron Golem", mob: "minecraft:iron_golem", value: 1000000, rarity: "mythic" },
};

export function spawnerItem(type, n = 1) {
  const s = SPAWNERS[type];
  const r = RARITY[s.rarity];
  return makeItem(`fc:spawner_${type}`, { amount: n, lore: [`§r${r.color}${r.name} Spawner`, `§r§7Value: §a${E.money(s.value)}`, "§r§7Place on your land. Use another", "§r§7on it to stack them."] });
}

export const CRAWLERS = {
  coal: { tier: 0, name: "Coal Crawler", rarity: "common", value: 15000, seconds: 30 },
  iron: { tier: 1, name: "Iron Crawler", rarity: "common", value: 60000, seconds: 30 },
  gold: { tier: 2, name: "Gold Crawler", rarity: "rare", value: 180000, seconds: 35 },
  diamond: { tier: 3, name: "Diamond Crawler", rarity: "epic", value: 600000, seconds: 40 },
  emerald: { tier: 4, name: "Emerald Crawler", rarity: "legendary", value: 1500000, seconds: 45 },
  netherite: { tier: 5, name: "Netherite Crawler", rarity: "mythic", value: 4000000, seconds: 60 },
};
export const CRAWLER_TIERS = Object.keys(CRAWLERS);

export function crawlerItem(type, upgrades = {}) {
  const c = CRAWLERS[type];
  const r = RARITY[c.rarity];
  const up = Object.entries(upgrades).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ");
  return makeItem(`fc:crawler_${type}`, {
    name: `${r.color}§l${c.name}`,
    lore: [`§r${r.color}${r.name} Ore Crawler`, "§r§7A little machine that digs ores", "§r§7for you, even while you're away.", `§r§7Value: §a${E.money(c.value)}`, up ? `§r§bUpgrades: ${up}` : "§r§8No upgrades yet", "§r§8Right-click the ground on your land."],
    data: { upgrades: JSON.stringify(upgrades) },
  });
}

export function genbucketItem(kind, n = 1) {
  const block = kind === "obsidian" ? "Obsidian" : kind === "sand" ? "Sand" : "Cobblestone";
  return makeItem(kind === "obsidian" ? "fc:genbucket_obsidian" : kind === "sand" ? "fc:genbucket_sand" : "fc:genbucket", { amount: n, lore: [`§r§7Use on a block to build a`, `§r§7${block} wall straight down.`, "§r§8Only on your own land or wilderness."] });
}

export const busterItem = (n = 1) => makeItem("fc:chunk_buster", { amount: n, lore: ["§r§7Use on your own land to clear", "§r§7the whole chunk below you.", "§r§cCan't be undone!"] });
export const xpShardItem = (n = 1) => makeItem("fc:xp_shard", { amount: n, lore: ["§r§7Right-click for §b+250 level XP§7."] });
export const powerShardItem = (n = 1) => makeItem("fc:power_shard", { amount: n, lore: ["§r§7Right-click for §c+2 power§7", "§r§7(up to your max)."] });
export const mysteryItem = (n = 1) => makeItem("fc:mystery_spawner", { amount: n, lore: ["§r§7Right-click to reveal a", "§r§7random spawner!"] });
export const menuItem = () => makeItem("fc:menu", { lore: ["§r§7Right-click to open the", "§r§7server menu."], keep: true, lock: true });

// ------------------------------------------------------------ legendary gear

const ench = (it, list) => {
  const comp = it.getComponent("minecraft:enchantable");
  if (!comp) return;
  for (const [id, level] of list) {
    try { comp.addEnchantment({ type: EnchantmentTypes.get(id), level }); } catch { /* not allowed */ }
  }
};

export const GEAR = {
  frostbite_blade: { item: "minecraft:netherite_sword", name: "§b§lFrostbite Blade", rarity: "legendary", vanilla: [["sharpness", 5], ["unbreaking", 3]], custom: { frostbite: 3, lifesteal: 2 } },
  inferno_axe: { item: "minecraft:netherite_axe", name: "§6§lInferno Cleaver", rarity: "legendary", vanilla: [["sharpness", 4], ["unbreaking", 3]], custom: { blaze: 2, executioner: 2, rage: 1 } },
  stormbringer: { item: "minecraft:diamond_sword", name: "§e§lStormbringer", rarity: "legendary", vanilla: [["sharpness", 5], ["fire_aspect", 1]], custom: { thunder: 3, blind: 1, swiftness: 2 } },
  vampire_fang: { item: "minecraft:iron_sword", name: "§4§lVampire Fang", rarity: "epic", vanilla: [["sharpness", 3], ["unbreaking", 2]], custom: { lifesteal: 3, venom: 2, swiftness: 1 } },
  reaper: { item: "minecraft:netherite_sword", name: "§c§lThe Reaper", rarity: "mythic", vanilla: [["sharpness", 5], ["unbreaking", 3], ["looting", 3]], custom: { obliterate: 1, wither: 2, plunder: 3, soulbound: 1 } },
  excavator: { item: "minecraft:netherite_pickaxe", name: "§d§lExcavator 3000", rarity: "legendary", vanilla: [["efficiency", 5], ["unbreaking", 3], ["fortune", 3]], custom: { explosive: 3, autosmelt: 1, telepathy: 1 } },
  prospector: { item: "minecraft:diamond_pickaxe", name: "§a§lProspector's Pick", rarity: "epic", vanilla: [["efficiency", 4], ["fortune", 2]], custom: { treasure: 3, haste: 2, experience: 2 } },
  titan_helmet: { item: "minecraft:netherite_helmet", name: "§3§lTitan Helm", rarity: "legendary", vanilla: [["protection", 4], ["unbreaking", 3]], custom: { nightvision: 1, berserk: 2 } },
  titan_chest: { item: "minecraft:netherite_chestplate", name: "§3§lTitan Chestplate", rarity: "legendary", vanilla: [["protection", 4], ["unbreaking", 3]], custom: { overload: 2, fireshield: 1 } },
  titan_legs: { item: "minecraft:netherite_leggings", name: "§3§lTitan Greaves", rarity: "legendary", vanilla: [["protection", 4], ["unbreaking", 3]], custom: { dodge: 2, armored: 3 } },
  titan_boots: { item: "minecraft:netherite_boots", name: "§3§lTitan Boots", rarity: "legendary", vanilla: [["protection", 4], ["feather_falling", 4]], custom: { speed: 2, jump: 1 } },
  scout_boots: { item: "minecraft:diamond_boots", name: "§9§lScout Boots", rarity: "rare", vanilla: [["protection", 3]], custom: { speed: 1 } },
  miner_helm: { item: "minecraft:iron_helmet", name: "§9§lMiner's Lamp", rarity: "rare", vanilla: [["protection", 2]], custom: { nightvision: 1, aquatic: 1 } },
};

export function gearItem(id) {
  const g = GEAR[id];
  const it = makeItem(g.item, { name: g.name });
  ench(it, g.vanilla);
  writeEnchants(it, g.custom);
  it.setLore([...it.getLore(), `§r${RARITY[g.rarity].color}§l${RARITY[g.rarity].name.toUpperCase()}`]);
  return it;
}

// ------------------------------------------------------------ rewards
// A reward is a short text like "money:5000", "key:rare", "spawner:zombie".

export function rewardLabel(spec) {
  const [kind, a, b] = spec.split(":");
  switch (kind) {
    case "money": return `§a${E.money(+a)}`;
    case "crystals": return `§b${a} Crystals`;
    case "key": return `${RARITY[a].color}${RARITY[a].name} Key${b > 1 ? ` x${b}` : ""}`;
    case "book": return `${RARITY[a].color}${RARITY[a].name} Enchant Book`;
    case "spawner": return `${RARITY[SPAWNERS[a].rarity].color}${SPAWNERS[a].name} Spawner${b > 1 ? ` x${b}` : ""}`;
    case "crawler": return `${RARITY[CRAWLERS[a].rarity].color}${CRAWLERS[a].name}`;
    case "gear": return GEAR[a].name;
    case "item": return `§f${a.replace(/_/g, " ")} x${b}`;
    case "xp": return `§b${a} Level XP`;
    case "xpshard": return `§bXP Shard x${a}`;
    case "power": return `§cPower Shard x${a}`;
    case "genbucket": return `§7${a === "obsidian" ? "Obsidian" : a === "sand" ? "Sand" : "Cobble"} Genbucket x${b}`;
    case "buster": return `§cChunk Buster x${a}`;
    case "wand": return `§6Sell Wand (${a} uses)`;
    case "note": return `§aBank Note ${E.money(+a)}`;
    case "mystery": return `§dMystery Spawner x${a}`;
    default: return spec;
  }
}

/** Gives a reward to a player. Returns its label. */
export function giveReward(player, spec) {
  const [kind, a, b] = spec.split(":");
  const p = E.playerRecord(player);
  switch (kind) {
    case "money": E.addMoney(p, +a); break;
    case "crystals": E.addCrystals(p, +a); break;
    case "xp": E.addXp(player, p, +a); break;
    case "key": giveItem(player, keyItem(a, +(b ?? 1))); break;
    case "book": giveItem(player, bookItem(a)); break;
    case "spawner": giveItem(player, spawnerItem(a, +(b ?? 1))); break;
    case "crawler": giveItem(player, crawlerItem(a)); break;
    case "gear": giveItem(player, gearItem(a)); break;
    case "item": giveItem(player, new ItemStack(`minecraft:${a}`, +(b ?? 1))); break;
    case "xpshard": giveItem(player, xpShardItem(+a)); break;
    case "power": giveItem(player, powerShardItem(+a)); break;
    case "genbucket": giveItem(player, genbucketItem(a, +(b ?? 1))); break;
    case "buster": giveItem(player, busterItem(+a)); break;
    case "wand": giveItem(player, wandItem(+a)); break;
    case "note": giveItem(player, noteItem(+a)); break;
    case "mystery": giveItem(player, mysteryItem(+a)); break;
  }
  return rewardLabel(spec);
}

/** Rarity of a reward, for colouring and "rare drop" broadcasts. */
export function rewardRarity(spec) {
  const [kind, a] = spec.split(":");
  if (kind === "key" || kind === "book") return a;
  if (kind === "spawner") return SPAWNERS[a].rarity;
  if (kind === "crawler") return CRAWLERS[a].rarity;
  if (kind === "gear") return GEAR[a].rarity;
  if (kind === "buster" || kind === "mystery") return "epic";
  return "common";
}

export { RARITIES, ENCHANTS, enchantLine };
