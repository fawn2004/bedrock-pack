// Factions Core - form helpers. Titles carry an invisible marker so the
// resource pack can draw our own styled layouts:
//   hub   - main dashboard: stat cards + navigation rail + text panel
//   list  - text panel + a column of big icon buttons
//   modal - styled input forms
import { system } from "@minecraft/server";
import { ActionFormData, ModalFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import * as R from "./rules.js";
import { Fail } from "./economy.js";

export const MARK = {
  hub: "§h§u§b§r", list: "§l§s§t§r", modal: "§m§d§l§r", card: "§c§r§d§r",
  // "board" layout (quests): banner + text + action buttons | grid of tiles
  board: "§b§o§a§r", tile: "§t§i§l§r", banner: "§b§n§r§r", action: "§a§c§t§r", locked: "§a§c§l§r",
  // which column (tiles) / row (cards) a button goes in; follows the tile/card marker
  first: "§0§r", second: "§9§r",
};
/** Our icon by name ("coin"), or any full texture path ("textures/items/diamond"). */
export const ICON = (name) => (name.includes("/") ? name : `textures/fc/ui/icons/${name}`);

/** Show a form, waiting until the player has closed chat or another screen. */
export async function show(player, form, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const res = await form.show(player);
    if (res.cancelationReason !== FormCancelationReason.UserBusy) return res;
    await new Promise((ok) => system.runTimeout(() => ok(undefined), 5));
  }
  return { canceled: true };
}

/** Run an action from a menu, telling the player if it fails. Returns true on success. */
export function attempt(player, fn) {
  try {
    const r = fn();
    if (r instanceof Promise) r.catch((e) => report(player, e));
    return true;
  } catch (e) {
    report(player, e);
    return false;
  }
}

function report(player, e) {
  if (e instanceof Fail) R.tell(player, "§c" + e.message);
  else { R.tell(player, "§cSomething went wrong. Check the content log."); console.error(`[Factions] ${e}\n${e?.stack ?? ""}`); }
  R.sound(player, "note.bass", 0.6, 0.6);
}

const label = (b) => (b.sub ? `§l${b.text}§r\n§7${b.sub}` : `§l${b.text}`);

/**
 * The main dashboard. `cards` (exactly 8) show as stat tiles,
 * `rail` as the navigation list. Each entry: { text, sub, icon, action }.
 */
export async function hub(player, { title, body, cards, rail }) {
  const form = new ActionFormData().title(MARK.hub + title).body(body);
  const all = [...cards, ...rail];
  cards.forEach((c, i) => form.button(`${MARK.card}${i < 4 ? MARK.first : MARK.second}§l${c.text}§r\n${c.sub}`, ICON(c.icon)));
  for (const b of rail) form.button(label(b), b.icon ? ICON(b.icon) : undefined);
  const res = await show(player, form);
  if (res.canceled || res.selection === undefined) return;
  R.sound(player, "random.click", 1.2, 0.5);
  await all[res.selection].action?.();
}

/**
 * A list screen: text on top, then big buttons. `back` adds a Back button.
 * Each button: { text, sub, icon, action }.
 * @param {any} player
 * @param {{ title: string, body?: string, buttons: any[], back?: () => any }} o
 */
export async function menu(player, { title, body = "", buttons, back = undefined }) {
  const form = new ActionFormData().title(MARK.list + title).body(body);
  const all = buttons.slice();
  if (back) all.push({ text: "Back", sub: "Return to the last page", icon: "back", action: back });
  for (const b of all) form.button(label(b), b.icon ? ICON(b.icon) : undefined);
  const res = await show(player, form);
  if (res.canceled || res.selection === undefined) return;
  R.sound(player, "random.click", 1.2, 0.5);
  await all[res.selection].action?.();
}

/**
 * The board layout used by the quest screens:
 * left = banner picture, text and big action buttons; right = grid of tiles.
 * tiles: [{ text, icon, action }], actions: [{ text, locked, action }], banner: texture path.
 */
export async function board(player, { title, body, tiles, banner, actions }) {
  const form = new ActionFormData().title(MARK.board + title).body(body);
  const all = [];
  // Tiles alternate between the left and right column.
  tiles.forEach((t, i) => { form.button(MARK.tile + (i % 2 ? MARK.second : MARK.first) + t.text, ICON(t.icon)); all.push(t.action); });
  form.button(MARK.banner, ICON(banner));
  all.push(undefined);
  for (const a of actions) { form.button((a.locked ? MARK.locked : MARK.action) + a.text); all.push(a.action); }
  const res = await show(player, form);
  if (res.canceled || res.selection === undefined) return;
  R.sound(player, "random.click", 1.2, 0.5);
  await all[res.selection]?.();
}

/** An input form. `build(form)` adds the fields. Returns the values or undefined. */
export async function modal(player, title, build, submit = "Confirm") {
  const form = new ModalFormData().title(MARK.modal + title);
  build(form);
  form.submitButton(submit);
  const res = await show(player, form);
  if (res.canceled || !res.formValues) return undefined;
  return res.formValues;
}

export async function confirm(player, title, text, yes = "Yes") {
  let ok = false;
  await menu(player, {
    title,
    body: text,
    buttons: [
      { text: yes, sub: "Go ahead", icon: "check", action: () => { ok = true; } },
      { text: "Cancel", sub: "Never mind", icon: "close", action: () => {} },
    ],
  });
  return ok;
}

export const serverTitle = (page) => `${CONFIG.serverName} §8| §f${page}`;
