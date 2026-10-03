import { characterState, applyCharacter, transformationError } from '/character-state.js';
import { authenticateStudio } from '/studio-auth.js';
export function mountTransformation({getStream,startCamera,stopPortrait,getReference,hasConsent,setOutput,setMode,setDiagnostic,registerStop}) {
  const $=id=>document.getElementById(id),status=$('transformStatus'),start=$('transformStart'),stop=$('transformStop');
  const output=$('aiVideo');output.muted=true;output.autoplay=true;output.playsInline=true;
  const progress=$('transformProgress'),progressText=$('transformProgressText'),resume=$('resumePlayback');
  const showProgress=message=>{progress.hidden=false;progressText.textContent=message;status.textContent=message;setDiagnostic(message)};
  let frames=0,lastFrameAt=0,frameCallback=null,watchdog=null,referenceApplied=false;
  let stage='Initialization',session=null,epoch=0,timer=null,limit=null,frameLimit=null,ready=false,inputTracks=[];
  const clearOutput=()=>{output.pause();output.srcObject=null;output.hidden=true;resume.hidden=true;setOutput(null)};
  async function end(message='Transformation stopped.') {
    epoch++;clearInterval(watchdog);watchdog=null;if(frameCallback!==null)output.cancelVideoFrameCallback?.(frameCallback);frameCallback=null;referenceApplied=false;clearInterval(timer);clearTimeout(limit);clearTimeout(frameLimit);timer=limit=frameLimit=null;
    const current=session;session=null;current?.disconnect();inputTracks.forEach(track=>track.stop());inputTracks=[];clearOutput();setMode(false);
    start.disabled=!ready;stop.disabled=true;$('transformTime').textContent='';if(message==='Transformation stopped.'){progress.hidden=true;status.textContent=message}else showProgress(message);
  }
  registerStop(()=>end());stop.onclick=()=>end();
  start.onclick=async()=>{
    if(!hasConsent()){status.textContent='Check the image permission box first.';return}
    const reference=$('transformReference').checked?getReference():null;
    if($('transformReference').checked&&!reference){status.textContent='Choose and save a character photo first.';return}
    const prompt=$('transformPrompt').value.trim();
    if(!reference&&!prompt){status.textContent='Enter transformation instructions.';return}
    await end();await stopPortrait();const attempt=++epoch;start.disabled=true;stop.disabled=false;
    frames=0;lastFrameAt=0;stage='Studio sign-in';showProgress('Checking studio access…');setMode(true,'Connecting to live AI…');
    try{
      await authenticateStudio($('transformKey'));if(attempt!==epoch)return;
      stage='Camera startup';showProgress('Preparing live camera…');if(!getStream())await startCamera();if(attempt!==epoch)return;
      const camera=getStream();if(!camera?.getVideoTracks().some(t=>t.readyState==='live'))throw Error('Camera is unavailable. Start it and allow camera access.');
      stage='Loading AI client';const {createDecartClient,models}=await import('/vendor/decart.mjs');
      let image;
      stage='Loading selected photo';showProgress('Preparing selected character photo…');if(reference){const res=await fetch(reference.url);if(!res.ok)throw Error('Cannot load the selected character photo.');image=new File([await res.blob()],reference.name,{type:reference.mime})}
      if(attempt!==epoch)return;
      stage='Session authorization';showProgress('Authorizing AI transformation…');setMode(true,'Preparing your stream…');
      const response=await fetch('/api/transform/token',{method:'POST',signal:AbortSignal.timeout(20000)});
      const token=await response.json();if(!response.ok)throw Error(token.error||'Session authorization failed.');
      if(attempt!==epoch)return;
      stage='AI connection';showProgress('Connecting to Decart and preparing transformation…');setMode(true,'Preparing the character stream…');
      limit=setTimeout(()=>end('Connection timed out. Check your network and Decart credits, then try again.'),45000);
      const client=createDecartClient({apiKey:token.apiKey});
      const editState=characterState({image,instructions:prompt});
      setDiagnostic(`Connecting to ${token.model} with ${reference?'selected character photo':'text instructions'}.`);
      const model=models.realtime(token.model);
      await camera.getVideoTracks()[0].applyConstraints({width:{ideal:model.width},height:{ideal:model.height},frameRate:model.fps}).catch(()=>{});
      inputTracks=camera.getVideoTracks().map(track=>track.clone());
      const connected=await client.realtime.connect(new MediaStream(inputTracks),{
        model,initialState:editState,
        onRemoteStream:remote=>{
          if(attempt!==epoch)return;
          if(!remote.getVideoTracks().length){showProgress('Connected, but Decart returned no video track.');return}
          remote.getVideoTracks().forEach(track=>{track.enabled=true});
          const markFrame=()=>{if(attempt!==epoch)return;frames++;lastFrameAt=performance.now();clearTimeout(frameLimit);if(referenceApplied){progress.hidden=true;resume.hidden=true;status.textContent='Live AI video playing';setDiagnostic(`AI video playing · ${output.videoWidth} × ${output.videoHeight} · ${frames} rendered frames`)}if(output.requestVideoFrameCallback)frameCallback=output.requestVideoFrameCallback(markFrame)};
          output.onloadeddata=()=>{if(!output.requestVideoFrameCallback)markFrame()};
          output.srcObject=remote;output.hidden=false;setOutput(output);
          if(output.requestVideoFrameCallback)frameCallback=output.requestVideoFrameCallback(markFrame);
          const play=()=>output.play().catch(()=>{if(attempt!==epoch)return;showProgress('AI video arrived. Click Play received video to allow playback.');resume.hidden=false});
          resume.onclick=play;play();
          let previousTime=-1;
          watchdog=setInterval(()=>{if(attempt!==epoch)return;if(!output.requestVideoFrameCallback&&output.currentTime!==previousTime){previousTime=output.currentTime;markFrame()}if(referenceApplied&&(!lastFrameAt||performance.now()-lastFrameAt>8000))showProgress(`Waiting for AI video frames · received ${frames} · video ${output.videoWidth} × ${output.videoHeight}${output.paused?' · playback paused':''}`)},2000);
        }
      });
      if(attempt!==epoch){connected.disconnect();return}
      session=connected;stage='Applying character reference';showProgress('Applying character photo and transformation instructions…');
      connected.on('error',error=>{if(attempt===epoch)end(transformationError(error,stage))});
      await applyCharacter(connected,editState);if(attempt!==epoch)return;referenceApplied=true;stage='Receiving AI video';if(lastFrameAt){progress.hidden=true;status.textContent='Live AI video playing'}else showProgress('Character applied. Waiting for decoded AI video frames…');
      clearTimeout(limit);if(!lastFrameAt)frameLimit=setTimeout(()=>end('AI connected but no decoded video frames arrived. This is a video delivery timeout, not a confirmed credit error.'),30000);
      connected.on('connectionChange',state=>{if(attempt===epoch&&state==='disconnected')end('AI connection ended. Click Execute to reconnect.')});
      const deadline=Date.now()+token.maxSessionDuration*1000;
      timer=setInterval(()=>{$('transformTime').textContent=`Session time remaining: ${Math.max(0,Math.ceil((deadline-Date.now())/1000))} seconds`},1000);
      limit=setTimeout(()=>end('Five-minute session completed. Click Execute for another session.'),token.maxSessionDuration*1000);
    }catch(e){if(attempt===epoch)await end(transformationError(e,stage))}
  };
  window.addEventListener('beforeunload',()=>{session?.disconnect()});
  fetch('/api/transform/capabilities').then(r=>r.json()).then(c=>{ready=c.enabled;start.disabled=!ready;status.textContent=ready?'Live AI ready. Select a photo, enter your studio key and click Execute.':c.reason}).catch(()=>{start.disabled=true;status.textContent='Cannot check live AI configuration. Refresh the app.'});
}
