import {execFileSync} from 'node:child_process';
const run=(session,...args)=>{const out=execFileSync('npx',['--yes','agent-browser','--session',session,...args],{encoding:'utf8',timeout:45000});console.log(out.trim());};
run('msd-site','eval',`(async()=>{const w=document.querySelector('chat-msd-widget');const duplicate=document.createElement('chat-msd-widget');duplicate.setAttribute('site-key',w.siteKey);document.body.append(duplicate);if(getComputedStyle(duplicate).display!=='none')throw Error('Duplicate widget visible');duplicate.remove();sessionStorage.setItem('expected-conversation',w.chat.conversationId);return 'Duplicate widget initialization safe';})()`);
run('msd-site','reload');
run('msd-site','eval',`(async()=>{await new Promise(r=>setTimeout(r,1200));const w=document.querySelector('chat-msd-widget');await w.sync();if(w.chat.conversationId!==sessionStorage.getItem('expected-conversation'))throw Error('Conversation duplicated on reload');if(!w.messages.some(m=>m.text==='Thank you from visitor'))throw Error('History missing after reload');return 'Conversation and history survive reload';})()`);
run('msd-site','eval',`(async()=>{const r=await fetch('/services/api/data/store.json');if(r.status!==403)throw Error('Development data exposed: '+r.status);return 'Development store access denied';})()`);
console.log('Browser edge checks passed.');
