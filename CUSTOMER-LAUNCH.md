# MyCam public home and customer registration

The Babstech Apps card links to `/home`. The original `/` admin studio remains available so existing camera sessions are not moved. `/portal` provides customer signup, login, logout and package-interest requests. `/studio` opens the admin studio only for an authenticated admin; customer accounts are redirected to the launch-status portal.

The background MP4 is a locally generated illustrative animation, not a recording of actual model performance. Its reproducible source is `scripts/build-intro.py` (Pillow and FFmpeg required only to rebuild the committed video).

## What is live

- Branded MyCam home, product walkthrough, video background with pause/reduced-motion support, FAQs and estimated pricing.
- Customer account registration with scrypt password hashing, opaque HttpOnly session cookies, server-side revocation and account persistence in `DATA_DIR/customers.json`.
- Package-interest requests, deduplicated per account and package.
- Admin-only `/api/customer/admin` view of registrations and package requests.

## What is not enabled

No checkout, payment collection, customer minute credits or customer AI access is enabled. The portal explicitly explains this before registration and on the dashboard. Estimates are not final prices. A customer cookie never grants admin studio authorization.

Before charging customers, implement and validate: verified Paystack payments and idempotent credit ledger; per-customer isolated avatars/recordings/voices; server-owned metering and session termination; control of provider token replay and concurrent connections; refunds/reconciliation; account email verification and password recovery. Decart token expiry alone does not terminate an active connection and its documented duration cap is per connection, so the existing admin token endpoint is not a customer billing boundary.

Keep `STUDIO_ACCESS_KEY`, Decart and ElevenLabs secrets server-side. Configure `APP_ORIGIN` for the actual MyCam host. Mount a Railway volume and set `DATA_DIR` to its mount directory so registrations survive redeploys. If moving existing data, migrate it before changing `DATA_DIR`; this change does not automatically copy old files. Run one service replica with this file-based store.

## Test

`npm test` verifies password/session privacy, signup/login/logout, package deduplication, disabled checkout, separation from admin studio, voice conversion and live-session cleanup. Actual camera, voice quality and provider performance require physical-device tests.

## Website administration
Open `/admin` from the public home's Admin login link. Use the existing
`STUDIO_ACCESS_KEY` to sign in; the existing admin session is reused. Edit
section text, import `.txt` text per section, update package names/minutes/USD
prices, and upload MP4/WebM videos for the hero, how-it-works and features.
Click Publish changes to apply staged edits. JSON export/import backs up the
configuration; uploaded video bytes are not included in the JSON backup.

Configuration is stored at `DATA_DIR/site-content.json`, and uploaded videos
at `DATA_DIR/site-media/`. A persistent Railway volume mounted at DATA_DIR and
one service replica are required to retain edits and media across deployments.
Text is rendered as plain text. Only admin may write or upload; videos selected
for the website are public. Uploaded files remain on disk when replaced or hidden.
Pricing changes update both the homepage and customer package catalog; they do
not activate checkout or alter existing purchased balances (none exist yet).

Prices are now stored and edited in Ghana cedis (`ghs`, currency `GHS`). Legacy
USD package settings convert once at 11.71 GHS/USD, the Bank of Ghana mid rate
for 2 October 2026. This is a fixed initial conversion, not automatic FX repricing.
The admin can subsequently set any supported positive GHS amount directly.
