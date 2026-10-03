// The photo supplies appearance; the full camera stream supplies motion and scene.
export function characterState({image,instructions=''}) {
  const extra=instructions.trim();
  const identity=image?'Transform the person in the live camera video into the character shown in the reference photo. Match the reference face, hair, visible clothing and appearance. Use the reference only for the character identity, not its background or pose.':'';
  const motion='Preserve the live camera background, room, objects, lighting and camera framing. Preserve the live person’s current body pose, head turns, eye movement, blinking, mouth movement, facial expressions and hand gestures in each frame. Render the character naturally within the live scene.';
  const text=[identity,motion,extra].filter(Boolean).join(' ');
  return {prompt:{text,enhance:true},passthrough:false,...(image?{image}:{})};
}

export async function applyCharacter(session,state) {
  await session.set({prompt:state.prompt.text,enhance:state.prompt.enhance,...(state.image?{image:state.image}:{})});
}
export function transformationError(error,stage) {
  const code=String(error?.code||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60);
  // Never display a provider URL, token or arbitrary provider response.
  const message=String(error?.message||'');
  const hint=/credit|balance|payment|402/i.test(code+' '+message)?'Decart credits or billing need attention.':/auth|unauthor|api.key|401|403/i.test(code+' '+message)?'Check studio sign-in, Decart API key and model access.':/network|websocket|ice|webrtc|connect|timeout/i.test(code+' '+message)?'Check network access to Decart and retry.':'Copy this status so the failed step can be diagnosed.';
  return `${stage} failed${code?' ('+code+')':''}. ${hint}`;
}
