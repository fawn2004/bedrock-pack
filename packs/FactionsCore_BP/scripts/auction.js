// Factions Core - auction house. Players list the item in their hand for a
// price; others buy it from the menu. Unsold items come back by mail.
import { system, ItemStack, EnchantmentTypes } from "@minecraft/server";
import { CONFIG } from "./config.js";
import * as S from "./store.js";
import * as R from "./rules.js";
import * as E from "./economy.js";
import { giveItem } from "./items.js";

// ------------------------------------------------------------ item <-> JSON

export function serialize(it) {
  const o = { t: it.typeId, a: it.amount };
  if (it.nameTag) o.n = it.nameTag;
  const lore = it.getLore();
  if (lore.length) o.l = lore;
  if (it.keepOnDeath) o.k = 1;
  const en = it.getComponent("minecraft:enchantable");
  if (en) { const list = en.getEnchantments().map((e) => [e.type.id, e.level]); if (list.length) o.e = list; }
  const du = it.getComponent("minecraft:durability");
  if (du?.damage) o.d = du.damage;
  const ids = it.getDynamicPropertyIds();
  if (ids.length) o.p = Object.fromEntries(ids.map((id) => [id, it.getDynamicProperty(id)]));
  return o;
}

export function deserialize(o) {
  const it = new ItemStack(o.t, o.a);
  if (o.n) it.nameTag = o.n;
  if (o.l) it.setLore(o.l);
  if (o.k) it.keepOnDeath = true;
  if (o.e) {
    const en = it.getComponent("minecraft:enchantable");
    for (const [id, level] of o.e) { try { en?.addEnchantment({ type: EnchantmentTypes.get(id), level }); } catch { /* */ } }
  }
  if (o.d) { const du = it.getComponent("minecraft:durability"); if (du) du.damage = o.d; }
  if (o.p) it.setDynamicProperties(o.p);
  return it;
}

export const itemLabel = (o) => `${o.n ?? o.t.split(":")[1].replace(/_/g, " ")}${o.a > 1 ? ` §7x${o.a}` : ""}`;

// ------------------------------------------------------------ listings

export const listings = () => S.auctionsT.values().filter((a) => a.expires > Date.now()).sort((a, b) => b.created - a.created);
export const myListings = (player) => S.auctionsT.values().filter((a) => a.seller === player.id);

export function list(player, priceText) {
  const price = E.parseAmount(priceText);
  if (!(price > 0)) E.fail("Give a price, like §e/ah sell 5k§r.");
  if (myListings(player).length >= CONFIG.auctionMaxListings) E.fail(`You can have ${CONFIG.auctionMaxListings} listings at once.`);
  const inv = player.getComponent("minecraft:inventory").container;
  const it = inv.getItem(player.selectedSlotIndex);
  if (!it) E.fail("Hold the item you want to sell.");
  if (it.typeId === "fc:menu" || /shulker_box|bundle/.test(it.typeId)) E.fail("That item can't be auctioned.");
  const item = serialize(it);
  inv.setItem(player.selectedSlotIndex, undefined);
  const id = "a" + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
  S.auctionsT.set(id, { id, seller: player.id, sellerName: player.name, price, item, created: Date.now(), expires: Date.now() + CONFIG.auctionHours * 3600000 });
  R.broadcast(`§e${player.name}§r is auctioning §f${itemLabel(item)}§r for §a${E.money(price)}§r! §7(Menu > Auction House)`);
}

export function buy(player, id) {
  const a = S.auctionsT.get(id);
  if (!a || a.expires < Date.now()) E.fail("That listing is gone.");
  if (a.seller === player.id) E.fail("That's your own listing.");
  const p = S.playerData(player);
  E.takeMoney(p, a.price, "this item");
  S.auctionsT.delete(id);
  giveItem(player, deserialize(a.item));
  const seller = S.getPlayerRecord(a.seller);
  const pay = Math.floor(a.price * (1 - CONFIG.auctionTaxPercent / 100));
  if (seller) E.addMoney(seller, pay);
  R.tell(player, `Bought §f${itemLabel(a.item)}§r for §c${E.money(a.price)}§r.`);
  R.sound(player, "random.levelup", 1.6, 0.5);
  const online = R.onlineById(a.seller);
  if (online) R.tell(online, `§e${player.name}§r bought your §f${itemLabel(a.item)}§r! You got §a${E.money(pay)}§r.`);
}

export function cancel(player, id) {
  const a = S.auctionsT.get(id);
  if (!a || a.seller !== player.id) E.fail("That isn't your listing.");
  S.auctionsT.delete(id);
  giveItem(player, deserialize(a.item));
  R.tell(player, `Took back §f${itemLabel(a.item)}§r.`);
}

export function collectMail(player) {
  const p = S.playerData(player);
  if (!p.mail.length) E.fail("Your mailbox is empty.");
  for (const o of p.mail) giveItem(player, deserialize(o));
  R.tell(player, `Collected §e${p.mail.length}§r item(s) from your mailbox.`);
  p.mail = [];
  S.savePlayer(p);
}

export function setupAuction() {
  // Expired listings go back to the seller's mailbox.
  system.runInterval(() => {
    const now = Date.now();
    for (const a of S.auctionsT.values()) {
      if (a.expires > now) continue;
      S.auctionsT.delete(a.id);
      const p = S.getPlayerRecord(a.seller);
      if (p) { p.mail.push(a.item); S.savePlayer(p); }
    }
  }, 1200);
}
