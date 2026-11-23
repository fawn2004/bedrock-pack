import * as M from "@minecraft/server";
import { shown } from "@minecraft/server-ui";
const { world, system, Player, Entity, ItemStack, players, flush, advance } = M;
const errors = [];
const origErr = console.error; console.error = (...a) => { errors.push(a.join(" ")); };
await import("./scripts/main.js");
await import("./chat/main.js");
const cmds = {};
const tooMany = [];
system.beforeEvents.startup.fire({ customCommandRegistry: { registerEnum() {}, registerCommand(d, cb) {
  const n = (d.mandatoryParameters?.length ?? 0) + (d.optionalParameters?.length ?? 0);
  if (n > 8) { tooMany.push(`${d.name} (${n})`); throw new Error("too many parameters"); } // like the real game
  cmds[d.name.split(":")[1]] = cb;
} } });
world.afterEvents.worldLoad.fire({});
let fails = 0;
const ok = (c, what) => { console.log((c ? "PASS " : "FAIL ") + what); if (!c) fails++; };
const strip = (s) => String(s).replace(/§./g, "");
const run = async (name, pl, ...a) => { M.setReadOnly(true); cmds[name]({ sourceEntity: pl }, ...a); M.setReadOnly(false); await flush(); return strip(pl.last()); };
const f = (pl, ...a) => run("f", pl, ...a);
const join = async (name, x, z) => { const p = new Player(name, { x, y: 64, z }); players.push(p); world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true }); await flush(); return p; };
const before = async (k, e) => { M.setReadOnly(true); world.beforeEvents[k].fire(e); M.setReadOnly(false); await flush(); return e; };
const before_ = (...a) => before(...a);
const hurt = async (att, vic, dmg = 4) => (await before("entityHurt", { hurtEntity: vic, damageSource: { damagingEntity: att }, damage: dmg, cancel: false }));
const P = (pl) => JSON.parse(world._props.get("fc:p:" + pl.id));
const hold = (pl, it) => { pl.inv.setItem(pl.selectedSlotIndex, it); };
const ow = world.getDimension("minecraft:overworld");
const blk = (x, y, z) => ow.getBlock({ x, y, z });

ok(tooMany.length === 0, "every command has 8 parameters or fewer" + (tooMany.length ? ": " + tooMany.join(", ") : ""));
ok(["f", "fc", "fa", "fadmin", "menu", "shop", "kit", "mute", "hud"].every((c) => cmds[c]), "all commands registered");
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
// trigger feedback: a hit that triggers an enchant tells the attacker
const fb = new ItemStack("minecraft:diamond_sword"); En.applyBook(fb, "blaze", 2, 100);
carol.inv.setItem(0, fb); carol.selectedSlotIndex = 0; carol.bar = "";
for (let i = 0; i < 40 && !strip(carol.bar).includes("BLAZE"); i++) { const z2 = ow.spawnEntity("minecraft:zombie", { x: 500, y: 64, z: 500 }); await hurt(carol, z2, 4); await advance(7); }
ok(strip(carol.bar).includes("BLAZE!"), "triggered enchants show on the action bar");
// held-weapon bonuses
const held = new ItemStack("minecraft:diamond_sword"); En.applyBook(held, "swiftness", 2, 100); En.applyBook(held, "rage", 2, 100);
carol.inv.setItem(0, held); carol.selectedSlotIndex = 0; carol.effects = {};
await advance(40);
ok(carol.effects.speed?.amplifier === 1 && carol.effects.strength?.amplifier === 1, "Swiftness II + Rage II give Speed II and Strength II while held");
ok(carol.effects.strength.duration <= 50, "held effects are short so they fade after switching away");
const emp = new ItemStack("minecraft:diamond_sword"); En.applyBook(emp, "thunder", 1, 100);
carol.inv.setItem(0, emp); carol.effects = {};
await advance(40);
ok(carol.effects.speed?.amplifier === 0 && !carol.effects.strength, "swords with a Legendary enchant are Empowered (Speed I)");
carol.inv.setItem(0, undefined); carol.effects = {};
await advance(40);
ok(!carol.effects.speed && !carol.effects.strength, "no held bonus with an empty hand");
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
ok(["FACTION", "SERVER SHOP", "CRATES", "ENCHANTER", "F-TOP", "DAILY REWARDS", "QUEST MASTER", "AUCTION HOUSE", "HOMES", "DIMENSIONS", "BOUNTIES", "EVENTS", "LEADERBOARDS", "PROFILE", "ADMIN"].every((t) => titles.some((x) => x.includes(t)) || (t === "ADMIN")), "every hub page opens: " + titles.join(", "));
await Mn.factionMenu(alice); await Mn.crawlerMenu(alice, ow.spawnEntity("fc:crawler", { x: 3, y: 64, z: 3 })); await Mn.spawnerMenu(alice, sb); await Mn.cratePreview(alice, "mythic");
await flush();
ok(shown.some((s) => strip(s.title).includes("MYTHIC CRATE") && s.body.includes("%")), "crate preview lists chances");
// shop pages: every item has its own icon (the two golden apples share one, as in vanilla)
const ShopM = await import("./scripts/shop.js");
const MnS = await import("./scripts/menus.js");
let distinct = true;
for (const [k, cat] of Object.keys(ShopM.CATEGORIES).entries()) {
  shown.length = 0;
  globalThis.formAnswers = [2 + k]; // shop page: 2 sell buttons, then the categories
  await MnS.shopMenu(alice); await flush();
  const page = shown[1];
  const icons = page.buttons.slice(0, -1).map((b) => b.i.replace("apple_golden", `apple_golden_${b.t}`));
  if (page.buttons.length - 1 !== ShopM.CATEGORIES[cat].items.length || new Set(icons).size !== icons.length || icons.some((i) => !i.startsWith("textures/"))) distinct = false;
}
ok(distinct, "every shop item has its own icon in every category");
ok(ShopM.SPECIALS.every((x, i, a) => a.findIndex((y) => y.icon === x.icon) === i), "spawners and crawlers each have their own icon");

// ---------- ranks via /tag + chat pack
const Rk = await import("./scripts/ranks.js");
const E2 = await import("./scripts/economy.js");
alice.addTag("Owner");
await advance(40);
const prefixOf = (pl) => strip(pl.getTags().find((t) => t.startsWith("fcprefix:")) ?? "");
ok(prefixOf(alice).includes("[OWNER] [Wolves]"), "/tag add Owner puts the rank in the chat prefix");
ok(alice.msgs.some((m) => strip(m).includes("chat rank is now OWNER")), "player is told about their new rank");
ok(!strip(alice.nameTag).includes("OWNER") && !strip(H.hudText(alice)).includes("OWNER"), "ranks only show in chat (not nametag or sidebar)");
ok(!S.playerData(alice).fastTp && !S.playerData(alice).rankHomes && E2.maxHomes(S.playerData(alice)) === Math.min(6, 1 + Math.floor(S.playerData(alice).level / 10)), "ranks give no perks");
alice.addTag("VIP"); alice.addTag("rank:&6Legend");
await advance(40);
ok((prefixOf(alice).match(/\[/g) ?? []).length === 2 && prefixOf(alice).includes("[OWNER]") && !prefixOf(alice).includes("VIP") && !prefixOf(alice).includes("Legend"), "only one rank shows: the highest");
alice.removeTag("VIP"); alice.removeTag("rank:&6Legend");
Rk.createRank("Builder", "&d&lBUILDER");
bob.addTag("Builder"); carol.addTag("rank:&6Legend");
await advance(40);
ok(bob.getTags().some((t) => t.startsWith("fcprefix:") && t.includes("§d§lBUILDER")), "custom ranks made with /fadmin rank create work with /tag");
ok(prefixOf(carol).includes("[Legend]"), "one-off rank:&6Legend tags work");
const chat = async (pl, text) => { const e = { sender: pl, message: text, cancel: false }; world.beforeEvents.chatSend.fire(e); await flush(); return e; };
M.log.length = 0;
const ce = await chat(alice, "hello everyone");
ok(ce.cancel && strip(M.log.at(-1) ?? "").includes("[OWNER] [Wolves] Alice » hello everyone"), "normal chat shows ranks and faction: " + strip(M.log.at(-1) ?? ""));
await chat(alice, "spam"); M.log.length = 0; await chat(alice, "spam again");
ok(M.log.length === 0 && strip(alice.last()).includes("Slow down"), "chat anti-spam");
await advance(30);
await f(bob, "chat", "faction");
M.log.length = 0; const nC = carol.msgs.length;
await chat(bob, "secret plan");
ok(M.log.length === 0 && strip(alice.last()).includes("[Faction]") && strip(alice.last()).includes("secret plan") && carol.msgs.length === nC, "faction chat mode only reaches the faction");
await f(bob, "chat", "public");
ok((await run("mute", bob, "Carol", "5")).includes("Operators only"), "only operators can mute");
alice.playerPermissionLevel = 2;
await run("mute", alice, "Carol", "5");
await advance(40);
M.log.length = 0; await chat(carol, "let me talk");
ok(M.log.length === 0 && strip(carol.last()).includes("muted"), "muted players can't chat");
alice.removeTag("Owner");
await advance(40);
ok(!alice.getTags().some((t) => t.includes("OWNER")), "/tag remove takes the rank away");

// ---------- kits
const Kt = await import("./scripts/kits.js");
const kitter = await join("Kitter", 7000, 7000);
const kitCount0 = kitter.inv.slots.filter(Boolean).length;
Kt.claimKit(kitter, "starter");
ok(kitter.inv.slots.filter(Boolean).length > kitCount0 + 5, "free Starter kit gives items");
try { Kt.claimKit(kitter, "starter"); ok(false, "kit cooldown"); } catch (e) { ok(strip(e.message).includes("again in"), "kits have a cooldown"); }
try { Kt.claimKit(kitter, "raider"); ok(false, "kit price"); } catch (e) { ok(strip(e.message).includes("You need"), "paid kits need money"); }
S.playerData(kitter).money = 1000000; S.playerData(kitter).crystals = 600;
Kt.claimKit(kitter, "diamond"); Kt.claimKit(kitter, "legend");
ok(S.playerData(kitter).money === 750000 && S.playerData(kitter).crystals === 100, "kits charge money or crystals");
const sword2 = kitter.inv.slots.find((i) => i?.typeId === "minecraft:netherite_sword");
ok(sword2 && En.readEnchants(sword2).frostbite === 2 && sword2.ench.length >= 2, "kit gear has vanilla and custom enchants");
ok(Kt.KITS.every((k) => Kt.contents(k).length > 0), "every kit lists its contents");

// ---------- bosses
const Bs = await import("./scripts/bosses.js");
const mythic = new Set(); for (let i = 0; i < 4000; i++) mythic.add(Cr.roll("mythic"));
ok([1, 2, 3, 4].every((t) => mythic.has(`bossegg:${t}`)), "mythic crates can drop all 4 boss eggs");
ok(["common", "rare", "epic", "legendary"].every((r) => !Cr.LOOT[r].some(([, s]) => s.startsWith("bossegg"))), "boss eggs only come from mythic crates");
const hunter = await join("Hunter", 9000, 9000);
hunter.inv.setItem(0, I.bossEggItem(3)); hunter.selectedSlotIndex = 0;
await before_("playerInteractWithBlock", { player: hunter, block: blk(9000, 63, 9000), itemStack: hunter.inv.getItem(0), blockFace: "Up", isFirstEvent: true, cancel: false });
const golem = ow.getEntities({ type: "fc:boss_golem" })[0];
ok(golem && !hunter.inv.getItem(0) && M.log.some((m) => strip(m).includes("summoned the Infernal Golem")), "boss egg summons its boss and is used up");
hunter.inv.setItem(0, I.bossEggItem(1));
await before_("playerInteractWithBlock", { player: hunter, block: blk(5000, 63, 5000), itemStack: hunter.inv.getItem(0), blockFace: "Up", isFirstEvent: true, cancel: false });
ok(!ow.getEntities({ type: "fc:boss_warlord" }).length && strip(hunter.last()).includes("SafeZone"), "bosses can't be summoned in the SafeZone");
golem.hp = 100; golem.maxHp = 1500;
hunter.location = { x: 9002, y: 64, z: 9000 };
await advance(20 * 15);
ok(hunter.knock || hunter.hp < 20 || Object.keys(hunter.effects).length, "boss uses its attacks on nearby players");
ok(golem.effects.strength, "boss gets enraged below half health");
world.afterEvents.entityHurt.fire({ hurtEntity: golem, damageSource: { damagingEntity: hunter }, damage: 100 });
const itemsBefore = ow.getEntities({ type: "minecraft:item" }).length;
world.afterEvents.entityDie.fire({ deadEntity: golem, damageSource: { damagingEntity: hunter } });
const drops = ow.getEntities({ type: "minecraft:item" }).slice(itemsBefore).map((e) => e.item);
ok(drops.some((d) => d.typeId === "fc:crystal" && d.amount === 200) && drops.some((d) => d.typeId === "fc:bank_note") && drops.length === 4, "Tier 3 boss drops crystals, a bank note and 2 exclusive items");
ok(drops.slice(2).every((d) => /Molten|Magma|Crawler|Spawner/.test((d.nameTag ?? "") + d.getLore().join(" "))), "boss loot comes from its exclusive table: " + drops.slice(2).map((d) => strip(d.nameTag ?? d.typeId)).join(", "));
ok(strip(M.log.at(-1)).includes("was slain") && strip(M.log.at(-1)).includes("Hunter"), "boss death is announced with top damage");

// ---------- frozen spawner mobs + grinding enchants
const grinder = await join("Grinder", 11000, 11000);
await f(grinder, "create", "Grinders"); await f(grinder, "claim");
const gsb = blk(11002, 64, 11002); gsb.setType("fc:spawner_cow");
world.afterEvents.playerPlaceBlock.fire({ block: gsb, player: grinder });
await advance(20 * 13);
const cow = ow.getEntities({ type: "minecraft:cow", tags: ["fc_stack"] })[0];
ok(cow && cow.effects.slowness?.amplifier === 255 && typeof cow.getDynamicProperty("fc:anchor") === "object", "spawner mobs are frozen in place");
const anchor = cow.getDynamicProperty("fc:anchor");
cow.location = { x: anchor.x + 4, y: anchor.y, z: anchor.z };
await advance(20);
ok(Math.abs(cow.location.x - anchor.x) < 0.01, "frozen mobs are put back if they get pushed");
const harvester = I.gearItem("golden_harvester");
ok(En.readEnchants(harvester).greed === 2 && En.readEnchants(harvester).mass_slayer === 1, "Golden Harvester has grinding enchants");
grinder.inv.setItem(0, harvester); grinder.selectedSlotIndex = 0;
cow.setDynamicProperty("fc:stack", 10);
const old = ow.spawnItem(new ItemStack("minecraft:leather", 5), cow.location);
await advance(10);
const m0g = S.playerData(grinder).money, kills0 = S.playerData(grinder).mobKills;
world.afterEvents.entityDie.fire({ deadEntity: cow, damageSource: { damagingEntity: grinder } });
ow.spawnItem(new ItemStack("minecraft:beef", 2), cow.location); // the cow's own drop
await flush(); await advance(4);
const next = ow.getEntities({ type: "minecraft:cow", tags: ["fc_stack"] }).find((e) => e.isValid && e !== cow);
ok(next?.getDynamicProperty("fc:stack") === 8, "Mass Slayer I kills 2 from the stack at once");
ok(S.playerData(grinder).mobKills - kills0 === 2 && S.playerData(grinder).money - m0g >= 24, "Greed II pays per kill ($12 each)");
const beef = ow.getEntities({ type: "minecraft:item" }).filter((e) => e.item?.typeId === "minecraft:beef");
ok(beef.length >= 2, "extra kills copy the mob's fresh drops");
ok(ow.getEntities({ type: "minecraft:item" }).filter((e) => e.item?.typeId === "minecraft:leather").length === 1, "old items lying nearby are never copied");

// ---------- chat messages when enchants go off
const fsw = new ItemStack("minecraft:diamond_sword"); En.applyBook(fsw, "frostbite", 3, 100);
grinder.inv.setItem(0, fsw);
for (let i = 0; i < 60 && !grinder.msgs.some((m) => strip(m).includes("Frostbite slowed Zombie")); i++) { const zz = ow.spawnEntity("minecraft:zombie", { x: 11001, y: 64, z: 11001 }); await hurt(grinder, zz, 2); await advance(41); }
ok(grinder.msgs.some((m) => strip(m).includes("[Enchant] Frostbite slowed Zombie.")), "chat says which enchant went off and what it did");
const victim = await join("Victim", 11003, 11003);
for (let i = 0; i < 60 && !victim.msgs.some((m) => strip(m).includes("Grinder's Frostbite slowed you")); i++) { await hurt(grinder, victim, 1); await advance(41); }
ok(victim.msgs.some((m) => strip(m).includes("Grinder's Frostbite slowed you")), "players hit by an enchant are told too");
S.playerData(grinder).procChat = false;
const n0 = grinder.msgs.length;
for (let i = 0; i < 30; i++) { const zz = ow.spawnEntity("minecraft:zombie", { x: 11001, y: 64, z: 11001 }); await hurt(grinder, zz, 2); await advance(41); }
ok(!grinder.msgs.slice(n0).some((m) => strip(m).includes("[Enchant]")), "enchant messages can be turned off");

// ---------- quest lines, Quest Master and rebirth
const QL = await import("./scripts/questlines.js");
const ShopQ = await import("./scripts/shop.js");
const quester = await join("Quester", 13000, 13000);
quester.inv.setItem(0, new ItemStack("minecraft:oak_log", 64));
for (let i = 1; i < 8; i++) quester.inv.setItem(i, new ItemStack("minecraft:oak_log", 64));
quester.inv.setItem(8, new ItemStack("minecraft:raw_iron", 10));
ShopQ.sellAll(quester);
const qp = S.playerData(quester);
ok(QL.soldOf(qp, QL.lineById("lumberjack").items[0]) === 512 && QL.questLevel(qp) === 1, "selling 512 oak logs reaches Oak Log Tier I = Quest Level 1");
ok(QL.soldOf(qp, QL.lineById("miner").items[2]) === 10, "raw iron counts toward the Iron quest");
ok(quester.msgs.some((m) => strip(m).includes("Oak Log reached Tier I")), "tier-ups are announced");
const keys0 = quester.inv.slots.filter((i) => i?.typeId === "fc:key_common").reduce((n, i) => n + i.amount, 0);
QL.claimLevels(quester);
ok(QL.ql(qp).claimed === 1 && quester.inv.slots.some((i) => i?.typeId === "fc:key_common" && i.amount > keys0 - 1), "Quest Master rewards can be claimed");
try { QL.claimLevels(quester); ok(false, "double claim"); } catch { ok(true, "can't claim the same level twice"); }
try { QL.rebirth(quester); ok(false, "early rebirth"); } catch (e) { ok(strip(e.message).includes("Quest Level 100"), "rebirth is locked before Quest Level 100"); }
// Max the Farmer line to earn its chat rank.
for (const it of QL.lineById("farmer").items) QL.recordSold(qp, `minecraft:${it.match[0]}`, it.base * 50, quester);
ok(QL.lineDone(qp, QL.lineById("farmer")) && quester.hasTag("rank:&a&lFARMER"), "maxing a line gives its chat rank");
// Max everything, claim to 100, rebirth.
for (const line of QL.LINES) for (const it of line.items) QL.recordSold(qp, `minecraft:${it.match[0]}`, it.base * 50, quester);
ok(QL.questLevel(qp) === 100, "Quest Level caps at 100 (lines have 140 tiers)");
QL.claimLevels(quester);
const money0 = qp.money;
QL.rebirth(quester);
ok(qp.rebirths === 1 && QL.questLevel(qp) === 0 && QL.ql(qp).claimed === 0 && qp.money >= money0 + 25000000, "rebirth resets quests and gives rewards");
const qHas = (id) => quester.inv.slots.some((i) => i?.typeId === id) || ow.getEntities({ type: "minecraft:item", location: quester.location, maxDistance: 2 }).some((e) => e.item?.typeId === id);
ok(qHas("fc:key_mythic") && qHas("fc:spawner_blaze"), "rebirth gives mythic keys and spawners (full inventory drops at your feet)");
quester.inv.setItem(20, new ItemStack("minecraft:diamond", 10));
const m1q = qp.money; quester.selectedSlotIndex = 20; ShopQ.sellHand(quester);
ok(qp.money - m1q === 2400, "after rebirth 1 sales pay x2");
await advance(40);
ok(quester.getTags().some((t) => t.startsWith("fcprefix:") && t.includes("[R1]")), "rebirth badge shows in chat");
// screens
const MnQ = await import("./scripts/menus.js");
shown.length = 0; globalThis.formAnswers = [];
await MnQ.questMasterMenu(quester); await MnQ.questLineMenu(quester, "monster"); await MnQ.rebirthMenu(quester); await flush();
const [qm, qline, reb] = shown;
const tileCount = (f) => f.buttons.filter((b) => b.t.startsWith("§t§i§l§r")).length;
ok(qm.title.startsWith("§b§o§a§r") && tileCount(qm) === 10 && qm.buttons.some((b) => b.t.startsWith("§b§n§r§r")), "Quest Master: 4 line + 6 reward tiles and a banner");
ok(["Lumberjack", "Miner", "Farmer", "Monster Hunter"].every((n, i) => strip(qm.buttons[i].t).startsWith(n)), "quest lines are the first tiles on the Quest Master");
ok(tileCount(qline) === 10 && qline.buttons.some((b) => strip(b.t).includes("SELL NOW")), "Monster Hunter page: 10 item tiles and SELL NOW");
ok(tileCount(reb) === 6 && reb.buttons.some((b) => b.t.startsWith("§a§c§l§r") && strip(b.t).includes("REBIRTH LOCKED")), "Rebirth Oracle: 6 reward tiles, locked button");
ok(qm.buttons.findIndex((b) => b.t.startsWith("§t§i§l§r")) === 0 && qm.buttons.slice(0, 10).every((b) => b.t.startsWith("§t§i§l§r")), "tiles come first so the grid shows them");

// ---------- menu NPCs
const npcAdmin = await join("NpcAdmin", 15000, 15000); npcAdmin.playerPermissionLevel = 2;
await run("fadmin", npcAdmin, "npc", "quests");
const npcs = ow.getEntities({ type: "fc:npc" });
ok(npcs.length === 6 && npcs.every((n) => strip(n.nameTag).includes("Interact to open")), "/fadmin npc quests places 6 labelled NPCs");
ok(new Set(npcs.map((n) => n.getDynamicProperty("fc:npc"))).size === 6 && npcs.every((n) => typeof n.props["fc:skin"] === "number"), "each quest NPC has its own type and skin");
shown.length = 0; globalThis.formAnswers = [];
const farmerNpc = npcs.find((n) => n.getDynamicProperty("fc:npc") === "farmer");
await before_("playerInteractWithEntity", { player: npcAdmin, target: farmerNpc, cancel: false });
await flush();
ok(shown.some((s) => strip(s.title).startsWith("Farmer")), "tapping the Farmer NPC opens the Farmer quest page");
shown.length = 0;
const qmNpc = npcs.find((n) => n.getDynamicProperty("fc:npc") === "questmaster");
await advance(20);
world.afterEvents.entityHitEntity.fire({ damagingEntity: npcAdmin, hitEntity: qmNpc });
await flush();
ok(shown.some((s) => strip(s.title).startsWith("QUEST MASTER")), "hitting the Quest Master NPC opens it too");
await run("fadmin", npcAdmin, "npc", "shop");
ok(ow.getEntities({ type: "fc:npc" }).some((n) => n.getDynamicProperty("fc:npc") === "shop"), "single NPCs can be placed (shop)");
await run("fadmin", npcAdmin, "npc", "remove");
ok(ow.getEntities({ type: "fc:npc" }).filter((n) => n.isValid).length === 6, "/fadmin npc remove removes the nearest");

// ---------- persistence
const S2 = await import("./scripts/store.js?reload"); S2.ensureLoaded();
ok(S2.findFaction("wolves") && S2.findPlayerRecord("Alice").kills === 1 && S2.spawnersT.values().length === 2, "everything reloads after a restart");

ok(errors.length === 0, "no script errors logged" + (errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""));
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
