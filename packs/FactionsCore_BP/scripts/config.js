// Factions Core - settings. Change these to tune your server.

export const CONFIG = {
  serverName: "FACTIONS",
  season: "Season I",

  // ---- factions
  nameMin: 3,
  nameMax: 16,
  descMax: 60,
  maxMembers: 15, // +5 per "Members" upgrade
  maxAllies: 3,
  inviteMinutes: 10,

  // ---- power
  // Every player has power between minPower and maxPower.
  // A faction's power is the total of its members' power (online or not).
  // A faction can hold one claimed chunk per point of power (+ upgrades).
  startPower: 10,
  maxPower: 10,
  minPower: -10,
  deathPowerLoss: 3,
  regenPerMinute: 0.5, // only while online
  noPowerLossInWarzone: false,

  // ---- land
  maxClaimRadius: 3, // "/f claim 3" claims a 7x7 square
  claimsMustConnect: true, // new claims must touch your land (first claim is free)
  bufferChunks: 1, // gap of wilderness required next to other factions' land (0 = none)
  // When TNT and creepers can break blocks on claimed land:
  // "never" | "raidable" (only when land > power) | "unshielded" (any time the shield is down) | "always"
  explosionsInClaims: "unshielded",
  alliesCanBuild: false,
  alliesCanUseDoors: true,

  // ---- shield: a daily window where your land can't be raided
  shieldHours: 6, // +2 per "Shield" upgrade
  shieldChangeCooldownHours: 24,
  timezoneOffsetHours: 0, // shield hours use UTC + this

  // ---- home / teleports
  homeWarmupSeconds: 5,
  homeCooldownSeconds: 30,
  wildRadius: 5000,
  wildMinRadius: 500,
  combatTagSeconds: 15,

  // ---- economy
  startMoney: 500,
  killReward: 250, // money for killing a player (plus any bounty)
  killCrystals: 1,
  minBounty: 1000,
  auctionMaxListings: 5,
  auctionHours: 48,
  auctionTaxPercent: 5,

  // ---- spawners
  spawnerIntervalSeconds: 12, // -10% per "Spawner speed" upgrade
  spawnerActivationRange: 24,
  maxMobStack: 1000,
  freezeSpawnerMobs: true, // spawner mobs stay where they spawn

  // ---- events
  envoyMinutes: 45, // supply drops
  envoyCrates: 8,
  envoyRadius: 120, // around spawn when there is no WarZone
  envoyLifetimeMinutes: 10,
  kothCaptureSeconds: 120,
  kothEveryMinutes: 120,
  kothDurationMinutes: 20,

  // ---- display
  nametagPrefix: true, // shows [Faction] above players' heads
  territoryMessages: true, // shows the land's name when you walk into it
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

// Item rarity, used by crates, books, crawlers and loot.
export const RARITY = {
  common: { name: "Common", color: "§f", order: 0 },
  rare: { name: "Rare", color: "§9", order: 1 },
  epic: { name: "Epic", color: "§5", order: 2 },
  legendary: { name: "Legendary", color: "§6", order: 3 },
  mythic: { name: "Mythic", color: "§c", order: 4 },
  boss: { name: "Boss Drop", color: "§4", order: 5 },
};
export const RARITIES = ["common", "rare", "epic", "legendary", "mythic"];

// Faction upgrades, bought with the faction treasury.
export const UPGRADES = {
  members: { name: "Recruitment", desc: "+5 member slots", icon: "members", costs: [250000, 750000, 2000000] },
  land: { name: "Land Grant", desc: "+10 claimable chunks", icon: "claim", costs: [200000, 600000, 1500000] },
  spawners: { name: "Spawner Speed", desc: "Spawners work 10% faster", icon: "spawner", costs: [500000, 1500000, 4000000] },
  crawlers: { name: "Crawler Speed", desc: "Crawlers mine 10% faster", icon: "crawler", costs: [400000, 1200000, 3500000] },
  haste: { name: "Miner's Haste", desc: "Haste on your land", icon: "haste", costs: [300000, 1000000] },
  speed: { name: "Swift Land", desc: "Speed on your land", icon: "speed", costs: [350000] },
  shield: { name: "Shield Generator", desc: "+2 shield hours", icon: "shield", costs: [500000, 1500000, 3000000] },
  xp: { name: "Wisdom", desc: "+10% XP for members", icon: "level", costs: [300000, 900000, 2500000] },
};
