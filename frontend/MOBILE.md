# Mobile apps (Capacitor) — Android & iOS

The same Angular app ships as **two native apps** via [Capacitor](https://capacitorjs.com).
Both wrap the full SPA — ERP, the Salesman field app (SFA), and everything else —
and talk to the cloud API over HTTPS.

| Variant | appId | WhatsApp features | Use |
|--------|-------|-------------------|-----|
| **Full** (default) | `com.wacommerce.app` | ✅ Campaigns, Conversations, WhatsApp Catalog, Workflow Builder | WhatsApp Commerce + ERP + SFA |
| **ERP** | `com.wacommerce.erp` | ❌ hidden | ERP + Salesman app only |

The WhatsApp features are toggled by the `whatsapp` flag baked into the build
(`src/environments/environment.mobile.ts` vs `environment.mobile-erp.ts`) and
enforced in the nav (`NavItem.wa` items are hidden when `environment.whatsapp === false`).

## Requirements
- **Node ≥ 20** (Capacitor 7). *(Capacitor 8 needs Node ≥ 22.)*
- **Android:** Android Studio + JDK 17.
- **iOS:** a **Mac** with Xcode + CocoaPods (`sudo gem install cocoapods`). iOS cannot be built on Windows/Linux.
- Set the cloud API URL in `src/environments/environment.mobile*.ts` (`apiUrl`) to your production domain before shipping.

## First-time setup
The native folders (`android/`, `ios/`) are git-ignored and generated on demand:

```bash
cd frontend
npm install

# Android (from any OS with Android Studio)
npm run build:mobile                       # or build:mobile-erp
npx cross-env WA_VARIANT=full npx cap add android

# iOS (Mac only)
npx cross-env WA_VARIANT=full npx cap add ios
```

## Build & run
```bash
# FULL app (WhatsApp + ERP + SFA)
npm run mobile:full:sync            # build web + copy into native
npm run mobile:full:open:android   # open in Android Studio → Run ▶
npm run mobile:full:open:ios       # open in Xcode (Mac)

# ERP-only app (no WhatsApp)
npm run mobile:erp:sync
npm run mobile:erp:open:android
npm run mobile:erp:open:ios
```
In Android Studio / Xcode, press **Run** to install on a device/emulator, or
build a signed **APK/AAB / IPA** for the stores (Build → Generate Signed Bundle).

## Shipping BOTH apps from one repo
Each variant has a distinct `appId`, so they install side-by-side and go to the
stores as separate listings. `WA_VARIANT` (read by `capacitor.config.ts`) selects
the appId/appName; the matching Angular config (`mobile` / `mobile-erp`) bakes the
WhatsApp flag. Keep a **separate native folder per variant** — the simplest way is
to generate, build, and release one variant, then switch `WA_VARIANT`, re-run
`cap add`, and build the other. (For a single checkout building both, use Android
product flavors / an Xcode target per variant.)

## Backend note — auth from a native origin
The portal login uses a **session cookie**. A native app's origin is
`https://localhost` (Capacitor), so for portal sign-in to work from the app the
API must allow that origin with credentials (CORS `Access-Control-Allow-Origin`
for the Capacitor origin + `SameSite=None; Secure` cookies). The **Salesman field
app (`/m/sales`) and all `/m/*` webviews use token-in-URL auth**, so they work in
the app with no cookie/CORS changes — the SFA experience is ready out of the box.
