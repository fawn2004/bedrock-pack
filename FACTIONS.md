# Factions Core (Minecraft Bedrock add-on)

A factions core for your server. Players can:
- start factions and claim land
- build up power, make allies and enemies
- raid factions that let their power slip

It's a separate pack from More Building Blocks and doesn't need it.

## Install
Double-click `dist/FactionsCore.mcpack`, then turn on the behavior pack in your world or server.
It needs Minecraft Bedrock **1.26.20 or newer** and no experiments.
All data is saved in the world, so it survives restarts.

## How it plays
- **Factions:** players have 4 ranks: leader `**`, officer `*`, member `+` and recruit `-`.
  The faction name shows above members' heads.
- **Power:** every player has power, from -10 up to 10.
  - Dying costs 4 power.
  - Being online gives back 0.5 power a minute.
  - A faction's power is the total of all its members' power.
- **Land:** a faction can claim one 16x16 chunk for each point of power.
  - Claims must touch your existing land.
  - There must be 1 chunk of wilderness between your land and another faction's land.
  - On your land, outsiders can't break, place or open anything. They also can't hurt animals.
- **Raiding:** a faction becomes **raidable** when it has more land than power, for example after its members die a lot. Then:
  - explosions work on its land
  - its **enemies** can claim its chunks out from under it
- **Relations:** *ally* and *truce* both need the two factions to agree. *Enemy* only needs one side.
  - You can't hurt members of your own faction, your allies or your truces.
  - Allies can use each other's doors.
- **Territory:** walking into new land shows its name, coloured by your relation to it:

  | Colour | Land |
  |---|---|
  | Green | Your faction |
  | Pink | Ally |
  | Aqua | Truce |
  | White | Neutral |
  | Red | Enemy |
  | Gold | SafeZone |
  | Dark red | WarZone |

- **Home:** officers set a faction home on your land. `/f home` teleports you there after 5 seconds.
  Moving or getting hurt cancels it.

## Commands
Type **`/f`** on its own to open a menu that does nearly everything. You can also type commands:

| Command | What it does |
|---|---|
| `/f help` | list commands |
| `/f create <name>` / `/f disband` | start or end a faction |
| `/f join <name>` / `/f leave` | join (open, or you were invited) / leave |
| `/f invite <player>` / `/f uninvite <player>` | officers: manage invites |
| `/f kick`, `/f promote`, `/f demote` `<player>` | officers: manage members |
| `/f leader <player>` | hand over leadership |
| `/f claim [radius]` / `/f unclaim [all]` / `/f autoclaim` | officers: land |
| `/f map` | coloured map of nearby chunks |
| `/f sethome` / `/f home` | faction home |
| `/f ally`, `/f truce`, `/f neutral`, `/f enemy` `<faction>` | relations |
| `/f info [faction or player]`, `/f list`, `/f who <player>`, `/f power [player]` | information |
| `/f open`, `/f rename <name>`, `/f desc <text>` | settings |
| `/fc <message>` / `/fa <message>` | faction chat / ally chat |

For player names with spaces, put the name in quotes, for example `/f invite "Some Player"`.
If another add-on also uses `/f`, type `/factions:f` instead.

### Admin (operators)
| Command | What it does |
|---|---|
| `/fadmin bypass` | toggle building and opening anything anywhere |
| `/fadmin safezone [radius]` | claim SafeZone: no PvP, no building, no explosions |
| `/fadmin warzone [radius]` | claim WarZone: PvP on, no building |
| `/fadmin unclaim [radius]` | remove any claims around you |
| `/fadmin disband <faction>` | delete a faction |
| `/fadmin setpower <player> <amount>` | change a player's power |
| `/fadmin join <faction>` | join any faction as an officer |

## Settings
Change the numbers at the top of `packs/FactionsCore_BP/scripts/config.js` (power, claim rules, explosions, home warmup...).
Then run `python3 tools/build_factions.py` to rebuild `dist/FactionsCore.mcpack`.
