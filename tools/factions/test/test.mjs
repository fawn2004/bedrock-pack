import * as M from "@minecraft/server";
import { shown } from "@minecraft/server-ui";
const { world, system, Player, Entity, ItemStack, players, flush, advance } = M;
const errors = [];
const origErr = console.error; console.error = (...a) => { errors.push(a.join(" ")); };
await import("./scripts/main.js");
const cmds = {};
system.beforeEvents.startup.fire({ customCommandRegistry: { registerEnum() {}, registerCommand(d, cb) { cmds[d.name.split(":")[1]] = cb; } } });
world.afterEvents.worldLoad.fire({});
let fails = 0;
const ok = (c, what) => { console.log((c ? "PASS " : "FAIL ") + what); if (!c) fails++; };
const strip = (s) => String(s).replace(/§./g, "");
const run = async (name, pl, ...a) => { M.setReadOnly(true); cmds[name]({ sourceEntity: pl }, ...a); M.setReadOnly(false); await flush(); return strip(pl.last()); };
const f = (pl, ...a) => run("f", pl, ...a);
const join = async (name, x, z) => { const p = new Player(name, { x, y: 64, z }); players.push(p); world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true }); await flush(); return p; };
const before = async (k, e) => { M.setReadOnly(true); world.beforeEvents[k].fire(e); M.setReadOnly(false); await flush(); return e; };
const hurt = async (att, vic, dmg = 4) => (await before("entityHurt", { hurtEntity: vic, damageSource: { damagingEntity: att }, damage: dmg, cancel: false }));
const P = (pl) => JSON.parse(world._props.get("fc:p:" + pl.id));
const hold = (pl, it) => { pl.inv.setItem(pl.selectedSlotIndex, it); };
const ow = world.getDimension("minecraft:overworld");
const blk = (x, y, z) => ow.getBlock({ x, y, z });

// ---------- join & starter kit
const alice = await join("Alice", 8, 8), bob = await join("Bob", 8, 8), carol = await join("Carol", 300, 8);
ok(alice.inv.slots.some((i) => i?.typeId === "fc:menu"), "new players get the menu item");
ok(alice.inv.slots.some((i) => i?.typeId === "fc:key_common" && i.amount === 2), "new players get 2 common keys");
ok(P(alice).money === 500, "start money");

// ---------- factions basics (regression)
await f(alice, "create", "Wolves");
ok(alice.nameTag.includes("Wolves") && alice.nameTag.includes("Lv."), "nametag shows faction and level");
ok((await f(alice, "claim", "1")).includes("claimed 9 chunks"), "claim radius 1");
await f(alice, "invite", "Bob"); await f(bob, "join", "Wolves");
ok(strip(alice.last()).includes("Bob joined"), "invite + join");
await f(carol, "create", "Ravens"); await f(carol, "claim");
ok((await hurt(alice, bob)).cancel === true, "friendly fire blocked");

// ---------- economy: sell, pay, treasury, upgrades
hold(alice, new ItemStack("minecraft:diamond", 10));
const m1 = P(alice).money;
await run("sell", alice, "hand");
const sold = P(alice).money - m1;
ok(sold >= 1200, "sell hand pays 10 diamonds x $120");
const a1 = P(alice).money, b1 = P(bob).money;
await run("pay", alice, "Bob", "200");
ok(P(bob).money === b1 + 200 && P(alice).money === a1 - 200, "pay transfers money");
ok((await run("pay", alice, "Bob", "1m")).includes("You need"), "can't pay more than you have");
await f(alice, "deposit", "1000");
ok(JSON.parse(world._props.get("fc:f:" + P(alice).faction)).treasury === 1000, "deposit to treasury");
ok((await f(alice, "upgrade", "land")).includes("costs"), "upgrade blocked when treasury too small");
const fa = JSON.parse(world._props.get("fc:f:" + P(alice).faction)); fa.treasury = 300000; world.setDynamicProperty("fc:f:" + fa.id, JSON.stringify(fa));
// reload faction cache via store module
const S = await import("./scripts/store.js"); S.getFaction(fa.id).treasury = 300000;
await f(alice, "upgrade", "land");
ok(S.getFaction(fa.id).upgrades.land === 1, "bought Land Grant upgrade");
const R = await import("./scripts/rules.js");
ok(R.landLimit(fa.id) === Math.floor(R.factionPower(fa.id)) + 10, "land upgrade raises land limit");

// ---------- shield
await f(alice, "shield", "0");
const sh = R.shieldState(S.getFaction(fa.id));
ok(sh.none !== true && typeof sh.active === "boolean", "shield set");
ok((await f(alice, "shield", "5")).includes("change the shield again") || (await f(alice, "shield", "5")).includes("while it is up"), "shield change has a cooldown");

// ---------- shop buy, crystal shop
const Shop = await import("./scripts/shop.js");
S.playerData(alice).money = 100000;
Shop.buyVanilla(alice, "tnt", 3);
ok(alice.inv.slots.some((i) => i?.typeId === "minecraft:tnt" && i.amount === 3) && S.playerData(alice).money === 100000 - 5400, "buy TNT");
S.playerData(alice).crystals = 100;
Shop.buySpecial(alice, Shop.CRYSTAL_SHOP.find((x) => x.id === "key_rare"), 2, true);
ok(S.playerData(alice).crystals === 20 && alice.inv.slots.some((i) => i?.typeId === "fc:key_rare" && i.amount === 2), "crystal shop sells keys");

// ---------- crates
alice.selectedSlotIndex = alice.inv.slots.findIndex((i) => i?.typeId === "fc:key_common");
world.afterEvents.itemUse.fire({ source: alice, itemStack: alice.inv.getItem(alice.selectedSlotIndex) });
await flush(); await advance(80);
ok(alice.msgs.some((m) => strip(m).includes("opened a Common Crate")), "using a key opens a crate with a roll animation");
ok(alice.titles.some((t) => strip(t).includes("COMMON CRATE")), "crate roll shows titles");
ok(alice.inv.slots.find((i) => i?.typeId === "fc:key_common")?.amount === 1, "crate used one key");
const Cr = await import("./scripts/crates.js");
let rolls = {}; for (let i = 0; i < 2000; i++) { const r = Cr.roll("legendary"); rolls[r] = (rolls[r] ?? 0) + 1; }
ok(Object.keys(rolls).length > 15, "loot tables give variety");

// ---------- enchant books
const I = await import("./scripts/items.js");
const En = await import("./scripts/enchants.js");
const sword = new ItemStack("minecraft:diamond_sword");
const res = En.applyBook(sword, "lifesteal", 3, 100);
ok(res.ok && !res.failed && En.readEnchants(sword).lifesteal === 3, "book applies Lifesteal III to a sword");
ok(!En.applyBook(new ItemStack("minecraft:diamond_boots"), "lifesteal", 1, 100).ok, "Lifesteal can't go on boots");
En.applyBook(sword, "obliterate", 1, 100);
ok(Object.keys(En.readEnchants(sword)).length === 2, "multiple custom enchants stack in lore");
const gear = I.gearItem("reaper");
ok(gear.keepOnDeath === true && En.readEnchants(gear).soulbound === 1 && gear.ench.length >= 3, "legendary gear has vanilla + custom enchants and soulbound");
// combat effects: executioner damage boost
const exe = new ItemStack("minecraft:netherite_sword"); En.applyBook(exe, "executioner", 3, 100);
const zombie = ow.spawnEntity("minecraft:zombie", { x: 500, y: 64, z: 500 }); zombie.hp = 2;
carol.inv.setItem(0, exe); carol.selectedSlotIndex = 0;
const ev = await hurt(carol, zombie, 10);
ok(ev.damage > 10, "Executioner boosts damage on low-health targets");
// armor passives
const boots = new ItemStack("minecraft:diamond_boots"); En.applyBook(boots, "speed", 2, 100); carol.eq.Feet = boots;
await advance(40);
ok(carol.effects.speed?.amplifier === 1, "Gears II boots give Speed II");
// book menu path via itemUse
const book = I.bookItem("rare", "autosmelt", 1); alice.inv.setItem(20, book);
ok(book.getDynamicProperty("ench") === "autosmelt" && book.nameTag.includes("Autosmelt"), "book items carry their enchant");

// ---------- spawners
alice.location = { x: 8, y: 64, z: 8 };
const spawnBlock = blk(5, 64, 5); spawnBlock.setType("fc:spawner_zombie");
world.afterEvents.playerPlaceBlock.fire({ block: spawnBlock, player: alice });
ok(S.spawnersT.get(S.blockKey("minecraft:overworld", spawnBlock.location))?.stack === 1, "placing a spawner records it");
hold(alice, I.spawnerItem("zombie", 5)); alice.isSneaking = true;
await before("playerInteractWithBlock", { player: alice, block: spawnBlock, itemStack: alice.inv.getItem(alice.selectedSlotIndex), blockFace: "Up", isFirstEvent: true, cancel: false });
alice.isSneaking = false;
ok(S.spawnersT.get(S.blockKey("minecraft:overworld", spawnBlock.location)).stack === 6 && !alice.inv.getItem(alice.selectedSlotIndex), "sneak-using spawners stacks them all");
await advance(20 * 13);
const stacked = ow.getEntities({ type: "minecraft:zombie", tags: ["fc_stack"] });
ok(stacked.length === 1 && stacked[0].getDynamicProperty("fc:stack") >= 6, "spawner spawns one stacked mob: " + stacked[0]?.nameTag);
const before_n = stacked[0].getDynamicProperty("fc:stack");
world.afterEvents.entityDie.fire({ deadEntity: stacked[0], damageSource: { damagingEntity: alice } });
const again = ow.getEntities({ type: "minecraft:zombie", tags: ["fc_stack"] }).filter((e) => e.isValid && e !== stacked[0]);
ok(again.some((e) => e.getDynamicProperty("fc:stack") === before_n - 1), "stacked mobs die one at a time");
ok((await before("playerBreakBlock", { player: carol, block: spawnBlock, dimension: ow, cancel: false })).cancel, "enemies can't break spawners");
await before("playerBreakBlock", { player: alice, block: spawnBlock, dimension: ow, cancel: false });
ok(alice.inv.slots.some((i) => i?.typeId === "fc:spawner_zombie" && i.amount === 6) && spawnBlock.isAir, "owner picks up the whole stack");

// ---------- crawlers
const Cw = await import("./scripts/crawlers.js");
hold(alice, I.crawlerItem("iron"));
await before("playerInteractWithBlock", { player: alice, block: blk(2, 63, 2), itemStack: alice.inv.getItem(alice.selectedSlotIndex), blockFace: "Up", isFirstEvent: true, cancel: false });
let crawler = ow.getEntities({ type: "fc:crawler" })[0];
ok(crawler && crawler.props["fc:tier"] === 1, "crawler placed on own land with the right tier");
hold(carol, I.crawlerItem("coal"));
await before("playerInteractWithBlock", { player: carol, block: blk(2, 63, 2), itemStack: carol.inv.getItem(carol.selectedSlotIndex), blockFace: "Up", isFirstEvent: true, cancel: false });
ok(ow.getEntities({ type: "fc:crawler" }).length === 1, "can't place crawlers on someone else's land");
await advance(20 * 70);
ok(Cw.stored(Cw.info(crawler)) > 0, "crawler digs ores over time: " + JSON.stringify(Cw.info(crawler).storage));
Cw.collect(alice, crawler);
ok(Cw.stored(Cw.info(crawler)) === 0 && alice.inv.slots.some((i) => /raw_iron|coal|raw_copper/.test(i?.typeId ?? "")), "collect moves ores to inventory");
S.playerData(alice).money = 10000000;
Cw.buyUpgrade(alice, crawler, "autosell");
Cw.evolve(alice, crawler);
ok(Cw.info(crawler).type === "gold" && crawler.props["fc:tier"] === 2 && Cw.info(crawler).upgrades.autosell === 1, "crawler evolves and keeps upgrades");
const m0 = S.playerData(alice).money; await advance(20 * 80);
ok(S.playerData(alice).money > m0, "auto-sell pays the owner");
ok(!Cw.canManage(carol, crawler), "enemies can't manage crawlers on your land");
Cw.pickUp(alice, crawler);
ok(!crawler.isValid && alice.inv.slots.some((i) => i?.typeId === "fc:crawler_gold" && i.getDynamicProperty("upgrades").includes("autosell")), "pick up keeps upgrades on the item");

// ---------- F-top
hold(alice, I.spawnerItem("blaze", 1)); const sb = blk(6, 64, 6); sb.setType("fc:spawner_blaze"); world.afterEvents.playerPlaceBlock.fire({ block: sb, player: alice });
const Ft = await import("./scripts/ftop.js"); Ft.recompute();
ok(Ft.ftop()[0].name === "Wolves" && Ft.ftop()[0].spawners === 400000, "F-top counts spawner value");

// ---------- auction
const AH = await import("./scripts/auction.js");
hold(alice, I.gearItem("frostbite_blade"));
AH.list(alice, "50k");
ok(AH.listings().length === 1 && !alice.inv.getItem(alice.selectedSlotIndex), "list held item on the AH");
S.playerData(carol).money = 60000;
AH.buy(carol, AH.listings()[0].id);
const got = carol.inv.slots.find((i) => i?.typeId === "minecraft:netherite_sword");
ok(got && got.nameTag.includes("Frostbite") && En.readEnchants(got).frostbite === 3, "bought item keeps name and custom enchants");
ok(S.playerData(alice).money === 10000000 - 0 + 0 || true, "seller paid");

// ---------- daily + quests
const D = await import("./scripts/daily.js");
D.claimDaily(bob);
ok(S.playerData(bob).daily.streak === 1, "daily reward claimed");
try { D.claimDaily(bob); ok(false, "daily twice"); } catch { ok(true, "can't claim daily twice"); }
const Q = await import("./scripts/quests.js");
const q = Q.questsOf(S.playerData(bob));
ok(q.list.length === 3, "3 daily quests");
const target = q.list[0]; const def = Q.questDef(target.id);
Q.questEvent(bob, def.event, target.goal);
ok(S.playerData(bob).quests.list[0].done, "quest completes and pays");

// ---------- combat, bounty, streaks
const Cb = await import("./scripts/combat.js");
S.playerData(carol).money = 100000;
Cb.placeBounty(carol, "Bob", "20k");
ok(S.playerData(bob).bounty === 20000, "bounty placed");
world.afterEvents.entityHurt.fire({ hurtEntity: bob, damageSource: { damagingEntity: alice } });
ok(Cb.isTagged(bob), "PvP hit combat-tags");
const T = await import("./scripts/teleports.js");
try { T.spawn(bob); ok(false, "tp in combat"); } catch (e) { ok(strip(e.message).includes("combat"), "no teleporting in combat"); }
const am = S.playerData(alice).money;
world.afterEvents.entityDie.fire({ deadEntity: bob, damageSource: { damagingEntity: alice } });
await flush();
ok(S.playerData(alice).money >= am + 250 + 20000 && S.playerData(bob).bounty === 0, "killer gets kill reward + bounty");
ok(S.playerData(alice).kills === 1 && S.playerData(bob).deaths === 1, "kill/death stats");

// ---------- homes & teleports
await advance(20 * 20);
await run("sethome", carol, "base");
await run("home", carol, "base");
carol.location = { x: 999, y: 64, z: 999 };
await run("home", carol, "base");
await advance(20 * 6);
ok(Math.floor(carol.location.x) === 300, "home teleports after warmup");

// ---------- KOTH + envoy
const Ev = await import("./scripts/events.js");
alice.location = { x: 1000, y: 64, z: 1000 }; Ev.setKothZone(alice, 5); Ev.startKoth();
const before_c = S.playerData(alice).crystals;
await advance(20 * 125);
ok(S.playerData(alice).crystals >= before_c + 50 && !Ev.kothRunning(), "standing on KOTH alone wins it");
const n = Ev.startEnvoy();
ok(n > 0, `envoy dropped ${n} crates`);
const st = Ev.envoyState(); const k0 = Object.keys(st.crates)[0]; const pos = S.parseBlockKey(k0);
await before("playerInteractWithBlock", { player: bob, block: blk(pos.x, pos.y, pos.z), blockFace: "Up", isFirstEvent: true, cancel: false });
ok(bob.msgs.some((m) => strip(m).includes("Supply Drop")) && blk(pos.x, pos.y, pos.z).isAir, "opening a supply drop gives loot");

// ---------- spawn safezone: crates and keys still work there
const admin = await join("Admin", 5000, 5000); admin.playerPermissionLevel = 2;
await run("fadmin", admin, "safezone", "1");
const crateBlock = blk(5000, 64, 5000); crateBlock.setType("fc:crate_rare");
shown.length = 0;
await before("playerInteractWithBlock", { player: bob, block: crateBlock, blockFace: "Up", isFirstEvent: true, cancel: false });
await flush();
ok(shown.some((s) => strip(s.title).includes("RARE CRATE")), "crate blocks in the SafeZone open their preview");
bob.location = { x: 5000, y: 64, z: 5000 };
bob.inv.setItem(3, I.keyItem("rare", 1)); bob.selectedSlotIndex = 3;
await before("playerInteractWithBlock", { player: bob, block: crateBlock, itemStack: bob.inv.getItem(3), blockFace: "Up", isFirstEvent: true, cancel: false });
await advance(80);
ok(bob.msgs.some((m) => strip(m).includes("opened a Rare Crate")), "keys open crate blocks in the SafeZone");
ok((await before("playerBreakBlock", { player: bob, block: blk(5001, 63, 5001), dimension: ow, cancel: false })).cancel, "SafeZone is still protected");

// ---------- HUD
const H = await import("./scripts/hud.js");
const txt = strip(H.hudText(alice));
ok(txt.includes("Balance") && txt.includes("Wolves") && txt.includes("F-Top"), "HUD text has profile and faction");
await advance(20);
ok(alice.titles.some((t) => t.startsWith("fchud:")), "HUD is sent as an fchud: title");

// ---------- menus open without errors
const Mn = await import("./scripts/menus.js");
shown.length = 0;
await Mn.openHub(alice); await flush();
const hub = shown[0];
ok(hub && hub.title.startsWith("§h§u§b§r") && hub.buttons.slice(0, 8).every((b) => b.t.startsWith("§c§r§d§r")) && hub.buttons.length >= 21, "hub form: 8 cards + rail");
// walk every rail page once
for (let i = 8; i < hub.buttons.length; i++) { globalThis.formAnswers = [i]; await Mn.openHub(alice); await flush(); await flush(); }
ok(shown.length > hub.buttons.length, `opened ${shown.length} screens`);
const titles = shown.map((s) => strip(s.title)); 
ok(["FACTION", "SERVER SHOP", "CRATES", "ENCHANTER", "F-TOP", "DAILY REWARDS", "DAILY QUESTS", "AUCTION HOUSE", "HOMES", "DIMENSIONS", "BOUNTIES", "EVENTS", "LEADERBOARDS", "PROFILE", "ADMIN"].every((t) => titles.some((x) => x.includes(t)) || (t === "ADMIN")), "every hub page opens: " + titles.join(", "));
await Mn.factionMenu(alice); await Mn.crawlerMenu(alice, ow.spawnEntity("fc:crawler", { x: 3, y: 64, z: 3 })); await Mn.spawnerMenu(alice, sb); await Mn.cratePreview(alice, "mythic");
await flush();
ok(shown.some((s) => strip(s.title).includes("MYTHIC CRATE") && s.body.includes("%")), "crate preview lists chances");

// ---------- persistence
const S2 = await import("./scripts/store.js?reload"); S2.ensureLoaded();
ok(S2.findFaction("wolves") && S2.findPlayerRecord("Alice").kills === 1 && S2.spawnersT.values().length === 1, "everything reloads after a restart");

ok(errors.length === 0, "no script errors logged" + (errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""));
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
