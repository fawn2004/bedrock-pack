// Factions Core - what happens when you use custom items and blocks.
import { system, world, BlockVolume } from "@minecraft/server";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { RARITIES } from "./config.js";
import { SPAWNERS, spawnerItem, giveItem } from "./items.js";
import { openCrate } from "./crates.js";
import { sellContainer, paySale } from "./shop.js";
import * as Sp from "./spawners.js";
import * as Cr from "./crawlers.js";
import * as Ev from "./events.js";
import * as M from "./menus.js";
import { summon } from "./bosses.js";

/** Runs fn next tick, reporting failures to the player. */
function later(player, fn) {
  system.run(() => {
    try { fn(); } catch (e) {
      if (e instanceof E.Fail) R.tell(player, "§c" + e.message);
      else { R.tell(player, "§cSomething went wrong. Check the content log."); console.error(`[Factions] ${e}\n${e?.stack ?? ""}`); }
    }
  });
}

/** Uses one of the item in the player's selected slot. */
function consumeHeld(player, typeId, n = 1) {
  const inv = player.getComponent("minecraft:inventory").container;
  const it = inv.getItem(player.selectedSlotIndex);
  if (!it || it.typeId !== typeId) return null;
  if (it.amount > n) { it.amount -= n; inv.setItem(player.selectedSlotIndex, it); } else inv.setItem(player.selectedSlotIndex, undefined);
  return it;
}

/** Item used in the air (or on a block that doesn't care). */
function useItem(player, item) {
  const id = item.typeId;
  const p = S.playerData(player);
  if (id === "fc:menu") return M.openHub(player);
  if (id.startsWith("fc:key_")) return openCrate(player, id.slice(7));
  if (id.startsWith("fc:book_")) return M.bookMenu(player);
  if (id === "fc:crystal") {
    const inv = player.getComponent("minecraft:inventory").container;
    const it = inv.getItem(player.selectedSlotIndex);
    if (it?.typeId !== id) return;
    E.addCrystals(p, it.amount);
    inv.setItem(player.selectedSlotIndex, undefined);
    R.tell(player, `§b+${it.amount} crystals§r (you have ${p.crystals}).`);
    return R.sound(player, "random.orb", 1.6);
  }
  if (id === "fc:bank_note") {
    const v = item.getDynamicProperty("value") ?? 0;
    consumeHeld(player, id);
    E.addMoney(p, v);
    R.tell(player, `Cashed a bank note for §a${E.money(v)}§r.`);
    return R.sound(player, "random.orb");
  }
  if (id === "fc:xp_shard") {
    consumeHeld(player, id);
    E.addXp(player, p, 250);
    player.onScreenDisplay.setActionBar("§b+250 level XP");
    return R.sound(player, "random.orb", 1.3);
  }
  if (id === "fc:power_shard") {
    if (p.power >= 10) E.fail("Your power is already full.");
    consumeHeld(player, id);
    R.addPower(p, 2);
    return R.tell(player, `§c+2 power§r (now ${p.power}).`);
  }
  if (id === "fc:mystery_spawner") {
    consumeHeld(player, id);
    const w = { common: 40, rare: 30, epic: 18, legendary: 9, mythic: 3 };
    let r = Math.random() * 100;
    let rarity = "common";
    for (const k of RARITIES) { r -= w[k]; if (r <= 0) { rarity = k; break; } }
    const types = Object.keys(SPAWNERS).filter((t) => SPAWNERS[t].rarity === rarity);
    const type = types[Math.floor(Math.random() * types.length)] ?? "pig";
    giveItem(player, spawnerItem(type));
    player.onScreenDisplay.setTitle("§d§lMYSTERY SPAWNER", { subtitle: `§f${SPAWNERS[type].name} Spawner!`, fadeInDuration: 0, stayDuration: 40, fadeOutDuration: 10 });
    R.sound(player, "random.levelup");
    if (rarity === "legendary" || rarity === "mythic") R.broadcast(`§e${player.name}§r found a §6${SPAWNERS[type].name} Spawner§r in a Mystery Spawner!`);
    return;
  }
  if (id === "fc:sell_wand") return R.tell(player, "Use the sell wand on a chest or barrel to sell what's inside.");
  if (id.startsWith("fc:genbucket") || id === "fc:chunk_buster" || id.startsWith("fc:crawler_") || id.startsWith("fc:boss_egg_")) return R.tell(player, "Use this on a block.");
}

// ------------------------------------------------------------ genbucket & chunk buster

function genbucket(player, block, face, item) {
  const fill = item.typeId === "fc:genbucket_obsidian" ? "minecraft:obsidian" : item.typeId === "fc:genbucket_sand" ? "minecraft:sand" : "minecraft:cobblestone";
  const off = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[face] ?? [0, 1, 0];
  const start = { x: block.location.x + off[0], y: block.location.y + off[1], z: block.location.z + off[2] };
  const dim = player.dimension;
  const owner = S.ownerAt(dim.id, start);
  if (owner && owner !== S.playerData(player).faction && !R.hasBypass(player)) E.fail("Genbuckets only work on your land or in the wilderness.");
  consumeHeld(player, item.typeId);
  let y = start.y;
  const min = dim.heightRange.min;
  let placed = 0;
  const id = system.runInterval(() => {
    try {
      const b = dim.getBlock({ x: start.x, y, z: start.z });
      if (!b || !(b.isAir || b.isLiquid) || y <= min || placed >= 256) { system.clearRun(id); return; }
      b.setType(fill);
      placed++;
      y--;
    } catch { system.clearRun(id); }
  }, 1);
  R.sound(player, "bucket.empty_lava");
}

const busterArm = new Map();

function chunkBuster(player, block) {
  const p = S.playerData(player);
  const dim = player.dimension;
  if (!p.faction || S.ownerAt(dim.id, block.location) !== p.faction) E.fail("Chunk busters only work on your own faction's land.");
  if ((busterArm.get(player.id) ?? 0) < Date.now()) {
    busterArm.set(player.id, Date.now() + 5000);
    return R.tell(player, "§cThis will clear the whole chunk from here down to bedrock. Use it again within 5s to confirm.");
  }
  busterArm.delete(player.id);
  consumeHeld(player, "fc:chunk_buster");
  const c = S.chunkOf(block.location);
  const x0 = c.x * 16;
  const z0 = c.z * 16;
  const top = block.location.y;
  const min = dim.heightRange.min + 1;
  R.tellFaction(p.faction, `§e${player.name}§r is busting the chunk at ${x0}, ${z0}...`);
  const keep = ["minecraft:bedrock", "minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel", "minecraft:ender_chest", "fc:crate_common", "fc:crate_rare", "fc:crate_epic", "fc:crate_legendary", "fc:crate_mythic", ...Object.keys(SPAWNERS).map((t) => `fc:spawner_${t}`)];
  system.runJob((function* () {
    for (let y = top; y >= min; y--) {
      try {
        dim.fillBlocks(new BlockVolume({ x: x0, y, z: z0 }, { x: x0 + 15, y, z: z0 + 15 }), "minecraft:air", { blockFilter: { excludeTypes: keep } });
      } catch { /* unloaded */ }
      if (y % 8 === 0) dim.playSound("random.explode", { x: x0 + 8, y, z: z0 + 8 }, { volume: 0.5 });
      yield;
    }
    try { R.tell(player, "§aChunk busted!"); } catch { /* */ }
  })());
}

// ------------------------------------------------------------ events

const CONTAINERS = /(chest|barrel|shulker_box)$/;

export function setupItemUse() {
  world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
    if (!itemStack?.typeId.startsWith("fc:")) return;
    later(player, () => useItem(player, itemStack));
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
    if (e.cancel) return; // land protection already said no
    const { player, block } = e;
    const item = e.itemStack;
    const bt = block.typeId;
    const it = item?.typeId ?? "";

    // Our blocks.
    if (bt.startsWith("fc:crate_")) {
      e.cancel = true;
      if (!e.isFirstEvent) return;
      const rarity = bt.slice(9);
      if (it === `fc:key_${rarity}`) later(player, () => openCrate(player, rarity));
      else later(player, () => M.cratePreview(player, rarity));
      return;
    }
    if (bt === "fc:supply_drop") {
      e.cancel = true;
      if (e.isFirstEvent) later(player, () => Ev.openSupply(player, block));
      return;
    }
    const st = Sp.spawnerTypeOf(bt);
    if (st) {
      if (it === bt) {
        e.cancel = true;
        if (!e.isFirstEvent) return;
        later(player, () => {
          if (!R.canBuild(player, block.dimension.id, block.location)) E.fail("You can't stack spawners here.");
          const n = player.isSneaking ? item.amount : 1;
          const added = Sp.addToStack(player, block, n);
          if (added) consumeHeld(player, it, added);
        });
        return;
      }
      if (!player.isSneaking || !it) {
        e.cancel = true;
        if (e.isFirstEvent) later(player, () => M.spawnerMenu(player, block));
      }
      return;
    }

    if (!it.startsWith("fc:")) return;
    if (it.startsWith("fc:spawner_")) return; // a block: let it place
    e.cancel = true;
    if (!e.isFirstEvent) return;
    if (it.startsWith("fc:crawler_")) return later(player, () => Cr.place(player, block, e.blockFace, item));
    if (it.startsWith("fc:boss_egg_")) return later(player, () => summon(player, block, Number(it.slice(12))));
    if (it.startsWith("fc:genbucket")) return later(player, () => genbucket(player, block, e.blockFace, item));
    if (it === "fc:chunk_buster") return later(player, () => chunkBuster(player, block));
    if (it === "fc:sell_wand" && CONTAINERS.test(bt)) {
      return later(player, () => {
        const inv = block.getComponent("minecraft:inventory")?.container;
        if (!inv) E.fail("That has no inventory.");
        const r = sellContainer(inv);
        if (!r.count) E.fail("Nothing sellable in there.");
        const paid = paySale(player, r.total, r.items);
        const held = player.getComponent("minecraft:inventory").container.getItem(player.selectedSlotIndex);
        const uses = Number(held?.getDynamicProperty("uses") ?? 1) - 1;
        if (uses <= 0) { consumeHeld(player, "fc:sell_wand"); R.tell(player, "§cYour sell wand broke."); } else if (held) {
          held.setDynamicProperty("uses", uses);
          held.setLore(held.getLore().map((l) => (l.includes("Uses left") ? `§r§eUses left: ${uses}` : l)));
          player.getComponent("minecraft:inventory").container.setItem(player.selectedSlotIndex, held);
        }
        R.tell(player, `Sold §e${r.count}§r items for §a${E.money(paid)}§r.`);
      });
    }
    // Any other custom item tapped on a block acts like using it in the air.
    later(player, () => useItem(player, item));
  });

  world.beforeEvents.playerBreakBlock.subscribe((e) => {
    if (e.cancel) return;
    const bt = e.block.typeId;
    const { player, block } = e;
    if (bt.startsWith("fc:crate_") || bt === "fc:supply_drop") {
      if (R.hasBypass(player)) return;
      e.cancel = true;
      if (bt === "fc:supply_drop") later(player, () => Ev.openSupply(player, block));
      return;
    }
    if (Sp.spawnerTypeOf(bt)) {
      e.cancel = true;
      later(player, () => Sp.pickUp(player, block));
    }
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((e) => {
    if (e.target.typeId !== Cr.ENTITY) return;
    e.cancel = true;
    later(e.player, () => M.crawlerMenu(e.player, e.target));
  });
}
