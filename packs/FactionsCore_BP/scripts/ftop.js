// Factions Core - F-Top: factions ranked by wealth
// (treasury + spawners + ore crawlers on their land).
import { system } from "@minecraft/server";
import * as S from "./store.js";
import { SPAWNERS, CRAWLERS } from "./items.js";

let cache = []; // [{ fid, name, value, treasury, spawners, crawlers }]
let rankOf = new Map();

export function recompute() {
  const rows = new Map();
  for (const f of S.allFactions()) rows.set(f.id, { fid: f.id, name: f.name, color: f.color, treasury: f.treasury, spawners: 0, crawlers: 0, spawnerCount: 0, crawlerCount: 0 });
  // Spawners count for whoever owns the land they stand on right now.
  for (const [key, s] of S.spawnersT.entries()) {
    const pos = S.parseBlockKey(key);
    const r = rows.get(S.ownerAt(pos.dim, pos));
    if (r) { r.spawners += (SPAWNERS[s.type]?.value ?? 0) * s.stack; r.spawnerCount += s.stack; }
  }
  for (const c of Object.values(S.kv.get("crawlers", {}))) {
    const r = rows.get(S.ownerAt(c.dim, c));
    if (r) { r.crawlers += CRAWLERS[c.type]?.value ?? 0; r.crawlerCount++; }
  }
  cache = [...rows.values()].map((r) => ({ ...r, value: r.treasury + r.spawners + r.crawlers })).sort((a, b) => b.value - a.value);
  rankOf = new Map(cache.map((r, i) => [r.fid, i + 1]));
}

export const ftop = () => cache;
export const ftopRank = (fid) => rankOf.get(fid);
export const ftopRow = (fid) => cache.find((r) => r.fid === fid);

export function setupFtop() {
  system.runTimeout(recompute, 40);
  system.runInterval(recompute, 20 * 60);
}
