import { characterState, applyCharacter, transformationError } from '/character-state.js';
import { authenticateStudio } from '/studio-auth.js';
export function mountTransformation({getStream,startCamera,stopPortrait,getReference,hasConsent,setOutput,setMode,setDiagnostic,registerStop}) {
  const $=id=>document.getElementById(id),status=$('transformStatus'),start=$('transformStart'),stop=$('transformStop');
  const output=$('aiVideo');output.muted=true;output.autoplay=true;output.playsInline=true;
  let stage='Initialization',session=null,epoch=0,timer=null,limit=null,frameLimit=null,ready=false;
  const clearOutput=()=>{output.pause();output.srcObject=null;output.hidden=true;$('aiVideoLabel').hidden=true;setOutput(null)};
  async function end(message='Transformation stopped.') {
    epoch++;clearInterval(timer);clearTimeout(limit);clearTimeout(frameLimit);timer=limit=frameLimit=null;
    const current=session;session=null;current?.disconnect();clearOutput();setMode(false);
    start.disabled=!ready;stop.disabled=true;$('transformTime').textContent='';status.textContent=message;setDiagnostic(message);
  }
  registerStop(()=>end());stop.onclick=()=>end();
  start.onclick=async()=>{
    if(!hasConsent()){status.textContent='Check the image permission box first.';return}
    const reference=$('transformReference').checked?getReference():null;
    if($('transformReference').checked&&!reference){status.textContent='Choose and save a character photo first.';return}
    const prompt=$('transformPrompt').value.trim();
    if(!reference&&!prompt){status.textContent='Enter transformation instructions.';return}
    await end();await stopPortrait();const attempt=++epoch;start.disabled=true;stop.disabled=false;
    stage='Studio sign-in';status.textContent='Starting camera…';setMode(true,'Connecting to live AI…');
    try{
      await authenticateStudio($('transformKey'));if(attempt!==epoch)return;
      stage='Camera startup';if(!getStream())await startCamera();if(attempt!==epoch)return;
      const camera=getStream();if(!camera?.getVideoTracks().some(t=>t.readyState==='live'))throw Error('Camera is unavailable. Start it and allow camera access.');
      stage='Loading AI client';const {createDecartClient,models}=await import('/vendor/decart.mjs');
      let image;
      stage='Loading selected photo';if(reference){const res=await fetch(reference.url);if(!res.ok)throw Error('Cannot load the selected character photo.');image=new File([await res.blob()],reference.name,{type:reference.mime})}
      if(attempt!==epoch)return;
      stage='Session authorization';status.textContent='Authorizing live transformation…';setMode(true,'Preparing your stream…');
      const response=await fetch('/api/transform/token',{method:'POST',signal:AbortSignal.timeout(20000)});
      const token=await response.json();if(!response.ok)throw Error(token.error||'Session authorization failed.');
      if(attempt!==epoch)return;
      stage='AI connection';status.textContent='Connecting to live AI…';setMode(true,'Preparing the character stream…');
      limit=setTimeout(()=>end('Connection timed out. Check your network and Decart credits, then try again.'),45000);
      const client=createDecartClient({apiKey:token.apiKey});
      const editState=characterState({image,instructions:prompt});
      setDiagnostic(`Connecting to ${token.model} with ${reference?'selected character photo':'text instructions'}.`);
      const connected=await client.realtime.connect(new MediaStream(camera.getVideoTracks()),{
        model:models.realtime(token.model),initialState:editState,
        onRemoteStream:remote=>{if(attempt!==epoch)return;output.srcObject=remote;output.hidden=false;$('aiVideoLabel').hidden=false;setOutput(output);output.onloadeddata=()=>{if(attempt!==epoch)return;clearTimeout(frameLimit);status.textContent='Live AI video received. Test your expressions and movements.';setDiagnostic(status.textContent)};output.play().catch(()=>{status.textContent='Click Execute again if the output does not play.'})}
      });
      if(attempt!==epoch){connected.disconnect();return}
      session=connected;stage='Applying character reference';status.textContent='AI connected. Confirming character reference…';
      connected.on('error',error=>{if(attempt===epoch)end(transformationError(error,stage))});
      await applyCharacter(connected,editState);if(attempt!==epoch)return;stage='Receiving AI video';setDiagnostic('Decart acknowledged the character instructions. Waiting for live output.');
      clearTimeout(limit);status.textContent=output.readyState>=2?'Live AI video received. Test your expressions and movements.':'AI connected. Waiting for transformed video…';if(output.readyState<2)frameLimit=setTimeout(()=>end('AI connected but no video arrived. Check Decart credits and network, then reconnect.'),30000);
      connected.on('connectionChange',state=>{if(attempt===epoch&&state==='disconnected')end('AI connection ended. Click Execute to reconnect.')});
      const deadline=Date.now()+token.maxSessionDuration*1000;
      timer=setInterval(()=>{$('transformTime').textContent=`Session time remaining: ${Math.max(0,Math.ceil((deadline-Date.now())/1000))} seconds`},1000);
      limit=setTimeout(()=>end('Five-minute session completed. Click Execute for another session.'),token.maxSessionDuration*1000);
    }catch(e){if(attempt===epoch)await end(transformationError(e,stage))}
  };
  window.addEventListener('beforeunload',()=>{session?.disconnect()});
  fetch('/api/transform/capabilities').then(r=>r.json()).then(c=>{ready=c.enabled;start.disabled=!ready;status.textContent=ready?'Live AI ready. Select a photo, enter your studio key and click Execute.':c.reason}).catch(()=>{start.disabled=true;status.textContent='Cannot check live AI configuration. Refresh the app.'});
}
