// Run against an isolated stack with empty CHAT_MSD_DATA/HOST_INSTALLATION_FILE.
import { execFileSync } from "node:child_process";
const admin = "msd-host-central",
  owner = "msd-host-owner",
  visitor = "msd-host-public",
  agent = "msd-host-agent",
  fresh = "msd-host-new-visitor";
const run = (session, ...args) => {
  try {
    return execFileSync(
      "npx",
      ["--yes", "agent-browser", "--session", session, ...args],
      { encoding: "utf8", timeout: 45000 },
    );
  } catch {
    throw Error(
      `Browser host-installer step failed in ${session}; inspect its browser state. Sensitive arguments suppressed.`,
    );
  }
};
const evaluate = (session, code) =>
  run(
    session,
    "eval",
    `(async()=>{const pause=()=>new Promise(r=>setTimeout(r,1000));const assert=(v,m)=>{if(!v)throw Error(m)};const submit=async(sel,values)=>{const f=document.querySelector(sel);assert(f,'Missing '+sel);for(const [k,v]of Object.entries(values))f.elements[k].value=v;f.requestSubmit();await pause();};${code}})()`,
  );
try {
  run(visitor, "open", "http://localhost:4303/apps/dummy-site/");
  evaluate(
    visitor,
    `await pause();assert(!document.querySelector('#install'),'Public installer controls exposed');assert((await fetch('/host-api/setup')).status===401,'Private setup readable');assert((await fetch('/host-api/widget')).ok,'Public configuration unavailable');return true;`,
  );
  run(owner, "open", "http://localhost:4303/apps/dummy-site/admin.html");
  evaluate(
    owner,
    `await pause();assert(document.querySelector('#host-login'),'Private page not gated');await submit('#host-login',{password:'LocalSite!2026'});await submit('#install',{name:'Isolated host installation',adminEmail:'site@msd.local'});assert(document.querySelector('#setup').textContent.includes('pending'),'Site did not register pending');await submit('#faq',{question:'Where can I get help?',answer:'Local draft from the host administrator.'});assert(!sessionStorage.getItem('msd-local-install'),'Browser-held installation credential remains');return true;`,
  );
  evaluate(
    visitor,
    `await new Promise(r=>setTimeout(r,5500));const w=document.querySelector('chat-msd-widget');assert(w,'Public site key not published');await w.sync();assert(getComputedStyle(w).display==='none','Pending widget visible');return true;`,
  );
  console.log(
    "Fresh installation registered pending; protected host setup added an FAQ; public widget stayed hidden.",
  );
  run(admin, "open", "http://localhost:4301/apps/admin/");
  evaluate(
    admin,
    `await pause();document.querySelector('#bootstrap').closest('details').open=true;await submit('#bootstrap',{name:'Isolated Administrator',email:'admin@msd.local',password:'LocalDemo!2026'});assert(document.querySelector('#logout'),'Admin bootstrap failed');await submit('#agent',{name:'Isolated Agent',email:'agent@msd.local',password:'LocalAgent!2026',capacity:'5'});document.querySelector('[data-review]').click();await pause();await submit('#status',{status:'declined',reason:'Please review the local guidance'});assert(document.querySelector('#sites').textContent.includes('declined'),'Decline failed');return true;`,
  );
  evaluate(
    owner,
    `document.querySelector('#refresh').click();await pause();assert(document.querySelector('#setup').textContent.includes('Please review the local guidance'),'Decline reason missing');document.querySelector('#resubmit').click();await pause();assert(document.querySelector('#setup').textContent.includes('pending'),'Resubmit failed');return true;`,
  );
  evaluate(
    admin,
    `document.querySelector('#refresh').click();await pause();document.querySelector('[data-review]').click();await pause();await submit('.faq-edit',{answer:'Central approved host guidance.'});await submit('#status',{status:'approved'});assert(document.querySelector('#sites').textContent.includes('approved'),'Approval failed');return true;`,
  );
  evaluate(
    visitor,
    `const w=document.querySelector('chat-msd-widget');await w.sync();assert(getComputedStyle(w).display!=='none','Approved widget hidden');assert(w.shadowRoot.querySelector('#faqs').textContent.includes('Central approved host guidance.'),'Central override missing');w.shadowRoot.querySelector('.launcher').click();w.shadowRoot.querySelector('input').value='Fresh visitor needs help';w.shadowRoot.querySelector('form').requestSubmit();await pause();assert(w.chat,'Conversation not created');return true;`,
  );
  console.log(
    "Decline, visible reason, resubmission, central FAQ override and approval passed.",
  );
  run(agent, "open", "http://localhost:4302/apps/agent/");
  evaluate(
    agent,
    `await pause();await submit('#login',{email:'agent@msd.local',password:'LocalAgent!2026'});document.querySelector('[data-id]').click();document.querySelector('#claim').click();await pause();await submit('#reply',{text:'Agent received your fresh host request'});assert(document.querySelector('#messages').textContent.includes('Agent received'),'Agent reply failed');return true;`,
  );
  evaluate(
    visitor,
    `const w=document.querySelector('chat-msd-widget');await w.sync();assert(w.shadowRoot.querySelector('#messages').textContent.includes('Agent received'),'Reply not delivered');w.shadowRoot.querySelector('input').value='Visitor confirms delivery';w.shadowRoot.querySelector('form').requestSubmit();await pause();return true;`,
  );
  evaluate(
    agent,
    `document.querySelector('#refresh').click();await pause();assert(document.querySelector('#messages').textContent.includes('Visitor confirms'),'Visitor reply missing');return true;`,
  );
  run(fresh, "open", "http://localhost:4303/apps/dummy-site/");
  evaluate(
    fresh,
    `await pause();const w=document.querySelector('chat-msd-widget');assert(w,'Fresh visitor did not get site configuration');await w.sync();assert(getComputedStyle(w).display!=='none','Fresh visitor widget hidden');assert((await fetch('/host-api/setup')).status===401,'Fresh visitor authorized as owner');assert(!document.cookie.includes('msd-host-session'),'Host session exposed');return true;`,
  );
  console.log(
    "Two-way live chat passed; a fresh unauthenticated visitor sees the approved widget without installer credentials.",
  );
  evaluate(
    owner,
    `await submit('#settings',{title:'Persistent host support'});document.querySelector('#host-logout').click();await pause();assert(document.querySelector('#host-login'),'Host logout failed');return true;`,
  );
  run(owner, "reload");
  evaluate(
    owner,
    `await pause();await submit('#host-login',{password:'LocalSite!2026'});assert(document.querySelector('#settings input').value==='Persistent host support','Settings did not persist');assert(!localStorage.getItem('msd-public-site-key')&&!sessionStorage.getItem('msd-local-install'),'Legacy storage still used');assert(!document.cookie.includes('msd-host-session'),'Cookie is script-readable');return true;`,
  );
  evaluate(
    admin,
    `await submit('#status',{status:'suspended',reason:'Verification pause'});return true;`,
  );
  evaluate(
    visitor,
    `const w=document.querySelector('chat-msd-widget');await w.sync();assert(getComputedStyle(w).display==='none','Suspended widget visible');return true;`,
  );
  evaluate(admin, `await submit('#status',{status:'approved'});return true;`);
  const pid = Number(process.env.MSD_API_PID);
  if (!Number.isInteger(pid) || pid <= 0)
    throw Error("Set MSD_API_PID for the isolated API outage check");
  evaluate(
    visitor,
    `await document.querySelector('chat-msd-widget').sync();return true;`,
  );
  process.kill(pid, "SIGSTOP");
  try {
    evaluate(
      visitor,
      `const w=document.querySelector('chat-msd-widget');await w.sync();await pause();await w.sync();assert(!w.online,'Outage not detected');assert(getComputedStyle(w).display!=='none','Cached widget hidden');assert(w.shadowRoot.querySelector('#faqs').textContent.includes('Central approved'),'Cached FAQ missing');assert(w.shadowRoot.querySelector('form button').disabled,'Offline chat allowed');return true;`,
    );
  } finally {
    process.kill(pid, "SIGCONT");
  }
  evaluate(
    visitor,
    `const w=document.querySelector('chat-msd-widget');await w.sync();await pause();await w.sync();assert(w.online,'Reconnect failed');assert(w.shadowRoot.querySelector('#faqs').textContent.includes('Central approved'),'Central source lost');return true;`,
  );
  console.log(
    "Host logout/relogin, persisted settings, suspension/restore and real central outage/FAQ recovery passed.",
  );
  for (const session of [owner, visitor, agent])
    run(session, "screenshot", `/tmp/${session}.png`);
  console.log("Fresh authenticated host-installer browser journey passed.");
} finally {
  for (const session of [admin, owner, visitor, agent, fresh]) {
    try {
      run(session, "close");
    } catch {}
  }
}
