const sig = () => { const l = []; return { l, subscribe: (f) => (l.push(f), f), unsubscribe() {}, fire: (e) => { for (const f of l) f(e); return e; } }; };
export let readOnly = false; export const setReadOnly = (v) => { readOnly = v; };
const props = new Map();
export const players = []; export const log = [];
export const EquipmentSlot = { Head: "Head", Chest: "Chest", Legs: "Legs", Feet: "Feet", Mainhand: "Mainhand", Offhand: "Offhand" };
export const EntityDamageCause = { thorns: "thorns" };
export const ItemLockMode = { inventory: "inventory", none: "none", slot: "slot" };
export const GameMode = { Survival: "Survival", Creative: "Creative" };
export const CommandPermissionLevel = { Any: 0, GameDirectors: 1, Admin: 2 };
export const CustomCommandParamType = { Enum: "Enum", String: "String" };
export const CustomCommandStatus = { Success: 0, Failure: 1 };
export const EnchantmentTypes = { get: (id) => ({ id, maxLevel: 5 }) };
export class BlockVolume { constructor(a, b) { this.a = a; this.b = b; } }
export class ItemStack {
  constructor(typeId, amount = 1) { this.typeId = typeId; this.amount = amount; this.lore = []; this.dp = {}; this.ench = []; this.keepOnDeath = false;
    this.maxAmount = /^fc:(book|bank_note|sell_wand|menu|crawler)/.test(typeId) || /sword|pickaxe|helmet|chestplate|leggings|boots|axe/.test(typeId) ? 1 : 64; }
  getLore() { return this.lore.slice(); } setLore(l) { this.lore = (l ?? []).slice(); }
  getDynamicProperty(k) { return this.dp[k]; } setDynamicProperty(k, v) { if (v === undefined) delete this.dp[k]; else this.dp[k] = v; }
  setDynamicProperties(o) { Object.assign(this.dp, o); } getDynamicPropertyIds() { return Object.keys(this.dp); }
  clone() { const c = new ItemStack(this.typeId, this.amount); Object.assign(c, JSON.parse(JSON.stringify({ lore: this.lore, dp: this.dp, ench: this.ench }))); c.nameTag = this.nameTag; return c; }
  getComponent(id) { const self = this; if (id === "minecraft:enchantable" && /sword|pickaxe|helmet|chestplate|leggings|boots|axe/.test(this.typeId)) return { addEnchantment(e) { self.ench.push(e); }, getEnchantments() { return self.ench; } };
    if (id === "minecraft:durability") return undefined; return undefined; }
}
export class Container { constructor(n) { this.size = n; this.slots = new Array(n).fill(undefined); }
  getItem(i) { return this.slots[i]; } setItem(i, it) { this.slots[i] = it; }
  addItem(it) { let left = it.amount; for (let i = 0; i < this.size && left > 0; i++) { const s = this.slots[i]; if (s && s.typeId === it.typeId && s.maxAmount > 1 && !s.nameTag && !it.nameTag && s.amount < s.maxAmount) { const n = Math.min(left, s.maxAmount - s.amount); s.amount += n; left -= n; } }
    for (let i = 0; i < this.size && left > 0; i++) if (!this.slots[i]) { const c = it.clone(); c.amount = Math.min(left, it.maxAmount); left -= c.amount; this.slots[i] = c; }
    if (left > 0) { const r = it.clone(); r.amount = left; return r; } return undefined; }
  get emptySlotsCount() { return this.slots.filter((x) => !x).length; }
}
const blocks = new Map(); // "dim|x|y|z" -> typeId
const bk = (d, l) => `${d}|${Math.floor(l.x)}|${Math.floor(l.y)}|${Math.floor(l.z)}`;
export const entities = [];
let nextId = 1;
class Block { constructor(dim, l) { this.dimension = dim; this.location = { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }; this.x = this.location.x; this.y = this.location.y; this.z = this.location.z; }
  get typeId() { return blocks.get(bk(this.dimension.id, this.location)) ?? (this.location.y < 64 ? "minecraft:stone" : "minecraft:air"); }
  get isAir() { return this.typeId === "minecraft:air"; } get isLiquid() { return false; }
  setType(t) { blocks.set(bk(this.dimension.id, this.location), t); }
  above() { return new Block(this.dimension, { ...this.location, y: this.location.y + 1 }); } below() { return new Block(this.dimension, { ...this.location, y: this.location.y - 1 }); }
  center() { return { x: this.x + 0.5, y: this.y + 0.5, z: this.z + 0.5 }; }
  getComponent(id) { if (id === "minecraft:inventory") { const k = "inv|" + bk(this.dimension.id, this.location); globalThis.blockInv ??= {}; return { container: (globalThis.blockInv[k] ??= new Container(27)) }; } }
}
class Dimension { constructor(id) { this.id = id; this.heightRange = { min: -64, max: 320 }; }
  getBlock(l) { return new Block(this, l); } setBlockType(l, t) { blocks.set(bk(this.id, l), t); }
  getTopmostBlock({ x, z }) { return new Block(this, { x, y: 63, z }); }
  getPlayers(o = {}) { return players.filter((p) => p.dimension.id === this.id && (!o.location || dist(p.location, o.location) <= (o.maxDistance ?? 1e9))); }
  getEntities(o = {}) { let l = entities.filter((e) => e.isValid && e.dimension.id === this.id); if (o.type) l = l.filter((e) => e.typeId === o.type);
    if (o.location) l = l.filter((e) => dist(e.location, o.location) <= (o.maxDistance ?? 1e9)); if (o.tags) l = l.filter((e) => o.tags.every((t) => e.tags.has(t))); return l; }
  spawnEntity(type, loc) { const e = new Entity("e" + nextId++, type, this.id, { ...loc }); entities.push(e); return e; }
  spawnItem(it, loc) { const e = this.spawnEntity("minecraft:item", loc); e.item = it; return e; }
  spawnParticle() {} playSound() {} runCommand(c) { const m = c.match(/setblock (\S+) (\S+) (\S+) air destroy/); if (m) blocks.set(bk(this.id, { x: +m[1], y: +m[2], z: +m[3] }), "minecraft:air"); return { successCount: 1 }; }
  fillBlocks(vol, t, o) { let n = 0; for (let x = vol.a.x; x <= vol.b.x; x++) for (let z = vol.a.z; z <= vol.b.z; z++) { const k = bk(this.id, { x, y: vol.a.y, z }); const cur = blocks.get(k) ?? (vol.a.y < 64 ? "minecraft:stone" : "minecraft:air"); if (o?.blockFilter?.excludeTypes?.includes(cur)) continue; blocks.set(k, t); n++; } return { n }; }
  isChunkLoaded() { return true; }
}
const dist = (a, b) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);
const dims = { "minecraft:overworld": new Dimension("minecraft:overworld"), "minecraft:nether": new Dimension("minecraft:nether"), "minecraft:the_end": new Dimension("minecraft:the_end") };
export class Entity { constructor(id, typeId, dim, loc) { this.id = id; this.typeId = typeId; this.dimension = dims[dim]; this.location = loc; this.dp = new Map(); this.tags = new Set(); this.nameTag = ""; this.isValid = true; this.props = {}; this.hp = 20; this.maxHp = 20; this.effects = {}; }
  getDynamicProperty(k) { return this.dp.get(k); } setDynamicProperty(k, v) { v === undefined ? this.dp.delete(k) : this.dp.set(k, v); }
  addTag(t) { this.tags.add(t); return true; } hasTag(t) { return this.tags.has(t); }
  setProperty(k, v) { this.props[k] = v; } getProperty(k) { return this.props[k]; }
  remove() { this.isValid = false; } kill() { this.isValid = false; return true; }
  matches(q) { return (q.families ?? []).includes("monster") && this.typeId === "minecraft:zombie"; }
  getComponent(id) { if (id === "minecraft:item") return this.item ? { itemStack: this.item } : undefined;
    if (id === "minecraft:health") { const s = this; return { get currentValue() { return s.hp; }, effectiveMax: s.maxHp, setCurrentValue(v) { s.hp = v; } }; } }
  addEffect(id, d, o) { this.effects[id] = { duration: d, amplifier: o?.amplifier ?? 0 }; } getEffect(id) { return this.effects[id]; } removeEffect(id) { delete this.effects[id]; }
  setOnFire() {} applyDamage(n) { this.hp -= n; } playAnimation() {} teleport(loc, o) { this.location = { ...loc }; if (o?.dimension) this.dimension = dims[o.dimension.id]; }
  getRotation() { return { x: 0, y: 0 }; } getViewDirection() { return { x: 0, y: 0, z: 1 }; }
}
export class Player extends Entity {
  constructor(name, loc) { super("id_" + name, "minecraft:player", "minecraft:overworld", loc); this.name = name; this.nameTag = name; this.msgs = []; this.bar = ""; this.title = ""; this.titles = [];
    this.inv = new Container(36); this.eq = {}; this.selectedSlotIndex = 0; this.isSneaking = false; this.playerPermissionLevel = 0; this.sounds = [];
    this.onScreenDisplay = { setActionBar: (t) => (this.bar = t), setTitle: (t, o) => { this.title = t; this.titles.push(t); } }; }
  sendMessage(m) { this.msgs.push(m); } playSound(s) { this.sounds.push(s); } getGameMode() { return "Survival"; }
  getComponent(id) { if (id === "minecraft:inventory") return { container: this.inv }; if (id === "minecraft:equippable") { const s = this; return { getEquipment: (slot) => (slot === "Mainhand" ? s.inv.getItem(s.selectedSlotIndex) : s.eq[slot]), setEquipment: (slot, it) => { s.eq[slot] = it; } }; } return super.getComponent(id); }
  last() { return this.msgs[this.msgs.length - 1] ?? ""; }
}
export const world = {
  beforeEvents: Object.fromEntries(["playerBreakBlock", "playerInteractWithBlock", "playerInteractWithEntity", "explosion", "entityHurt", "playerLeave", "itemUse"].map((k) => [k, sig()])),
  afterEvents: Object.fromEntries(["playerSpawn", "playerLeave", "entityDie", "entityHurt", "worldLoad", "playerBreakBlock", "playerPlaceBlock", "itemUse"].map((k) => [k, sig()])),
  getDynamicPropertyIds: () => [...props.keys()], getDynamicProperty: (k) => props.get(k),
  setDynamicProperty: (k, v) => { if (readOnly) throw new Error("read-only"); v === undefined ? props.delete(k) : props.set(k, v); },
  getAllPlayers: () => players, getEntity: (id) => players.find((p) => p.id === id) ?? entities.find((e) => e.id === id),
  getDimension: (id) => dims[id], sendMessage: (m) => log.push(m), getDefaultSpawnLocation: () => ({ x: 0, y: 70, z: 0 }), _props: props,
};
const queue = []; export const intervals = []; const timeouts = [];
let tick = 0;
const realNow = Date.now.bind(Date); const base = realNow(); let skew = 0;
Date.now = () => realNow() + skew;
export const system = {
  beforeEvents: { startup: sig() }, get currentTick() { return tick; },
  run: (f) => (queue.push(f), queue.length), runTimeout: (f, d = 1) => (timeouts.push({ f, at: tick + d }), timeouts.length),
  runInterval: (f, t) => { intervals.push({ f, t, id: intervals.length + 1, on: true }); return intervals.length; }, clearRun: (id) => { const i = intervals.find((x) => x.id === id); if (i) i.on = false; },
  runJob: (gen) => { for (const _ of gen); return 1; },
};
export const flush = async () => { for (let k = 0; k < 50; k++) { while (queue.length) queue.shift()(); await new Promise((r) => setImmediate(r)); if (!queue.length) break; } };
/** Advance n ticks, running intervals and timeouts. */
export async function advance(n) { for (let i = 0; i < n; i++) { tick++; skew += 50; for (const iv of intervals) if (iv.on && tick % iv.t === 0) iv.f(); for (const t of timeouts.splice(0)) { if (t.at <= tick) t.f(); else timeouts.push(t); } await flush(); } }
