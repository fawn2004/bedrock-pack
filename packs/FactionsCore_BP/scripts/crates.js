// Factions Core - crates: weighted loot tables and the roll animation.
import { system } from "@minecraft/server";
import { RARITY } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { giveReward, rewardLabel, rewardRarity, takeItems, countItems, KEY } from "./items.js";
import { questEvent } from "./quests.js";
import { lockTitle } from "./hud.js";

// [weight, reward]
export const LOOT = {
  common: [
    [14, "money:2500"], [8, "money:5000"], [10, "crystals:3"], [16, "book:common"], [6, "book:rare"],
    [8, "item:iron_ingot:32"], [6, "item:diamond:4"], [6, "item:golden_apple:4"], [6, "xpshard:2"],
    [5, "genbucket:cobble:16"], [3, "spawner:pig"], [3, "spawner:chicken"], [3, "crawler:coal"], [3, "wand:10"], [4, "key:rare"],
  ],
  rare: [
    [12, "money:15000"], [6, "money:30000"], [8, "crystals:10"], [14, "book:rare"], [5, "book:epic"], [4, "key:epic"],
    [6, "item:diamond:16"], [5, "item:golden_apple:16"], [2, "item:enchanted_golden_apple:1"], [5, "spawner:cow"],
    [4, "spawner:zombie"], [3, "spawner:spider"], [5, "crawler:iron"], [2, "crawler:gold"], [4, "gear:scout_boots"],
    [4, "gear:miner_helm"], [2, "gear:vampire_fang"], [4, "power:2"], [4, "genbucket:obsidian:16"], [3, "wand:50"], [4, "xpshard:6"],
  ],
  epic: [
    [10, "money:75000"], [8, "crystals:30"], [14, "book:epic"], [4, "book:legendary"], [3, "key:legendary"],
    [6, "spawner:skeleton"], [4, "spawner:creeper"], [2, "spawner:blaze"], [6, "crawler:gold"], [2, "crawler:diamond"],
    [5, "gear:prospector"], [5, "gear:vampire_fang"], [1, "gear:stormbringer"], [3, "item:netherite_ingot:2"],
    [3, "item:enchanted_golden_apple:3"], [2, "item:totem_of_undying:1"], [2, "buster:1"], [4, "mystery:1"], [5, "xpshard:16"],
  ],
  legendary: [
    [10, "money:300000"], [8, "crystals:100"], [14, "book:legendary"], [3, "book:mythic"], [2, "key:mythic"],
    [6, "spawner:blaze"], [3, "spawner:enderman"], [6, "crawler:diamond"], [2, "crawler:emerald"],
    [4, "gear:frostbite_blade"], [4, "gear:inferno_axe"], [4, "gear:stormbringer"], [4, "gear:excavator"],
    [3, "gear:titan_helmet"], [3, "gear:titan_chest"], [3, "gear:titan_legs"], [3, "gear:titan_boots"],
    [2, "item:elytra:1"], [4, "item:netherite_ingot:8"], [5, "mystery:2"], [4, "buster:2"],
  ],
  mythic: [
    [10, "money:1500000"], [8, "crystals:500"], [12, "book:mythic"], [3, "spawner:iron_golem"], [8, "spawner:enderman"],
    [6, "crawler:emerald"], [2, "crawler:netherite"], [3, "gear:reaper"], [6, "gear:excavator"], [6, "gear:frostbite_blade"],
    [4, "gear:titan_helmet"], [4, "gear:titan_chest"], [4, "gear:titan_legs"], [4, "gear:titan_boots"],
    [4, "item:elytra:1"], [6, "key:legendary:3"],
    // Boss eggs only come from Mythic crates.
    [6, "bossegg:1"], [4, "bossegg:2"], [3, "bossegg:3"], [1, "bossegg:4"],
  ],
};

export function roll(rarity) {
  const table = LOOT[rarity];
  const total = table.reduce((s, [w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [w, spec] of table) { r -= w; if (r <= 0) return spec; }
  return table[0][1];
}

/** Lines describing a crate's loot with chances, rarest first. */
export function previewLines(rarity) {
  const table = LOOT[rarity];
  const total = table.reduce((s, [w]) => s + w, 0);
  return table
    .slice()
    .sort((a, b) => a[0] - b[0])
    .map(([w, spec]) => `${rewardLabel(spec)} §7- ${((w / total) * 100).toFixed(1)}%`);
}

const opening = new Set();

/** Uses a key from the player's inventory and plays the roll. */
export function openCrate(player, rarity) {
  if (opening.has(player.id)) throw new E.Fail("You're already opening a crate!");
  if (countItems(player, KEY(rarity)) < 1) throw new E.Fail(`You need a ${RARITY[rarity].color}${RARITY[rarity].name} Crate Key§r. Get them from quests, daily rewards, levels, envoys and KOTH.`);
  takeItems(player, KEY(rarity), 1);
  opening.add(player.id);
  lockTitle(player, 5000);
  const final = roll(rarity);
  const delays = [2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6, 7, 9, 12];
  let i = 0;
  const color = RARITY[rarity].color;
  const step = () => {
    try {
      if (i < delays.length) {
        const show = i === delays.length - 1 ? final : roll(rarity);
        player.onScreenDisplay.setTitle(`${color}§l${RARITY[rarity].name.toUpperCase()} CRATE`, { subtitle: `§8» ${rewardLabel(show)} §8«`, fadeInDuration: 0, stayDuration: 40, fadeOutDuration: 0 });
        R.sound(player, "note.pling", 0.8 + i * 0.08, 0.7);
        system.runTimeout(step, delays[i++]);
        return;
      }
      const label = giveReward(player, final);
      const rr = rewardRarity(final);
      player.onScreenDisplay.setTitle(`${RARITY[rr].color}§l${RARITY[rr].name.toUpperCase()}!`, { subtitle: label, fadeInDuration: 0, stayDuration: 50, fadeOutDuration: 10 });
      R.sound(player, RARITY[rr].order >= 3 ? "random.totem" : "random.levelup");
      try { player.dimension.spawnParticle("minecraft:totem_particle", { ...player.location, y: player.location.y + 1 }); } catch { /* */ }
      R.tell(player, `You opened a ${color}${RARITY[rarity].name} Crate§r and won ${label}§r!`);
      if (RARITY[rr].order >= 3) R.broadcast(`§e${player.name}§r won ${label}§r from a ${color}${RARITY[rarity].name} Crate§r!`);
      const p = S.playerData(player);
      p.cratesOpened++;
      S.savePlayer(p);
      questEvent(player, "crate");
    } catch { /* player left */ }
    opening.delete(player.id);
  };
  step();
}
