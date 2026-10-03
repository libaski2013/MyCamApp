# Live AI transformation

Set these variables in the existing Railway MyCamApp service:

- `DECART_API_KEY`: your private Decart API key.
- `STUDIO_ACCESS_KEY`: a random secret of at least 24 characters. Enter this key in the studio; do not enter the Decart key in the browser.
- `APP_ORIGIN`: `https://mycamapp-production.up.railway.app` (use the actual app origin if it changes).
- Optional `DECART_MODEL`: defaults to `lucy-2.5`.

Deploy the latest commit. The install step bundles the official Decart SDK for the browser. This mode uses Decart-hosted inference and does not need a Runpod Pod. Stop any Runpod worker you are not using.

In the studio, check image permission, choose a reference photo, enter the studio access key under Live AI transformation, enter instructions and click Execute transformation. Stop ends the provider connection. Sessions are capped at five minutes on both the client and provider token. Camera video and the chosen reference image go to Decart; microphone audio remains in the local recording flow. Reference resemblance, hand detail and movement fidelity depend on the model and must be tested with your camera.

Record and Save snapshot capture the transformed output. For video calls, capture the studio in OBS and use OBS Virtual Camera as described in OBS-SETUP.md. A native MyCam virtual camera and streamer integrations are not included in this version.

The permanent provider key stays server-side. Token issuance requires the studio key and is limited to five starts per minute per server-visible IP. Client credentials expire after two minutes and are scoped to the model, app origin and maximum session duration. Do not expose the studio key publicly.
