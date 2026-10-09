// Run against the isolated template fixture on ports4300-4304. Does not reset data.
import { execFileSync } from "node:child_process";
const session = `msd-template-customer-${Date.now()}`;
const run = (...args) => {
  try {
    return execFileSync(
      "npx",
      ["--offline", "--yes", "agent-browser", "--session", session, ...args],
      { encoding: "utf8", timeout: 45000 },
    );
  } catch {
    throw Error(
      "Customer template browser check failed. Inspect the isolated browser session; sensitive arguments suppressed.",
    );
  }
};
const evaluate = (code) =>
  run(
    "eval",
    `(async()=>{const pause=(ms=300)=>new Promise(r=>setTimeout(r,ms));const assert=(v,m)=>{if(!v)throw Error(m)};const w=document.querySelector('chat-msd-widget');assert(w,'Widget missing');const r=w.shadowRoot;${code}})()`,
  );
try {
  run("open", "http://localhost:4303/apps/dummy-site/");
  run("snapshot", "-i");
  evaluate(
    `await w.sync();assert(w.online,'Widget offline');assert(w.hasAttribute('inline'),'Original customer showcase missing');assert(r.querySelector('.phone-shell'),'Original phone shell missing');assert(r.querySelectorAll('.quick-card').length===3,'Quick cards missing');assert(r.querySelectorAll('.topic-card').length===6,'Topics missing');assert(r.querySelectorAll('.drawer-tool').length===7,'Chat tools missing');assert(!r.querySelector('[onclick]'),'Inline template demo handler remains');return true;`,
  );
  run("screenshot", "/tmp/msd-template-customer-dark.png");
  evaluate(
    `r.querySelector('#lang-sw').click();assert(r.querySelector('#homeTitle').textContent.includes('Habari'),'Swahili');r.querySelector('#lang-fr').click();assert(r.querySelector('#homeTitle').textContent.includes('Bonjour'),'French');r.querySelector('#lang-en').click();r.querySelector('.theme-toggle').click();assert(w.classList.contains('msd-light'),'Light theme');return true;`,
  );
  run("screenshot", "/tmp/msd-template-customer-light.png");
  evaluate(
    `r.querySelector('.theme-toggle').click();const quick=[...r.querySelectorAll('.quick-card')];quick[0].click();r.querySelector('[data-action=provider-unavailable]').click();assert(r.querySelector('#pageError').textContent.includes('not been connected'),'Order summary unavailable explanation');assert(r.querySelector('.dummy-secondary').textContent==='Download Order Summary','Original order action missing');assert(w.page==='order'&&r.querySelector('#dummyContent').textContent.includes('not been connected'),'Order missing-provider state');r.querySelector('[data-action=back]').click();quick[1].click();r.querySelector('[data-action=provider-unavailable]').click();assert(r.querySelector('#pageError').textContent.includes('not been connected'),'Contacts unavailable explanation');assert(r.querySelector('.dummy-secondary').textContent==='Copy Contacts','Original contacts action missing');assert(w.page==='zonal'&&r.querySelector('#dummyContent').textContent.includes('not been connected'),'Contacts missing-provider state');r.querySelector('[data-action=back]').click();quick[2].click();assert(w.page==='tickets','Tickets page');r.querySelector('[data-action=continue-ticket]').click();assert(r.querySelector('#pageError').textContent.includes('No saved tickets'),'Empty continue action');w.goHome();r.querySelector('#moreToolsBtn').click();assert(w.page==='tools','More tools');for(const target of ['new-ticket','faqs','order','zonal','tickets']){w.openPage('tools');r.querySelector('[data-page="'+target+'"]').click();assert(w.page===target,'Tool '+target);}w.openPage('tools');assert(r.querySelector('.dummy-secondary').textContent==='Open Forms','Original forms action missing');r.querySelector('.dummy-secondary').click();assert(w.page==='new-ticket','Open forms action');w.goHome();r.querySelector('.ai-card').click();assert(r.querySelector('#dummyContent').textContent.includes('Phase Two'),'AI phase');w.goHome();for(let i=0;i<6;i++){r.querySelectorAll('.topic-card')[i].click();assert(w.page!=='home','Topic '+i);w.goHome();}r.querySelector('#viewAllBtn').click();assert(r.querySelectorAll('#faqs details').length>=2,'Published FAQs');const faq=r.querySelector('#faqs details');faq.open=true;assert(faq.querySelector('p').textContent,'FAQ answer');w.goHome();r.querySelector('.floating-chat-btn').click();assert(w.page==='chat','Open chat');r.querySelector('#customerInput').value=w.faqs[0].question.slice(0,8);r.querySelector('#customerInput').dispatchEvent(new Event('input'));assert(r.querySelector('#suggestionPanel').classList.contains('open'),'FAQ suggestions');r.querySelector('.suggestion-item').click();assert(w.page==='faqs'&&r.querySelector('#faqs details').open,'FAQ suggestion opens answer');return true;`,
  );
  console.log(
    "Original home cards, all service/topic pages, three languages, both themes and FAQ search passed.",
  );
  evaluate(
    `w.goHome();r.querySelector('.ticket-card-shape').click();const f=r.querySelector('#newTicketForm');f.elements.visitorName.value='Template customer';f.elements.reference.value='TEMPLATE-BROWSER';f.elements.description.value='Template customer real support request';f.requestSubmit();await pause(1200);await w.sync();assert(w.chat&&w.messages.some(m=>m.text.includes('Template customer real support request')),'New ticket not saved');assert(w.page==='chat','New ticket did not open chat');r.querySelector('#customerInput').value='Customer template follow-up';r.querySelector('.send-btn').click();await pause(700);await w.sync();assert(w.messages.some(m=>m.text==='Customer template follow-up'),'Follow-up missing');const response=await fetch('http://localhost:4300/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'template-admin@example.test',password:'TemplateAdmin!2026'})});const login=await response.json();assert(response.ok,'Fixture admin login');const reply=await fetch('http://localhost:4300/api/conversations/'+w.chat.conversationId+'/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+login.token},body:JSON.stringify({text:'Support reply for template customer',requestKey:crypto.randomUUID()})});assert(reply.ok,'Staff reply');await pause(700);assert(w.messages.some(m=>m.text==='Support reply for template customer'),'Live reply missing');return true;`,
  );
  evaluate(
    `const text=new File(['Customer template file attachment'], 'customer-template.txt', {type:'text/plain'});await w.sendFile(text);assert(w.messages.some(m=>m.attachment?.name==='customer-template.txt'),'File not sent');const attachment=w.messages.find(m=>m.attachment?.name==='customer-template.txt').attachment;const url=await w.attachmentUrl(attachment.id);assert((await(await fetch(url)).text()).includes('Customer template file attachment'),'File download mismatch');const forbidden=await fetch('http://localhost:4300/api/conversations/'+w.chat.conversationId+'/attachments/'+attachment.id);assert(forbidden.status===401,'Anonymous attachment readable');const png=new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFRkAAAAASUVORK5CYII='),c=>c.charCodeAt(0))], 'customer-template.png', {type:'image/png'});await w.sendFile(png);await pause(600);assert(r.querySelector('.attachment img'),'Image attachment preview missing');const before=w.messages.length;await w.sendFile(new File([new Uint8Array(2*1024*1024+1)],'too-large.txt',{type:'text/plain'}));assert(w.messages.length===before&&r.querySelector('#error').textContent.includes('2 MiB'),'Oversize upload not blocked');return true;`,
  );
  run("screenshot", "/tmp/msd-template-customer-chat.png");
  evaluate(
    `r.querySelector('#historyBtn').click();await pause(500);assert(r.querySelector('[data-action=ticket]'),'Ticket history missing');r.querySelector('[data-action=continue-ticket]').click();await pause(500);assert(w.page==='chat','Continue ticket failed');r.querySelector('#customerPlusBtn').click();assert(r.querySelector('#customerToolDrawer').classList.contains('open'),'Drawer');for(const [index,page]of [[0,'faqs'],[1,'tools'],[2,'order'],[3,'zonal']]){w.openChat();r.querySelectorAll('.drawer-tool')[index].click();assert(w.page===page,'Drawer tool '+index);}w.openChat();r.querySelectorAll('.drawer-tool')[5].click();assert(r.querySelector('#customerInput').value.includes('escalate'),'Escalation action');r.querySelectorAll('.drawer-tool')[6].click();assert(r.querySelector('#customerInput').value.includes('feedback'),'Feedback action');r.querySelector('#expandChat').click();assert(w.classList.contains('expanded'),'Expand');r.querySelector('#expandChat').click();r.querySelector('#endSession').click();assert(w.page==='home','Leave chat');return true;`,
  );
  console.log(
    "Real new ticket, visitor message, live support reply, attachment upload/download/image preview, size rejection and history continuation passed.",
  );
  run("reload");
  const openTicket = evaluate(
    `await w.sync();assert(w.chat&&w.tickets.length>0,'Conversation not persisted');w.openPage('faqs');const realRequest=w.request.bind(w);w.request=async()=>{throw new TypeError('Simulated unavailable connection');};await w.sync();assert(!w.online,'Offline not shown');assert(r.querySelector('#faqs').textContent.includes(w.faqs[0].question),'Cached FAQs missing');assert(r.querySelector('.send-btn').disabled,'Offline chat enabled');w.request=realRequest;await w.sync();assert(w.online,'Reconnect failed');const login=await(await fetch('http://localhost:4300/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'template-admin@example.test',password:'TemplateAdmin!2026'})})).json();const closed=await fetch('http://localhost:4300/api/conversations/'+w.chat.conversationId,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+login.token},body:JSON.stringify({status:'closed'})});assert(closed.ok,'Fixture close failed');await w.sync();w.openChat();assert(r.querySelector('.send-btn').disabled&&!r.querySelector('#new').hidden,'Closed ticket controls');r.querySelector('#new').click();assert(!w.chat&&!r.querySelector('.send-btn').disabled,'New conversation after close');r.querySelector('#customerInput').value='Open template ticket for agent UI verification';await w.send();assert(w.chat,'Second ticket failed');console.info('Open customer conversation: '+w.chat.conversationId);return w.chat.conversationId;`,
  );
  console.log("Open customer ticket for agent checks: " + openTicket.trim());
  console.log(
    "Conversation survives reload; offline cached FAQs, reconnect, closed conversation and fresh conversation passed.",
  );
  run("set", "viewport", "390", "844");
  evaluate(
    `w.goHome();assert(r.querySelector('.phone-shell').getBoundingClientRect().width<=390,'Mobile overflow');return true;`,
  );
  run("screenshot", "/tmp/msd-template-customer-mobile.png");
  evaluate(
    `w.removeAttribute('inline');assert(getComputedStyle(r.querySelector('.panel')).display==='none','Embed initially open');r.querySelector('.launcher').click();assert(getComputedStyle(r.querySelector('.panel')).display!=='none','Embed launcher broken');r.querySelector('.launcher').click();assert(getComputedStyle(r.querySelector('.panel')).display==='none','Embed close broken');w.setAttribute('inline','');return true;`,
  );
  const errors = run("errors");
  if (errors.trim()) throw Error("Unexpected browser errors: " + errors);
  console.log(
    "Mobile layout and standalone embed launcher passed; no browser errors.",
  );
} finally {
  try {
    run("close");
  } catch {}
}
