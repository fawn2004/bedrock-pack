// Factions Core Chat - formats normal chat with ranks and factions.
//
// This is a separate pack because it needs the Beta APIs experiment (the
// chat event isn't in the stable API yet). If a Minecraft update breaks the
// beta API, only chat formatting stops: Factions Core keeps working, and
// chat falls back to vanilla. Fix it by updating the @minecraft/server
// "-beta" version in this pack's manifest.json.
//
// Factions Core (main pack) keeps these player tags up to date:
//   fcprefix:<ranks + faction tag>   fcmode:<public|faction|ally>
//   fcfac:<faction id>               fcallies:<id,id,...>
//   fcmuted:<time the mute ends>
import { world, system } from "@minecraft/server";

const tagValue = (player, key) => {
  const t = player.getTags().find((x) => x.startsWith(key));
  return t === undefined ? undefined : t.slice(key.length);
};

const recent = new Map(); // player id -> { time, text }

world.beforeEvents.chatSend.subscribe((e) => {
  const sender = e.sender;
  const raw = e.message;
  e.cancel = true; // we send our own formatted line instead
  system.run(() => {
    try {
      handle(sender, raw);
    } catch (err) {
      console.warn(`[Factions Chat] ${err}`);
      world.sendMessage(`<${sender.name}> ${raw}`);
    }
  });
});

function handle(sender, raw) {
  const now = Date.now();
  const mutedUntil = Number(tagValue(sender, "fcmuted:") ?? 0);
  if (mutedUntil > now) {
    sender.sendMessage(`§cYou are muted for ${Math.ceil((mutedUntil - now) / 60000)} more minute(s).`);
    return;
  }

  // Strip colour codes so players can't fake ranks.
  const text = raw.replace(/§/g, "").trim();
  if (!text) return;
  const last = recent.get(sender.id);
  if (last && now - last.time < 900) { sender.sendMessage("§cSlow down!"); return; }
  if (last && last.text === text.toLowerCase() && now - last.time < 8000) { sender.sendMessage("§cPlease don't repeat yourself."); return; }
  recent.set(sender.id, { time: now, text: text.toLowerCase() });

  const prefix = tagValue(sender, "fcprefix:") ?? "";
  const mode = tagValue(sender, "fcmode:") ?? "public";
  const fid = tagValue(sender, "fcfac:");

  if (mode === "faction" && fid) {
    const line = `§a[Faction] ${prefix}§f${sender.name}§8 » §a${text}`;
    for (const pl of world.getAllPlayers()) if (tagValue(pl, "fcfac:") === fid) pl.sendMessage(line);
    return;
  }
  if (mode === "ally" && fid) {
    const ids = new Set([fid, ...(tagValue(sender, "fcallies:") ?? "").split(",").filter(Boolean)]);
    const line = `§d[Ally] ${prefix}§f${sender.name}§8 » §d${text}`;
    for (const pl of world.getAllPlayers()) if (ids.has(tagValue(pl, "fcfac:") ?? "")) pl.sendMessage(line);
    return;
  }
  world.sendMessage(`${prefix}§f${sender.name}§8 » §r§f${text}`);
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => recent.delete(playerId));
