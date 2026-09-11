# Leseno Android (Play Store + Amazon Fire)

Capacitor-WebView-App (`de.leseno.app`), die **https://leseno.de** lädt. Eine Codebasis für Google Play (AAB) und Amazon Appstore / Fire / Fire Kids (APK).

## Artefakte

Nach dem Release-Build:

| Datei | Store |
|---|---|
| [`mobile/dist/leseno-1.0.2.aab`](../mobile/dist/leseno-1.0.2.aab) | Google Play Console |
| [`mobile/dist/leseno-1.0.2.apk`](../mobile/dist/leseno-1.0.2.apk) | Amazon Appstore (Fire / Fire Kids) |

Quellen unter Gradle:

- `mobile/android/app/build/outputs/bundle/release/app-release.aab`
- `mobile/android/app/build/outputs/apk/release/app-release.apk`

## Voraussetzungen (Windows)

- **JDK 21** (Capacitor 7 / AGP brauchen Source 21). Empfohlen: Temurin unter `%LOCALAPPDATA%\Java\jdk-21`
- **Android SDK** unter `%LOCALAPPDATA%\Android\Sdk` (cmdline-tools, **platform 37**, build-tools 36+)
- App zielt auf **`targetSdk` / `compileSdk` 37** (`mobile/android/variables.gradle`)
- Umgebungsvariablen beim Build:

```powershell
$env:JAVA_HOME = "$env:LOCALAPPDATA\Java\jdk-21"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
```

Oder: `mobile/scripts/build-release.ps1` (setzt das und kopiert nach `mobile/dist/`).

## Signierung (keystore)

Release-Keystore liegt **nicht** in Git:

- `mobile/keystore/leseno-release.jks`
- `mobile/android/keystore.properties` (Passwörter)
- Backup: `mobile/keystore/.password.txt`

Vorlage: [`mobile/keystore.properties.example`](../mobile/keystore.properties.example).

**Wichtig:** Keystore und Passwort sicher sichern. Ohne denselben Key können Updates in Play/Amazon nicht signiert werden.

Neuen Key (nur wenn bewusst neu starten):

```powershell
$kt = "$env:LOCALAPPDATA\Java\jdk-21\bin\keytool.exe"
# … keytool -genkeypair … siehe Beispiel in mobile/
```

## Neu bauen

```powershell
cd mobile
npm install
npx cap sync android
.\scripts\build-release.ps1
```

Version erhöhen vor dem nächsten Store-Upload in [`mobile/android/app/build.gradle`](../mobile/android/app/build.gradle):

- `versionCode` (Integer, immer hochzählen)
- `versionName` (z. B. `1.0.1`)

Dann Script erneut ausführen und `mobile/dist/leseno-<version>.*` prüfen.

## Google Play

1. Play Console → App anlegen (Paketname **`de.leseno.app`**)
2. **Production / Testing** → AAB hochladen (`leseno-*.aab`)
3. Store-Listing (Text, Screenshots, Datenschutz-URL: https://leseno.de/… Datenschutzseite)
4. Altersfreigabe / Fragebogen ausfüllen (Kindergeschichten → ehrlich angeben)
5. Data safety / Berechtigungen: App braucht Internet; keine sensiblen Geräteberechtigungen in dieser Hülle

## Amazon Appstore (Fire + Fire Kids)

1. [Amazon Developer Console](https://developer.amazon.com/) → Android-App
2. **APK** hochladen (`leseno-*.apk`) — Amazon akzeptiert APK; Zielgeräte Fire Tablet / Fire OS
3. Für **Fire Kids**:
   - Kategorie / Zielalter korrekt setzen
   - Amazon-Inhaltsrichtlinien für Kinder beachten
   - **Risiko:** WebView mit Login, Stripe-Käufen und ggf. Tracking kann für *Kids* abgelehnt werden
   - Praxis: oft zuerst normale Fire-/All-Ages-Listing; Kids erst mit Parental Gate / ohne Checkout in der App

### Fire-Kids-Checkliste (vor Einreichung)

- [ ] Zielalter und IARC/Amazon-Rating passen
- [ ] Keine irreführende „nur für Kinder“-Werbung, wenn Eltern-Abo nötig ist
- [ ] Externe Käufe / Browser-Links: Parental Gate erwägen
- [ ] Analytics / Ads: Kids-Policy (oft stark eingeschränkt)
- [ ] Bei Ablehnung: separate „Leseno Kids“-Variante ohne Mitgliedschaftskauf in der WebView planen

## Tracking (Amazon / Fire Kids)

Die APK lädt die Live-Website. Google Analytics wird **nicht** geladen, wenn:

- Query `?leseno_store=amazon` (Capacitor `server.url`), oder
- User-Agent enthält `LesenoApp/Amazon`, oder
- Capacitor `isNativePlatform()` (WebView-Bridge)

Relevant: [`src/components/analytics/google-analytics.tsx`](../src/components/analytics/google-analytics.tsx), [`mobile/capacitor.config.ts`](../mobile/capacitor.config.ts).

**Coolify-Deploy der Website** muss live sein, sonst greift der Skip nicht auf Produktion.

- Capacitor: [`mobile/capacitor.config.ts`](../mobile/capacitor.config.ts) → `server.url = https://leseno.de`
- Offline: lokales `www/index.html` nur als Fallback-Hinweis
- App-Updates der Website: Coolify-Deploy reicht; Store-Update nur bei nativer Hülle / Version

## Nicht enthalten

- iOS
- Offline-Vollspiegel der Next.js-App
- Separates Kids-Binary (gleiche APK; Store-Freigabe ist Policy)
