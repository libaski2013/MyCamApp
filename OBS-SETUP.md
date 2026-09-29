# Use MyCam in a video call with OBS

1. Start MyCam on localhost, open it in a browser, choose your camera and microphone, and click **Start camera**.
2. Install OBS Studio from obsproject.com. In OBS, add a **Window Capture** source and choose the MyCam browser window. Crop the browser window to the video frame using Alt + drag on Windows/Linux or Option + drag on macOS. The `AI Avatar` label must stay visible.
3. In OBS, click **Start Virtual Camera**. In your calling app, select **OBS Virtual Camera** as the video source.
4. For microphone audio, use your normal microphone in the calling app. MyCam's recorded audio filters are not routed into another app automatically; OS audio routing needs a separate virtual audio device.
5. If a calling app cannot pick a virtual camera, use its window sharing feature and select the MyCam studio window.

OBS and each calling app must be installed and configured on your own computer. Browser camera permission requires localhost or HTTPS. Do not present a generated likeness as a real person without their consent and an explicit AI avatar disclosure.
