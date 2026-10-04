const tabs=[...document.querySelectorAll('[data-studio-tab]')];
function select(key,focus=false){
 if(!tabs.some(t=>t.dataset.studioTab===key))key='avatar';
 for(const tab of tabs){const chosen=tab.dataset.studioTab===key;tab.setAttribute('aria-selected',String(chosen));tab.tabIndex=chosen?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!chosen;if(chosen&&focus)tab.focus()}
 try{sessionStorage.setItem('mycam-studio-tab',key)}catch{}
}
for(const [index,tab] of tabs.entries()){
 tab.addEventListener('click',()=>select(tab.dataset.studioTab));
 tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();select(tabs[next].dataset.studioTab,true)});
}
document.getElementById('jumpUpload').addEventListener('click',()=>select('avatar'),true);
document.getElementById('transformStart').addEventListener('click',()=>select('ai'),true);
let saved;try{saved=sessionStorage.getItem('mycam-studio-tab')}catch{}select(saved||'avatar');
