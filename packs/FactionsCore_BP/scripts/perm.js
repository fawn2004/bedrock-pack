// Factions Core - who counts as a server admin (operators, or the fc_admin tag).
export function hasPerm(player) {
  try {
    return player.playerPermissionLevel === 2 || player.hasTag("fc_admin");
  } catch {
    return false;
  }
}
