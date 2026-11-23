# Add-on Importer (Android)

A small Android app that imports `.mcaddon`, `.mcpack`, `.mcworld` and `.mctemplate` files into Minecraft Bedrock Edition.

## Install
1. On your phone, download `dist/AddonImporter.apk` from this repo.
2. Open it. Android will ask you to allow installs from your browser or Files app. Allow it, then tap **Install**.

## Use
- Tap an add-on file in your Files app or browser downloads and pick **Add-on Importer**, or
- Use **Share → Add-on Importer** from any app, or
- Open the app and tap **Choose add-on files** (you can pick several).

The app checks the file and shows which packs are inside. Then it hands the file to Minecraft, which opens and imports it.
If a file was packed in a way Minecraft rejects, the app fixes it first. That covers an extra wrapper folder, a `.zip` name, a `.zip` inside an add-on, Windows `\` paths, or Mac `__MACOSX` junk.

Android doesn't let other apps write into Minecraft's folders, so the app gives the file to Minecraft's own importer instead.

## Build
`./build.sh` builds `../dist/AddonImporter.apk` with the Android SDK (`platforms;android-35`, `build-tools;35.0.0`). It doesn't need Gradle.
The signing key is created at `~/.android/addon-importer.jks` and is not committed. Builds made with a different key can't install over an older copy, so uninstall that copy first.
Run `test/run.sh` to test the file checking and repair code on a normal JVM.
