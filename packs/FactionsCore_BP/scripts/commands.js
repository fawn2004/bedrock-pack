// Factions Core - slash commands: /f, /fc, /fa and /fadmin.
// They're registered as factions:f etc. but can be typed as just /f.
import { system, Player, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as A from "./actions.js";
import { autoclaimers, startHome } from "./tasks.js";
import { openMenu } from "./menu.js";

const NS = "factions";

const F_ACTIONS = {
  help: (pl) => A.help(pl),
  menu: (pl) => openMenu(pl),
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
  home: (pl) => startHome(pl),
  ally: (pl, a) => A.setRelation(pl, "ally", need(a[0], "/f ally <faction>")),
  truce: (pl, a) => A.setRelation(pl, "truce", need(a[0], "/f truce <faction>")),
  neutral: (pl, a) => A.setRelation(pl, "neutral", need(a[0], "/f neutral <faction>")),
  enemy: (pl, a) => A.setRelation(pl, "enemy", need(a[0], "/f enemy <faction>")),
};

const ADMIN_ACTIONS = {
  bypass: (pl) => {
    const on = !R.hasBypass(pl);
    pl.setDynamicProperty("fc:bypass", on || undefined);
    R.tell(pl, `Admin bypass ${on ? "§aon§r: you can build and open anything" : "§coff"}§r.`);
  },
  safezone: (pl, a) => A.claim(pl, a[0], S.SAFEZONE),
  warzone: (pl, a) => A.claim(pl, a[0], S.WARZONE),
  unclaim: (pl, a) => A.unclaim(pl, a[0], true),
  disband: (pl, a) => {
    const f = S.findFaction(need(a[0], "/fadmin disband <faction>"));
    if (!f || f.system) throw new A.Fail(`No faction called ${a[0]}.`);
    const online = R.onlineMembers(f.id);
    S.deleteFaction(f.id);
    for (const m of online) { R.refreshNametag(m); R.tell(m, "Your faction was disbanded by an admin."); }
    R.tell(pl, `Disbanded §e${f.name}§r.`);
  },
  setpower: (pl, a) => {
    const t = S.findPlayerRecord(need(a[0], "/fadmin setpower <player> <amount>"));
    if (!t) throw new A.Fail(`No player called ${a[0]} has played here.`);
    const n = Number(a[1]);
    if (!Number.isFinite(n)) throw new A.Fail("Usage: /fadmin setpower <player> <amount>");
    t.power = Math.min(CONFIG.maxPower, Math.max(CONFIG.minPower, n));
    S.savePlayer(t);
    R.tell(pl, `§e${t.name}§r now has ${t.power} power.`);
  },
  join: (pl, a) => {
    const f = S.findFaction(need(a[0], "/fadmin join <faction>"));
    if (!f || f.system) throw new A.Fail(`No faction called ${a[0]}.`);
    const p = S.playerData(pl);
    if (p.rank === "leader" && p.faction !== f.id) throw new A.Fail("You lead a faction; disband or hand it over first.");
    p.faction = f.id;
    p.rank = "officer";
    S.savePlayer(p);
    R.refreshNametag(pl);
    R.tellFaction(f.id, `Admin §e${pl.name}§r joined as an officer.`);
  },
};

function need(v, usage) {
  if (v === undefined || v === "") throw new A.Fail(`Usage: §e${usage}`);
  return v;
}

/** Runs an action next tick (commands start in read-only mode) and reports failures. */
function run(origin, fn) {
  const player = origin.sourceEntity instanceof Player ? origin.sourceEntity : origin.initiator;
  if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Players only." };
  system.run(() => {
    try {
      fn(player);
    } catch (e) {
      if (e instanceof A.Fail) R.tell(player, "§c" + e.message);
      else { R.tell(player, "§cSomething went wrong. Check the content log."); console.error(`[Factions] ${e}\n${e?.stack ?? ""}`); }
    }
  });
  return { status: CustomCommandStatus.Success };
}

const words = (n, from = 1) => Array.from({ length: n }, (_, i) => ({ name: `word${i + from}`, type: CustomCommandParamType.String }));
const clean = (args) => args.filter((x) => x !== undefined && x !== null).map(String);

export function setupCommands() {
  system.beforeEvents.startup.subscribe(({ customCommandRegistry: reg }) => {
    reg.registerEnum(`${NS}:action`, Object.keys(F_ACTIONS));
    reg.registerEnum(`${NS}:admin_action`, Object.keys(ADMIN_ACTIONS));

    reg.registerCommand({
      name: `${NS}:f`,
      description: "Factions: /f help for all commands, /f on its own opens the menu",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ name: `${NS}:action`, type: CustomCommandParamType.Enum }, ...words(8)],
    }, (origin, action, ...rest) => run(origin, (pl) => {
      if (!action) return openMenu(pl);
      F_ACTIONS[action](pl, clean(rest));
    }));

    reg.registerCommand({
      name: `${NS}:fc`,
      description: "Send a message to your faction",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: words(1),
      optionalParameters: words(19, 2),
    }, (origin, ...rest) => run(origin, (pl) => A.chat(pl, clean(rest).join(" "), false)));

    reg.registerCommand({
      name: `${NS}:fa`,
      description: "Send a message to your faction and its allies",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: words(1),
      optionalParameters: words(19, 2),
    }, (origin, ...rest) => run(origin, (pl) => A.chat(pl, clean(rest).join(" "), true)));

    reg.registerCommand({
      name: `${NS}:fadmin`,
      description: "Factions admin tools (bypass, safezone, warzone, unclaim, disband, setpower, join)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      mandatoryParameters: [{ name: `${NS}:admin_action`, type: CustomCommandParamType.Enum }],
      optionalParameters: words(2),
    }, (origin, action, ...rest) => run(origin, (pl) => ADMIN_ACTIONS[action](pl, clean(rest))));
  });
}
