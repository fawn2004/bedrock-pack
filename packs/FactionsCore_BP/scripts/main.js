// Factions Core - entry point.
import { world } from "@minecraft/server";
import { ensureLoaded } from "./store.js";
import { setRewardGiver } from "./economy.js";
import { setQuestRewardGiver } from "./quests.js";
import { giveReward } from "./items.js";
import { setupCommands } from "./commands.js";
import { setupProtection } from "./protection.js";
import { setupEnchants } from "./enchants.js";
import { setupCombat } from "./combat.js";
import { setupTasks } from "./tasks.js";
import { setupItemUse } from "./itemuse.js";
import { setupSpawners } from "./spawners.js";
import { setupCrawlers } from "./crawlers.js";
import { setupTeleports } from "./teleports.js";
import { setupEvents } from "./events.js";
import { setupAuction } from "./auction.js";
import { setupFtop } from "./ftop.js";
import { setupHud } from "./hud.js";
import { setupHolograms } from "./holograms.js";
import { setupRanks, setOnRanksChanged, ranksOf } from "./ranks.js";
import { alliesOf, refreshNametag, tell } from "./rules.js";
import { refreshHud } from "./hud.js";

setRewardGiver(giveReward);
setQuestRewardGiver(giveReward);

setupCommands(); // must happen during startup
// Order matters: land protection gets the first say on every event.
setupProtection();
setupItemUse();
setupEnchants();
setupCombat();
setupSpawners();
setupCrawlers();
setupTasks();
setupTeleports();
setupEvents();
setupAuction();
setupFtop();
setupHud();
setupHolograms();
setupRanks(alliesOf);
setOnRanksChanged((player, first) => {
  refreshNametag(player);
  refreshHud(player);
  if (!first) {
    const list = ranksOf(player);
    tell(player, list.length ? `Your rank: ${list.map((r) => r.display).join("§r ")}` : "Your rank was removed.");
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  ensureLoaded();
  console.log("[Factions] Factions Core loaded.");
});
