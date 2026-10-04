# MyCam live voice and video calls

## Start the synchronized output

1. Open the hosted MyCam studio in desktop Chrome or Edge and sign in. The server needs `ELEVENLABS_API_KEY`; live mode uses the same saved voice library and key as recorded-video conversion.
2. Start your camera with **Include microphone** checked. Choose your physical microphone, not a virtual cable input. Execute the photo transformation and wait for moving AI video.
3. In **Voice for recorded videos**, create or select an authorized voice. A saved voice can be reused. A temporary voice is deleted after this live session ends (or server expiry), with provider deletion retries if necessary.
4. Under **Live voice and call output · Beta**, confirm speaker permission and click **Start selected voice live**. Speak a short test sentence.
5. The separate call preview buffers video and plays converted speech in two-second segments. The normal studio camera preview stays immediate. If the AI image lags speech, increase **AI video timing adjustment** and test another sentence. This is approximate segment alignment, not generated mouth animation.
6. For a local test, choose your headphones as **Converted audio output** and enable **Send converted audio to the selected output**. Avoid speakers feeding audio into your microphone.
7. Click **Record** to save the buffered video and selected voice together. Stop live voice to end the session. Live sessions stop after five minutes; hidden tabs or an overloaded processing queue stop the output. Keep MyCam visible, such as in a separate window alongside the call.

## Route to calls on Windows

1. Install OBS Studio from https://obsproject.com/ and VB-CABLE from https://vb-audio.com/Cable/ . Restart apps after driver installation.
2. In MyCam, click **Refresh audio outputs**, choose **CABLE Input** as **Converted audio output**, and enable **Send converted audio to the selected output**. MyCam sends only converted voice into the cable.
3. After live voice starts, click **Open clean output for OBS**. If changing live voice mode, close and reopen this output window.
4. In OBS, add a **Window Capture** source for **MyCam Clean Output**, crop browser chrome if necessary, and click **Start Virtual Camera**.
5. In the calling application, choose **OBS Virtual Camera** for video and **CABLE Output** for microphone. Keep the application's speaker output on headphones, not CABLE Input. Leave OBS microphone monitoring disabled to avoid mixing raw speech into the cable.
6. Test with a second device before a call: confirm the other device receives the avatar and converted voice together. If voice conversion stops, this output becomes silent; it does not replace the cloned voice with your physical microphone.

## macOS

Use OBS for the virtual camera and a macOS virtual audio driver such as VB-CABLE. Select its playback side in MyCam and its recording side as the call microphone. Device names can differ from Windows. If browser output-device selection is unavailable, use OS audio routing for the MyCam browser only; keep call playback on headphones.

## Limits

This mode calls ElevenLabs speech-to-speech for short WAV segments; it is not continuous low-latency voice conversion. Expect several seconds of conversation delay and possible voice discontinuities between segments. Provider quality, latency and credits require real-account testing. If processing cannot keep pace, MyCam stops rather than growing an unlimited delay.

OBS Virtual Camera carries video; voice needs the separate audio route. A browser cannot install system camera/microphone drivers. Apps must allow selecting virtual devices; this is not a guarantee of support in every social-media or mobile app. Retention policies for provider audio still apply. Disclose the AI avatar and use authorized likenesses and voices.
