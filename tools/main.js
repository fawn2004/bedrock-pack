// More Building Blocks - door and slab behaviour.
// Generated into the behavior pack by tools/build.py (lists below are filled in).
import { system, world, ItemStack, BlockPermutation } from "@minecraft/server";

const NS = "mbb";
const SLABS = new Set(__SLABS__);
const DOORS = __DOORS__; // door id -> "wood" | "stone"
const STAIRS = new Set(__STAIRS__);
const LOGS = __LOGS__; // log id -> stripped log id
const WOOD_SLABS = new Set(__WOOD_SLABS__);
const TREES = __TREES__; // name -> [vanilla feature, [vanilla log ids], our wood]

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
    target.dimension.playSound(WOOD_SLABS.has(slabId) ? "use.wood" : "use.stone", target.center());
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

// ---------------------------------------------------------------- stairs
// Corner shapes use the same rules as vanilla stairs, so corners always line
// up. Our stairs also join up with vanilla stairs.

const OPPOSITE = { north: "south", south: "north", east: "west", west: "east" };
const AXIS = { north: "z", south: "z", east: "x", west: "x" };
const VANILLA_DIR = ["east", "west", "south", "north"]; // weirdo_direction 0..3

function stairInfo(block) {
  if (!block) return undefined;
  const id = block.typeId;
  const p = block.permutation;
  if (STAIRS.has(id)) {
    return { dir: p.getState("minecraft:cardinal_direction"), top: p.getState("minecraft:vertical_half") === "top" };
  }
  if (id.startsWith("minecraft:") && id.endsWith("_stairs")) {
    const w = p.getState("weirdo_direction");
    if (w === undefined) return undefined;
    return { dir: VANILLA_DIR[w], top: !!p.getState("upside_down_bit") };
  }
  return undefined;
}

function stairShape(block, me) {
  const canTakeShape = (dir) => {
    const n = stairInfo(offset(block, dir));
    return !n || n.dir !== me.dir || n.top !== me.top;
  };
  const front = stairInfo(offset(block, me.dir));
  if (front && front.top === me.top && AXIS[front.dir] !== AXIS[me.dir] && canTakeShape(OPPOSITE[front.dir])) {
    return front.dir === LEFT_OF[me.dir] ? "outer_left" : "outer_right";
  }
  const back = stairInfo(offset(block, OPPOSITE[me.dir]));
  if (back && back.top === me.top && AXIS[back.dir] !== AXIS[me.dir] && canTakeShape(back.dir)) {
    return back.dir === LEFT_OF[me.dir] ? "inner_left" : "inner_right";
  }
  return "straight";
}

function refreshStairs(block) {
  try {
    if (!block || !STAIRS.has(block.typeId)) return;
    const shape = stairShape(block, stairInfo(block));
    if (block.permutation.getState(`${NS}:shape`) !== shape) {
      block.setPermutation(block.permutation.withState(`${NS}:shape`, shape));
    }
  } catch { /* unloaded */ }
}

function refreshStairsAround(block) {
  refreshStairs(block);
  for (const dir of ["north", "south", "east", "west"]) refreshStairs(offset(block, dir));
}

world.afterEvents.playerPlaceBlock.subscribe(({ block }) => refreshStairsAround(block));
world.afterEvents.playerBreakBlock.subscribe(({ block }) => refreshStairsAround(block));

// ---------------------------------------------------------------- logs
// Use an axe on a log to strip it, like vanilla.

function damageHeldItem(player) {
  if (isCreative(player)) return;
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  const slot = player.selectedSlotIndex;
  const item = container.getItem(slot);
  const durability = item?.getComponent("minecraft:durability");
  if (!durability) return;
  if (durability.damage + 1 >= durability.maxDurability) {
    container.setItem(slot, undefined);
    player.dimension.playSound("random.break", player.location);
  } else {
    durability.damage += 1;
    container.setItem(slot, item);
  }
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const stripped = LOGS[event.block.typeId];
  const item = event.itemStack;
  if (!stripped || !item) return;
  let isAxe = false;
  try { isAxe = item.hasTag("minecraft:is_axe"); } catch { /* ignore */ }
  if (!isAxe && !item.typeId.endsWith("_axe")) return;
  event.cancel = true;
  if (event.isFirstEvent === false) return;
  const { block, player } = event;
  system.run(() => {
    if (LOGS[block.typeId] !== stripped) return;
    const face = block.permutation.getState("minecraft:block_face");
    block.setPermutation(BlockPermutation.resolve(stripped, { "minecraft:block_face": face }));
    block.dimension.playSound("use.wood", block.center());
    damageHeldItem(player);
  });
});

// ---------------------------------------------------------------- trees
// "/scriptevent mbb:tree <name> [dx dz]" (what /function mbb/trees/<name>
// runs) grows a real vanilla tree with Minecraft's own generator, then walks
// that tree from its base and swaps its logs for our wood, keeping each
// log's direction, and makes its leaves persistent so they never decay.

const AXIS_TO_FACE = { y: "up", x: "east", z: "north" };

function findGround(dimension, x, y, z) {
  for (let yy = Math.floor(y) + 8; yy >= Math.floor(y) - 12; yy--) {
    let b;
    try { b = dimension.getBlock({ x, y: yy, z }); } catch { return undefined; }
    if (!b) return undefined;
    if (!b.isAir && !b.isLiquid && !b.typeId.endsWith("_leaves") && !b.typeId.includes("grass") &&
        !b.typeId.includes("fern") && !b.typeId.includes("flower") && b.typeId !== "minecraft:snow_layer") {
      return { x, y: yy + 1, z };
    }
  }
  return undefined;
}

function convertTree(dimension, base, logIds, wood) {
  const logs = new Set(logIds);
  const ourLog = `${NS}:${wood}_log`;
  const key = (p) => `${p.x},${p.y},${p.z}`;
  const seen = new Set();
  const queue = [];
  // the trunk starts at (or right next to) the spot the tree was grown on
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = -1; dy <= 2; dy++) {
        const p = { x: base.x + dx, y: base.y + dy, z: base.z + dz };
        const b = dimension.getBlock(p);
        if (b && logs.has(b.typeId)) { queue.push(p); seen.add(key(p)); }
      }
  const logCells = [];
  while (queue.length && logCells.length < 4000) {
    const p = queue.shift();
    const b = dimension.getBlock(p);
    if (!b || !logs.has(b.typeId)) continue;
    logCells.push(p);
    const axis = b.permutation.getState("pillar_axis") ?? "y";
    b.setPermutation(BlockPermutation.resolve(ourLog, { "minecraft:block_face": AXIS_TO_FACE[axis] ?? "up" }));
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
          if (Math.abs(q.x - base.x) > 20 || Math.abs(q.z - base.z) > 20 || q.y < base.y - 2) continue;
          const k = key(q);
          if (seen.has(k)) continue;
          seen.add(k);
          const nb = dimension.getBlock(q);
          if (nb && logs.has(nb.typeId)) queue.push(q);
        }
  }
  // leaves round the tree: make them persistent so they never decay
  const leafSeen = new Set();
  const lq = logCells.map((p) => [p, 0]);
  while (lq.length) {
    const [p, d] = lq.shift();
    if (d >= 7) continue;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
      const k = key(q);
      if (leafSeen.has(k)) continue;
      leafSeen.add(k);
      const lb = dimension.getBlock(q);
      if (!lb || !lb.typeId.includes("leaves")) continue;
      try {
        if (lb.permutation.getState("persistent_bit") === false) {
          lb.setPermutation(lb.permutation.withState("persistent_bit", true));
        }
      } catch { /* leaves without the state */ }
      lq.push([q, d + 1]);
    }
  }
  return logCells.length;
}

function growTree(name, origin, dimension, player) {
  const def = TREES[name];
  if (!def) {
    player?.sendMessage(`§cUnknown tree "${name}". Try: ${Object.keys(TREES).join(", ")}`);
    return;
  }
  const [feature, logIds, wood] = def;
  const spot = findGround(dimension, Math.floor(origin.x), origin.y, Math.floor(origin.z));
  if (!spot) {
    player?.sendMessage("§cCouldn't find ground to grow the tree on here.");
    return;
  }
  let ok = false;
  try {
    if (typeof dimension.placeFeature === "function") {
      ok = dimension.placeFeature(feature, spot, false);
    } else {
      // older script API: use the /place command instead
      const r = dimension.runCommand(`place feature ${feature} ${spot.x} ${spot.y} ${spot.z}`);
      ok = (r?.successCount ?? 1) > 0;
    }
  } catch (e) {
    player?.sendMessage(`§cMinecraft couldn't grow ${name}: ${e}`);
    return;
  }
  if (!ok) {
    player?.sendMessage(`§eNo room to grow ${name} here — try open grass or dirt with space above.`);
    return;
  }
  convertTree(dimension, spot, logIds, wood);
}

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== `${NS}:tree`) return;
  const source = event.sourceEntity ?? event.initiator;
  const where = source ?? event.sourceBlock;
  if (!where) return;
  const parts = event.message.trim().split(/\s+/);
  const name = parts[0];
  const dx = Number(parts[1] ?? 0) || 0;
  const dz = Number(parts[2] ?? 0) || 0;
  const loc = where.location;
  const player = source?.typeId === "minecraft:player" ? source : undefined;
  system.run(() => growTree(name, { x: loc.x + dx, y: loc.y, z: loc.z + dz }, where.dimension, player));
});

// ---------------------------------------------------------------- register

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent(`${NS}:door`, DoorComponent);
});
