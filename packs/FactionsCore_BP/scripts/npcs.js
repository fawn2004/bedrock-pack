// Factions Core - NPCs that open menus. Admins place them at spawn; players
// tap (or hit) one to open its menu.
//   /fadmin npc <type>     place one where you stand
//   /fadmin npc quests     place all 6 quest NPCs in a half circle around you
//   /fadmin npc remove     remove the nearest NPC
import { system, world, Player } from "@minecraft/server";
import * as R from "./rules.js";
import * as E from "./economy.js";
import * as M from "./menus.js";

export const NPC = "fc:npc";

// skin = texture index in the resource pack (see tools/factions/art.py NPC_SKINS)
export const NPC_TYPES = {
  questmaster: { skin: 0, title: "§6§lQUEST MASTER", sub: "Claim your level rewards", open: (p) => M.questMasterMenu(p) },
  lumberjack: { skin: 1, title: "§6§lLUMBERJACK", sub: "Wood Quests", open: (p) => M.questLineMenu(p, "lumberjack") },
  miner: { skin: 2, title: "§b§lMINER", sub: "Ore Quests", open: (p) => M.questLineMenu(p, "miner") },
  farmer: { skin: 3, title: "§a§lFARMER", sub: "Farming Quests", open: (p) => M.questLineMenu(p, "farmer") },
  monster: { skin: 4, title: "§c§lMONSTER HUNTER", sub: "Mob Drop Quests", open: (p) => M.questLineMenu(p, "monster") },
  rebirth: { skin: 5, title: "§d§lREBIRTH ORACLE", sub: "Rebirth and start again", open: (p) => M.rebirthMenu(p) },
  shop: { skin: 6, title: "§e§lSERVER SHOP", sub: "Buy and sell items", open: (p) => M.shopMenu(p) },
  crates: { skin: 7, title: "§b§lCRATES", sub: "Open your crate keys", open: (p) => M.cratesMenu(p) },
  kits: { skin: 8, title: "§9§lKITS", sub: "Gear bundles", open: (p) => M.kitsMenu(p) },
  auction: { skin: 6, title: "§6§lAUCTION HOUSE", sub: "Buy and sell with players", open: (p) => M.auctionMenu(p) },
  bosses: { skin: 4, title: "§4§lBOSSES", sub: "Boss eggs and drops", open: (p) => M.bossesMenu(p) },
  menu: { skin: 8, title: "§b§lSERVER MENU", sub: "Everything in one place", open: (p) => M.openHub(p) },
};
export const QUEST_NPCS = ["lumberjack", "miner", "questmaster", "rebirth", "farmer", "monster"];

const label = (t) => `${t.title}\n§7${t.sub}\n§a» §fInteract to open §a«`;

export function placeNpc(player, type, at = player.location) {
  const t = NPC_TYPES[type];
  if (!t) throw new E.Fail(`NPC types: ${Object.keys(NPC_TYPES).join(", ")}, quests, remove`);
  const ent = player.dimension.spawnEntity(NPC, at);
  ent.setProperty("fc:skin", t.skin);
  ent.setDynamicProperty("fc:npc", type);
  ent.nameTag = label(t);
  try { ent.teleport(at, { facingLocation: player.location }); } catch { /* */ }
  return ent;
}

/** All 6 quest NPCs in a half circle in front of the player. */
export function placeQuestNpcs(player) {
  const l = player.location;
  const yaw = (player.getRotation().y * Math.PI) / 180;
  QUEST_NPCS.forEach((type, i) => {
    const a = yaw + ((i - (QUEST_NPCS.length - 1) / 2) * Math.PI) / 7;
    const at = { x: l.x - Math.sin(a) * 5, y: l.y, z: l.z + Math.cos(a) * 5 };
    placeNpc(player, type, at);
  });
}

export function removeNearestNpc(player) {
  const near = player.dimension.getEntities({ type: NPC, location: player.location, maxDistance: 6, closest: 1 });
  if (!near.length) throw new E.Fail("No NPC within 6 blocks.");
  near[0].remove();
}

function open(player, ent) {
  const t = NPC_TYPES[ent.getDynamicProperty("fc:npc")];
  if (!t) return;
  R.sound(player, "random.pop", 1.2, 0.6);
  const r = t.open(player);
  if (r instanceof Promise) r.catch((e) => console.error(`[Factions] npc: ${e}`));
}

const lastOpen = new Map();

export function setupNpcs() {
  // Tap / right-click.
  world.beforeEvents.playerInteractWithEntity.subscribe((e) => {
    if (e.target.typeId !== NPC) return;
    e.cancel = true;
    const player = e.player;
    const ent = e.target;
    system.run(() => { lastOpen.set(player.id, Date.now()); open(player, ent); });
  });
  // Hitting one opens it too (handy on PC). NPCs can't be hurt.
  world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
    if (hitEntity.typeId !== NPC || !(damagingEntity instanceof Player)) return;
    if ((lastOpen.get(damagingEntity.id) ?? 0) > Date.now() - 600) return;
    lastOpen.set(damagingEntity.id, Date.now());
    open(damagingEntity, hitEntity);
  });
  // Keep labels up to date if NPC texts change in an update.
  system.runInterval(() => {
    for (const dimId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
      let list = [];
      try { list = world.getDimension(dimId).getEntities({ type: NPC }); } catch { continue; }
      for (const ent of list) {
        const t = NPC_TYPES[ent.getDynamicProperty("fc:npc")];
        if (t && ent.nameTag !== label(t)) ent.nameTag = label(t);
      }
    }
  }, 600);
}
