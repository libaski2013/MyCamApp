# Recorded-video voice cloning

The studio can create a voice from an authorized speech sample and replace speech in an existing MyCam recording. Recorded-video conversion is available alongside a buffered live voice beta. Neither mode generates automatic lip animation.

## Railway configuration

1. Create an ElevenLabs API key with permission to create/delete voices and use speech-to-speech. Your ElevenLabs account must support instant voice cloning and have credits. Decart credits do not cover voice conversion.
2. In the MyCam Railway service, add `ELEVENLABS_API_KEY` with the key value. Never put it in browser code or GitHub.
3. Keep your existing `STUDIO_ACCESS_KEY` and `APP_ORIGIN` settings. `ELEVENLABS_VOICE_MODEL` is optional; default: `eleven_multilingual_sts_v2`.
4. For voices and recordings to survive deployments, mount a Railway volume at `/data` and set `DATA_DIR=/data`. If changing from existing storage, copy its contents before switching; existing recordings are not migrated automatically. This prototype supports one service replica and one conversion at a time.
5. Redeploy, open the studio, and sign in using your existing studio access key.

## Use

1. In **Voice for recorded videos**, enter a name and choose MP3, WAV, M4A, WebM, Ogg or FLAC (15 MB maximum). Minimum 5 seconds; 1–2 minutes of clean, single-speaker speech is recommended. Only the first 3 minutes are used.
2. Confirm ownership or speaker permission. Choose **Save for later use** or **One video, then delete**, then click **Create voice**. If verification is required, complete it in ElevenLabs before applying the voice.
3. Start the camera with **Include microphone** checked, execute the avatar transformation, record yourself speaking, then stop recording. Keep recordings under 5 minutes.
4. Click **Refresh voices and videos**, select the voice and recording, then **Apply voice to recording**.
5. Watch extraction, conversion and merging status; download the resulting MP4. The original recording stays available. Delete outputs with **Delete output**; delete saved voices with **Delete selected voice**.

## Retention and limits

Uploaded samples and conversion intermediates are deleted locally after processing. Saved voice IDs stay in the server library until deleted. Temporary voices are deleted from the library and ElevenLabs after a conversion attempt, including a failed attempt; unused temporary voices expire after one hour. Provider deletion failures remain visible and retry while the service is running. Restarted jobs are marked failed and their temporary voices scheduled for deletion. If the service is stopped, cleanup resumes when it starts again.

Deleting a provider voice does not guarantee erasure of the provider's request logs or other retained data. ElevenLabs retention terms apply; its zero-retention API option requires enterprise access. Converted videos and originals have independent delete controls.

Voice quality depends on the sample and source recording. Speech-to-speech changes vocal identity while using the existing spoken delivery; it does not promise exact timing or perfect lip synchronization. The implementation uses shared studio admin access, not separate paid-customer accounts or billing.

## Verification

`npm test` includes real FFmpeg extraction and MP4 creation with a mocked voice provider, admin authentication checks, temporary provider-deletion retry and output deletion. Real voice quality and account access must be tested after configuring a valid ElevenLabs key.

## Live voice beta

Use the selected library voice with **Start selected voice live**. See [OBS-SETUP.md](OBS-SETUP.md) for microphone routing and synchronization instructions. Temporary voices are deleted after one live session. Existing `ELEVENLABS_API_KEY` enables both modes; no new Railway key is required. Two-second speech segments add buffering and provider latency, and do not guarantee precise mouth synchronization.
