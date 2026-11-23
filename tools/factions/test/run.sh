#!/bin/sh
# Plays a scripted game session against a fake Minecraft API (no game needed).
#   sh tools/factions/test/run.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
WORK="$(mktemp -d)"
mkdir -p "$WORK/node_modules/@minecraft/server" "$WORK/node_modules/@minecraft/server-ui"
cp "$HERE/mock/server/index.js" "$WORK/node_modules/@minecraft/server/index.js"
cp "$HERE/mock/server-ui/index.js" "$WORK/node_modules/@minecraft/server-ui/index.js"
echo '{"name":"@minecraft/server","type":"module","main":"index.js"}' > "$WORK/node_modules/@minecraft/server/package.json"
echo '{"name":"@minecraft/server-ui","type":"module","main":"index.js"}' > "$WORK/node_modules/@minecraft/server-ui/package.json"
echo '{"type":"module"}' > "$WORK/package.json"
cp -r "$ROOT/packs/FactionsCore_BP/scripts" "$WORK/scripts"
cp "$HERE/test.mjs" "$WORK/test.mjs"
cd "$WORK" && node test.mjs
rm -rf "$WORK"
