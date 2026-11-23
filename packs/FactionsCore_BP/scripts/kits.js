// Factions Core - the kit shop. Each kit costs money or crystals each time
// you claim it, and has a cooldown before you can claim it again.
import { ItemStack, EnchantmentTypes } from "@minecraft/server";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { giveItem, giveReward, rewardLabel } from "./items.js";
import { writeEnchants } from "./enchants.js";

/** A vanilla item, optionally with vanilla enchants ([id, level]) and custom enchants ({ id: level }). */
function gear(id, vanilla = [], custom = {}, amount = 1) {
  return () => {
    const it = new ItemStack(`minecraft:${id}`, amount);
    const ench = it.getComponent("minecraft:enchantable");
    for (const [e, lvl] of vanilla) {
      try { ench?.addEnchantment({ type: EnchantmentTypes.get(e), level: lvl }); } catch { /* not allowed on this item */ }
    }
    if (Object.keys(custom).length) writeEnchants(it, custom);
    return it;
  };
}
const stack = (id, amount) => gear(id, [], {}, amount);
const armor = (mat, vanilla, custom = {}) => ["helmet", "chestplate", "leggings", "boots"].map((p) => gear(`${mat}_${p}`, vanilla, custom[p] ?? {}));

/**
 * Kits. `price` is per claim, in `currency` ("money", "crystals" or "free").
 * `items` are functions making ItemStacks; `rewards` use the crate reward format.
 */
export const KITS = [
  {
    id: "starter", name: "Starter", icon: "chest", currency: "free", price: 0, hours: 24,
    desc: "Free every day. Basic tools and food to get going.",
    items: [gear("stone_sword"), gear("stone_pickaxe"), gear("stone_axe"), ...armor("leather", []), stack("bread", 16), stack("torch", 32)],
    rewards: [],
  },
  {
    id: "farmer", name: "Farmer", icon: "farming", currency: "money", price: 10000, hours: 12,
    desc: "Seeds, crops and bone meal to start a farm.",
    items: [gear("iron_hoe", [["efficiency", 3], ["unbreaking", 2]]), stack("wheat_seeds", 32), stack("carrot", 16), stack("potato", 16), stack("bone_meal", 64), stack("water_bucket", 1), stack("sugar_cane", 16)],
    rewards: [],
  },
  {
    id: "miner", name: "Miner", icon: "haste", currency: "money", price: 15000, hours: 12,
    desc: "A good pickaxe, light and food for a long dig.",
    items: [gear("iron_pickaxe", [["efficiency", 3], ["unbreaking", 2]], { haste: 1 }), gear("iron_shovel", [["efficiency", 2]]), stack("torch", 64), stack("cooked_beef", 32)],
    rewards: ["xpshard:3"],
  },
  {
    id: "builder", name: "Builder", icon: "blocks", currency: "money", price: 20000, hours: 12,
    desc: "Blocks and a genbucket to wall in your base.",
    items: [stack("stone_bricks", 64), stack("stone_bricks", 64), stack("glass", 64), stack("oak_log", 64), stack("glowstone", 16)],
    rewards: ["genbucket:cobble:16"],
  },
  {
    id: "warrior", name: "Warrior", icon: "sword", currency: "money", price: 40000, hours: 12,
    desc: "Iron armour, a sharp sword and gapples for PvP.",
    items: [gear("diamond_sword", [["sharpness", 3], ["unbreaking", 2]]), ...armor("iron", [["protection", 2], ["unbreaking", 2]]), gear("bow", [["power", 2]]), stack("arrow", 64), stack("golden_apple", 4), stack("cooked_beef", 32)],
    rewards: [],
  },
  {
    id: "raider", name: "Raider", icon: "raid", currency: "money", price: 100000, hours: 24,
    desc: "TNT, redstone and genbuckets for breaking into bases.",
    items: [stack("tnt", 64), stack("redstone", 64), stack("repeater", 16), stack("dispenser", 8), stack("water_bucket", 1), stack("sand", 64), gear("flint_and_steel")],
    rewards: ["genbucket:obsidian:8", "genbucket:sand:8"],
  },
  {
    id: "diamond", name: "Diamond", icon: "crystal", currency: "money", price: 250000, hours: 48,
    desc: "Full enchanted diamond gear with custom enchants.",
    items: [
      gear("diamond_sword", [["sharpness", 4], ["unbreaking", 3]], { lifesteal: 1 }),
      gear("diamond_pickaxe", [["efficiency", 4], ["fortune", 2], ["unbreaking", 3]], { autosmelt: 1 }),
      ...armor("diamond", [["protection", 3], ["unbreaking", 3]], { boots: { speed: 1 } }),
      stack("golden_apple", 8),
    ],
    rewards: ["key:rare"],
  },
  {
    id: "legend", name: "Legend", icon: "crown", currency: "crystals", price: 500, hours: 72,
    desc: "Netherite gear loaded with custom enchants.",
    items: [
      gear("netherite_sword", [["sharpness", 5], ["unbreaking", 3], ["fire_aspect", 2]], { frostbite: 2, rage: 1 }),
      gear("netherite_pickaxe", [["efficiency", 5], ["fortune", 3], ["unbreaking", 3]], { explosive: 1, telepathy: 1 }),
      ...armor("netherite", [["protection", 4], ["unbreaking", 3]], { chestplate: { overload: 1 }, boots: { speed: 2 }, helmet: { nightvision: 1 } }),
      stack("enchanted_golden_apple", 2),
    ],
    rewards: ["key:legendary"],
  },
];

export const kit = (id) => KITS.find((k) => k.id === String(id).toLowerCase());
export const priceText = (k) => (k.currency === "free" ? "§aFree" : k.currency === "crystals" ? `§b${k.price} crystals` : `§a${E.money(k.price)}`);

/** ms until this kit can be claimed again (0 = ready). */
export function cooldownLeft(p, k) {
  const last = p.kits?.[k.id] ?? 0;
  return Math.max(0, last + k.hours * 3600000 - Date.now());
}

/** Text lines describing what's in a kit. */
export function contents(k) {
  const lines = k.items.map((fn) => {
    const it = fn();
    const custom = it.getLore().filter((l) => l.startsWith("§r")).map((l) => l.replace(/§./g, "")).join(", ");
    return `§f${it.amount > 1 ? `${it.amount}x ` : ""}${it.typeId.split(":")[1].replace(/_/g, " ")}${custom ? ` §d(${custom})` : ""}`;
  });
  return [...lines, ...k.rewards.map((r) => rewardLabel(r))];
}

export function claimKit(player, id) {
  const k = kit(id);
  if (!k) E.fail(`No kit called ${id}. Kits: ${KITS.map((x) => x.id).join(", ")}`);
  const p = S.playerData(player);
  const wait = cooldownLeft(p, k);
  if (wait > 0) E.fail(`You can claim ${k.name} again in ${Math.ceil(wait / 3600000) > 1 ? `${Math.ceil(wait / 3600000)}h` : `${Math.ceil(wait / 60000)}m`}.`);
  if (k.currency === "money") E.takeMoney(p, k.price, `the ${k.name} kit`);
  if (k.currency === "crystals") E.takeCrystals(p, k.price, `the ${k.name} kit`);
  p.kits = { ...(p.kits ?? {}), [k.id]: Date.now() };
  S.savePlayer(p);
  for (const fn of k.items) giveItem(player, fn());
  for (const r of k.rewards) giveReward(player, r);
  R.tell(player, `You claimed the §e${k.name}§r kit!`);
  R.sound(player, "random.levelup", 1.4);
}
