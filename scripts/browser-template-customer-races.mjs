// Fault-injection checks run only inside a fresh browser against the local UI.
// Requests are replaced after bootstrap; no conversations are written to the API.
import { execFileSync } from "node:child_process";
const session = `msd-template-races-${Date.now()}`;
const run = (...args) =>
  execFileSync(
    "npx",
    ["--offline", "--yes", "agent-browser", "--session", session, ...args],
    { encoding: "utf8", timeout: 45000 },
  );
const evaluate = (code) =>
  run(
    "eval",
    `(async()=>{const w=document.querySelector('chat-msd-widget'),r=w.shadowRoot;const assert=(v,m)=>{if(!v)throw Error(m)};const deferred=()=>{let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});return{promise,resolve,reject}};const pause=()=>new Promise(res=>setTimeout(res,30));${code}})()`,
  );
try {
  run("open", "http://localhost:4303/apps/dummy-site/");
  evaluate(
    `await w.sync();clearInterval(w.timer);w.socket?.removeAllListeners();w.socket?.disconnect();w.connectSocket=()=>{};w.sync=async()=>{};w.online=true;w.closed=false;window.fixtureBootstrap=JSON.parse(localStorage.getItem(w.key+':bootstrap'));window.capA={conversationId:'race-ticket-a',visitorToken:'race-token-a'};window.capB={conversationId:'race-ticket-b',visitorToken:'race-token-b'};return true;`,
  );
  evaluate(
    `w.clearChat();w.online=true;localStorage.setItem(w.key+':pending',JSON.stringify({text:'Earlier creation draft',requestKey:'creation-retry-key-1234567890'}));r.querySelector('#customerInput').value='Changed creation draft';let sent=[];w.request=async(path,method,body)=>{sent.push(body);return window.capA};await w.send();assert(sent.length===1&&sent[0].text==='Earlier creation draft','Creation retry did not settle original');assert(r.querySelector('#customerInput').value==='Changed creation draft','Changed creation draft lost');assert(r.querySelector('#error').textContent.includes('recovered'),'Creation reconciliation not explained');assert(w.chat.conversationId===window.capA.conversationId,'Recovered creation not retained');return true;`,
  );
  evaluate(
    `const key=w.key+':pending-message:'+window.capA.conversationId;localStorage.setItem(key,JSON.stringify({text:'Earlier message',requestKey:'message-retry-key-1234567890'}));r.querySelector('#customerInput').value='Changed message';let sent=[];w.request=async(path,method,body,capability)=>{sent.push({body,capability});return{}};await w.send();assert(sent.length===1&&sent[0].body.text==='Earlier message','Message retry sent wrong payload');assert(sent[0].capability.conversationId===window.capA.conversationId,'Message destination not captured');assert(r.querySelector('#customerInput').value==='Changed message','Changed message draft lost');assert(JSON.parse(localStorage.getItem(key))===null,'Acknowledged pending key retained');const pending=deferred();w.request=async()=>pending.promise;r.querySelector('#customerInput').value='Sending draft';const task=w.send();await pause();r.querySelector('#customerInput').value='Typed while sending';pending.resolve({});await task;assert(r.querySelector('#customerInput').value==='Typed while sending','In-flight edited draft lost');return true;`,
  );
  console.log(
    "Lost-response creation/message retries settle the original payload once and preserve edited drafts.",
  );
  evaluate(
    `for(const status of [401,403,404]){w.chat=window.capA;w.selectionVersion++;const old=deferred();let waiting=false;w.request=async path=>{if(path.endsWith('/bootstrap'))return window.fixtureBootstrap;waiting=true;return old.promise};const task=w.performSync();while(!waiting)await pause();w.selectionVersion++;w.chat=window.capB;old.reject(Object.assign(Error('Old ticket unavailable'),{status}));await task;assert(w.chat?.conversationId===window.capB.conversationId,'Old '+status+' cleared new selection');}const a=deferred(),b=deferred();w.tickets=[window.capA,window.capB];w.request=async path=>path.endsWith(window.capA.conversationId)?a.promise:b.promise;const first=w.selectTicket(window.capA.conversationId),second=w.selectTicket(window.capB.conversationId);b.resolve({status:'open',messages:[],updatedAt:new Date().toISOString()});await second;a.resolve({status:'open',messages:[],updatedAt:new Date().toISOString()});await first;assert(w.chat.conversationId===window.capB.conversationId,'Slow ticket selection overwrote newer selection');return true;`,
  );
  console.log(
    "Late 401/403/404 sync failures and out-of-order ticket selections preserve the current ticket.",
  );
  evaluate(
    `w.chat=window.capA;w.selectionVersion++;w.online=true;w.closed=false;const RealReader=window.FileReader;let reader;window.FileReader=class{readAsDataURL(){reader=this}};let sent=0;w.request=async()=>{sent++;return{}};const task=w.sendFile(new File(['file content'],'race.txt',{type:'text/plain'}));while(!reader)await pause();w.selectionVersion++;w.chat=window.capB;reader.result='data:text/plain;base64,ZmlsZSBjb250ZW50';reader.onload();await task;window.FileReader=RealReader;assert(sent===0,'Attachment crossed into another ticket');assert(r.querySelector('#error').textContent.includes('ticket changed'),'Attachment cancellation not explained');return true;`,
  );
  evaluate(
    `w.chat=window.capA;w.selectionVersion++;w.online=true;w.closed=false;const file=new File(['retry attachment'],'retry.txt',{type:'text/plain'});const keys=[];w.request=async(path,method,body,capability)=>{keys.push([body.requestKey,capability.conversationId]);if(keys.length===1)throw new TypeError('Response lost');return{}};await w.sendFile(file);const picker=r.querySelector('#attachmentInput'),dt=new DataTransfer();dt.items.add(file);picker.files=dt.files;assert(picker.value,'Test file selection missing');const click=picker.click;let pickerCleared=false;picker.click=()=>{pickerCleared=picker.value===''};w.tool('files');picker.click=click;assert(pickerCleared,'File picker was not reset before reopen');await w.sendFile(file);assert(keys.length===2&&keys[0][0]===keys[1][0],'Same-file retry changed uncertain request key');w.chat=window.capB;w.selectionVersion++;await w.sendFile(file);assert(keys[2][0]!==keys[1][0]&&keys[2][1]===window.capB.conversationId,'Attachment retry key crossed tickets');return true;`,
  );
  console.log(
    "Delayed file reads cancel on ticket changes; same-file retry reopens and retains its destination-specific request key.",
  );
  evaluate(
    `w.clearChat();w.online=true;const result=deferred();w.request=async()=>result.promise;const pending=w.createConversation('Creation before selection switch');w.selectionVersion++;w.chat=window.capB;result.resolve(window.capA);const created=await pending;assert(!created.selected&&w.chat.conversationId===window.capB.conversationId,'Late creation overrode selected ticket');assert(w.tickets.some(t=>t.conversationId===window.capA.conversationId),'Recovered unselected creation lost from history');w.openPage('new-ticket');const form=r.querySelector('#newTicketForm');form.elements.description.value='New ticket form draft';localStorage.setItem(w.key+':pending',JSON.stringify({text:'Old uncertain ticket',requestKey:'old-ticket-request-key-1234567890'}));w.request=async()=>window.capA;await w.submitTicket(form);assert(w.page==='new-ticket'&&form.elements.description.value==='New ticket form draft','Retry discarded new ticket form');assert(r.querySelector('#pageError').textContent.includes('recovered'),'New-ticket reconciliation not explained');return true;`,
  );
  console.log(
    "Late creation is retained in history without changing selection; recovered creation preserves the new-ticket form.",
  );
  const errors = run("errors");
  if (errors.trim()) throw Error(errors);
  console.log("All customer race regressions passed; no browser errors.");
} finally {
  try {
    run("close");
  } catch {}
}
