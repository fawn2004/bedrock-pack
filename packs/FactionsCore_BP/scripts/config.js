// Factions Core - settings. Change these to tune your server.

export const CONFIG = {
  // ---- factions
  nameMin: 3,
  nameMax: 16,
  descMax: 60,
  maxMembers: 20,
  maxAllies: 3,
  inviteMinutes: 10,

  // ---- power
  // Every player has power between minPower and maxPower.
  // A faction's power is the sum of its members' power (online or not).
  // A faction can hold one claimed chunk per point of power.
  startPower: 10,
  maxPower: 10,
  minPower: -10,
  deathPowerLoss: 4,
  regenPerMinute: 0.5, // only while online
  noPowerLossInWarzone: false,

  // ---- land
  maxClaimRadius: 3, // "/f claim 3" claims a 7x7 square
  claimsMustConnect: true, // new claims must touch your land (first claim is free)
  bufferChunks: 1, // gap of wilderness required next to other factions' land (0 = none)
  explosionsInClaims: "raidable", // "never" | "raidable" | "always"
  alliesCanBuild: false,
  alliesCanUseDoors: true,

  // ---- home
  homeWarmupSeconds: 5,
  homeCooldownSeconds: 30,

  // ---- display
  nametagPrefix: true, // shows [Faction] above players' heads
  territoryTitles: true, // shows a title when you walk into new land
};

// Ranks, highest first.
export const RANKS = ["leader", "officer", "member", "recruit"];
export const RANK_LEVEL = { leader: 3, officer: 2, member: 1, recruit: 0 };
export const RANK_ICON = { leader: "**", officer: "*", member: "+", recruit: "-" };

// Colours used for relations everywhere (chat, map, titles).
export const COLOR = {
  own: "§a",
  ally: "§d",
  truce: "§b",
  neutral: "§f",
  enemy: "§c",
  wilderness: "§2",
  safezone: "§6",
  warzone: "§4",
};
