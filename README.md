# MyCam Studio

A Fastify camera studio based on the supplied `MyCam.html` concept. The real app is served from `public/`. The original Poe preview export is kept outside Git as a design reference.

## Run

Node.js 20+ is required.

```sh
npm ci
npm start
```

Open http://127.0.0.1:3000 and grant camera and microphone permissions. On macOS you can run `start-mac.command`; on Windows run `start-windows.bat`. These launchers wait until the server responds, then open the actual URL. If port 3000 is busy, they select the next available port and print it. You can also run `npm run launch`. **Open the running app URL, not `Original-MyCam.html`**: that file is only the supplied design reference and its upload control is not functional. Set `PORT` to change the local port. During `npm ci`, a pinned MediaPipe model is downloaded and checked by SHA-256, while WebAssembly files are copied from the installed package. The browser then loads all tracking assets from this local server. If you bind to `HOST=0.0.0.0`, protect the app with authentication and HTTPS before exposing it publicly.

## Features

- Select a camera and microphone. Choose microphone on/off before starting.
- Check the visible likeness permission box, choose a PNG, JPEG, or WebP photo (8 MB maximum), and see an immediate preview before starting the camera. Drag the photo on the canvas to position it, resize or remove it, and preview the still photo. Save a PNG snapshot when ready.
- Local face landmark tracking can move the still photo to your face position. It does not deform the photo, animate expressions, or follow the body. Disable **Move still photo with face position** to keep it fixed.
- Solid private background by default, with optional original or blurred camera background; mirrored preview and persistent visual settings.
- Natural, warm, bright, and radio audio EQ plus input gain for saved recordings. This is tone filtering, not identity voice conversion.
- Record canvas plus optional processed microphone to WebM, then download or delete (100 MB upload limit). The video has a permanent visible **2D Photo Overlay** label.
- Use meeting window share or capture the MyCam window with OBS Virtual Camera. See [OBS-SETUP.md](OBS-SETUP.md). OBS must be installed on the same computer.

The API provides `GET /api/health`, `GET /api/state`, `PATCH /api/settings`, and image/recording upload, file, list and delete routes. Files and metadata live in `data/` and are excluded from Git. Back up `data/` separately. A hosted service with ephemeral disk will lose these files. No user accounts or remote access control are included; run locally for personal use.

## Scope

The browser cannot register a system wide virtual camera or microphone itself. Direct third party app integration and full body animation from one image require a native application and specialized models. The app presents the capabilities it actually provides, with disclosure visible in the output.

## First live tracking test

1. Run `npm ci` then `npm start` (or use the start script). Wait for **Local face tracking assets ready**.
2. Open `http://127.0.0.1:3000`, check the permission box and choose a face photo. The photo should appear before you start the camera.
3. Click **Start camera** and allow permission. Check the tracking status for **Face detected**. Move your head and observe the position of the still photo. Mouth and blink are not animated.
4. If tracking reports **WebGL unavailable**, enable browser hardware acceleration or use a browser with WebGL. If it reports **Tracking stopped**, capture the exact message for debugging.

The live effect is a still 2D photo overlay with optional face-following position. Real portrait reenactment requires a separate GPU animation engine and an interface to the studio. Full body reenactment from one photo is a separate, harder problem and is not provided here.

## Railway

The server uses Railway's `PORT` and binds to `::` when Railway system variables are present. The health endpoint is `/api/health`. After a successful deployment, the service needs a public domain under **Settings → Networking**; the project dashboard URL is not the app URL. For persistent images and recordings, mount a Railway volume and set `DATA_DIR` to its mount path. Protect a public deployment before uploading personal likenesses: this prototype has no account login yet.
