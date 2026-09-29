# Connect a hosted GPU for portrait animation

This integration uses a persistent Runpod GPU Pod running the included LivePortrait worker. It animates the **face and head** of one uploaded portrait from cropped camera frames. It does not create new full body movement. Performance depends on the GPU and network round trip; a live call frame rate is not guaranteed.

## 1. Build the worker image

The repository includes `.github/workflows/gpu-worker.yml`. In GitHub, open **Actions → Build GPU portrait worker → Run workflow**. Wait for it to finish. It publishes `ghcr.io/libaski2013/mycamapp-gpu:latest` to GitHub Container Registry. If the package is private, make that package public under GitHub package settings or configure Runpod registry credentials. No application photos or tokens are baked into the image.

## 2. Create the GPU Pod

In Runpod, create a **GPU Pod** with that Docker image. Use an NVIDIA CUDA GPU with enough VRAM for LivePortrait (start with 16 GB or more), at least 20 GB free container disk, and expose **HTTP port 8000**. Set the environment variable `WORKER_TOKEN` to a new random secret of at least 32 characters. Keep a copy for Railway. The first boot downloads the official LivePortrait model weights from Hugging Face, so wait for the worker to start. A persistent volume mounted over `/opt/LivePortrait/pretrained_weights` can cache weights between Pod replacements, but it must preserve the expected directory structure.

Runpod gives the service a URL of the form `https://POD_ID-8000.proxy.runpod.net`. The endpoint requires the worker token, including for `/health`; a browser visit without the token returns 401. The Pod stays billed while running. Stop it when not needed, and restart it before using portrait mode again.

## 3. Connect Railway

In the existing MyCamApp Railway service, open **Variables** and set:

| Variable | Value |
| --- | --- |
| `GPU_WORKER_URL` | `https://POD_ID-8000.proxy.runpod.net` (your actual Pod URL) |
| `GPU_WORKER_TOKEN` | The exact same secret as `WORKER_TOKEN` on the Pod |
| `STUDIO_ACCESS_KEY` | A **different** random secret of at least 24 characters; you enter this in the app |

Redeploy the Railway service. Do not commit these values to GitHub or paste them into public chat. The browser sends the studio key to Fastify; Fastify holds the worker token and forwards camera JPEGs and the selected photo to the GPU over HTTPS. The browser crops the selected photo with MediaPipe before sending it. The GPU worker downloads only LivePortrait human model weights and does not use InsightFace detection models. It does not persist photos or camera frames to disk; sessions are in memory and expire after five minutes of inactivity. Uploaded originals and saved recordings remain in the Railway app's configured data directory.

## 4. Try it

1. Open your **public Railway app domain** in Chrome or Edge over HTTPS. The Railway project dashboard URL is not the app URL.
2. Upload and select a permitted portrait, check the likeness permission box, and start the camera.
3. In **GPU portrait animation**, enter `STUDIO_ACCESS_KEY`, then click **Start animated portrait**. Hold a frontal, neutral face for the first frame. Move your head, blink, and speak.
4. The generated face appears in the preview and is included in snapshots and recordings. Use OBS Virtual Camera to present that canvas to a meeting app.
5. Click **Stop animation** when done, then stop the Pod in Runpod to stop GPU charges.

If the page says **GPU worker is not configured**, check the three Railway variables and redeploy. If it says **GPU portrait preparation failed**, check the Pod logs, model download, and whether the selected image contains a clear face. If frames stop, restart portrait mode; Pod restarts clear its in-memory sessions. Runpod's HTTP proxy URL and port format are documented in its Pod port guide.

## Limits and security

The GPU access key gates the paid portrait endpoints. The rest of this prototype's upload and recording routes still have no account login, so protect the public Railway app before using it with private photos. The model processes facial movement only. The output is a 256 pixel cropped portrait upscaled in the canvas; it cannot create unseen body detail from a single image. A hosted GPU and internet round trips may have noticeable latency and lower frame rates than a local virtual camera.
