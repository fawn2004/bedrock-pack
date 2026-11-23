// Factions Core - live events: Envoy supply drops and King of the Hill.
import { system, world } from "@minecraft/server";
import { CONFIG, RARITY, RARITIES } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import { roll } from "./crates.js";
import { giveReward, keyItem, giveItem } from "./items.js";
import * as E from "./economy.js";

// ------------------------------------------------------------ envoy

const ENVOY_WEIGHTS = { common: 45, rare: 30, epic: 17, legendary: 7, mythic: 1 };

function rollRarity() {
  let r = Math.random() * 100;
  for (const k of RARITIES) { r -= ENVOY_WEIGHTS[k]; if (r <= 0) return k; }
  return "common";
}

export const envoyState = () => S.kv.get("envoy", { active: false, until: 0, crates: {}, next: Date.now() + CONFIG.envoyMinutes * 60000 });
const setEnvoy = (st) => S.kv.set("envoy", st);

export function spawnPoint() {
  const sp = S.kv.get("spawn");
  if (sp) return sp;
  const d = world.getDefaultSpawnLocation();
  return { dim: "minecraft:overworld", x: d.x, y: d.y > 300 ? 80 : d.y, z: d.z };
}

function envoySpots(n) {
  const dim = world.getDimension("minecraft:overworld");
  const war = S.claimKeysOf(S.WARZONE).filter((k) => S.dimFromKey(k) === "minecraft:overworld");
  const center = spawnPoint();
  const spots = [];
  for (let tries = 0; tries < n * 6 && spots.length < n; tries++) {
    let x;
    let z;
    if (war.length) {
      const [, cx, cz] = war[Math.floor(Math.random() * war.length)].split("|").map(Number);
      x = cx * 16 + Math.floor(Math.random() * 16);
      z = cz * 16 + Math.floor(Math.random() * 16);
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * CONFIG.envoyRadius;
      x = Math.floor(center.x + Math.cos(a) * r);
      z = Math.floor(center.z + Math.sin(a) * r);
    }
    const owner = S.ownerAt("minecraft:overworld", { x, z });
    if (owner && owner !== S.WARZONE) continue; // never on someone's base
    try {
      const top = dim.getTopmostBlock({ x, z });
      if (!top || top.isLiquid) continue;
      const above = top.above();
      if (!above?.isAir) continue;
      spots.push(above.location);
    } catch { /* not loaded */ }
  }
  return spots;
}

export function startEnvoy() {
  const spots = envoySpots(CONFIG.envoyCrates);
  if (!spots.length) return 0;
  const st = { active: true, until: Date.now() + CONFIG.envoyLifetimeMinutes * 60000, crates: {}, next: Date.now() + CONFIG.envoyMinutes * 60000 };
  const dim = world.getDimension("minecraft:overworld");
  for (const l of spots) {
    dim.setBlockType(l, "fc:supply_drop");
    st.crates[S.blockKey(dim.id, l)] = rollRarity();
  }
  setEnvoy(st);
  const where = spots.slice(0, 4).map((l) => `${l.x}, ${l.z}`).join("  ");
  R.broadcast(`§d§lENVOY!§r §f${spots.length} supply drops have landed${S.claimKeysOf(S.WARZONE).length ? " in the §4WarZone§r" : " near spawn"}! §7${where}${spots.length > 4 ? " ..." : ""}`);
  for (const pl of world.getAllPlayers()) R.sound(pl, "mob.wither.spawn", 1.5, 0.4);
  return spots.length;
}

function endEnvoy() {
  const st = envoyState();
  const dim = world.getDimension("minecraft:overworld");
  for (const key of Object.keys(st.crates)) {
    try { const b = dim.getBlock(S.parseBlockKey(key)); if (b?.typeId === "fc:supply_drop") b.setType("minecraft:air"); } catch { /* */ }
  }
  setEnvoy({ active: false, until: 0, crates: {}, next: Date.now() + CONFIG.envoyMinutes * 60000 });
}

export function openSupply(player, block) {
  const st = envoyState();
  const key = S.blockKey(block.dimension.id, block.location);
  const rarity = st.crates[key] ?? "common";
  block.setType("minecraft:air");
  delete st.crates[key];
  if (!Object.keys(st.crates).length) { st.active = false; st.next = Date.now() + CONFIG.envoyMinutes * 60000; }
  setEnvoy(st);
  const won = [roll(rarity), roll(rarity)].map((spec) => giveReward(player, spec));
  const c = RARITY[rarity].color;
  block.dimension.spawnParticle("minecraft:totem_particle", block.center());
  R.sound(player, "random.levelup");
  R.tell(player, `You opened a ${c}${RARITY[rarity].name} Supply Drop§r: ${won.join("§r, ")}`);
  if (RARITY[rarity].order >= 3) R.broadcast(`§e${player.name}§r looted a ${c}§l${RARITY[rarity].name}§r supply drop!`);
}

// ------------------------------------------------------------ KOTH

export const kothZone = () => S.kv.get("koth");
let koth = null; // { endsAt, capper, progress, contested }

export function setKothZone(player, radius) {
  const l = player.location;
  S.kv.set("koth", { dim: player.dimension.id, x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z), radius: Math.max(2, Math.min(25, Number(radius) || 5)) });
}

export function startKoth() {
  const z = kothZone();
  if (!z) E.fail("Set the KOTH zone first: §e/fadmin koth set [radius]");
  koth = { endsAt: Date.now() + CONFIG.kothDurationMinutes * 60000, capper: null, progress: 0, contested: false };
  R.broadcast(`§6§lKING OF THE HILL§r has started at §e${z.x}, ${z.z}§r! Hold the hill for §e${CONFIG.kothCaptureSeconds}s§r to win.`);
  for (const pl of world.getAllPlayers()) R.sound(pl, "raid.horn", 1, 0.6);
}

export function stopKoth() {
  if (!koth) return false;
  koth = null;
  R.broadcast("§6KOTH§r ended with no winner.");
  return true;
}

export const kothRunning = () => !!koth;

function kothTick() {
  const z = kothZone();
  if (!koth || !z) return;
  if (Date.now() > koth.endsAt) { stopKoth(); S.kv.set("kothNext", Date.now() + CONFIG.kothEveryMinutes * 60000); return; }
  const dim = world.getDimension(z.dim);
  const inside = dim.getPlayers({ location: z, maxDistance: z.radius + 6 }).filter((pl) => {
    const l = pl.location;
    return Math.hypot(l.x - z.x - 0.5, l.z - z.z - 0.5) <= z.radius && Math.abs(l.y - z.y) <= 6 && pl.getGameMode() !== "Spectator" && pl.getGameMode() !== "Creative";
  });
  const teams = new Set(inside.map((pl) => S.playerData(pl).faction ?? `solo:${pl.id}`));
  koth.contested = teams.size > 1;
  if (!inside.length) { koth.capper = null; koth.progress = 0; return; }
  if (koth.contested) return;
  const stillHere = inside.find((pl) => pl.id === koth.capper);
  if (!stillHere) {
    koth.capper = inside[0].id;
    koth.progress = 0;
    R.broadcast(`§e${inside[0].name}§r is capturing the §6KOTH§r!`);
  }
  koth.progress++;
  const capper = stillHere ?? inside[0];
  if (koth.progress % 30 === 0 && koth.progress < CONFIG.kothCaptureSeconds) R.broadcast(`§e${capper.name}§r has held §6KOTH§r for ${koth.progress}s!`);
  if (koth.progress >= CONFIG.kothCaptureSeconds) {
    koth = null;
    S.kv.set("kothNext", Date.now() + CONFIG.kothEveryMinutes * 60000);
    const p = S.playerData(capper);
    E.addMoney(p, 250000);
    E.addCrystals(p, 50);
    giveItem(capper, keyItem("legendary", 1));
    E.addXp(capper, p, 500);
    const f = S.getFaction(p.faction);
    if (f) { f.treasury += 100000; S.factionLog(f, `§6${capper.name} won KOTH (+$100k)`); }
    R.broadcast(`§6§l${capper.name}${f ? ` of ${f.name}` : ""} WON KING OF THE HILL!§r §7(+$250k, 50 crystals, Legendary key${f ? ", $100k to their treasury" : ""})`);
    for (const pl of world.getAllPlayers()) R.sound(pl, "random.totem", 1, 0.5);
  }
}

export function hudEventLines(player) {
  const out = [];
  if (koth) {
    const cap = koth.capper ? R.onlineById(koth.capper) : undefined;
    out.push("§6§lKOTH", koth.contested ? "§cContested!" : cap ? `§e${cap.name} §f${koth.progress}§8/${CONFIG.kothCaptureSeconds}s` : "§7Nobody on the hill");
  }
  const st = envoyState();
  if (st.active) out.push("§d§lENVOY", `§f${Object.keys(st.crates).length} §7drops left`);
  else out.push(`§7Envoy in §f${Math.max(0, Math.ceil((st.next - Date.now()) / 60000))}m`);
  return out;
}

export function setupEvents() {
  system.runInterval(() => {
    kothTick();
    const st = envoyState();
    const now = Date.now();
    if (st.active && now > st.until) { endEnvoy(); R.broadcast("§dThe envoy is over."); }
    else if (!st.active && now > st.next && world.getAllPlayers().length > 0) {
      if (!startEnvoy()) { st.next = now + 5 * 60000; setEnvoy(st); }
    }
    const z = kothZone();
    if (z && !koth && now > S.kv.get("kothNext", now + CONFIG.kothEveryMinutes * 60000)) startKoth();
    if (z && !S.kv.get("kothNext")) S.kv.set("kothNext", now + CONFIG.kothEveryMinutes * 60000);
  }, 20);

  // Supply drop beacons.
  system.runInterval(() => {
    const st = envoyState();
    if (!st.active) return;
    const dim = world.getDimension("minecraft:overworld");
    for (const key of Object.keys(st.crates)) {
      const l = S.parseBlockKey(key);
      for (let dy = 1; dy < 12; dy += 2) {
        try { dim.spawnParticle("minecraft:villager_happy", { x: l.x + 0.5, y: l.y + dy, z: l.z + 0.5 }); } catch { break; }
      }
    }
  }, 30);
}
