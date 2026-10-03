// The photo supplies appearance; the full camera stream supplies motion and scene.
export function characterState({image,instructions=''}) {
  const extra=instructions.trim();
  const identity=image?'Transform the person in the live camera video into the character shown in the reference photo. Match the reference face, hair, visible clothing and appearance. Use the reference only for the character identity, not its background or pose.':'';
  const motion='Preserve the live camera background, room, objects, lighting and camera framing. Preserve the live person’s current body pose, head turns, eye movement, blinking, mouth movement, facial expressions and hand gestures in each frame. Render the character naturally within the live scene.';
  const text=[identity,motion,extra].filter(Boolean).join(' ');
  return {prompt:{text,enhance:true},passthrough:false,...(image?{image}:{})};
}
