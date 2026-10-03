import { authenticateStudio } from '/studio-auth.js';
export function mountTransformation({getStream,startCamera,stopPortrait,getReference,hasConsent,setOutput,setMode,registerStop}) {
  const $=id=>document.getElementById(id),status=$('transformStatus'),start=$('transformStart'),stop=$('transformStop');
  const output=document.createElement('video');output.muted=true;output.autoplay=true;output.playsInline=true;
  let session=null,epoch=0,timer=null,limit=null,frameLimit=null,ready=false;
  const clearOutput=()=>{output.pause();output.srcObject=null;setOutput(null)};
  async function end(message='Transformation stopped.') {
    epoch++;clearInterval(timer);clearTimeout(limit);clearTimeout(frameLimit);timer=limit=frameLimit=null;
    const current=session;session=null;current?.disconnect();clearOutput();setMode(false);
    start.disabled=!ready;stop.disabled=true;$('transformTime').textContent='';status.textContent=message;
  }
  registerStop(()=>end());stop.onclick=()=>end();
  start.onclick=async()=>{
    if(!hasConsent()){status.textContent='Check the image permission box first.';return}
    const reference=$('transformReference').checked?getReference():null;
    if($('transformReference').checked&&!reference){status.textContent='Choose and save a character photo first.';return}
    const prompt=$('transformPrompt').value.trim()||(reference?'Transform the person into the character in the reference image. Preserve their live movement and expressions.':'');
    if(!prompt){status.textContent='Enter transformation instructions.';return}
    await end();await stopPortrait();const attempt=++epoch;start.disabled=true;stop.disabled=false;
    status.textContent='Starting camera…';setMode(true,'Connecting to live AI…');
    try{
      await authenticateStudio($('transformKey'));if(attempt!==epoch)return;
      if(!getStream())await startCamera();if(attempt!==epoch)return;
      const camera=getStream();if(!camera?.getVideoTracks().some(t=>t.readyState==='live'))throw Error('Camera is unavailable. Start it and allow camera access.');
      const {createDecartClient,models}=await import('/vendor/decart.mjs');
      let image;
      if(reference){const res=await fetch(reference.url);if(!res.ok)throw Error('Cannot load the selected character photo.');image=new File([await res.blob()],reference.name,{type:reference.mime})}
      if(attempt!==epoch)return;
      status.textContent='Authorizing live transformation…';
      const response=await fetch('/api/transform/token',{method:'POST',signal:AbortSignal.timeout(20000)});
      const token=await response.json();if(!response.ok)throw Error(token.error||'Session authorization failed.');
      if(attempt!==epoch)return;
      status.textContent='Connecting to live AI…';
      limit=setTimeout(()=>end('Connection timed out. Check your network and Decart credits, then try again.'),45000);
      const client=createDecartClient({apiKey:token.apiKey});
      const connected=await client.realtime.connect(new MediaStream(camera.getVideoTracks()),{
        model:models.realtime(token.model),initialState:{prompt:{text:prompt,enhance:true},...(image?{image}:{})},
        onRemoteStream:remote=>{if(attempt!==epoch)return;output.srcObject=remote;setOutput(output);output.onloadeddata=()=>{if(attempt!==epoch)return;clearTimeout(frameLimit);status.textContent='Live AI video received. Test your expressions and movements.'};output.play().catch(()=>{status.textContent='Click Execute again if the output does not play.'})}
      });
      if(attempt!==epoch){connected.disconnect();return}
      session=connected;clearTimeout(limit);status.textContent=output.readyState>=2?'Live AI video received. Test your expressions and movements.':'AI connected. Waiting for transformed video…';if(output.readyState<2)frameLimit=setTimeout(()=>end('AI connected but no video arrived. Check Decart credits and network, then reconnect.'),30000);
      connected.on('error',()=>{if(attempt===epoch)end('Live AI error. Check Decart credits and network, then try again.')});
      connected.on('connectionChange',state=>{if(attempt===epoch&&state==='disconnected')end('AI connection ended. Click Execute to reconnect.')});
      const deadline=Date.now()+token.maxSessionDuration*1000;
      timer=setInterval(()=>{$('transformTime').textContent=`Session time remaining: ${Math.max(0,Math.ceil((deadline-Date.now())/1000))} seconds`},1000);
      limit=setTimeout(()=>end('Five-minute session completed. Click Execute for another session.'),token.maxSessionDuration*1000);
    }catch(e){if(attempt===epoch)await end(e.message||'Transformation failed.')}
  };
  window.addEventListener('beforeunload',()=>{session?.disconnect()});
  fetch('/api/transform/capabilities').then(r=>r.json()).then(c=>{ready=c.enabled;start.disabled=!ready;status.textContent=ready?'Live AI ready. Select a photo, enter your studio key and click Execute.':c.reason}).catch(()=>{start.disabled=true;status.textContent='Cannot check live AI configuration. Refresh the app.'});
}
