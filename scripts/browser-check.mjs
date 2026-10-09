// Requires agent-browser on PATH, or runs it through npx. Uses the local demo accounts.
import { execFileSync } from "node:child_process";
const run = (session, ...args) => {
  const out = execFileSync(
    "npx",
    ["--yes", "agent-browser", "--session", session, ...args],
    { encoding: "utf8", timeout: 45000 },
  );
  console.log(out.trim());
  return out;
};
const evaluate = (session, code) =>
  run(
    session,
    "eval",
    `(async()=>{const pause=()=>new Promise(r=>setTimeout(r,900));const assert=(v,m)=>{if(!v)throw Error(m)};const submit=async(sel,values)=>{const f=document.querySelector(sel);assert(f,'Missing '+sel);for(const [k,v] of Object.entries(values))f.elements[k].value=v;f.requestSubmit();await pause();};${code}})()`,
  );
const admin = "msd-check",
  site = "msd-site",
  agent = "msd-agent";
run(site,"network","unroute");
for (const [session, url, email, password] of [
  [
    admin,
    "http://localhost:4301/apps/admin/",
    "admin@msd.local",
    "LocalDemo!2026",
  ],
  [
    agent,
    "http://localhost:4302/apps/agent/",
    "agent@msd.local",
    "LocalAgent!2026",
  ],
]) {
  run(session, "open", url);
  evaluate(
    session,
    `await pause();if(document.querySelector('#login'))await submit('#login',{email:${JSON.stringify(email)},password:${JSON.stringify(password)}});assert(document.querySelector('#logout'),'Login failed');return 'Signed in';`,
  );
}
evaluate(
  admin,
  `document.querySelector('#refresh').click();await pause();document.querySelector('[data-review]').click();await pause();await submit('.faq-edit',{answer:'Central approved delivery guidance.'});if(document.querySelector('#status select').value!=='suspended')await submit('#status',{status:'approved'});assert(document.querySelector('#sites').innerText.includes('approved'),'Approval failed');return 'Central override and approval passed';`,
);
evaluate(
  site,
  `const w=document.querySelector('chat-msd-widget');await w.sync();assert(getComputedStyle(w).display!=='none','Widget hidden after approval');const s=w.shadowRoot;s.querySelector('.panel').classList.add('open');assert(s.querySelector('#faqs').textContent.includes('Central approved'),'Override missing');s.querySelector('input').value='Browser visitor needs delivery help';s.querySelector('form').requestSubmit();await pause();assert(w.chat,'Conversation missing');return 'Visitor chat created';`,
);
evaluate(
  agent,
  `document.querySelector('#refresh').click();await pause();const items=[...document.querySelectorAll('[data-id]')];items.find(b=>b.innerText.includes('Browser visitor needs delivery help')).click();document.querySelector('#claim').click();await pause();await submit('#reply',{text:'Browser agent reply: happy to help'});assert(document.querySelector('#messages').innerText.includes('happy to help'),'Reply missing');return 'Agent claimed and replied';`,
);
evaluate(
  site,
  `const w=document.querySelector('chat-msd-widget');await w.sync();assert(w.shadowRoot.querySelector('#messages').innerText.includes('happy to help'),'Visitor did not receive reply');w.shadowRoot.querySelector('input').value='Thank you from visitor';w.shadowRoot.querySelector('form').requestSubmit();await pause();return 'Two-way chat passed';`,
);
evaluate(
  agent,
  `document.querySelector('#refresh').click();await pause();assert(document.querySelector('#messages').innerText.includes('Thank you from visitor'),'Agent did not receive visitor reply');return 'Reply delivered';`,
);
evaluate(
  admin,
  `await submit('#status',{status:'suspended',reason:'Browser verification maintenance'});assert(document.querySelector('#sites').innerText.includes('suspended'),'Suspend failed');return 'Suspended';`,
);
evaluate(
  site,
  `const w=document.querySelector('chat-msd-widget');await w.sync();assert(getComputedStyle(w).display==='none','Suspended widget visible');return 'Suspension hides widget';`,
);
evaluate(
  admin,
  `await submit('#status',{status:'approved'});return 'Restored';`,
);
evaluate(
  site,
  `const w=document.querySelector('chat-msd-widget');await w.sync();assert(getComputedStyle(w).display!=='none','Restore failed');return 'Restoration passed';`,
);
const apiPid=Number(process.env.MSD_API_PID);
if(!Number.isInteger(apiPid)||apiPid<=0)throw Error("Set MSD_API_PID to the local API process PID for outage verification");
process.kill(apiPid,"SIGSTOP");
try {
evaluate(
  site,
  `const w=document.querySelector('chat-msd-widget');await w.sync();await pause();await w.sync();assert(!w.online,'Outage not detected');assert(getComputedStyle(w).display!=='none','Offline cache unavailable');assert(w.shadowRoot.querySelector('#faqs').textContent.includes('Central approved'),'Cached FAQ missing');assert(w.shadowRoot.querySelector('form button').disabled,'Offline chat enabled');return 'Offline FAQ fallback passed';`,
);
} finally { process.kill(apiPid,"SIGCONT"); }
evaluate(
  site,
  `const w=document.querySelector('chat-msd-widget');await w.sync();await pause();await w.sync();assert(w.online,'Reconnect failed');assert(w.shadowRoot.querySelector('#faqs').textContent.includes('Central approved'),'Central override lost');return 'Automatic resync passed';`,
);
evaluate(agent,`document.querySelector("#refresh").click();await pause();assert(!document.querySelector("#error").textContent,"Stale connection error");return "Console recovered";`);
for (const s of [admin, agent, site]) run(s, "screenshot", `/tmp/msd-${s}.png`);
console.log("Browser free run passed.");
