#!/usr/bin/env bash
# Builds dist/AddonImporter.apk without Gradle. Needs JDK 11+ and the Android
# SDK with platforms;android-35 and build-tools;35.0.0 (set ANDROID_HOME).
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
VERSION_CODE=1
VERSION_NAME=1.0.0
OUT=../dist/AddonImporter.apk

rm -rf build && mkdir -p build/classes build/gen build/dex
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -I "$JAR" --manifest AndroidManifest.xml --java build/gen \
  --min-sdk-version 24 --target-sdk-version 35 \
  --version-code $VERSION_CODE --version-name $VERSION_NAME \
  -o build/base.apk build/res.zip
javac -nowarn --release 11 -classpath "$JAR" -d build/classes $(find src build/gen -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output build/dex $(find build/classes -name '*.class')
cp build/base.apk build/unsigned.apk
(cd build/dex && zip -qj ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk

# Signing key: kept outside git. Reuse the same one so updates install over the old app.
KS="${KEYSTORE:-$HOME/.android/addon-importer.jks}"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias importer \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Add-on Importer" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --out "$OUT" build/aligned.apk
rm -f "$OUT.idsig"
echo "Built $(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
