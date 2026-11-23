// Factions Core - slash commands. Registered as factions:<name> but can be
// typed without the prefix (/f, /menu, /shop ...).
import { system, Player, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { CONFIG, RARITIES } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import * as A from "./actions.js";
import * as M from "./menus.js";
import * as T from "./teleports.js";
import * as Shop from "./shop.js";
import * as AH from "./auction.js";
import * as Ev from "./events.js";
import * as H from "./holograms.js";
import * as I from "./items.js";
import { claimDaily } from "./daily.js";
import { placeBounty } from "./combat.js";
import { autoclaimers } from "./tasks.js";
import { refreshHud } from "./hud.js";
import { hasPerm } from "./perm.js";
import * as Rk from "./ranks.js";
import * as Kt from "./kits.js";

const NS = "factions";
const need = (v, usage) => {
  if (v === undefined || v === "") throw new E.Fail(`Usage: §e${usage}`);
  return v;
};

const F_ACTIONS = {
  help: (pl) => A.help(pl),
  menu: (pl) => M.openHub(pl),
  create: (pl, a) => A.create(pl, a[0]),
  disband: (pl) => A.disband(pl),
  invite: (pl, a) => A.invite(pl, need(a[0], "/f invite <player>")),
  uninvite: (pl, a) => A.uninvite(pl, need(a[0], "/f uninvite <player>")),
  join: (pl, a) => A.join(pl, need(a[0], "/f join <faction>")),
  leave: (pl) => A.leave(pl),
  kick: (pl, a) => A.kick(pl, need(a[0], "/f kick <player>")),
  promote: (pl, a) => A.promote(pl, need(a[0], "/f promote <player>")),
  demote: (pl, a) => A.demote(pl, need(a[0], "/f demote <player>")),
  leader: (pl, a) => A.leader(pl, need(a[0], "/f leader <player>")),
  rename: (pl, a) => A.rename(pl, need(a[0], "/f rename <name>")),
  desc: (pl, a) => A.describe(pl, a.join(" ")),
  open: (pl) => A.toggleOpen(pl),
  color: (pl, a) => A.setColor(pl, need(a[0], "/f color <colour>")),
  info: (pl, a) => A.info(pl, a[0]),
  list: (pl, a) => A.list(pl, a[0]),
  who: (pl, a) => A.who(pl, need(a[0], "/f who <player>")),
  power: (pl, a) => A.power(pl, a[0]),
  claim: (pl, a) => A.claim(pl, a[0]),
  unclaim: (pl, a) => A.unclaim(pl, a[0]),
  autoclaim: (pl) => {
    const on = !autoclaimers.has(pl.id);
    if (on) { A.autoClaimHere(pl); autoclaimers.add(pl.id); } else autoclaimers.delete(pl.id);
    R.tell(pl, `Autoclaim ${on ? "§aon§r: walk into wilderness to claim it" : "§coff"}§r.`);
  },
  map: (pl) => A.map(pl),
  sethome: (pl) => A.setHome(pl),
  home: (pl) => T.factionHome(pl),
  ally: (pl, a) => A.setRelation(pl, "ally", need(a[0], "/f ally <faction>")),
  truce: (pl, a) => A.setRelation(pl, "truce", need(a[0], "/f truce <faction>")),
  neutral: (pl, a) => A.setRelation(pl, "neutral", need(a[0], "/f neutral <faction>")),
  enemy: (pl, a) => A.setRelation(pl, "enemy", need(a[0], "/f enemy <faction>")),
  deposit: (pl, a) => A.deposit(pl, need(a[0], "/f deposit <amount>")),
  withdraw: (pl, a) => A.withdraw(pl, need(a[0], "/f withdraw <amount>")),
  upgrade: (pl, a) => A.buyUpgrade(pl, need(a[0], "/f upgrade <members|land|spawners|crawlers|haste|speed|shield|xp>")),
  shield: (pl, a) => A.setShield(pl, a[0]),
  top: (pl) => M.ftopMenu(pl),
  quests: (pl) => M.questsMenu(pl),
  chat: (pl, a) => R.tell(pl, `Chat mode: §e${Rk.setChatMode(pl, a[0])}§r. Normal chat now goes to ${({ public: "everyone", faction: "your faction", ally: "your faction and allies" })[S.playerData(pl).chatMode]}.`),
};

const ADMIN_ACTIONS = {
  help: (pl) => pl.sendMessage([
    "§6---- /fadmin ----",
    "§ebypass§7 - build/open anywhere",
    "§esafezone|warzone [radius]§7 - claim admin land",
    "§eunclaim [radius]§7 - remove any claims",
    "§edisband <faction>§7, §esetpower <player> <n>§7, §ejoin <faction>",
    "§eeco <give|take|set> <player> <amount>§7 - money",
    "§ecrystals <player> <amount>§7 - give crystals",
    "§egive <item> [amount]§7 - key_<rarity>, book_<rarity>, spawner_<type>, crawler_<type>, gear_<id>, crystal, genbucket, buster, wand, xpshard, power, mystery, crate_<rarity>, bossegg_<1-4>",
    "§esetspawn§7, §esetwarp <name>§7, §edelwarp <name>",
    "§ekoth <set [radius]|start|stop>§7, §eenvoy§7 - events",
    "§ehologram <ftop|money|kills|level|streak|welcome|remove>",
    "§erank [list|create <name> [look]|delete <name>]§7 - give ranks with §e/tag <player> add <rank>",
  ].join("\n")),
  bypass: (pl) => {
    const on = !R.hasBypass(pl);
    pl.setDynamicProperty("fc:bypass", on || undefined);
    R.tell(pl, `Admin bypass ${on ? "§aon" : "§coff"}§r.`);
  },
  safezone: (pl, a) => A.claim(pl, a[0], S.SAFEZONE),
  warzone: (pl, a) => A.claim(pl, a[0], S.WARZONE),
  unclaim: (pl, a) => A.unclaim(pl, a[0], true),
  disband: (pl, a) => {
    const f = S.findFaction(need(a[0], "/fadmin disband <faction>"));
    if (!f || f.system) throw new E.Fail(`No faction called ${a[0]}.`);
    const online = R.onlineMembers(f.id);
    S.deleteFaction(f.id);
    for (const m of online) { R.refreshNametag(m); R.tell(m, "Your faction was disbanded by an admin."); }
    R.tell(pl, `Disbanded §e${f.name}§r.`);
  },
  setpower: (pl, a) => {
    const t = S.findPlayerRecord(need(a[0], "/fadmin setpower <player> <amount>"));
    if (!t) throw new E.Fail(`No player called ${a[0]}.`);
    const n = Number(a[1]);
    if (!Number.isFinite(n)) throw new E.Fail("Usage: /fadmin setpower <player> <amount>");
    t.power = Math.min(CONFIG.maxPower, Math.max(CONFIG.minPower, n));
    S.savePlayer(t);
    R.tell(pl, `§e${t.name}§r now has ${t.power} power.`);
  },
  join: (pl, a) => {
    const f = S.findFaction(need(a[0], "/fadmin join <faction>"));
    if (!f || f.system) throw new E.Fail(`No faction called ${a[0]}.`);
    const p = S.playerData(pl);
    if (p.rank === "leader" && p.faction !== f.id) throw new E.Fail("You lead a faction; disband or hand it over first.");
    p.faction = f.id;
    p.rank = "officer";
    S.savePlayer(p);
    R.refreshNametag(pl);
    R.tellFaction(f.id, `Admin §e${pl.name}§r joined as an officer.`);
  },
  eco: (pl, a) => {
    const t = S.findPlayerRecord(need(a[1], "/fadmin eco <give|take|set> <player> <amount>"));
    if (!t) throw new E.Fail(`No player called ${a[1]}.`);
    const n = E.parseAmount(a[2]);
    if (!(n >= 0)) throw new E.Fail("Give an amount.");
    if (a[0] === "give") E.addMoney(t, n);
    else if (a[0] === "take") { t.money = Math.max(0, t.money - n); S.savePlayer(t); }
    else if (a[0] === "set") { t.money = n; S.savePlayer(t); }
    else throw new E.Fail("Usage: /fadmin eco <give|take|set> <player> <amount>");
    R.tell(pl, `§e${t.name}§r now has §a${E.money(t.money)}§r.`);
  },
  crystals: (pl, a) => {
    const t = S.findPlayerRecord(need(a[0], "/fadmin crystals <player> <amount>"));
    if (!t) throw new E.Fail(`No player called ${a[0]}.`);
    E.addCrystals(t, Math.floor(Number(a[1]) || 0));
    R.tell(pl, `§e${t.name}§r now has §b${t.crystals}§r crystals.`);
  },
  give: (pl, a) => {
    const what = need(a[0], "/fadmin give <item> [amount]").toLowerCase();
    const n = Math.max(1, Math.floor(Number(a[1]) || 1));
    const [kind, ...rest] = what.split("_");
    const arg = rest.join("_");
    let item;
    if (kind === "key" && RARITIES.includes(arg)) item = I.keyItem(arg, n);
    else if (kind === "book" && RARITIES.includes(arg)) { for (let i = 0; i < n; i++) I.giveItem(pl, I.bookItem(arg)); return; }
    else if (kind === "spawner" && I.SPAWNERS[arg]) item = I.spawnerItem(arg, n);
    else if (kind === "crawler" && I.CRAWLERS[arg]) item = I.crawlerItem(arg);
    else if (kind === "gear" && I.GEAR[arg]) item = I.gearItem(arg);
    else if (kind === "crate" && RARITIES.includes(arg)) { I.giveItem(pl, I.makeItem(`fc:crate_${arg}`, { amount: n })); return; }
    else if (what === "crystal") item = I.crystalItem(n);
    else if (what === "genbucket") item = I.genbucketItem("cobble", n);
    else if (what === "genbucket_obsidian") item = I.genbucketItem("obsidian", n);
    else if (what === "genbucket_sand") item = I.genbucketItem("sand", n);
    else if (what === "buster") item = I.busterItem(n);
    else if (what === "wand") item = I.wandItem(100);
    else if (what === "xpshard") item = I.xpShardItem(n);
    else if (what === "power") item = I.powerShardItem(n);
    else if (what === "mystery") item = I.mysteryItem(n);
    else if (what === "menu") item = I.menuItem();
    else if (what === "supply_drop") item = I.makeItem("fc:supply_drop", { amount: n });
    else if (kind === "bossegg" && I.BOSS_NAMES[arg]) item = I.bossEggItem(+arg, n);
    if (!item) throw new E.Fail("Unknown item. See §e/fadmin help§r.");
    I.giveItem(pl, item);
  },
  setspawn: (pl) => {
    const l = pl.location;
    S.kv.set("spawn", { dim: pl.dimension.id, x: l.x, y: l.y, z: l.z });
    R.tell(pl, "Spawn set here.");
  },
  setwarp: (pl, a) => T.setWarp(pl, need(a[0], "/fadmin setwarp <name>")),
  delwarp: (pl, a) => T.delWarp(pl, need(a[0], "/fadmin delwarp <name>")),
  koth: (pl, a) => {
    if (a[0] === "set") { Ev.setKothZone(pl, a[1]); R.tell(pl, "KOTH zone set here."); }
    else if (a[0] === "start") Ev.startKoth();
    else if (a[0] === "stop") { if (!Ev.stopKoth()) R.tell(pl, "KOTH isn't running."); }
    else throw new E.Fail("Usage: /fadmin koth <set [radius]|start|stop>");
  },
  envoy: (pl) => R.tell(pl, `Dropped ${Ev.startEnvoy()} supply crates.`),
  rank: (pl, a) => {
    const sub = (a[0] ?? "list").toLowerCase();
    if (sub === "create") { const r = Rk.createRank(need(a[1], "/fadmin rank create <name> [look]"), a[2]); return R.tell(pl, `Created ${r.display}§r. Give it with §e/tag <player> add ${r.name}`); }
    if (sub === "delete") { Rk.deleteRank(need(a[1], "/fadmin rank delete <name>")); return R.tell(pl, `Deleted rank ${a[1]}.`); }
    R.tell(pl, `Ranks: ${[...Rk.BUILTIN_RANKS, ...Rk.customRanks()].map((r) => `${r.display}§r §7(${r.name})`).join("§7, ")}\n§7Give one with §e/tag <player> add <name>§7, or a one-off with §e/tag <player> add "rank:&d&lName"`);
  },
  hologram: (pl, a) => {
    if (a[0] === "remove") return H.removeNearestHolo(pl);
    H.placeHolo(pl, need(a[0], "/fadmin hologram <type|remove>"));
  },
};

/** Runs an action next tick (commands start in read-only mode) and reports failures. */
function run(origin, fn) {
  const player = origin.sourceEntity instanceof Player ? origin.sourceEntity : origin.initiator;
  if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Players only." };
  system.run(() => {
    try {
      const r = fn(player);
      if (r instanceof Promise) r.catch((e) => console.error(`[Factions] ${e}`));
    } catch (e) {
      if (e instanceof E.Fail) R.tell(player, "§c" + e.message);
      else { R.tell(player, "§cSomething went wrong. Check the content log."); console.error(`[Factions] ${e}\n${e?.stack ?? ""}`); }
    }
  });
  return { status: CustomCommandStatus.Success };
}

const words = (n, from = 1) => Array.from({ length: n }, (_, i) => ({ name: `word${i + from}`, type: CustomCommandParamType.String }));
const clean = (args) => args.filter((x) => x !== undefined && x !== null).map(String);

export function setupCommands() {
  system.beforeEvents.startup.subscribe(({ customCommandRegistry: raw }) => {
    // Minecraft allows at most 8 parameters per command. If one command
    // fails to register, log it and carry on with the rest.
    const reg = {
      registerEnum: (n, v) => { try { raw.registerEnum(n, v); } catch (e) { console.error(`[Factions] enum ${n}: ${e}`); } },
      registerCommand: (def, cb) => {
        const count = (def.mandatoryParameters?.length ?? 0) + (def.optionalParameters?.length ?? 0);
        if (count > 8) console.error(`[Factions] ${def.name} has ${count} parameters (max 8)`);
        try { raw.registerCommand(def, cb); } catch (e) { console.error(`[Factions] command ${def.name}: ${e}`); }
      },
    };
    reg.registerEnum(`${NS}:action`, Object.keys(F_ACTIONS));
    reg.registerEnum(`${NS}:admin_action`, Object.keys(ADMIN_ACTIONS));

    const simple = (name, description, fn, nWords = 0) => reg.registerCommand(
      { name: `${NS}:${name}`, description, permissionLevel: CommandPermissionLevel.Any, optionalParameters: words(nWords) },
      (origin, ...rest) => run(origin, (pl) => fn(pl, clean(rest))),
    );

    reg.registerCommand({
      name: `${NS}:f`,
      description: "Factions: /f opens your faction, /f help lists commands",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ name: `${NS}:action`, type: CustomCommandParamType.Enum }, ...words(7)],
    }, (origin, action, ...rest) => run(origin, (pl) => (action ? F_ACTIONS[action](pl, clean(rest)) : M.factionMenu(pl))));

    simple("menu", "Open the server menu", (pl) => M.openHub(pl));
    simple("shop", "Open the server shop", (pl) => M.shopMenu(pl));
    simple("sell", "Sell items: /sell hand or /sell all", (pl, a) => (a[0] === "all" ? Shop.sellAll(pl) : Shop.sellHand(pl)), 1);
    simple("pay", "Pay a player: /pay <player> <amount>", (pl, a) => E.pay(pl, need(a[0], "/pay <player> <amount>"), need(a[1], "/pay <player> <amount>")), 2);
    simple("bal", "Show a balance: /bal [player]", (pl, a) => {
      const t = a[0] ? S.findPlayerRecord(a[0]) : S.playerData(pl);
      if (!t) throw new E.Fail("No such player.");
      R.tell(pl, `§e${t.name}§r has §a${E.money(t.money)}§r and §b${t.crystals}§r crystals.`);
    }, 1);
    simple("ah", "Auction house: /ah or /ah sell <price>", (pl, a) => (a[0] === "sell" ? AH.list(pl, need(a[1], "/ah sell <price>")) : M.auctionMenu(pl)), 2);
    simple("crates", "Open the crates menu", (pl) => M.cratesMenu(pl));
    simple("quests", "Quest Master: quest lines, Quest Levels and rebirth", (pl) => M.questMasterMenu(pl));
    simple("rebirth", "Open the Rebirth Oracle", (pl) => M.rebirthMenu(pl));
    simple("kit", "Kit shop: /kit or /kit <name>", (pl, a) => (a[0] ? Kt.claimKit(pl, a[0]) : M.kitsMenu(pl)), 1);
    simple("daily", "Claim your daily reward", (pl) => claimDaily(pl));
    simple("bounty", "Place a bounty: /bounty <player> <amount>", (pl, a) => placeBounty(pl, need(a[0], "/bounty <player> <amount>"), need(a[1], "/bounty <player> <amount>")), 2);
    simple("spawn", "Teleport to spawn", (pl) => T.spawn(pl));
    simple("wild", "Teleport somewhere random in the wilderness", (pl) => T.wild(pl));
    simple("home", "Teleport home: /home [name]", (pl, a) => T.home(pl, a[0] ?? "home"), 1);
    simple("sethome", "Set a home: /sethome [name]", (pl, a) => T.setHome(pl, a[0] ?? "home"), 1);
    simple("delhome", "Delete a home: /delhome [name]", (pl, a) => T.delHome(pl, a[0] ?? "home"), 1);
    simple("warp", "Teleport to a warp: /warp <name>", (pl, a) => (a[0] ? T.warp(pl, a[0]) : M.warpsMenu(pl)), 1);
    const staffOnly = (pl) => { if (!hasPerm(pl)) throw new E.Fail("Operators only."); };
    simple("mute", "Mute a player: /mute <player> [minutes]", (pl, a) => {
      staffOnly(pl);
      const { p, m } = Rk.mute(need(a[0], "/mute <player> [minutes]"), a[1]);
      R.broadcast(`§e${p.name}§r was muted for ${m} minute(s) by §e${pl.name}§r.`);
    }, 2);
    simple("unmute", "Unmute a player: /unmute <player>", (pl, a) => {
      staffOnly(pl);
      const p = Rk.unmute(need(a[0], "/unmute <player>"));
      R.tell(pl, `§e${p.name}§r can talk again.`);
    }, 1);
    simple("hud", "Show or hide the sidebar", (pl) => {
      const p = S.playerData(pl);
      p.hud = !p.hud;
      S.savePlayer(p);
      refreshHud(pl);
      R.tell(pl, `Sidebar ${p.hud ? "§aon" : "§coff"}§r.`);
    });

    for (const [name, chat] of [["fc", false], ["fa", true]]) {
      reg.registerCommand({
        name: `${NS}:${name}`,
        description: chat ? "Message your faction and its allies" : "Message your faction",
        permissionLevel: CommandPermissionLevel.Any,
        mandatoryParameters: words(1),
        optionalParameters: words(7, 2),
      }, (origin, ...rest) => run(origin, (pl) => A.chat(pl, clean(rest).join(" "), chat)));
    }

    reg.registerCommand({
      name: `${NS}:fadmin`,
      description: "Factions admin tools - /fadmin help",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      mandatoryParameters: [{ name: `${NS}:admin_action`, type: CustomCommandParamType.Enum }],
      optionalParameters: words(3),
    }, (origin, action, ...rest) => run(origin, (pl) => {
      if (!hasPerm(pl) && !R.hasBypass(pl)) throw new E.Fail("Operators only.");
      return ADMIN_ACTIONS[action](pl, clean(rest));
    }));
  });
}
