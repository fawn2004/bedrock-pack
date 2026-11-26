# My Claude — Android chat app

A small Android app that chats with Claude through the official Anthropic Java SDK, streaming replies as they're written.

## Install
1. Copy `MyClaude.apk` to your phone and open it (allow "install unknown apps" when asked).
2. On first launch, paste your Anthropic API key (from console.anthropic.com). Usage is billed to that key.

## Settings (⋮ menu)
- **API key**: stored only in the app's private storage on your phone.
- **Model**: defaults to `claude-opus-5-5`.
- **Personality / instructions**: the system prompt. Change it to give the app its own name or style.

"New chat" clears the conversation.

## Build it yourself
Requires JDK 17+ and the Android SDK (set `sdk.dir` in `local.properties`):

    ./gradlew assembleRelease

The output APK is at `app/build/outputs/apk/release/app-release.apk`. It is signed with a debug key so it installs directly; sign it with your own key before publishing it anywhere.
