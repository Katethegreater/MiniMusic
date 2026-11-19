# MiniMusic

MiniMusic is an offline Android studio for composing and practicing songs on a kalimba or lyre.

- In **Compose**, tap keys or strings to append letter notes. Select an event to change its duration, remove it, or replace its note with a two-note chord.
- In **Setup**, choose the number of keys or strings and enter their pitches from left to right. C major presets give you a starting point. Use the notes and octaves on your physical instrument for an exact match.
- **Save song** adds the current title, notes, timing, and tuning to **My songs** on the device.
- In **Learn**, select a practice speed down to 25% and follow the highlighted keys or strings. The same song is also playable at full speed in Compose.

## Android build

Use JDK 17 or 21, Android SDK Platform 35, Android SDK Build-Tools 34.0.0, and Gradle 8.9. Set `ANDROID_HOME` or open the repository in Android Studio to select the SDK.

```sh
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The debug app supports Android 6.0 and later. The studio assets in `app/src/main/assets` can also be served locally for browser-based UI development.

## GitHub Actions

The **Android APK** workflow builds and lints the debug APK for pushes and pull requests targeting `main`. You can also run it manually from the **Actions** tab. Open a successful run and download **MiniMusic-debug-apk** from **Artifacts**.
