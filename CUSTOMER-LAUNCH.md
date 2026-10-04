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
