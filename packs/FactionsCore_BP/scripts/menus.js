// Factions Core - every menu screen.
import { world, EquipmentSlot, ItemStack } from "@minecraft/server";
import { CONFIG, RARITY, RARITIES, RANK_LEVEL, RANK_ICON, UPGRADES } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import * as A from "./actions.js";
import * as UI from "./ui.js";
import * as Shop from "./shop.js";
import * as AH from "./auction.js";
import * as Q from "./quests.js";
import * as D from "./daily.js";
import * as T from "./teleports.js";
import * as Ev from "./events.js";
import * as Sp from "./spawners.js";
import * as Cr from "./crawlers.js";
import * as H from "./holograms.js";
import { ftop, ftopRank, ftopRow } from "./ftop.js";
import { placeBounty } from "./combat.js";
import { openCrate, previewLines } from "./crates.js";
import { ENCHANTS, readEnchants, applyBook, fits, roman } from "./enchants.js";
import { SPAWNERS, CRAWLERS, GEAR, countItems, takeItems, rewardLabel, KEY, giveItem, noteItem, gearItem, keyItem, bookItem, spawnerItem, crawlerItem, genbucketItem, busterItem, wandItem, xpShardItem, powerShardItem, mysteryItem, menuItem } from "./items.js";
import { hasPerm } from "./perm.js";
import { refreshHud } from "./hud.js";
import { autoclaimers } from "./tasks.js";
import * as Rk from "./ranks.js";
import { VERSION } from "./version.js";
import * as Kt from "./kits.js";
import * as QL from "./questlines.js";
import * as Npc from "./npcs.js";
import { bossInfo } from "./bosses.js";

const { attempt } = UI;
const pct = (a, b) => (b ? Math.floor((a / b) * 100) : 0);

// ============================================================ HUB

export function openHub(player) {
  hubScreen(player).catch((e) => console.error(`[Factions] menu: ${e}\n${e?.stack}`));
}

async function hubScreen(player) {
  const p = S.playerData(player);
  const f = S.getFaction(p.faction);
  const need = E.xpForLevel(p.level);
  const l = player.location;
  const sh = f ? R.shieldState(f) : undefined;
  const lines = [
    `§lLEVEL ${p.level}§r  §a${E.fmt(p.xp)} / ${E.fmt(need)} XP`,
    E.bar(p.xp / need, 40, "§a", "§8"),
    f ? (sh.none ? "§cNO SHIELD §7- set one in Factions > Shield" : sh.active ? `§aSHIELDED §7drops in ${A.dur(sh.ms)}` : `§cUNSHIELDED §7shield in ${A.dur(sh.ms)}`) : "§7Join a faction to get a raid shield",
    f ? E.bar(sh.active ? sh.ms / (R.shieldLength(f) * 3600000) : 0, 40, "§b", "§8") : "",
    "",
    `§b§lWelcome to ${CONFIG.serverName}!`,
    "§fClaim land, fill the treasury and climb the §bF-TOP§f board.",
    "§fPick a page from the rail on the left.",
    "",
    "§b§lQUICK TIPS",
    "§f- Create or join a faction from §bFACTIONS§f.",
    "§f- Sell ores and drops in the §bSERVER SHOP§f for fast cash.",
    "§f- Place §bOre Crawlers§f and §bSpawners§f to grow your F-Top value.",
    "§f- Set a daily §bshield§f to cover the hours you are offline.",
    "§f- Open crates for §6legendary gear§f and enchant books.",
    "",
    ...Ev.hudEventLines(player),
  ];
  const cards = [
    { text: "PLAYER", sub: `§f${player.name}`, icon: "player", action: () => profileMenu(player) },
    { text: "BALANCE", sub: `§a${E.money(p.money)}`, icon: "coin", action: () => bankMenu(player) },
    { text: "CRYSTALS", sub: `§b${E.fmt(p.crystals)}`, icon: "crystal", action: () => crystalShopMenu(player) },
    { text: "FACTION", sub: f ? `§${f.color}${f.name}` : "§7None", icon: "faction", action: () => factionMenu(player) },
    { text: "LEVEL", sub: `§a${p.level}`, icon: "level", action: () => profileMenu(player) },
    { text: "PLAYERS", sub: `§a${world.getAllPlayers().length} online`, icon: "players", action: () => playersMenu(player) },
    { text: "WORLD", sub: `§f${S.DIM_NAME[player.dimension.id] ?? "?"}`, icon: "world", action: () => warpsMenu(player) },
    { text: "POSITION", sub: `§f${Math.floor(l.x)}, ${Math.floor(l.z)}`, icon: "position", action: () => A.map(player) },
  ];
  const rail = [
    { text: "QUEST MASTER", sub: "Quest Lines & Rebirth", icon: "quests", action: () => questMasterMenu(player) },
    { text: "FACTIONS", sub: "Dashboard & Stats", icon: "faction", action: () => factionMenu(player) },
    { text: "SERVER SHOP", sub: "Buy & Sell Items", icon: "shop", action: () => shopMenu(player) },
    { text: "KITS", sub: "Gear Bundles", icon: "kit", action: () => kitsMenu(player) },
    { text: "CRATES", sub: "Open Rare Loot", icon: "crate", action: () => cratesMenu(player) },
    { text: "BOSSES", sub: "Boss Eggs & Drops", icon: "boss", action: () => bossesMenu(player) },
    { text: "ENCHANTER", sub: "Custom Enchants", icon: "enchant", action: () => enchanterMenu(player) },
    { text: "F-TOP", sub: "Faction Rankings", icon: "ftop", action: () => ftopMenu(player) },
    { text: "DAILY REWARDS", sub: "Claim Rewards", icon: "daily", action: () => dailyMenu(player) },
    { text: "AUCTION HOUSE", sub: "Buy & Sell", icon: "auction", action: () => auctionMenu(player) },
    { text: "HOMES", sub: "Manage Homes", icon: "home", action: () => homesMenu(player) },
    { text: "DIMENSIONS", sub: "Teleportation", icon: "world", action: () => warpsMenu(player) },
    { text: "BOUNTIES", sub: "Hunt Players", icon: "bounty", action: () => bountyMenu(player) },
    { text: "EVENTS", sub: "KOTH & Envoys", icon: "event", action: () => eventsMenu(player) },
    { text: "LEADERBOARDS", sub: "Top Players", icon: "trophy", action: () => leaderboardMenu(player) },
    { text: "SETTINGS", sub: "Profile & HUD", icon: "settings", action: () => profileMenu(player) },
  ];
  if (hasPerm(player)) rail.push({ text: "ADMIN", sub: "Server Tools", icon: "admin", action: () => adminMenu(player) });
  await UI.hub(player, { title: "MAIN MENU", body: lines.join("\n"), cards, rail });
}

const back = (player) => () => hubScreen(player);

// ============================================================ PROFILE & BANK

async function profileMenu(player) {
  const p = S.playerData(player);
  const need = E.xpForLevel(p.level);
  const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
  const body = [
    `§b§l${player.name}`,
    `§7Level §f${p.level}  §8${E.bar(p.xp / need, 20, "§a")} §7${pct(p.xp, need)}%`,
    `§7Balance §a${E.money(p.money)}   §7Crystals §b${p.crystals}`,
    `§7Power §f${Math.round(p.power * 10) / 10}/${CONFIG.maxPower}`,
    `§7Kills §f${p.kills}  §7Deaths §f${p.deaths}  §7K/D §f${kd}`,
    `§7Streak §f${p.streak}  §7Best §f${p.bestStreak}  §7Mob kills §f${p.mobKills}`,
    `§7Blocks mined §f${E.fmt(p.mined)}  §7Crates opened §f${p.cratesOpened}`,
    `§7Time played §f${Math.floor(p.playMinutes / 60)}h ${p.playMinutes % 60}m`,
    `§7Total earned §a${E.money(p.earned)}`,
    `§7Homes §f${Object.keys(p.homes).length}/${E.maxHomes(p)}  §8(+1 every 10 levels)`,
    p.bounty ? `§cBounty on you: ${E.money(p.bounty)}` : "",
    "",
    "§b§lLEVEL REWARDS",
    "§fEvery level: money  §8|  §fEvery 5: crystals  §8|  §fEvery 10: a crate key",
  ];
  await UI.menu(player, {
    title: "PROFILE",
    body: body.join("\n"),
    buttons: [
      { text: p.hud ? "Hide Sidebar" : "Show Sidebar", sub: "Toggle the profile HUD", icon: "settings", action: () => { p.hud = !p.hud; S.savePlayer(p); refreshHud(player); R.tell(player, `Sidebar ${p.hud ? "§aon" : "§coff"}§r.`); } },
      { text: `Enchant Messages: ${p.procChat === false ? "OFF" : "ON"}`, sub: "Chat lines when enchants go off", icon: "enchant", action: () => { p.procChat = p.procChat === false; S.savePlayer(p); R.tell(player, `Enchant messages ${p.procChat ? "§aon" : "§coff"}§r.`); } },
      { text: `Chat: ${(p.chatMode ?? "public").toUpperCase()}`, sub: "Public, faction or ally chat", icon: "mail", action: () => attempt(player, () => R.tell(player, `Chat mode: §e${Rk.setChatMode(player)}§r.`)) },
      { text: "Bank", sub: "Pay players, bank notes", icon: "coin", action: () => bankMenu(player) },
      { text: "Get Menu Item", sub: "Lost your menu item?", icon: "menu", action: () => { if (!countItems(player, "fc:menu")) giveItem(player, menuItem()); } },
    ],
    back: back(player),
  });
}

async function bankMenu(player) {
  const p = S.playerData(player);
  await UI.menu(player, {
    title: "BANK",
    body: `§7Balance: §a${E.money(p.money)}\n§7Crystals: §b${p.crystals}\n\n§fBank notes let you carry money as an item - trade them or keep them in a chest.`,
    buttons: [
      { text: "Pay a Player", sub: "Send money", icon: "coin", action: async () => {
        const names = world.getAllPlayers().filter((x) => x.id !== player.id).map((x) => x.name);
        const v = await UI.modal(player, "PAY", (f) => f.dropdown("Online player", ["(type below)", ...names]).textField("...or name", "Steve").textField("Amount (5000, 2.5k, 1m)", "1000"));
        if (v) attempt(player, () => E.pay(player, v[0] > 0 ? names[v[0] - 1] : v[1], v[2]));
      } },
      { text: "Withdraw Bank Note", sub: "Turn money into an item", icon: "note", action: async () => {
        const v = await UI.modal(player, "BANK NOTE", (f) => f.textField("Amount", "10000"));
        if (v) attempt(player, () => { const n = E.parseAmount(v[0]); if (!(n > 0)) E.fail("Give an amount."); E.takeMoney(p, n, "the note"); giveItem(player, noteItem(n)); R.tell(player, `Withdrew a §a${E.money(n)}§r bank note.`); });
      } },
      { text: "Faction Treasury", sub: "Deposit to your faction", icon: "faction", action: () => treasuryMenu(player) },
    ],
    back: back(player),
  });
}

async function playersMenu(player) {
  const list = world.getAllPlayers();
  const mine = S.playerData(player).faction;
  await UI.menu(player, {
    title: "PLAYERS ONLINE",
    body: `§7${list.length} player(s) online.`,
    buttons: list.map((pl) => {
      const q = S.playerData(pl);
      const f = S.getFaction(q.faction);
      return { text: pl.name, sub: `${f ? R.colorName(f, mine) : "§7No faction"} §8| §7Lv.${q.level} §8| §7K ${q.kills}`, icon: "player", action: () => A.who(player, pl.name) };
    }),
    back: back(player),
  });
}

// ============================================================ FACTIONS

export async function factionMenu(player) {
  const p = S.playerData(player);
  const f = S.getFaction(p.faction);
  if (!f) {
    const invites = A.invitesFor(player);
    return UI.menu(player, {
      title: "FACTIONS",
      body: "§fYou're not in a faction yet.\n\n§7A faction lets you claim land, share a treasury, build spawners and crawlers, and raid your enemies.\n\n" + (invites.length ? `§aYou have invites from: ${invites.map((x) => x.name).join(", ")}` : "§7No invites right now."),
      buttons: [
        { text: "Create a Faction", sub: "Start your own", icon: "create", action: () => createMenu(player) },
        { text: "Join a Faction", sub: `${invites.length} invite(s), open factions`, icon: "members", action: () => joinMenu(player) },
        { text: "All Factions", sub: "Browse every faction", icon: "ftop", action: () => listMenu(player) },
        { text: "Map", sub: "Land around you", icon: "map", action: () => A.map(player) },
      ],
      back: back(player),
    });
  }
  const officer = R.rankAtLeast(p, "officer");
  const leader = p.rank === "leader";
  const row = ftopRow(f.id);
  const body = [
    ...A.infoLines(f, f.id),
    `§7F-Top: §f${ftopRank(f.id) ? `#${ftopRank(f.id)}` : "-"}  §7Value: §a${E.money(row?.value ?? f.treasury)}`,
    `§7Spawners: §f${row?.spawnerCount ?? 0}  §7Crawlers: §f${row?.crawlerCount ?? 0}`,
    "",
    "§b§lRECENT ACTIVITY",
    ...(f.log.length ? f.log.slice(0, 6).map((x) => `§8${x}`) : ["§8Nothing yet"]),
  ];
  const buttons = [
    { text: "Members", sub: `${S.membersOf(f.id).length}/${R.maxMembers(f)} members`, icon: "members", action: () => membersMenu(player) },
    { text: "Faction Home", sub: f.home ? "Teleport home" : "Not set", icon: "home", action: () => attempt(player, () => T.factionHome(player)) },
    { text: "Treasury", sub: E.money(f.treasury), icon: "coin", action: () => treasuryMenu(player) },
    { text: "Upgrades", sub: "Spend the treasury", icon: "upgrade", action: () => upgradesMenu(player) },
    { text: "Land", sub: `${S.claimsOf(f.id)}/${R.landLimit(f.id)} chunks`, icon: "claim", action: () => landMenu(player) },
    { text: "Relations", sub: "Allies & enemies", icon: "relations", action: () => relationMenu(player) },
  ];
  if (officer) buttons.push({ text: "Invite", sub: "Invite a player", icon: "create", action: () => inviteMenu(player) });
  if (leader) buttons.push({ text: "Shield", sub: "Daily raid protection", icon: "shield", action: () => shieldMenu(player) });
  if (officer) buttons.push({ text: "Settings", sub: "Name, description, colour", icon: "settings", action: () => settingsMenu(player) });
  buttons.push({ text: leader ? "§4Disband" : "§cLeave", sub: leader ? "End your faction" : "Leave your faction", icon: "leave", action: async () => {
    if (await UI.confirm(player, "ARE YOU SURE?", leader ? "Disband your faction for good? All land is lost." : "Leave your faction?")) attempt(player, () => (leader ? A.disband(player) : A.leave(player)));
  } });
  await UI.menu(player, { title: `FACTION §8| §${f.color}${f.name}`, body: body.join("\n"), buttons, back: back(player) });
}

async function createMenu(player) {
  const v = await UI.modal(player, "CREATE FACTION", (f) => f
    .textField(`Name (${CONFIG.nameMin}-${CONFIG.nameMax} letters, numbers or _)`, "MyFaction")
    .textField("Description", "What is your faction about?")
    .toggle("Anyone can join without an invite", { defaultValue: false }), "Create");
  if (!v) return;
  const [name, desc, open] = v;
  if (!attempt(player, () => A.create(player, name))) return;
  if (desc) attempt(player, () => A.describe(player, desc));
  if (open) attempt(player, () => A.toggleOpen(player));
  factionMenu(player);
}

async function joinMenu(player) {
  const invited = A.invitesFor(player);
  const open = S.allFactions().filter((f) => f.open && !invited.includes(f));
  const choices = [...invited, ...open];
  await UI.menu(player, {
    title: "JOIN A FACTION",
    body: choices.length ? "§7Invites first, then open factions." : "§7No invites and no open factions right now. Ask a leader to invite you!",
    buttons: choices.map((f) => ({ text: `${invited.includes(f) ? "§a[INVITE] §r" : ""}${f.name}`, sub: `${S.membersOf(f.id).length} members, ${S.claimsOf(f.id)} land`, icon: "faction", action: () => attempt(player, () => A.join(player, f.name)) })),
    back: () => factionMenu(player),
  });
}

async function listMenu(player) {
  const mine = S.playerData(player).faction;
  const all = S.allFactions().sort((a, b) => R.factionPower(b.id) - R.factionPower(a.id));
  await UI.menu(player, {
    title: "ALL FACTIONS",
    body: all.length ? `§7${all.length} factions.` : "§7No factions yet. Be the first!",
    buttons: all.map((f) => ({ text: R.colorName(f, mine), sub: `${S.membersOf(f.id).length} members, power ${Math.floor(R.factionPower(f.id))}${R.isRaidable(f.id) ? " §cRAIDABLE" : ""}`, icon: "faction", action: () => UI.menu(player, { title: f.name, body: A.infoLines(f, mine).join("\n"), buttons: [], back: () => listMenu(player) }) })),
    back: () => factionMenu(player),
  });
}

async function membersMenu(player) {
  const p = S.playerData(player);
  const members = S.membersOf(p.faction).sort((a, b) => RANK_LEVEL[b.rank] - RANK_LEVEL[a.rank]);
  const online = new Set(world.getAllPlayers().map((x) => x.id));
  await UI.menu(player, {
    title: "MEMBERS",
    body: "§7Tap a member to manage them. §a**§7 leader, §a*§7 officer, §a+§7 member, §a-§7 recruit.",
    buttons: members.map((m) => ({
      text: `${online.has(m.id) ? "§2" : "§8"}${RANK_ICON[m.rank]}${m.name}`,
      sub: `${m.rank} | power ${Math.round(m.power * 10) / 10} | Lv.${m.level}`,
      icon: "player",
      action: async () => {
        if (m.id === p.id || !R.rankAtLeast(p, "officer")) return A.who(player, m.name);
        const opts = [
          { text: "Promote", sub: "Move up a rank", icon: "upgrade", action: () => attempt(player, () => A.promote(player, m.name)) },
          { text: "Demote", sub: "Move down a rank", icon: "down", action: () => attempt(player, () => A.demote(player, m.name)) },
          { text: "§cKick", sub: "Remove from the faction", icon: "leave", action: () => attempt(player, () => A.kick(player, m.name)) },
        ];
        if (p.rank === "leader") opts.push({ text: "Make Leader", sub: "Hand over the faction", icon: "crown", action: () => attempt(player, () => A.leader(player, m.name)) });
        await UI.menu(player, { title: m.name, body: `§7Rank: §f${m.rank}\n§7Power: §f${m.power}\n§7Level: §f${m.level}\n§7Kills: §f${m.kills}`, buttons: opts, back: () => membersMenu(player) });
      },
    })),
    back: () => factionMenu(player),
  });
}

async function treasuryMenu(player) {
  const p = S.playerData(player);
  const f = S.getFaction(p.faction);
  if (!f) return R.tell(player, "You are not in a faction.");
  await UI.menu(player, {
    title: "TREASURY",
    body: `§7Treasury: §a${E.money(f.treasury)}\n§7Your balance: §a${E.money(p.money)}\n\n§fThe treasury pays for faction upgrades and counts toward F-Top.`,
    buttons: [
      { text: "Deposit", sub: "Put money in", icon: "coin", action: async () => { const v = await UI.modal(player, "DEPOSIT", (fm) => fm.textField("Amount", "10000")); if (v) attempt(player, () => A.deposit(player, v[0])); } },
      ...(R.rankAtLeast(p, "officer") ? [{ text: "Withdraw", sub: "Officers only", icon: "note", action: async () => { const v = await UI.modal(player, "WITHDRAW", (fm) => fm.textField("Amount", "10000")); if (v) attempt(player, () => A.withdraw(player, v[0])); } }] : []),
    ],
    back: () => factionMenu(player),
  });
}

async function upgradesMenu(player) {
  const p = S.playerData(player);
  const f = S.getFaction(p.faction);
  if (!f) return;
  await UI.menu(player, {
    title: "FACTION UPGRADES",
    body: `§7Treasury: §a${E.money(f.treasury)}\n§7Officers can buy upgrades with treasury money.`,
    buttons: Object.entries(UPGRADES).map(([id, u]) => {
      const lvl = R.upgradeLevel(f, id);
      const max = lvl >= u.costs.length;
      return { text: `${u.name} ${max ? "§a(MAX)" : `§7${lvl}/${u.costs.length}`}`, sub: max ? u.desc : `${u.desc} - §a${E.money(u.costs[lvl])}`, icon: u.icon, action: () => { attempt(player, () => A.buyUpgrade(player, id)); upgradesMenu(player); } };
    }),
    back: () => factionMenu(player),
  });
}

async function landMenu(player) {
  const p = S.playerData(player);
  const officer = R.rankAtLeast(p, "officer");
  const buttons = [{ text: "Map", sub: "Land around you", icon: "map", action: () => A.map(player) }];
  if (officer) {
    buttons.push(
      { text: "Claim Here", sub: "Claim this chunk", icon: "claim", action: () => attempt(player, () => A.claim(player, 0)) },
      { text: "Claim Square", sub: "Claim around you", icon: "claim", action: async () => { const v = await UI.modal(player, "CLAIM", (fm) => fm.slider("Radius", 1, CONFIG.maxClaimRadius, { valueStep: 1, defaultValue: 1 })); if (v) attempt(player, () => A.claim(player, v[0])); } },
      { text: "Unclaim Here", sub: "Give up this chunk", icon: "leave", action: () => attempt(player, () => A.unclaim(player)) },
      { text: autoclaimers.has(player.id) ? "Autoclaim: ON" : "Autoclaim: OFF", sub: "Claim as you walk", icon: "claim", action: () => { if (autoclaimers.has(player.id)) autoclaimers.delete(player.id); else autoclaimers.add(player.id); R.tell(player, `Autoclaim ${autoclaimers.has(player.id) ? "§aon" : "§coff"}§r.`); } },
      { text: "Set Faction Home", sub: "Here, on your land", icon: "home", action: () => attempt(player, () => A.setHome(player)) },
    );
  }
  await UI.menu(player, { title: "LAND", body: A.mapLines(player).join("\n"), buttons, back: () => factionMenu(player) });
}

async function relationMenu(player) {
  const fid = S.playerData(player).faction;
  const others = S.allFactions().filter((f) => f.id !== fid);
  if (!others.length) return R.tell(player, "There are no other factions yet.");
  const labels = others.map((f) => `${R.colorName(f, fid)}§r (${R.relation(fid, f.id)})`);
  const v = await UI.modal(player, "RELATIONS", (f) => f.dropdown("Faction", labels).dropdown("Set relation to", R.RELATIONS, { defaultValueIndex: 2 }), "Set");
  if (v) attempt(player, () => A.setRelation(player, R.RELATIONS[v[1]], others[v[0]].name));
}

async function inviteMenu(player) {
  const fid = S.playerData(player).faction;
  const names = world.getAllPlayers().filter((x) => S.playerData(x).faction !== fid).map((x) => x.name);
  const v = await UI.modal(player, "INVITE", (f) => f.dropdown("Online players", ["(type a name below)", ...names]).textField("...or a name", "Steve"), "Invite");
  if (!v) return;
  const name = v[0] > 0 ? names[v[0] - 1] : String(v[1] ?? "").trim();
  if (name) attempt(player, () => A.invite(player, name));
}

async function shieldMenu(player) {
  const f = S.getFaction(S.playerData(player).faction);
  const sh = R.shieldState(f);
  const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00 - ${String((h + R.shieldLength(f)) % 24).padStart(2, "0")}:00`);
  const v = await UI.modal(player, "SHIELD", (fm) => fm.dropdown(`Your land can't be raided during this window every day (UTC${CONFIG.timezoneOffsetHours >= 0 ? "+" : ""}${CONFIG.timezoneOffsetHours}). Now: ${sh.none ? "not set" : sh.active ? "UP" : "DOWN"}.`, hours, { defaultValueIndex: f.shieldStart ?? 0 }), "Set Shield");
  if (v) attempt(player, () => A.setShield(player, v[0]));
}

async function settingsMenu(player) {
  const p = S.playerData(player);
  const f = S.getFaction(p.faction);
  const leader = p.rank === "leader";
  const colors = ["red", "orange", "yellow", "green", "aqua", "blue", "pink", "purple", "white", "gold"];
  const v = await UI.modal(player, "FACTION SETTINGS", (fm) => {
    if (leader) fm.textField("Name (leader only)", f.name, { defaultValue: f.name });
    fm.textField("Description", f.desc, { defaultValue: f.desc });
    fm.toggle("Anyone can join without an invite", { defaultValue: f.open });
    if (leader) fm.dropdown("Colour", colors, { defaultValueIndex: Math.max(0, ["c", "6", "e", "a", "b", "9", "d", "5", "f", "g"].indexOf(f.color)) });
  }, "Save");
  if (!v) return;
  const vals = [...v];
  const name = leader ? String(vals.shift() ?? "") : f.name;
  const [desc, open, color] = vals;
  if (leader && name && name !== f.name) attempt(player, () => A.rename(player, name));
  if (desc && desc !== f.desc) attempt(player, () => A.describe(player, desc));
  if (open !== f.open) attempt(player, () => A.toggleOpen(player));
  if (leader && color !== undefined) attempt(player, () => A.setColor(player, colors[color]));
}

// ============================================================ SHOP

export async function shopMenu(player) {
  const p = S.playerData(player);
  await UI.menu(player, {
    title: "SERVER SHOP",
    body: `§7Balance: §a${E.money(p.money)}\n\n§fSell ores, crops and mob drops for cash. Buy blocks, raiding gear, spawners and crawlers.`,
    buttons: [
      { text: "Sell Hand", sub: "Sell what you're holding", icon: "sell", action: () => attempt(player, () => Shop.sellHand(player)) },
      { text: "Sell All", sub: "Sell your whole inventory", icon: "sell", action: () => attempt(player, () => Shop.sellAll(player)) },
      ...Object.entries(Shop.CATEGORIES).map(([id, c]) => ({ text: c.name, sub: `${c.items.length} items`, icon: c.icon, action: () => categoryMenu(player, id) })),
      { text: "Spawners", sub: "Stackable mob spawners", icon: "spawner", action: () => specialMenu(player, "spawner") },
      { text: "Ore Crawlers", sub: "Machines that dig for you", icon: "crawler", action: () => specialMenu(player, "crawler") },
      { text: "Crystal Shop", sub: "Keys, books & tools", icon: "crystal", action: () => crystalShopMenu(player) },
    ],
    back: back(player),
  });
}

async function categoryMenu(player, id) {
  const c = Shop.CATEGORIES[id];
  await UI.menu(player, {
    title: c.name.toUpperCase(),
    body: `§7Balance: §a${E.money(S.playerData(player).money)}§7. Tap an item to buy it.`,
    buttons: c.items.map(([item, buy, sell]) => ({
      text: item.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      sub: `${buy ? `§aBuy ${E.money(buy)}` : "§8Can't buy"} §8| ${sell ? `§eSell ${E.money(sell)}` : "§8Can't sell"}`,
      icon: Shop.ITEM_ICONS[item] ?? c.icon,
      action: async () => {
        if (!buy) return R.tell(player, "That item can only be sold.");
        const v = await UI.modal(player, `BUY ${item.replace(/_/g, " ").toUpperCase()}`, (f) => f.slider(`Amount (${E.money(buy)} each)`, 1, 64, { valueStep: 1, defaultValue: 16 }), "Buy");
        if (v) attempt(player, () => Shop.buyVanilla(player, item, v[0]));
        categoryMenu(player, id);
      },
    })),
    back: () => shopMenu(player),
  });
}

async function specialMenu(player, kind) {
  const list = Shop.SPECIALS.filter((s) => s.id.startsWith(kind));
  await UI.menu(player, {
    title: kind === "spawner" ? "SPAWNERS" : "ORE CRAWLERS",
    body: kind === "spawner"
      ? "§fSpawners spawn stacked mobs near players. Stack more of the same type on one block to multiply them. Each spawner adds its value to your §bF-Top§f."
      : "§fCrawlers wander your base digging ores into their storage. Upgrade them, turn on auto-sell, and evolve them into better crawlers. Enemies can steal them if they take your land!",
    buttons: list.map((s) => ({ text: s.name, sub: `§a${E.money(s.price)}`, icon: s.icon, action: async () => {
      const v = s.single ? [1] : await UI.modal(player, s.name.toUpperCase(), (f) => f.slider(`Amount (${E.money(s.price)} each)`, 1, 16, { valueStep: 1, defaultValue: 1 }), "Buy");
      if (v) attempt(player, () => Shop.buySpecial(player, s, v[0], false));
    } })),
    back: () => shopMenu(player),
  });
}

async function crystalShopMenu(player) {
  const p = S.playerData(player);
  await UI.menu(player, {
    title: "CRYSTAL SHOP",
    body: `§7Crystals: §b${p.crystals}\n\n§fEarn crystals from kills, quests, levels, crates, crawlers, Treasure Hunter and KOTH.`,
    buttons: Shop.CRYSTAL_SHOP.map((s) => ({ text: s.name, sub: `§b${s.price} crystals`, icon: s.icon, action: async () => {
      const v = s.single ? [1] : await UI.modal(player, s.name.toUpperCase(), (f) => f.slider(`Amount (${s.price} crystals each)`, 1, 16, { valueStep: 1, defaultValue: 1 }), "Buy");
      if (v) attempt(player, () => Shop.buySpecial(player, s, v[0], true));
    } })),
    back: back(player),
  });
}

// ============================================================ CRATES & ENCHANTS

export async function cratesMenu(player) {
  await UI.menu(player, {
    title: "CRATES",
    body: "§fGet keys from daily rewards, quests, levels, envoys, KOTH and the crystal shop. Tap a crate to see what's inside.",
    buttons: RARITIES.map((r) => ({ text: `${RARITY[r].color}${RARITY[r].name} Crate`, sub: `You have §f${countItems(player, KEY(r))}§7 key(s)`, icon: `key_${r}`, action: () => cratePreview(player, r, () => cratesMenu(player)) })),
    back: back(player),
  });
}

export async function cratePreview(player, rarity, backFn) {
  const keys = countItems(player, KEY(rarity));
  await UI.menu(player, {
    title: `${RARITY[rarity].name.toUpperCase()} CRATE`,
    body: `§7Keys: §f${keys}\n\n§b§lPOSSIBLE LOOT\n${previewLines(rarity).join("\n")}`,
    buttons: [
      { text: keys ? "Open Crate" : "§8Open Crate", sub: keys ? "Use one key" : "You have no key", icon: `key_${rarity}`, action: () => attempt(player, () => openCrate(player, rarity)) },
      { text: "Buy Key", sub: "With crystals", icon: "crystal", action: () => crystalShopMenu(player) },
    ],
    back: backFn ?? (() => cratesMenu(player)),
  });
}

async function enchanterMenu(player) {
  await UI.menu(player, {
    title: "ENCHANTER",
    body: "§fCustom enchants are added with §dEnchant Books§f. Each book has a success rate - if it fails, the book is lost.\n\n§7Get books from crates, envoys, daily rewards and the crystal shop.",
    buttons: [
      { text: "Apply a Book", sub: "Use a book from your inventory", icon: "enchant", action: () => bookMenu(player) },
      { text: "Enchant Guide", sub: `${Object.keys(ENCHANTS).length} custom enchants`, icon: "quests", action: () => guideMenu(player) },
      { text: "Buy Books", sub: "Crystal shop", icon: "crystal", action: () => crystalShopMenu(player) },
    ],
    back: back(player),
  });
}

async function guideMenu(player) {
  const lines = RARITIES.flatMap((r) => {
    const list = Object.values(ENCHANTS).filter((e) => e.rarity === r);
    return list.length ? [`${RARITY[r].color}§l${RARITY[r].name.toUpperCase()}`, ...list.map((e) => `${RARITY[r].color}${e.name} ${roman(e.max)} §7- ${e.desc} §8(${e.on.includes("*") ? "any" : e.on.join("/")})`), ""] : [];
  });
  await UI.menu(player, { title: "ENCHANT GUIDE", body: lines.join("\n"), buttons: [], back: () => enchanterMenu(player) });
}

/** Pick a book from the inventory, then the item to put it on. */
export async function bookMenu(player) {
  const inv = player.getComponent("minecraft:inventory").container;
  const books = [];
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it?.typeId.startsWith("fc:book_") && it.getDynamicProperty("ench")) books.push({ slot: i, it });
  }
  if (!books.length) return R.tell(player, "You have no enchant books. Get them from crates and the crystal shop!");
  await UI.menu(player, {
    title: "CHOOSE A BOOK",
    body: "§7Pick the book to apply.",
    buttons: books.map(({ slot, it }) => ({ text: it.nameTag ?? "Book", sub: `§a${it.getDynamicProperty("rate")}% success`, icon: `book_${it.typeId.slice(8)}`, action: () => targetMenu(player, slot) })),
    back: () => enchanterMenu(player),
  });
}

async function targetMenu(player, bookSlot) {
  const inv = player.getComponent("minecraft:inventory").container;
  const book = inv.getItem(bookSlot);
  if (!book) return;
  const enchId = book.getDynamicProperty("ench");
  const lvl = book.getDynamicProperty("lvl");
  const rate = book.getDynamicProperty("rate");
  const eq = player.getComponent("minecraft:equippable");
  const targets = [];
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it && fits(enchId, it.typeId)) targets.push({ where: "inv", slot: i, it });
  }
  for (const s of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) {
    const it = eq?.getEquipment(s);
    if (it && fits(enchId, it.typeId)) targets.push({ where: "eq", slot: s, it });
  }
  if (!targets.length) return R.tell(player, `Nothing in your inventory can take ${ENCHANTS[enchId].name}. It goes on: ${ENCHANTS[enchId].on.join(", ")}.`);
  await UI.menu(player, {
    title: `APPLY ${ENCHANTS[enchId].name.toUpperCase()} ${roman(lvl)}`,
    body: `§7Success rate: §a${rate}%§7. Pick an item.`,
    buttons: targets.map((t) => ({
      text: t.it.nameTag ?? t.it.typeId.split(":")[1].replace(/_/g, " "),
      sub: `${Object.keys(readEnchants(t.it)).length} custom enchant(s)${t.where === "eq" ? " §8(worn)" : ""}`,
      icon: "enchant",
      action: () => {
        const fresh = t.where === "inv" ? inv.getItem(t.slot) : eq.getEquipment(t.slot);
        const bk = inv.getItem(bookSlot);
        if (!fresh || !bk || bk.getDynamicProperty("ench") !== enchId) return R.tell(player, "§cThe items moved - try again.");
        const r = applyBook(fresh, enchId, lvl, rate);
        if (!r.ok) return R.tell(player, "§c" + r.msg);
        inv.setItem(bookSlot, undefined);
        if (!r.failed) { if (t.where === "inv") inv.setItem(t.slot, fresh); else eq.setEquipment(t.slot, fresh); }
        R.tell(player, r.msg);
        R.sound(player, r.failed ? "random.break" : "random.anvil_use", r.failed ? 0.8 : 1.2);
      },
    })),
    back: () => bookMenu(player),
  });
}

// ============================================================ F-TOP & LEADERBOARDS

export async function ftopMenu(player) {
  const rows = ftop();
  const mine = S.playerData(player).faction;
  const body = [
    "§fFactions ranked by §btreasury + spawners + crawlers§f. Updates every minute.",
    "",
    ...rows.slice(0, 10).map((r, i) => `${["§6", "§7", "§c"][i] ?? "§8"}#${i + 1} §${r.color}${r.name} §a${E.money(r.value)} §8(${r.spawnerCount} spawners, ${r.crawlerCount} crawlers)`),
    rows.length ? "" : "§8No factions yet.",
  ];
  await UI.menu(player, {
    title: "F-TOP",
    body: body.join("\n"),
    buttons: rows.slice(0, 10).map((r, i) => ({ text: `#${i + 1} ${r.name}`, sub: `§a${E.money(r.value)}`, icon: "ftop", action: () => {
      const f = S.getFaction(r.fid);
      if (f) UI.menu(player, { title: f.name, body: [...A.infoLines(f, mine), "", `§7Treasury §a${E.money(r.treasury)}`, `§7Spawners §a${E.money(r.spawners)}`, `§7Crawlers §a${E.money(r.crawlers)}`].join("\n"), buttons: [], back: () => ftopMenu(player) });
    } })),
    back: back(player),
  });
}

async function leaderboardMenu(player) {
  const board = (title, field, fmt) => () => UI.menu(player, { title, body: E.leaderboard(field).map((p, i) => `§7#${i + 1} §f${p.name} ${fmt(p)}`).join("\n") || "§8Nobody yet", buttons: [], back: () => leaderboardMenu(player) });
  await UI.menu(player, {
    title: "LEADERBOARDS",
    body: "§7The best players on the server.",
    buttons: [
      { text: "Richest", sub: "Most money", icon: "coin", action: board("RICHEST", "money", (p) => `§a${E.money(p.money)}`) },
      { text: "Top Killers", sub: "Most player kills", icon: "sword", action: board("TOP KILLERS", "kills", (p) => `§c${p.kills}`) },
      { text: "Highest Level", sub: "Level", icon: "level", action: board("HIGHEST LEVEL", "level", (p) => `§bLv.${p.level}`) },
      { text: "Best Streaks", sub: "Kill streaks", icon: "bounty", action: board("BEST STREAKS", "bestStreak", (p) => `§6${p.bestStreak}`) },
      { text: "Miners", sub: "Blocks mined", icon: "ores", action: board("MINERS", "mined", (p) => `§f${E.fmt(p.mined)}`) },
      { text: "F-Top", sub: "Factions", icon: "ftop", action: () => ftopMenu(player) },
    ],
    back: back(player),
  });
}

// ============================================================ DAILY, QUESTS, BOUNTIES

async function dailyMenu(player) {
  const p = S.playerData(player);
  const st = D.dailyState(p);
  const body = D.DAYS.map((r, i) => `${i < st.day ? "§a[x]" : i === st.day ? (st.canClaim ? "§e[>]" : "§a[x]") : "§8[ ]"} §fDay ${i + 1}: ${r.map(rewardLabel).join("§7, ")}`);
  await UI.menu(player, {
    title: "DAILY REWARDS",
    body: [`§7Streak: §e${st.streak} day(s)§7. Log in every day for better rewards!`, "", ...body].join("\n"),
    buttons: [{ text: st.canClaim ? "Claim Reward" : "§8Claimed", sub: st.canClaim ? `Day ${st.day + 1}` : "Come back tomorrow", icon: "daily", action: () => attempt(player, () => D.claimDaily(player)) }],
    back: back(player),
  });
}

export async function questsMenu(player) {
  const p = S.playerData(player);
  const qs = Q.questsOf(p);
  const hoursLeft = 24 - Math.floor(((Date.now() + CONFIG.timezoneOffsetHours * 3600000) % 86400000) / 3600000);
  const body = qs.list.flatMap((q) => {
    const r = Q.questReward(q);
    return [`${q.done ? "§a✔" : "§e•"} §f${Q.questText(q)}`, `  ${E.bar(q.progress / q.goal, 30)} §7${q.progress}/${q.goal}`, `  §8Reward: ${E.money(r.cash)}, ${r.crystals} crystals, ${r.xp} XP`, ""];
  });
  await UI.menu(player, {
    title: "DAILY QUESTS",
    body: [`§7New quests in §f${hoursLeft}h§7. Finish all 3 for an §5Epic Key§7!`, "", ...body].join("\n"),
    buttons: [],
    back: back(player),
  });
}

async function bountyMenu(player) {
  const list = S.allPlayerRecords().filter((p) => p.bounty > 0).sort((a, b) => b.bounty - a.bounty).slice(0, 15);
  await UI.menu(player, {
    title: "BOUNTIES",
    body: list.length ? `§fKill these players to claim the reward:\n\n${list.map((p) => `§c${E.money(p.bounty)} §f${p.name}`).join("\n")}` : "§7No bounties right now.",
    buttons: [{ text: "Place a Bounty", sub: `From ${E.money(CONFIG.minBounty)}`, icon: "bounty", action: async () => {
      const names = world.getAllPlayers().filter((x) => x.id !== player.id).map((x) => x.name);
      const v = await UI.modal(player, "PLACE BOUNTY", (f) => f.dropdown("Online player", ["(type below)", ...names]).textField("...or name", "Steve").textField("Amount", "10000"));
      if (v) attempt(player, () => placeBounty(player, v[0] > 0 ? names[v[0] - 1] : v[1], v[2]));
    } }],
    back: back(player),
  });
}

// ============================================================ AUCTION

export async function auctionMenu(player, page = 0) {
  const all = AH.listings();
  const per = 12;
  const pages = Math.max(1, Math.ceil(all.length / per));
  page = Math.min(page, pages - 1);
  const p = S.playerData(player);
  const buttons = [
    { text: "Sell Held Item", sub: "List it for a price", icon: "sell", action: async () => { const v = await UI.modal(player, "SELL ITEM", (f) => f.textField(`Price for the item in your hand (${CONFIG.auctionTaxPercent}% tax)`, "5000"), "List"); if (v) attempt(player, () => AH.list(player, v[0])); } },
    { text: "My Listings", sub: `${AH.myListings(player).length}/${CONFIG.auctionMaxListings}`, icon: "auction", action: () => myAuctions(player) },
    { text: `Mailbox (${p.mail.length})`, sub: "Unsold items", icon: "mail", action: () => attempt(player, () => AH.collectMail(player)) },
    ...all.slice(page * per, page * per + per).map((a) => ({ text: AH.itemLabel(a.item), sub: `§a${E.money(a.price)} §8| §7${a.sellerName}`, icon: "auction", action: async () => {
      const lore = a.item.l?.length ? `\n${a.item.l.join("\n")}` : "";
      if (await UI.confirm(player, "BUY ITEM", `§f${AH.itemLabel(a.item)}${lore}\n\n§7Seller: §f${a.sellerName}\n§7Price: §a${E.money(a.price)}`, "Buy")) attempt(player, () => AH.buy(player, a.id));
    } })),
  ];
  if (page + 1 < pages) buttons.push({ text: "Next Page", sub: `Page ${page + 2}/${pages}`, icon: "next", action: () => auctionMenu(player, page + 1) });
  await UI.menu(player, { title: `AUCTION HOUSE §8| §7${page + 1}/${pages}`, body: `§7${all.length} item(s) for sale. Balance: §a${E.money(p.money)}`, buttons, back: back(player) });
}

async function myAuctions(player) {
  await UI.menu(player, {
    title: "MY LISTINGS",
    body: "§7Tap a listing to take it back.",
    buttons: AH.myListings(player).map((a) => ({ text: AH.itemLabel(a.item), sub: `§a${E.money(a.price)} §8| ${a.expires > Date.now() ? `${A.dur(a.expires - Date.now())} left` : "expired"}`, icon: "auction", action: () => attempt(player, () => AH.cancel(player, a.id)) })),
    back: () => auctionMenu(player),
  });
}

// ============================================================ HOMES & WARPS

async function homesMenu(player) {
  const p = S.playerData(player);
  await UI.menu(player, {
    title: "HOMES",
    body: `§7Homes: §f${Object.keys(p.homes).length}/${E.maxHomes(p)} §8(+1 every 10 levels)`,
    buttons: [
      ...Object.entries(p.homes).map(([name, h]) => ({ text: name, sub: `${S.DIM_NAME[h.dim] ?? ""} ${Math.floor(h.x)}, ${Math.floor(h.y)}, ${Math.floor(h.z)}`, icon: "home", action: async () => {
        await UI.menu(player, { title: `HOME ${name.toUpperCase()}`, body: "", buttons: [
          { text: "Teleport", sub: "Go there", icon: "home", action: () => attempt(player, () => T.home(player, name)) },
          { text: "§cDelete", sub: "Remove this home", icon: "leave", action: () => attempt(player, () => T.delHome(player, name)) },
        ], back: () => homesMenu(player) });
      } })),
      { text: "Set Home Here", sub: "Save this spot", icon: "create", action: async () => { const v = await UI.modal(player, "SET HOME", (f) => f.textField("Name", "home", { defaultValue: "home" }), "Save"); if (v) attempt(player, () => T.setHome(player, v[0] || "home")); } },
      { text: "Faction Home", sub: "Your faction's home", icon: "faction", action: () => attempt(player, () => T.factionHome(player)) },
    ],
    back: back(player),
  });
}

export async function warpsMenu(player) {
  const w = T.warps();
  await UI.menu(player, {
    title: "DIMENSIONS",
    body: "§7Teleports take a few seconds and are blocked while you're in combat.",
    buttons: [
      { text: "Spawn", sub: "The server spawn", icon: "spawn", action: () => attempt(player, () => T.spawn(player)) },
      { text: "Wilderness", sub: "Random spot to settle", icon: "wild", action: () => attempt(player, () => T.wild(player)) },
      ...Object.entries(w).map(([name, l]) => ({ text: name.replace(/\b\w/g, (m) => m.toUpperCase()), sub: S.DIM_NAME[l.dim] ?? "Warp", icon: l.dim === "minecraft:nether" ? "nether" : l.dim === "minecraft:the_end" ? "end" : "world", action: () => attempt(player, () => T.warp(player, name)) })),
    ],
    back: back(player),
  });
}

// ============================================================ EVENTS

async function eventsMenu(player) {
  const z = Ev.kothZone();
  const st = Ev.envoyState();
  const body = [
    "§6§lKING OF THE HILL",
    z ? `§7Hill at §f${z.x}, ${z.z}§7 (${S.DIM_NAME[z.dim]}). Stand on it alone for §f${CONFIG.kothCaptureSeconds}s§7 to win §a$250k§7, §b50 crystals§7 and a §6Legendary Key§7.` : "§8Not set up yet.",
    z ? (Ev.kothRunning() ? "§aRunning now!" : `§7Next in §f${Math.max(0, Math.ceil((S.kv.get("kothNext", 0) - Date.now()) / 60000))}m`) : "",
    "",
    "§d§lENVOY",
    "§7Supply drops land in the WarZone (or near spawn). Break or tap them for loot from every rarity.",
    st.active ? `§a${Object.keys(st.crates).length} drops left!` : `§7Next in §f${Math.max(0, Math.ceil((st.next - Date.now()) / 60000))}m`,
  ];
  const buttons = [];
  if (z) buttons.push({ text: "Go to KOTH", sub: `${z.x}, ${z.z}`, icon: "event", action: () => attempt(player, () => T.teleport(player, { dim: z.dim, x: z.x + 0.5, y: z.y, z: z.z + 0.5 }, "the KOTH hill")) });
  await UI.menu(player, { title: "EVENTS", body: body.join("\n"), buttons, back: back(player) });
}

// ============================================================ SPAWNERS & CRAWLERS

export async function spawnerMenu(player, block) {
  const type = Sp.spawnerTypeOf(block.typeId);
  const s = Sp.spawnerAt(block) ?? { type, stack: 1 };
  const def = SPAWNERS[type];
  const can = R.canBuild(player, block.dimension.id, block.location);
  const held = countItems(player, block.typeId);
  await UI.menu(player, {
    title: `${def.name.toUpperCase()} SPAWNER`,
    body: [
      `§7Stack: §e${s.stack}§8/${Sp.MAX_SPAWNER_STACK}`,
      `§7Mob: §f${def.name}`,
      `§7Spawns every §f${Math.round(Sp.spawnerInterval(s))}s§7 while a player is within ${CONFIG.spawnerActivationRange} blocks.`,
      `§7Value: §a${E.money(def.value * s.stack)}`,
      "",
      "§7Use the same spawner on it to stack (sneak to add the whole stack).",
    ].join("\n"),
    buttons: can ? [
      ...(held ? [{ text: "Add All", sub: `Add ${held} from your inventory`, icon: "upgrade", action: () => attempt(player, () => {
        const n = Sp.addToStack(player, block, held);
        if (n) takeItems(player, block.typeId, n);
      }) }] : []),
      { text: "Pick Up", sub: "Take the whole stack", icon: "spawner", action: () => attempt(player, () => Sp.pickUp(player, block)) },
    ] : [],
  });
}

export async function crawlerMenu(player, ent) {
  if (!ent.isValid) return;
  const c = Cr.info(ent);
  const manage = Cr.canManage(player, ent);
  const stolen = manage && c.owner !== player.id;
  const storage = Object.entries(c.storage).map(([id, n]) => `§f${n}x §7${id.replace(/_/g, " ")}`).join("§8, ") || "§8empty";
  const f = S.getFaction(S.ownerAt(ent.dimension.id, ent.location));
  const speed = (1 + (c.upgrades.speed ?? 0) * 0.15) * (1 + R.upgradeLevel(f, "crawlers") * 0.1);
  const body = [
    `${RARITY[c.def.rarity].color}§l${c.def.name}`,
    `§7Owner: §f${c.ownerName}`,
    `§7Digs every §f${(c.def.seconds / speed).toFixed(1)}s`,
    `§7Storage: §f${Cr.stored(c)}§8/${Cr.capacity(c)}  ${E.bar(Cr.stored(c) / Cr.capacity(c), 20, "§e")}`,
    `§7Stored value: §a${E.money(Cr.storedValue(c))}`,
    `§7Inside: ${storage}`,
    `§7Mined so far: §f${E.fmt(c.mined)}  §7Auto-sold: §a${E.money(c.sold)}`,
    "",
    "§b§lUPGRADES",
    ...Object.entries(Cr.UPGRADES).map(([id, u]) => `§f${u.name} §7${c.upgrades[id] ?? 0}/${u.max} §8- ${u.desc}`),
  ];
  if (!manage) return UI.menu(player, { title: "ORE CRAWLER", body: body.join("\n") + "\n\n§cThis isn't yours. Take the land it's on to steal it!", buttons: [] });
  const nt = Cr.nextTier(c.type);
  await UI.menu(player, {
    title: "ORE CRAWLER",
    body: body.join("\n"),
    buttons: [
      { text: "Collect", sub: "Take the ores", icon: "chest", action: () => { attempt(player, () => Cr.collect(player, ent)); } },
      { text: "Sell Storage", sub: `§a${E.money(Cr.storedValue(c))}`, icon: "sell", action: () => attempt(player, () => Cr.sellStorage(player, ent)) },
      ...Object.entries(Cr.UPGRADES).map(([id, u]) => {
        const lvl = c.upgrades[id] ?? 0;
        return { text: `${u.name} ${lvl >= u.max ? "§a(MAX)" : `§7${lvl}/${u.max}`}`, sub: lvl >= u.max ? u.desc : `§a${E.money(Cr.upgradeCost(c.type, id, lvl))}`, icon: "upgrade", action: () => { attempt(player, () => Cr.buyUpgrade(player, ent, id)); crawlerMenu(player, ent); } };
      }),
      ...(nt ? [{ text: `Evolve to ${CRAWLERS[nt].name}`, sub: `§a${E.money(Cr.evolveCost(c.type))}`, icon: "crawler", action: async () => { if (await UI.confirm(player, "EVOLVE", `Evolve into a ${RARITY[CRAWLERS[nt].rarity].color}${CRAWLERS[nt].name}§r for §a${E.money(Cr.evolveCost(c.type))}§r?`, "Evolve")) attempt(player, () => Cr.evolve(player, ent)); } }] : []),
      { text: stolen ? "§cSteal Crawler" : "Pick Up", sub: stolen ? "It's on your land now!" : "Keeps its upgrades", icon: "leave", action: () => attempt(player, () => Cr.pickUp(player, ent)) },
    ],
  });
}

// ============================================================ ADMIN

async function adminMenu(player) {
  if (!hasPerm(player)) return;
  const give = (fn) => () => { giveItem(player, fn()); };
  await UI.menu(player, {
    title: "ADMIN",
    body: `§7Version: §f${VERSION}\n§7Bypass: ${R.hasBypass(player) ? "§aON" : "§cOFF"}\n§7Spawn: ${S.kv.get("spawn") ? "§aset" : "§cnot set (using world spawn)"}\n§7KOTH: ${Ev.kothZone() ? "§aset" : "§cnot set"}\n\n§7Commands: §e/fadmin help`,
    buttons: [
      { text: "Place Quest NPCs", sub: "All 6 quest NPCs around you", icon: "quests", action: () => attempt(player, () => Npc.placeQuestNpcs(player)) },
      { text: "Place an NPC", sub: "Shop, crates, kits, menu...", icon: "players", action: async () => {
        const types = Object.keys(Npc.NPC_TYPES);
        const v = await UI.modal(player, "PLACE NPC", (f) => f.dropdown("NPC", types), "Place");
        if (v) attempt(player, () => Npc.placeNpc(player, types[v[0]]));
      } },
      { text: "Remove NPC", sub: "The nearest one", icon: "leave", action: () => attempt(player, () => Npc.removeNearestNpc(player)) },
      { text: "Ranks", sub: "Give ranks, make custom ranks", icon: "crown", action: () => ranksMenu(player) },
      { text: "Toggle Bypass", sub: "Build anywhere", icon: "admin", action: () => { player.setDynamicProperty("fc:bypass", R.hasBypass(player) ? undefined : true); R.tell(player, `Bypass ${R.hasBypass(player) ? "§aon" : "§coff"}`); } },
      { text: "Set Spawn Here", sub: "Server spawn", icon: "spawn", action: () => { const l = player.location; S.kv.set("spawn", { dim: player.dimension.id, x: l.x, y: l.y, z: l.z }); R.tell(player, "Spawn set."); } },
      { text: "Start Envoy", sub: "Drop supply crates now", icon: "event", action: () => R.tell(player, `Dropped ${Ev.startEnvoy()} crates.`) },
      { text: "Set KOTH Here", sub: "5 block radius", icon: "event", action: () => { Ev.setKothZone(player, 5); R.tell(player, "KOTH zone set."); } },
      { text: "Start KOTH", sub: "Start it now", icon: "event", action: () => attempt(player, () => Ev.startKoth()) },
      { text: "Place Hologram", sub: "Leaderboards at spawn", icon: "trophy", action: async () => { const v = await UI.modal(player, "HOLOGRAM", (f) => f.dropdown("Type", H.HOLO_TYPES)); if (v) attempt(player, () => H.placeHolo(player, H.HOLO_TYPES[v[0]])); } },
      { text: "Give: Keys", sub: "One of each", icon: "key_legendary", action: () => RARITIES.forEach((r) => giveItem(player, keyItem(r, 1))) },
      { text: "Give: Books", sub: "One of each rarity", icon: "book_legendary", action: () => RARITIES.forEach((r) => giveItem(player, bookItem(r))) },
      { text: "Give: Gear", sub: "Every legendary item", icon: "sword", action: () => Object.keys(GEAR).forEach((g) => giveItem(player, gearItem(g))) },
      { text: "Give: Spawners", sub: "One of each", icon: "spawner", action: () => Object.keys(SPAWNERS).forEach((t) => giveItem(player, spawnerItem(t))) },
      { text: "Give: Crawlers", sub: "One of each", icon: "crawler", action: () => Object.keys(CRAWLERS).forEach((t) => giveItem(player, crawlerItem(t))) },
      { text: "Give: Tools", sub: "Genbuckets, buster, wand, shards", icon: "chest", action: () => [() => genbucketItem("cobble", 16), () => genbucketItem("obsidian", 16), () => genbucketItem("sand", 16), () => busterItem(2), () => wandItem(100), () => xpShardItem(16), () => powerShardItem(8), () => mysteryItem(4)].forEach((fn) => give(fn)()) },
      { text: "Give: Crate Blocks", sub: "Place them at spawn", icon: "crate", action: () => RARITIES.forEach((r) => giveItem(player, new ItemStack(`fc:crate_${r}`, 1))) },
    ],
    back: back(player),
  });
}

async function ranksMenu(player) {
  const custom = Rk.customRanks();
  const body = [
    "§fRanks are player tags, so you can also use the vanilla command:",
    "§e/tag <player> add Owner§7  -  §e/tag <player> remove Owner",
    "§7One-off ranks: §e/tag <player> add \"rank:&d&lBuilder\"",
    "",
    "§b§lBUILT-IN",
    ...Rk.BUILTIN_RANKS.map((r) => `${r.display}§r §7(${r.name})`),
    "",
    "§b§lCUSTOM",
    ...(custom.length ? custom.map((r) => `${r.display}§r §7(${r.name})`) : ["§8None yet"]),
    "",
    "§7Ranks only show in chat, and a player shows just one: the highest on this list (built-ins first, then custom ranks, then one-off tags).",
  ];
  await UI.menu(player, {
    title: "RANKS",
    body: body.join("\n"),
    buttons: [
      { text: "Give a Rank", sub: "Add a rank to a player", icon: "crown", action: async () => {
        const names = world.getAllPlayers().map((x) => x.name);
        const ranks = Rk.allRankNames();
        const v = await UI.modal(player, "GIVE RANK", (f) => f.dropdown("Player", names).dropdown("Rank", ranks).toggle("Remove it instead", { defaultValue: false }), "Apply");
        if (!v) return;
        const target = world.getAllPlayers().find((x) => x.name === names[v[0]]);
        if (!target) return;
        if (v[2]) target.removeTag(ranks[v[1]]); else target.addTag(ranks[v[1]]);
        R.tell(player, `${v[2] ? "Removed" : "Gave"} §e${ranks[v[1]]}§r ${v[2] ? "from" : "to"} §e${target.name}§r.`);
      } },
      { text: "Create Custom Rank", sub: "Name and how it looks", icon: "create", action: async () => {
        const v = await UI.modal(player, "CREATE RANK", (f) => f
          .textField("Rank name (what you type in /tag)", "Builder")
          .textField("How it looks (& colour codes, e.g. &d&lBUILDER)", "&d&lBUILDER"), "Create");
        if (v) attempt(player, () => { const r = Rk.createRank(v[0], v[1]); R.tell(player, `Created ${r.display}§r. Give it with §e/tag <player> add ${r.name}§r.`); });
      } },
      ...custom.map((r) => ({ text: `Delete ${r.name}`, sub: "Remove this custom rank", icon: "leave", action: async () => {
        if (await UI.confirm(player, "DELETE RANK", `Delete ${r.display}§r? Players keep the tag but it stops showing.`, "Delete")) attempt(player, () => Rk.deleteRank(r.name));
      } })),
    ],
    back: () => adminMenu(player),
  });
}

// ============================================================ KITS & BOSSES

export async function kitsMenu(player) {
  const p = S.playerData(player);
  await UI.menu(player, {
    title: "KIT SHOP",
    body: `§7Balance: §a${E.money(p.money)}§7  Crystals: §b${p.crystals}\n\n§fKits are bundles of gear. You pay each time you claim one, then wait for its cooldown.`,
    buttons: Kt.KITS.map((k) => {
      const wait = Kt.cooldownLeft(p, k);
      return { text: k.name, sub: wait ? `§cReady in ${A.dur(wait)}` : `${Kt.priceText(k)} §8| §7every ${k.hours}h`, icon: k.icon, action: () => kitPage(player, k.id) };
    }),
    back: back(player),
  });
}

async function kitPage(player, id) {
  const k = Kt.kit(id);
  const p = S.playerData(player);
  const wait = Kt.cooldownLeft(p, k);
  await UI.menu(player, {
    title: `${k.name.toUpperCase()} KIT`,
    body: [`§f${k.desc}`, "", `§7Price: ${Kt.priceText(k)}`, `§7Cooldown: §f${k.hours} hours`, wait ? `§cYou can claim it again in ${A.dur(wait)}.` : "§aReady to claim!", "", "§b§lINSIDE", ...Kt.contents(k)].join("\n"),
    buttons: [{ text: wait ? "§8On Cooldown" : "Claim Kit", sub: wait ? A.dur(wait) : Kt.priceText(k), icon: k.icon, action: () => { attempt(player, () => Kt.claimKit(player, k.id)); } }],
    back: () => kitsMenu(player),
  });
}

export async function bossesMenu(player) {
  await UI.menu(player, {
    title: "BOSSES",
    body: ["§fBoss Eggs only come from §cMythic Crates§f. Use one on the ground to summon its boss - each tier is tougher and drops loot you can't get anywhere else.", "§7Bosses get enraged below half health. Loot drops on the ground, so watch out for thieves!", "", ...bossInfo()].join("\n"),
    buttons: [{ text: "Mythic Crate", sub: "Where boss eggs come from", icon: "key_mythic", action: () => cratePreview(player, "mythic", () => bossesMenu(player)) }],
    back: back(player),
  });
}

// ============================================================ QUEST LINES, QUEST MASTER, REBIRTH

const KEY_ICON = (L) => (L % 10 === 0 ? "key_legendary" : L % 5 === 0 ? "key_epic" : L % 2 === 0 ? "key_rare" : "key_common");
const banner = (name) => `textures/fc/ui/banners/${name}`;
const rebirthBadge = (p) => (p.rebirths ? `§6Rebirth ${p.rebirths}` : "§7No rebirths yet");

export async function questMasterMenu(player) {
  const p = S.playerData(player);
  const q = QL.ql(p);
  const L = QL.questLevel(p);
  const waiting = L - q.claimed;
  const next = QL.nextRank(L);
  const closestLine = QL.LINES.map((l) => [l, QL.lineTiers(p, l) / QL.totalTiers(l)]).sort((a, b) => Number(b[1]) - Number(a[1])).find(([l]) => !QL.lineDone(p, l))?.[0];
  const body = [
    `§e§lQuest Level ${L}`,
    `${QL.questRank(L)} Rank${next ? `  §8(next: ${next[1]}§8 at Quest Level ${next[0]})` : ""}`,
    "",
    `§7ROAD TO 100   §fClaimed ${q.claimed} of 100`,
    E.bar(q.claimed / QL.MAX_LEVEL, 30, "§6", "§8"),
    "",
    waiting > 0 ? `§a§l${waiting} reward${waiting > 1 ? "s" : ""} waiting!` : "§7Nothing to claim yet",
    closestLine ? `§7Next level: §f${QL.closest(p, closestLine)}` : "§aEvery quest line is MAXED!",
    "",
    `§7Sales pay §ax${QL.sellMultiplier(p)}§7. ${rebirthBadge(p)}`,
    "",
    "§8Sell items to the server to level up your quest lines. Every tier is worth 1 Quest Level.",
  ];
  const tiles = [];
  // Quest lines first so they're always on screen; the reward track follows.
  for (const line of QL.LINES) {
    const t = QL.lineTiers(p, line);
    tiles.push({ text: `§l${line.name}§r  §7${t} of ${QL.totalTiers(line)}\n${E.bar(t / QL.totalTiers(line), 24, "§a", "§8")}\n§eTap to open`, icon: line.icon, action: () => questLineMenu(player, line.id) });
  }
  for (let L2 = q.claimed + 1; L2 <= Math.min(QL.MAX_LEVEL, q.claimed + 6); L2++) {
    const ready = L2 <= L;
    tiles.push({ text: `§lLevel ${L2}§r  ${ready ? "§a[CLAIM]" : "§8[LOCKED]"}\n§7${QL.levelRewardText(L2)}`, icon: KEY_ICON(L2), action: () => (ready ? attempt(player, () => QL.claimLevels(player)) : questMasterMenu(player)) });
  }
  await UI.board(player, {
    title: `QUEST MASTER §8| ${rebirthBadge(p)}`,
    body: body.join("\n"),
    banner: banner("questmaster"),
    tiles,
    actions: [
      { text: waiting > 0 ? `CLAIM ${waiting} REWARD${waiting > 1 ? "S" : ""}` : "NO REWARDS WAITING", locked: waiting <= 0, action: async () => { if (waiting > 0) attempt(player, () => QL.claimLevels(player)); await questMasterMenu(player); } },
      { text: "REBIRTH ORACLE", locked: !QL.canRebirth(p), action: () => rebirthMenu(player) },
      { text: "DAILY QUESTS", locked: true, action: () => questsMenu(player) },
      { text: "BACK", locked: true, action: back(player) },
    ],
  });
}

export async function questLineMenu(player, id) {
  const line = QL.lineById(id);
  const p = S.playerData(player);
  const t = QL.lineTiers(p, line);
  const total = QL.totalTiers(line);
  const rank = line.rank.slice(5).replace(/&([0-9a-v])/g, "§$1");
  const body = [
    `§6§l${line.title}`,
    "§7LINE PROGRESS",
    E.bar(t / total, 30, "§a", "§8"),
    `§fLine tiers ${t} of ${total}`,
    "",
    `§7Closest: §f${QL.closest(p, line)}`,
    "",
    "§6§lFINISH THE LINE",
    `${rank}§r §7chat rank`,
    `§7Reach MAXED on all ${line.items.length} items.`,
    `§eWorth ${total} Quest Levels`,
    "",
    "§8Progress counts every item you sell to the server.",
  ];
  const tiles = line.items.map((it) => {
    const sold = QL.soldOf(p, it);
    const tier = QL.tierOf(sold, it);
    const target = QL.nextTarget(sold, it);
    const prevTarget = tier ? it.base * QL.TIERS[tier - 1] : 0;
    return {
      text: `§l${it.name}§r  ${target === undefined ? "§6[MAXED]" : `§8[§bTier ${QL.TIER_NAMES[tier]}§8]`}\n§7Sold §f${E.fmt(sold)}§7 of §f${E.fmt(target ?? sold)}\n${E.bar(target === undefined ? 1 : (sold - prevTarget) / (target - prevTarget), 20, "§b", "§8")}`,
      icon: it.icon,
      action: () => UI.menu(player, {
        title: `${it.name.toUpperCase()} TIERS`,
        body: [`§7Sold so far: §f${E.fmt(sold)}`, "", ...QL.TIERS.map((m, i) => `${tier > i ? "§a[x]" : "§8[ ]"} §fTier ${QL.TIER_NAMES[i]} §7- sell ${E.fmt(it.base * m)}`)].join("\n"),
        buttons: [],
        back: () => questLineMenu(player, id),
      }),
    };
  });
  await UI.board(player, {
    title: `${line.name} §8| §bQuest Level ${QL.questLevel(p)}`,
    body: body.join("\n"),
    banner: banner(line.id),
    tiles,
    actions: [
      { text: "SELL NOW", action: async () => { attempt(player, () => Shop.sellAll(player)); await questLineMenu(player, id); } },
      { text: "BACK", locked: true, action: () => questMasterMenu(player) },
    ],
  });
}

export async function rebirthMenu(player) {
  const p = S.playerData(player);
  const L = QL.questLevel(p);
  const q = QL.ql(p);
  const ready = QL.canRebirth(p);
  const body = [
    `§d§lYour Quest Level ${L}`,
    E.bar(L / QL.MAX_LEVEL, 30, "§d", "§8"),
    "",
    `§7Needs Quest Level §f${QL.MAX_LEVEL}`,
    `§7Rewards claimed §f${q.claimed} of ${QL.MAX_LEVEL}`,
    "",
    "§c§lWARNING",
    "§7Resets every quest line, your claimed levels and your quest rank. Money, keys and items stay.",
    "",
    ready ? "§aYou're ready to rebirth!" : `§6Reach Quest Level ${QL.MAX_LEVEL} first - you are at ${L}`,
    "",
    "§8The phoenix burns to rise again.",
  ];
  await UI.board(player, {
    title: `REBIRTH ORACLE §8| ${rebirthBadge(p)}`,
    body: body.join("\n"),
    banner: banner("rebirth"),
    tiles: QL.REBIRTH_REWARDS((p.rebirths ?? 0) + 1).map((r) => ({ text: `§l${r.label}`, icon: r.icon, action: () => rebirthMenu(player) })),
    actions: [
      { text: ready ? "REBIRTH NOW" : "REBIRTH LOCKED", locked: !ready, action: async () => {
        if (!ready) return rebirthMenu(player);
        if (await UI.confirm(player, "REBIRTH", "Reset all quest lines and Quest Levels for the rebirth rewards? Money, keys and items stay.", "Rebirth")) attempt(player, () => QL.rebirth(player));
      } },
      { text: "BACK", locked: true, action: () => questMasterMenu(player) },
    ],
  });
}
