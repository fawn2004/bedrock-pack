// Factions Core - land protection and PvP rules.
import { world, Player } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";

const DOOR_LIKE = ["door", "fence_gate", "button", "lever", "pressure_plate"];
const isDoorLike = (typeId) => DOOR_LIKE.some((w) => typeId.includes(w));

// Entities with storage or that hold items: protected like chests.
const PROTECTED_ENTITIES = new Set([
  "minecraft:armor_stand",
  "minecraft:chest_minecart",
  "minecraft:hopper_minecart",
  "minecraft:chest_boat",
  "minecraft:leash_knot",
]);

const FACE_OFFSET = {
  Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0],
};

let lastWarn = new Map();
function deny(player, what) {
  const now = Date.now();
  if ((lastWarn.get(player.id) ?? 0) + 1500 > now) return;
  lastWarn.set(player.id, now);
  const owner = S.getFaction(S.ownerAt(player.dimension.id, player.location));
  player.onScreenDisplay.setActionBar(`§cYou can't ${what} in ${owner ? owner.name : "this land"}'s territory`);
}

export function setupProtection() {
  world.beforeEvents.playerBreakBlock.subscribe((e) => {
    if (!R.canBuild(e.player, e.dimension.id, e.block.location)) {
      e.cancel = true;
      deny(e.player, "break blocks");
    }
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
    const { player, block } = e;
    const dimId = block.dimension.id;
    // Placing: the new block lands next to the clicked face, maybe in another chunk.
    // (Clicking a door you may use just opens it, so that's left alone.)
    const door = isDoorLike(block.typeId);
    if (e.itemStack && !(door && R.canUse(player, dimId, block.location, true))) {
      const o = FACE_OFFSET[e.blockFace] ?? [0, 0, 0];
      const at = { x: block.location.x + o[0], y: block.location.y + o[1], z: block.location.z + o[2] };
      if (!R.canBuild(player, dimId, at)) {
        e.cancel = true;
        if (e.isFirstEvent) deny(player, "build");
        return;
      }
    }
    if (!R.canUse(player, dimId, block.location, door)) {
      e.cancel = true;
      if (e.isFirstEvent) deny(player, "use that");
    }
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((e) => {
    if (!PROTECTED_ENTITIES.has(e.target.typeId)) return;
    if (!R.canBuild(e.player, e.target.dimension.id, e.target.location)) {
      e.cancel = true;
      deny(e.player, "use that");
    }
  });

  world.beforeEvents.explosion.subscribe((e) => {
    if (CONFIG.explosionsInClaims === "always") return;
    const dimId = e.dimension.id;
    const blocks = e.getImpactedBlocks();
    const keep = blocks.filter((b) => {
      const owner = S.ownerAt(dimId, b.location);
      if (!owner) return true;
      if (S.getFaction(owner)?.system) return false;
      return CONFIG.explosionsInClaims === "raidable" && R.isRaidable(owner);
    });
    if (keep.length !== blocks.length) e.setImpactedBlocks(keep);
  });

  world.beforeEvents.entityHurt.subscribe((e) => {
    const victim = e.hurtEntity;
    let attacker = e.damageSource.damagingEntity;
    if (!(attacker instanceof Player)) return;
    if (!(victim instanceof Player)) {
      // Animals, villagers, armor stands etc. on someone else's land are protected.
      if (attacker.id === victim.id) return;
      let hostile = false;
      try { hostile = victim.matches({ families: ["monster"] }); } catch { /* removed */ }
      if (!hostile && !R.canBuild(attacker, victim.dimension.id, victim.location)) e.cancel = true;
      return;
    }
    if (attacker.id === victim.id) return;
    if (inSafeZone(victim) || inSafeZone(attacker)) { e.cancel = true; return; }
    const rel = R.relation(S.playerData(attacker).faction, S.playerData(victim).faction);
    if (rel === "own" || rel === "ally" || rel === "truce") {
      e.cancel = true;
      deny2(attacker, rel === "own" ? "your own faction" : `your ${rel}`);
    }
  });
}

function inSafeZone(player) {
  return S.ownerAt(player.dimension.id, player.location) === S.SAFEZONE;
}

function deny2(player, who) {
  const now = Date.now();
  if ((lastWarn.get(player.id) ?? 0) + 1500 > now) return;
  lastWarn.set(player.id, now);
  player.onScreenDisplay.setActionBar(`§cYou can't hurt ${who}`);
}
