const tips={
 start:'Allow camera access and start the physical camera selected under Devices & scene. Enable the microphone before starting if you want voice or audio recordings.',
 stop:'Stop camera, AI transformation and live voice. Any active recording is finalized.',
 record:'Save the AI video and microphone audio. During live voice mode, save the buffered video with converted voice instead.',
 stopRecord:'Finish the recording and save it to the Recordings tab.',
 snapshot:'Download one frame as a PNG image. This does not capture audio.',
 jumpUpload:'Open Photo & avatar to choose the reference picture for your AI character.',
 cameraDevice:'Choose your physical webcam. Stop and restart the camera after changing devices.',
 microphoneDevice:'Choose your physical microphone. For live voice capture, do not choose the virtual cable used to send converted speech to your call.',
 micEnabled:'Include microphone audio in recordings and enable live voice capture. Restart the camera after changing this option.',
 photoOverlay:'Place a still picture over your camera. For a moving human avatar, use AI transformation instead.',
 trackFace:'Move the optional still overlay with your face position. This does not generate human facial or body animation.',
 consent:'Confirm that you own the image or have permission to use the pictured person’s likeness.',
 avatarFile:'Choose PNG, JPEG or WebP up to 8 MB. A clear reference photo helps the transformation.',
 size:'Resize the optional still-photo overlay; this does not resize the AI character.',
 x:'Position the optional still overlay horizontally.',y:'Position the optional still overlay vertically.',
 mirror:'Flip the camera preview horizontally.',clearAvatar:'Clear the current photo selection and still overlay. Saved images remain in your library.',
 transformPrompt:'Describe optional character details. Your reference photo supplies appearance and your live camera supplies movement.',
 transformReference:'Use the selected reference photo for the AI character. Turn this off for prompt-only editing.',
 transformKey:'Admin studio access key from Railway. Sign-in is remembered in this browser; this is not a customer payment or subscription key.',
 studioLogout:'Remove the saved studio sign-in from this browser.',
 transformStart:'Start the paid Decart live video transformation with the selected photo. Active generation consumes provider credits; sessions last up to five minutes.',
 transformStop:'Stop the current Decart transformation and active generation.',
 studioKey:'Studio access key used to authorize the GPU portrait service.',
 startPortrait:'Use the separately configured GPU worker for face and head animation. This mode does not generate full-body movement.',
 stopPortrait:'End the GPU portrait animation session.',
 background:'Choose the camera scene, a blurred scene or a solid background for the local composition.',
 audioFilter:'Adjust microphone tone for ordinary recordings. These filters do not clone a voice.',
 gain:'Adjust microphone loudness. High gain can distort audio.',
 voiceName:'Give the voice a recognizable name in your private studio library.',
 voiceFile:'Upload authorized single-speaker audio, up to 15 MB. At least five seconds is accepted; one to two minutes of clear speech gives better results.',
 voiceRetention:'Save the voice for reuse, or delete it after one conversion attempt or one live session. Unused temporary voices expire after one hour.',
 voiceConsent:'Confirm permission to clone and use the speaker’s voice.',
 createVoice:'Send the audio sample to ElevenLabs and create a voice clone. Requires a configured server API key and account access to voice cloning.',
 voiceSelect:'Select the voice to use for recorded-video conversion or Live voice. This selection is shared across those tabs.',
 deleteVoice:'Delete the selected voice from MyCam and the provider. Failed provider deletion is retried automatically.',
 voiceRecording:'Choose a saved recording containing speech. Recorded-video conversion supports up to five minutes.',
 applyVoice:'Replace recorded speech with the selected voice and produce a new MP4. The original recording remains available.',
 refreshVoices:'Reload available voices, saved recordings and conversion job status.',
 liveVoiceConsent:'Confirm permission to use the selected voice in a live session.',
 liveVoiceSink:'Choose where converted speech plays. Use headphones to test, or the playback side of a virtual cable to send voice into a calling app.',
 liveVoiceDevices:'Reload audio outputs after installing a virtual cable or connecting headphones.',
 liveVoiceMonitor:'Enable sending converted audio to the selected output. Leave call speaker playback on headphones to avoid echo.',
 liveVoiceOffset:'Adjust video timing if AI frames arrive behind speech. This aligns two-second segments approximately; it does not generate matching mouth shapes.',
 liveVoiceStart:'Convert your microphone speech using the voice selected in Voice library. The call preview buffers video to match; expect several seconds of delay.',
 liveVoiceStop:'Stop live voice and make its call output silent. Temporary voices are deleted after the session; saved voices remain.',
 popout:'Open a clean video window for OBS capture. Start live voice first to capture its synchronized video; reopen this window after switching output modes.'
};
const tooltip=document.createElement('div');tooltip.className='studio-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
let owner;
function hide(){tooltip.hidden=true;owner=null}
function show(target,message){owner=target;tooltip.textContent=message;tooltip.hidden=false;const r=target.getBoundingClientRect(),w=tooltip.offsetWidth,h=tooltip.offsetHeight;tooltip.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';tooltip.style.top=(r.bottom+h+16<innerHeight?r.bottom+8:Math.max(8,r.top-h-8))+'px'}
for(const [id,message] of Object.entries(tips)){
 const target=document.getElementById(id);if(!target)continue;
 const description=document.createElement('span');description.id='help-'+id;description.className='sr-only';description.textContent=message;document.body.append(description);target.setAttribute('aria-describedby',[target.getAttribute('aria-describedby'),description.id].filter(Boolean).join(' '));
 target.addEventListener('focus',()=>show(target,message));target.addEventListener('blur',hide);
 target.addEventListener('mouseenter',()=>show(target,message));target.addEventListener('mouseleave',hide);
 if(target.tagName==='BUTTON'){target.title=message;continue}
 const help=document.createElement('button');help.type='button';help.className='tooltip-help';help.textContent='?';help.setAttribute('aria-label','Help: '+(target.closest('label')?.textContent.trim().slice(0,65)||id));help.setAttribute('aria-describedby',description.id);
 help.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();show(help,message)});
 help.addEventListener('mouseenter',()=>show(help,message));help.addEventListener('mouseleave',hide);help.addEventListener('focus',()=>show(help,message));help.addEventListener('blur',hide);
 const label=target.closest('label');if(label)label.append(help);else target.insertAdjacentElement('afterend',help);
}
const tabTips={devices:'Choose camera, microphone, background and basic audio settings.',avatar:'Upload and select the reference photo for your character.',ai:'Execute or stop Decart transformation, or use the optional GPU portrait engine.',voices:'Create, select and manage voice clones; apply them to saved recordings.',live:'Send microphone speech through the selected voice with buffered call video.',recordings:'Download or delete saved studio recordings.',output:'Set up OBS and virtual audio routing for compatible calling apps.'};
for(const tab of document.querySelectorAll('[data-studio-tab]'))tab.title=tabTips[tab.dataset.studioTab]||'';
document.addEventListener('keydown',event=>{if(event.key==='Escape')hide()});document.addEventListener('pointerdown',event=>{if(owner&&!owner.contains(event.target))hide()});window.addEventListener('resize',hide);document.addEventListener('scroll',hide,true);
