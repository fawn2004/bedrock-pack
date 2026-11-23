// Factions Core - the /f menu (forms), so players never have to remember commands.
import { system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG, RANK_LEVEL, RANK_ICON } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as A from "./actions.js";
import { startHome } from "./tasks.js";

/** Show a form, waiting until the player has closed chat. */
async function show(player, form, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const res = await form.show(player);
    if (res.cancelationReason !== FormCancelationReason.UserBusy) return res;
    await new Promise((ok) => system.runTimeout(() => ok(undefined), 5));
  }
  return { canceled: true };
}

/** Run an action from a menu, telling the player if it fails. Returns true on success. */
function attempt(player, fn) {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof A.Fail) R.tell(player, "§c" + e.message);
    else { R.tell(player, "§cSomething went wrong. Check the content log."); console.error(`[Factions] ${e}\n${e?.stack ?? ""}`); }
    return false;
  }
}

export function openMenu(player) {
  mainMenu(player).catch((e) => console.error(`[Factions] menu: ${e}`));
}

async function mainMenu(player) {
  const p = S.playerData(player);
  const f = S.getFaction(p.faction);
  const items = [];
  const add = (label, fn) => items.push([label, fn]);
  const form = new ActionFormData().title("Factions");

  if (!f) {
    form.body(`§7You are not in a faction.\nPower: §e${p.power}§7 / ${CONFIG.maxPower}`);
    add("Create a faction", () => createMenu(player));
    add("Join a faction", () => joinMenu(player));
  } else {
    form.body(A.infoLines(f, f.id).join("\n"));
    const officer = R.rankAtLeast(p, "officer");
    add("Members", () => membersMenu(player));
    add("Faction home", () => attempt(player, () => startHome(player)));
    if (officer) add("Claim this chunk", () => attempt(player, () => A.claim(player, 0)));
    if (officer) add("Unclaim this chunk", () => attempt(player, () => A.unclaim(player)));
    if (officer) add("Set home here", () => attempt(player, () => A.setHome(player)));
    if (officer) add("Invite a player", () => inviteMenu(player));
    if (officer) add("Relations", () => relationMenu(player));
    if (officer) add("Settings", () => settingsMenu(player));
    add(p.rank === "leader" ? "§4Disband faction" : "§cLeave faction", () => confirm(player, p.rank === "leader" ? "Disband your faction for good?" : "Leave your faction?", () => (p.rank === "leader" ? A.disband(player) : A.leave(player))));
  }
  add("Map", () => A.map(player));
  add("All factions", () => listMenu(player));
  add("Help", () => A.help(player));

  for (const [label] of items) form.button(label);
  const res = await show(player, form);
  if (res.canceled || res.selection === undefined) return;
  await items[res.selection][1]();
}

async function confirm(player, question, fn) {
  const res = await show(player, new ActionFormData().title("Are you sure?").body(question).button("§cYes").button("No"));
  if (res.selection === 0) attempt(player, fn);
}

async function createMenu(player) {
  const res = await show(player, new ModalFormData()
    .title("Create a faction")
    .textField(`Name (${CONFIG.nameMin}-${CONFIG.nameMax} letters, numbers or _)`, "MyFaction")
    .textField("Description", "What is your faction about?")
    .toggle("Anyone can join without an invite", { defaultValue: false })
    .submitButton("Create"));
  if (res.canceled || !res.formValues) return;
  const [name, desc, open] = res.formValues;
  if (!attempt(player, () => A.create(player, name))) return;
  if (desc) attempt(player, () => A.describe(player, desc));
  if (open) attempt(player, () => A.toggleOpen(player));
}

async function joinMenu(player) {
  const invited = A.invitesFor(player);
  const open = S.allFactions().filter((f) => f.open && !invited.includes(f));
  const choices = [...invited, ...open];
  if (!choices.length) return R.tell(player, "No invites and no open factions right now. Ask a leader to §e/f invite§r you.");
  const form = new ActionFormData().title("Join a faction").body("§7Invites first, then open factions.");
  for (const f of choices) form.button(`${invited.includes(f) ? "§a[Invite] " : ""}§r${f.name}\n§7${S.membersOf(f.id).length} members, ${S.claimsOf(f.id)} land`);
  const res = await show(player, form);
  if (res.selection !== undefined) attempt(player, () => A.join(player, choices[res.selection].name));
}

async function listMenu(player) {
  const mine = S.playerData(player).faction;
  const all = S.allFactions().sort((a, b) => R.factionPower(b.id) - R.factionPower(a.id));
  if (!all.length) return R.tell(player, "No factions yet.");
  const form = new ActionFormData().title("All factions");
  for (const f of all) form.button(`${R.colorName(f, mine)}\n§7${S.membersOf(f.id).length} members, power ${Math.floor(R.factionPower(f.id))}${R.isRaidable(f.id) ? " §cRAIDABLE" : ""}`);
  const res = await show(player, form);
  if (res.selection === undefined) return;
  const f = all[res.selection];
  await show(player, new ActionFormData().title(f.name).body(A.infoLines(f, mine).join("\n")).button("Back"));
}

async function membersMenu(player) {
  const p = S.playerData(player);
  const members = S.membersOf(p.faction).sort((a, b) => RANK_LEVEL[b.rank] - RANK_LEVEL[a.rank]);
  const online = new Set(world.getAllPlayers().map((x) => x.id));
  const form = new ActionFormData().title("Members");
  for (const m of members) form.button(`${online.has(m.id) ? "§2" : "§8"}${RANK_ICON[m.rank]}${m.name}\n§7${m.rank}, power ${Math.round(m.power * 10) / 10}`);
  const res = await show(player, form);
  if (res.selection === undefined) return;
  const t = members[res.selection];
  if (t.id === p.id || !R.rankAtLeast(p, "officer")) return;
  /** @type {[string, () => void][]} */
  const options = [
    ["Promote", () => A.promote(player, t.name)],
    ["Demote", () => A.demote(player, t.name)],
    ["§cKick", () => A.kick(player, t.name)],
  ];
  if (p.rank === "leader") options.push(["Make leader", () => A.leader(player, t.name)]);
  const f2 = new ActionFormData().title(t.name).body(`§7Rank: §f${t.rank}`);
  for (const [l] of options) f2.button(l);
  const r2 = await show(player, f2);
  if (r2.selection !== undefined) attempt(player, options[r2.selection][1]);
}

async function inviteMenu(player) {
  const fid = S.playerData(player).faction;
  const others = world.getAllPlayers().filter((x) => S.playerData(x).faction !== fid);
  const names = others.map((x) => x.name);
  const res = await show(player, new ModalFormData()
    .title("Invite a player")
    .dropdown("Online players", ["(type a name below)", ...names])
    .textField("...or a name", "Steve")
    .submitButton("Invite"));
  if (res.canceled || !res.formValues) return;
  const [i, typed] = res.formValues;
  const name = i > 0 ? names[i - 1] : String(typed ?? "").trim();
  if (name) attempt(player, () => A.invite(player, name));
}

async function relationMenu(player) {
  const fid = S.playerData(player).faction;
  const others = S.allFactions().filter((f) => f.id !== fid);
  if (!others.length) return R.tell(player, "There are no other factions yet.");
  const labels = others.map((f) => `${R.colorName(f, fid)}§r (${R.relation(fid, f.id)})`);
  const res = await show(player, new ModalFormData()
    .title("Relations")
    .dropdown("Faction", labels)
    .dropdown("Set relation to", R.RELATIONS, { defaultValueIndex: 2 })
    .submitButton("Set"));
  if (res.canceled || !res.formValues) return;
  const [fi, ri] = res.formValues;
  attempt(player, () => A.setRelation(player, R.RELATIONS[ri], others[fi].name));
}

async function settingsMenu(player) {
  const p = S.playerData(player);
  const f = S.getFaction(p.faction);
  const leader = p.rank === "leader";
  const form = new ModalFormData().title("Faction settings");
  if (leader) form.textField("Name (leader only)", f.name, { defaultValue: f.name });
  form.textField("Description", f.desc, { defaultValue: f.desc });
  form.toggle("Anyone can join without an invite", { defaultValue: f.open });
  form.submitButton("Save");
  const res = await show(player, form);
  if (res.canceled || !res.formValues) return;
  const v = [...res.formValues];
  const name = leader ? String(v.shift() ?? "") : f.name;
  const [desc, open] = v;
  if (leader && name && name !== f.name) attempt(player, () => A.rename(player, name));
  if (desc && desc !== f.desc) attempt(player, () => A.describe(player, desc));
  if (open !== f.open) attempt(player, () => A.toggleOpen(player));
}
