# Web Push (VAPID) Setup

This document explains how to generate and configure VAPID keys for the owner web app push notifications.

## What VAPID is

VAPID keys identify your server as an authorized sender for web push. The browser uses the public key when it subscribes. The backend uses the private key to send notifications.

## Generate keys

Run this once on your machine:

```bash
npx web-push generate-vapid-keys
```

You will get:
- `publicKey`
- `privateKey`

Store these somewhere safe. The private key must never be exposed to the browser.

## Backend configuration

Add these to `.env` in the project root:

```
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:owner@yourdomain.com
```

Notes:
- `VAPID_SUBJECT` can be a mailto or a URL.
- The backend reads these values to send web push in `src/services/webPushService.js`.

## Web app configuration

Add this to `apps/owner/.env`:

```
VITE_VAPID_PUBLIC_KEY=your_public_key
```

This value is used in `apps/owner/src/App.tsx` when registering a push subscription.

## Enable in the UI

1) Open the owner web app.
2) Go to **Profile**.
3) Click **Enable web notifications**.
4) Accept the browser prompt.

If successful, the UI will show “Web push enabled.”

## Test push (dev only)

Send a test push from the backend:

```bash
curl -X POST http://localhost:3000/owner/devices/test \
  -H "Authorization: Bearer <OWNER_JWT>"
```

Notes:
- `/owner/devices/test` is disabled in production.
- You need a valid owner JWT (from OTP login).

## Troubleshooting

- **No prompt appears**: You may have blocked notifications in the browser settings.
- **Service worker not registered**: The file is at `apps/owner/public/sw.js`. Must be served at `/sw.js`.
- **Push not supported**: Some browsers or http origins do not support push. Use HTTPS or localhost.
- **Invalid VAPID**: Ensure the public key matches the private key.
