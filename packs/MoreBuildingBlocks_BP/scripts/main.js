// More Building Blocks - door and slab behaviour.
// Generated into the behavior pack by tools/build.py (lists below are filled in).
import { system, world, ItemStack } from "@minecraft/server";

const NS = "mbb";
const SLABS = new Set(["mbb:maple_slab", "mbb:redwood_slab", "mbb:ebony_slab", "mbb:willow_slab", "mbb:ash_slab", "mbb:azure_slab", "mbb:marble_slab", "mbb:slate_tile_slab", "mbb:limestone_brick_slab", "mbb:red_granite_brick_slab", "mbb:jade_brick_slab", "mbb:polished_onyx_slab"]);
const DOORS = {"mbb:maple_door": "wood", "mbb:redwood_door": "wood", "mbb:ebony_door": "wood", "mbb:willow_door": "wood", "mbb:ash_door": "wood", "mbb:azure_door": "wood", "mbb:marble_door": "stone", "mbb:slate_tile_door": "stone", "mbb:limestone_brick_door": "stone", "mbb:red_granite_brick_door": "stone", "mbb:jade_brick_door": "stone", "mbb:polished_onyx_door": "stone"}; // door id -> "wood" | "stone"

const isCreative = (player) => String(player.getGameMode()).toLowerCase() === "creative";

// Direction to the player's left when facing a cardinal direction.
const LEFT_OF = { north: "west", south: "east", east: "north", west: "south" };

function offset(block, dir) {
  try {
    switch (String(dir).toLowerCase()) {
      case "up": return block.above();
      case "down": return block.below();
      case "north": return block.north();
      case "south": return block.south();
      case "east": return block.east();
      case "west": return block.west();
    }
  } catch { /* unloaded */ }
  return undefined;
}

// ---------------------------------------------------------------- doors

/** Both halves of a door (uses the multi-block API, with a manual fallback). */
function doorParts(block) {
  if (typeof block.getParts === "function") {
    const parts = block.getParts();
    if (parts && parts.length) return parts;
  }
  const part = block.permutation.getState("minecraft:multi_block_part");
  const other = part === 0 ? block.above() : block.below();
  return other && other.typeId === block.typeId ? [block, other] : [block];
}

function setDoorState(block, state, value) {
  for (const p of doorParts(block)) {
    p.setPermutation(p.permutation.withState(state, value));
  }
}

function playDoorSound(block, open) {
  const stone = DOORS[block.typeId] === "stone";
  block.dimension.playSound(open ? "random.door_open" : "random.door_close", block.center(), {
    pitch: stone ? 0.75 : 0.9 + Math.random() * 0.1,
    volume: 1,
  });
}

const DoorComponent = {
  onPlayerInteract({ block }) {
    const open = !block.permutation.getState(`${NS}:open`);
    setDoorState(block, `${NS}:open`, open);
    playDoorSound(block, open);
  },

  beforeOnPlayerPlace(event) {
    const perm = event.permutationToPlace;
    const facing = perm.getState("minecraft:cardinal_direction");
    // Like vanilla: placing next to another door that is hinged on the left
    // puts this door's hinge on the right, making a double door.
    const neighbour = offset(event.block, LEFT_OF[facing]);
    let hingeRight = false;
    if (neighbour && neighbour.typeId in DOORS) {
      const n = neighbour.permutation;
      hingeRight =
        n.getState("minecraft:cardinal_direction") === facing && !n.getState(`${NS}:hinge_right`);
    }
    event.permutationToPlace = perm.withState(`${NS}:hinge_right`, hingeRight);
    const placed = event.block;
    system.run(() => {
      try {
        if (placed.typeId in DOORS) setDoorState(placed, `${NS}:hinge_right`, hingeRight);
      } catch { /* block gone */ }
    });
  },
};

// A broken door always gives back exactly one door item (survival only).
world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation }) => {
  const id = brokenBlockPermutation.type.id;
  if (!(id in DOORS) || isCreative(player)) return;
  block.dimension.spawnItem(new ItemStack(id, 1), block.center());
});

// ---------------------------------------------------------------- slabs

function halfFromFace(face, faceLocation, block) {
  const f = String(face).toLowerCase();
  if (f === "up") return "bottom";
  if (f === "down") return "top";
  let y = faceLocation ? faceLocation.y : 0;
  if (y > 1.0001) y -= block.location.y; // absolute -> relative
  return y - Math.floor(y) > 0.5 ? "top" : "bottom";
}

/** Find the slab that would become a double slab for this click, if any. */
function slabToDouble(block, face, faceLocation, slabId) {
  const f = String(face).toLowerCase();
  if (block.typeId === slabId && !block.permutation.getState(`${NS}:double`)) {
    const half = block.permutation.getState("minecraft:vertical_half");
    if ((half === "bottom" && f === "up") || (half === "top" && f === "down")) return block;
  }
  const adj = offset(block, face);
  if (adj && adj.typeId === slabId && !adj.permutation.getState(`${NS}:double`)) {
    const wanted = halfFromFace(face, faceLocation, block);
    if (adj.permutation.getState("minecraft:vertical_half") !== wanted) return adj;
  }
  return undefined;
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const item = event.itemStack;
  if (!item || !SLABS.has(item.typeId)) return;
  const target = slabToDouble(event.block, event.blockFace, event.faceLocation, item.typeId);
  if (!target) return;
  event.cancel = true;
  if (event.isFirstEvent === false) return;
  const { player } = event;
  const slabId = item.typeId;
  system.run(() => {
    if (target.typeId !== slabId || target.permutation.getState(`${NS}:double`)) return;
    target.setPermutation(target.permutation.withState(`${NS}:double`, true));
    target.dimension.playSound(DOORS[slabId.replace("_slab", "_door")] === "wood"
      ? "use.wood" : "use.stone", target.center());
    if (isCreative(player)) return;
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) return;
    const slot = player.selectedSlotIndex;
    const held = container.getItem(slot);
    if (!held || held.typeId !== slabId) return;
    if (held.amount > 1) {
      held.amount -= 1;
      container.setItem(slot, held);
    } else {
      container.setItem(slot, undefined);
    }
  });
});

// ---------------------------------------------------------------- register

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent(`${NS}:door`, DoorComponent);
});
