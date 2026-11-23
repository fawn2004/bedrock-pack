// Factions Core - ore crawlers: little machines that dig ores for you.
// Place one on your land; it wanders a few blocks and fills its storage.
// Upgrade it, collect or auto-sell. Enemies can steal it if they take the land.
import { system, world, ItemStack } from "@minecraft/server";
import { RARITY } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { CRAWLERS, CRAWLER_TIERS, crawlerItem, giveItem } from "./items.js";
import { sellPriceOf, paySale, paySaleRecord } from "./shop.js";
import { questEvent } from "./quests.js";

export const ENTITY = "fc:crawler";

// [weight, item, min, max]
const LOOT = {
  coal: [[70, "coal", 1, 2], [20, "cobblestone", 2, 4], [10, "raw_copper", 1, 2]],
  iron: [[55, "raw_iron", 1, 2], [30, "coal", 2, 3], [15, "raw_copper", 2, 3]],
  gold: [[45, "raw_gold", 1, 2], [35, "raw_iron", 2, 3], [10, "lapis_lazuli", 2, 4], [10, "redstone", 3, 5]],
  diamond: [[35, "diamond", 1, 1], [35, "raw_gold", 2, 3], [15, "lapis_lazuli", 3, 5], [15, "redstone", 4, 7]],
  emerald: [[35, "emerald", 1, 1], [45, "diamond", 1, 2], [20, "raw_gold", 3, 4]],
  netherite: [[25, "netherite_scrap", 1, 1], [40, "diamond", 2, 2], [35, "emerald", 1, 2]],
};

export const UPGRADES = {
  speed: { name: "Speed", desc: "Digs 15% faster per level", max: 3, cost: [40000, 120000, 350000] },
  fortune: { name: "Fortune", desc: "+50% ore per dig per level", max: 3, cost: [50000, 150000, 400000] },
  storage: { name: "Storage", desc: "Holds 512 more items per level", max: 3, cost: [20000, 60000, 150000] },
  autosell: { name: "Auto-Sell", desc: "Sells ores straight to your balance", max: 1, cost: [250000] },
};
export const upgradeCost = (type, id, lvl) => Math.floor(UPGRADES[id].cost[lvl] * (1 + CRAWLERS[type].tier * 0.6));

export function info(ent) {
  const type = ent.getDynamicProperty("fc:ctype") ?? "coal";
  return {
    type,
    def: CRAWLERS[type],
    owner: ent.getDynamicProperty("fc:owner"),
    ownerName: ent.getDynamicProperty("fc:ownerName") ?? "?",
    fid: ent.getDynamicProperty("fc:fid"),
    storage: JSON.parse(ent.getDynamicProperty("fc:storage") ?? "{}"),
    upgrades: JSON.parse(ent.getDynamicProperty("fc:upgrades") ?? "{}"),
    mined: ent.getDynamicProperty("fc:mined") ?? 0,
    sold: ent.getDynamicProperty("fc:sold") ?? 0,
  };
}

export const capacity = (c) => 512 * (1 + (c.upgrades.storage ?? 0));
export const stored = (c) => Object.values(c.storage).reduce((s, n) => s + n, 0);
export const storedValue = (c) => Object.entries(c.storage).reduce((s, [id, n]) => s + sellPriceOf(`minecraft:${id}`) * n, 0);

function save(ent, c) {
  ent.setDynamicProperty("fc:storage", JSON.stringify(c.storage));
  ent.setDynamicProperty("fc:upgrades", JSON.stringify(c.upgrades));
  ent.setDynamicProperty("fc:mined", c.mined);
  ent.setDynamicProperty("fc:sold", c.sold);
  label(ent, c);
}

function label(ent, c) {
  const r = RARITY[c.def.rarity];
  const full = stored(c) >= capacity(c);
  ent.nameTag = `${r.color}§l${c.def.name}\n§r§7${c.ownerName}  ${c.upgrades.autosell ? "§aAUTO-SELL" : full ? "§cFULL" : `§f${stored(c)}§8/${capacity(c)}`}`;
}

function register(ent, c) {
  const all = S.kv.get("crawlers", {});
  const l = ent.location;
  all[ent.id] = { type: c.type, dim: ent.dimension.id, x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z), seen: Date.now(), owner: c.owner };
  S.kv.set("crawlers", all);
}

function unregister(id) {
  const all = S.kv.get("crawlers", {});
  if (all[id]) { delete all[id]; S.kv.set("crawlers", all); }
}

/** Places a crawler from the item in the player's hand. */
export function place(player, block, face, item) {
  const type = item.typeId.slice("fc:crawler_".length);
  if (!CRAWLERS[type]) return;
  const p = S.playerData(player);
  const at = { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 };
  const owner = S.ownerAt(player.dimension.id, at);
  if (!R.hasBypass(player) && (!p.faction || owner !== p.faction)) E.fail("Crawlers can only be placed on your faction's land.");
  const above = player.dimension.getBlock(at);
  if (!above?.isAir) E.fail("There's no room there.");
  let upgrades = {};
  try { upgrades = JSON.parse(item.getDynamicProperty("upgrades") ?? "{}"); } catch { /* */ }
  const ent = player.dimension.spawnEntity(ENTITY, at);
  ent.setProperty("fc:tier", CRAWLERS[type].tier);
  ent.setDynamicProperty("fc:ctype", type);
  ent.setDynamicProperty("fc:owner", player.id);
  ent.setDynamicProperty("fc:ownerName", player.name);
  ent.setDynamicProperty("fc:fid", p.faction ?? "");
  const c = info(ent);
  c.upgrades = upgrades;
  save(ent, c);
  register(ent, c);
  // Use up the item.
  const inv = player.getComponent("minecraft:inventory").container;
  const held = inv.getItem(player.selectedSlotIndex);
  if (held?.typeId === item.typeId) {
    if (held.amount > 1) { held.amount--; inv.setItem(player.selectedSlotIndex, held); } else inv.setItem(player.selectedSlotIndex, undefined);
  }
  R.tell(player, `Placed a ${RARITY[CRAWLERS[type].rarity].color}${CRAWLERS[type].name}§r! It digs ores every ${CRAWLERS[type].seconds}s. Tap it to manage it.`);
  R.sound(player, "random.anvil_land", 1.6, 0.6);
}

/** Who may manage (collect, upgrade, pick up) this crawler? */
export function canManage(player, ent) {
  if (R.hasBypass(player)) return true;
  const c = info(ent);
  const land = S.ownerAt(ent.dimension.id, ent.location);
  const p = S.playerData(player);
  if (c.owner === player.id) return true;
  if (p.faction && land === p.faction) return true; // your land: yours (even if stolen!)
  return false;
}

export function collect(player, ent) {
  const c = info(ent);
  let n = 0;
  const inv = player.getComponent("minecraft:inventory").container;
  for (const [id, count] of Object.entries(c.storage)) {
    let left = count;
    while (left > 0) {
      const st = new ItemStack(`minecraft:${id}`, Math.min(64, left));
      const rest = inv.addItem(st);
      const given = st.amount - (rest?.amount ?? 0);
      left -= given;
      n += given;
      if (rest) break;
    }
    if (left > 0) c.storage[id] = left; else delete c.storage[id];
  }
  save(ent, c);
  questEvent(player, "crawler", n);
  R.tell(player, n ? `Collected §e${n}§r items.${stored(c) ? " §7(your inventory is full)" : ""}` : "Nothing to collect yet.");
}

export function sellStorage(player, ent) {
  const c = info(ent);
  const total = Math.floor(storedValue(c));
  const n = stored(c);
  if (!n) E.fail("Nothing to sell yet.");
  const items = Object.fromEntries(Object.entries(c.storage).map(([id, k]) => [`minecraft:${id}`, k]));
  c.storage = {};
  const paid = paySale(player, total, items);
  c.sold += paid;
  save(ent, c);
  questEvent(player, "crawler", n);
  R.tell(player, `Sold §e${n}§r ores for §a${E.money(paid)}§r.`);
}

export function buyUpgrade(player, ent, id) {
  const c = info(ent);
  const u = UPGRADES[id];
  const lvl = c.upgrades[id] ?? 0;
  if (lvl >= u.max) E.fail(`${u.name} is maxed.`);
  const cost = upgradeCost(c.type, id, lvl);
  E.takeMoney(S.playerData(player), cost, `${u.name} ${lvl + 1}`);
  c.upgrades[id] = lvl + 1;
  save(ent, c);
  R.tell(player, `Upgraded §b${u.name}§r to level §b${lvl + 1}§r.`);
  R.sound(player, "random.levelup", 1.3);
}

export function pickUp(player, ent) {
  const c = info(ent);
  if (stored(c)) collect(player, ent);
  const left = info(ent);
  if (stored(left)) E.fail("Make room to collect its storage first.");
  const stolen = c.owner !== player.id;
  giveItem(player, crawlerItem(c.type, c.upgrades));
  unregister(ent.id);
  ent.remove();
  R.tell(player, `${stolen ? "§cYou stole§r" : "Picked up"} the ${c.def.name}.`);
  if (stolen) {
    const o = R.onlineById(c.owner);
    if (o) R.tell(o, `§c${player.name} stole your ${c.def.name}!`);
  }
}

export const nextTier = (type) => CRAWLER_TIERS[CRAWLER_TIERS.indexOf(type) + 1];
export const evolveCost = (type) => (nextTier(type) ? Math.floor((CRAWLERS[nextTier(type)].value - CRAWLERS[type].value) * 1.1) : 0);

/** Turns a crawler into the next tier, keeping its upgrades and storage. */
export function evolve(player, ent) {
  const c = info(ent);
  const nt = nextTier(c.type);
  if (!nt) E.fail("This crawler is already the best there is.");
  E.takeMoney(S.playerData(player), evolveCost(c.type), `evolving to a ${CRAWLERS[nt].name}`);
  ent.setDynamicProperty("fc:ctype", nt);
  ent.setProperty("fc:tier", CRAWLERS[nt].tier);
  const n = info(ent);
  save(ent, n);
  register(ent, n);
  ent.dimension.spawnParticle("minecraft:totem_particle", ent.location);
  R.sound(player, "random.totem", 1.2, 0.6);
  R.tell(player, `Your crawler evolved into a ${RARITY[CRAWLERS[nt].rarity].color}${CRAWLERS[nt].name}§r!`);
  if (CRAWLERS[nt].tier >= 4) R.broadcast(`§e${player.name}§r evolved a ${RARITY[CRAWLERS[nt].rarity].color}${CRAWLERS[nt].name}§r!`);
}

function pickLoot(type) {
  const table = LOOT[type];
  const total = table.reduce((s, x) => s + x[0], 0);
  let r = Math.random() * total;
  for (const [w, id, min, max] of table) {
    r -= w;
    if (r <= 0) return [id, min + Math.floor(Math.random() * (max - min + 1))];
  }
  return [table[0][1], table[0][2]];
}

const next = new Map();

function work(ent) {
  const now = Date.now();
  const c = info(ent);
  if (!c.def) return;
  const f = S.getFaction(S.ownerAt(ent.dimension.id, ent.location));
  const speed = (1 + (c.upgrades.speed ?? 0) * 0.15) * (1 + R.upgradeLevel(f, "crawlers") * 0.1);
  const due = next.get(ent.id);
  if (due === undefined) { next.set(ent.id, now + (c.def.seconds * 1000) / speed); label(ent, c); return; }
  if (due > now) return;
  next.set(ent.id, now + (c.def.seconds * 1000) / speed);

  let [id, n] = pickLoot(c.type);
  const fortune = c.upgrades.fortune ?? 0;
  n = Math.floor(n * (1 + fortune * 0.5) + Math.random());
  c.mined += n;

  // Rare finds.
  if (Math.random() < 0.01 * (c.def.tier + 1)) {
    ent.dimension.spawnItem(new ItemStack("fc:crystal", 1), ent.location);
  }
  if (Math.random() < 0.001 * (c.def.tier + 1)) {
    ent.dimension.spawnItem(new ItemStack("fc:key_rare", 1), ent.location);
  }

  if (c.upgrades.autosell) {
    const total = Math.floor(sellPriceOf(`minecraft:${id}`) * n);
    const owner = S.getPlayerRecord(c.owner);
    if (owner && total > 0) c.sold += paySaleRecord(owner, total, { [`minecraft:${id}`]: n });
  } else if (stored(c) < capacity(c)) {
    c.storage[id] = (c.storage[id] ?? 0) + Math.min(n, capacity(c) - stored(c));
  }
  save(ent, c);
  try {
    ent.dimension.spawnParticle("minecraft:villager_happy", { x: ent.location.x, y: ent.location.y + 0.8, z: ent.location.z });
    ent.dimension.playSound("dig.stone", ent.location, { volume: 0.4, pitch: 1.2 });
    ent.playAnimation("animation.fc_crawler.dig");
  } catch { /* */ }
}

export function setupCrawlers() {
  system.runInterval(() => {
    const all = S.kv.get("crawlers", {});
    let changed = false;
    for (const dimId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
      let ents = [];
      try { ents = world.getDimension(dimId).getEntities({ type: ENTITY }); } catch { continue; }
      for (const ent of ents) {
        try {
          work(ent);
          const rec = all[ent.id];
          if (!rec || Date.now() - rec.seen > 600000) {
            const l = ent.location;
            all[ent.id] = { type: info(ent).type, dim: dimId, x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z), seen: Date.now(), owner: info(ent).owner };
            changed = true;
          }
        } catch { /* */ }
      }
    }
    // Forget crawlers that haven't been seen for a week.
    for (const [id, rec] of Object.entries(all)) if (Date.now() - rec.seen > 7 * 86400000) { delete all[id]; changed = true; }
    if (changed) S.kv.set("crawlers", all);
  }, 20);
}
