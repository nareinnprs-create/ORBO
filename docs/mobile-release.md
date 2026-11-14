# Mobile release (EAS) — config present, accounts owner-pending

The release pipeline **configuration** now lives in this repository; what is still missing is
every **account and credential only the owner can create**. This document is the end-to-end flow
for the person who holds those accounts. PLAN.md §10.B.19 tracks the same state.

## What is already in the tree

| Piece | Where |
|---|---|
| App identity | `mobile/app.config.ts` — name `ORBO`, slug `orbo`, version `0.1.6`, scheme `orbo`, bundle IDs `ai.orbo.mobile` (iOS + Android) |
| Build + submit profiles | `mobile/eas.json` — `development`, `preview`, `production`; production auto-increments the build number/version code and pulls credentials from EAS servers |
| EAS project id slot | `EXPO_PUBLIC_EAS_PROJECT_ID` env var, read by `mobile/app.config.ts` (`extra.eas.projectId`) |
| CI typecheck (not builds) | `.github/workflows/ci.yml` `mobile` job — `npm ci` + `npm run typecheck`; no workflow invokes EAS yet |

## What the owner must provide (slots)

1. **EAS organization / account** — an Expo account (free tier is enough to start) at
   <https://expo.dev>. `[OWNER: Expo account email + org name]`
2. **Apple Developer Program team** — for iOS signing and App Store Connect.
   `[OWNER: Apple Developer team ID + Apple ID]`
3. **Google Play developer account** — for Android signing and Play Console, plus a
   service-account JSON key with the Play Console API enabled (EAS Submit uses it).
   `[OWNER: Play service-account key file]`
4. **Push notification credentials** — provisioned *through EAS*, not by hand:
   - APNs key (iOS): `eas credentials` offers to create and store it on EAS servers.
   - FCM server key (Android): created in Google Cloud Console for the Play account, then
     uploaded with `eas credentials`. `[OWNER: Google Cloud project for FCM]`
5. **Store listings** — screenshots, descriptions, privacy-policy URL, support contacts for both
   stores. `[OWNER: listing copy + privacy policy URL]`

## The flow, end to end

Run everything inside `mobile/` (the app is an isolated npm package on purpose — it is not a Bun
workspace, so CI installs its own reviewed lockfile).

```sh
cd mobile
npm install

# One-time: claim the project and write the project id into your environment
npx eas login                  # [OWNER: Expo account]
npx eas init                   # prints the project id -> export EXPO_PUBLIC_EAS_PROJECT_ID=<id>
```

`eas init` also proposes an `owner` value for `app.config.ts` if the account is an org member
(`[OWNER: org name, or leave personal]`). `extra.eas.projectId` stays env-provided so the
repository carries no account-specific id.

### Development build (sideload, uses the dev client)

```sh
npx eas build --profile development --platform all
npx eas device:create          # register a physical device, then reinstall
```

### Preview build (internal testing)

```sh
npx eas build --profile preview --platform all
```

iOS lands as a simulator build; Android as an installable APK — both internal-distribution.

### Production build + store submission

```sh
npx eas build --profile production --platform all
npx eas submit --platform ios   # uses the [OWNER] appleId / ascAppId / appleTeamId slots
npx eas submit --platform android
```

First production iOS build: EAS creates the distribution certificate and provisioning profile and
stores them remotely (`credentialsSource: remote` in `eas.json`). First Android production build:
EAS generates and holds the upload keystore — **accept EAS-managed credentials**; it offers to
back up the keystore password (`[OWNER: decide keystore backup storage]`).

`autoIncrement: true` bumps `ios.buildNumber` / `android.versionCode` per build on EAS servers, so
no build number is ever edited in the repository. The human-readable version (`0.1.6`) is bumped
by hand in `mobile/package.json` and `mobile/app.config.ts`, matching the root version.

## Deliberately not in this pipeline

- **No CI workflow invokes EAS builds.** Builds are owner-triggered until the EAS org and billing
  exist; adding a workflow is a one-line `eas build` call after that.
- **No OTA updates channel** (`expo-updates` is not a dependency); every release is a store build.
- **Desktop releases** are a separate Tauri flow — see `docs/desktop-updater.md`.
