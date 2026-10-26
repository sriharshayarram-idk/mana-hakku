# Mana Hakku (మన హక్కు)

An Android app for Andhra Pradesh that turns a public need into a rights-based case: the responsible state department and Union ministry, the constitutional articles and Acts that apply, a 7 / 30 / 90-day action plan, and the escalation ladder from the Grama Sachivalayam to the High Court.

## What the app does

- **Telugu and English**: Telugu by default, one tap to switch. All 28 districts, 13 sectors, rights, plans and escalation steps in both languages.
- **Read aloud**: every screen has a Listen (వినండి) button using the phone's own text-to-speech. Helpline numbers are read digit by digit.
- **Speak a complaint**: a Speak (మాట్లాడండి) button turns spoken Telugu or English into text (uses the phone's Google voice typing).
- **Share report**: sends a ready-made summary to WhatsApp, SMS or email for an official or NGO.
- **Gap dashboard**: official indicators for Andhra Pradesh (NFHS-5, NITI Aayog MPI, SDG India Index) and the needs saved on the phone.
- **News check**: searches nine trusted outlets and grades a report as Unverified, Single source or Corroborated.

Reports are saved on the phone in this version. A shared online register (Firebase) is the next step.

## Install on a phone

1. Open the [Releases](../../releases) page on the phone and download the latest `ManaHakku-v0.1.x.apk`.
2. Open the downloaded file. If Android asks, allow installs from your browser or file manager.
3. For Telugu read-aloud, make sure a Telugu voice is installed in the phone's text-to-speech settings.

Every push to `main` builds a new APK automatically (see `.github/workflows/build-apk.yml`). New builds install over old ones because they share the same signing key.

## Project layout

| Path | What it is |
| --- | --- |
| `app/src/main/assets/index.html` | The whole app interface, data and logic (bilingual) |
| `app/src/main/java/org/manahakku/app/MainActivity.kt` | WebView host plus phone bridges: text-to-speech, voice input, share |
| `app/mana-hakku-debug.keystore` | Shared **test** signing key. Replace with a private key in GitHub Secrets before any Play Store release |
| `.github/workflows/build-apk.yml` | Builds the APK and publishes a GitHub release |

## Notes

- The rights mapping is guidance, not legal advice.
- The Telugu text should be reviewed by a native speaker before a public pilot.
- Indicators: NFHS-5 (2019–21); NITI Aayog National Multidimensional Poverty Index 2023; SDG India Index 2023–24.
