const video=document.getElementById('heroVideo'),toggle=document.getElementById('videoToggle');
function update(){toggle.textContent=video.paused?'Play background':'Pause background';toggle.setAttribute('aria-pressed',String(video.paused))}
if(matchMedia('(prefers-reduced-motion: reduce)').matches)video.pause();
toggle.onclick=()=>{if(video.paused)video.play().catch(()=>{});else video.pause();update()};video.addEventListener('play',update);video.addEventListener('pause',update);update();
