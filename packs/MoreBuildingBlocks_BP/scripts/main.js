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
// Each door is two blocks: the bottom half (mbb:upper = false) and the top
// half (mbb:upper = true). The script keeps both halves in sync.

const UPPER = `${NS}:upper`;
const OPEN = `${NS}:open`;
const HINGE = `${NS}:hinge_right`;

/** The other half of a door, if it is still there. */
function otherHalf(block, permutation = block.permutation) {
  try {
    const other = permutation.getState(UPPER) ? block.below() : block.above();
    if (other && other.typeId === permutation.type.id && other.permutation.getState(UPPER) !== permutation.getState(UPPER)) {
      return other;
    }
  } catch { /* unloaded */ }
  return undefined;
}

function setDoorState(block, state, value) {
  const other = otherHalf(block);
  block.setPermutation(block.permutation.withState(state, value));
  if (other) other.setPermutation(other.permutation.withState(state, value));
}

function playDoorSound(block, open) {
  const stone = DOORS[block.typeId] === "stone";
  block.dimension.playSound(open ? "random.door_open" : "random.door_close", block.center(), {
    pitch: stone ? 0.75 : 0.9 + Math.random() * 0.1,
    volume: 1,
  });
}

function dropDoor(player, id, location, dimension) {
  if (player && isCreative(player)) return;
  dimension.spawnItem(new ItemStack(id, 1), { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 });
}

const DoorComponent = {
  onPlayerInteract({ block }) {
    const open = !block.permutation.getState(OPEN);
    setDoorState(block, OPEN, open);
    playDoorSound(block, open);
  },

  beforeOnPlayerPlace(event) {
    const above = event.block.above();
    // Like vanilla: needs a free block above for the top half.
    if (!above || !(above.isAir || above.isLiquid)) {
      event.cancel = true;
      return;
    }
    const perm = event.permutationToPlace;
    const facing = perm.getState("minecraft:cardinal_direction");
    // Placing next to a door hinged on the left makes a double door.
    const neighbour = offset(event.block, LEFT_OF[facing]);
    let hingeRight = false;
    if (neighbour && neighbour.typeId in DOORS) {
      const n = neighbour.permutation;
      hingeRight = n.getState("minecraft:cardinal_direction") === facing && !n.getState(HINGE);
    }
    const bottom = perm.withState(HINGE, hingeRight).withState(UPPER, false);
    event.permutationToPlace = bottom;
    system.run(() => {
      try {
        if (above.isAir || above.isLiquid) above.setPermutation(bottom.withState(UPPER, true));
      } catch { /* unloaded */ }
    });
  },

  // Breaking either half removes the other half and drops one door.
  onPlayerBreak({ block, brokenBlockPermutation, player, dimension }) {
    const other = otherHalf(block, brokenBlockPermutation);
    if (other) other.setType("minecraft:air");
    dropDoor(player, brokenBlockPermutation.type.id, block.location, dimension);
  },
};

// Like vanilla, a door pops off if the block under it is broken.
world.afterEvents.playerBreakBlock.subscribe(({ player, block }) => {
  try {
    const above = block.above();
    if (!above || !(above.typeId in DOORS) || above.permutation.getState(UPPER)) return;
    const id = above.typeId;
    const top = above.above();
    if (top && top.typeId === id) top.setType("minecraft:air");
    above.setType("minecraft:air");
    dropDoor(player, id, above.location, above.dimension);
  } catch { /* unloaded */ }
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
