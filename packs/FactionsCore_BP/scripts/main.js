// Factions Core - entry point.
import { world } from "@minecraft/server";
import { ensureLoaded } from "./store.js";
import { setupCommands } from "./commands.js";
import { setupProtection } from "./protection.js";
import { setupTasks } from "./tasks.js";

setupCommands(); // must happen during startup
setupProtection();
setupTasks();

world.afterEvents.worldLoad.subscribe(() => {
  ensureLoaded();
  console.log("[Factions] Factions Core loaded.");
});
