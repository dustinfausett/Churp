# Android release builds

The **Android signed release** workflow builds a signed Android App Bundle for
`com.churptree.app`. It runs manually on `main` and saves an artifact; it does
not upload to Google Play or roll out a release.

## One-time setup

Add these repository Actions secrets (never commit their values):
- `ANDROID_KEYSTORE_BASE64`: Base64 encoding of the upload keystore.
- `ANDROID_KEYSTORE_PASSWORD`: keystore password.
- `ANDROID_KEY_ALIAS`: upload key alias, currently `churp-upload`.
- `ANDROID_KEY_PASSWORD`: private key password.

Retain a secure backup of the keystore and passwords. The workflow decodes the
keystore in the runner's temporary directory, passes passwords through environment
variables, and removes the temporary keystore even if a previous step fails.
Only the signed AAB is uploaded as an artifact.

## First internal test release

1. Merge the workflow into main.
2. In Actions, select **Android signed release**, then **Run workflow** on main.
3. Use version code `1` and version name `1.0.0` for the first upload.
4. Download the `Churp-Android-1` artifact after the run succeeds and unzip it.
5. Upload `app-release.aab` to the draft internal testing release in Play Console.
6. Complete Play's release details and tester setup before rolling out the test.

Increase version code for each new bundle uploaded to Play. Re-running a build
with the same code is useful before upload, but Play will not accept reusing a
previously uploaded code. The workflow validates the code and version name and
checks the bundle's signature before retaining it.

The packaged web app calls `https://app.churptree.com`; that backend must remain
available. This build setup does not configure Firebase. Android push notifications
still require the matching `android/app/google-services.json` and server-side FCM
configuration; validate these separately before promising push to testers.

## Local builds and CI

Gradle accepts `CHURP_VERSION_CODE` and `CHURP_VERSION_NAME`, defaulting to
`1` and `1.0.0`. Upload signing uses `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
Set `CHURP_REQUIRE_SIGNING=true` for release automation to fail if credentials
are missing. Partial signing configuration always fails. Without signing variables,
ordinary debug and unsigned release builds remain available for PR checks.

The native PR workflow builds the debug APK and an unsigned release bundle.
Both Android workflows explicitly request supported SDK packages instead of the
retired SDK `tools` package.
