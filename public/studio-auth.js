let authenticated=false;
function display(){for(const id of ['transformKey','studioKey']){const input=document.getElementById(id);input.closest('label').hidden=authenticated;if(authenticated)input.value=''}document.getElementById('studioSessionStatus').textContent=authenticated?'Studio access remembered on this browser for 30 days.':'Enter your studio key once to remember access on this browser.';document.getElementById('studioLogout').hidden=!authenticated}
export async function ensureStudio(input){
  if(authenticated)return;
  const res=await fetch('/api/studio/session',{method:'POST',headers:{'X-Studio-Key':input.value}});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Studio sign-in failed.');authenticated=true;display();
}
const sessionReady=fetch('/api/studio/session').then(r=>r.json()).then(data=>{authenticated=data.authenticated;display()}).catch(()=>{});
export async function authenticateStudio(input){await sessionReady;await ensureStudio(input)}
document.getElementById('studioLogout').onclick=async()=>{const res=await fetch('/api/studio/session',{method:'DELETE'});if(res.ok){authenticated=false;display()}};
