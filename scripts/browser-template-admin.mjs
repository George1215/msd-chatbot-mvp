import { execFileSync } from "node:child_process";
const session = "msd-template-admin-check",
  owner = "msd-template-owner-check";
const cli = process.env.AGENT_BROWSER_CLI;
function run(s, ...args) {
  try {
    return execFileSync(
      cli ? process.execPath : "npx",
      cli
        ? [cli, "--session", s, ...args]
        : ["--yes", "agent-browser", "--session", s, ...args],
      { encoding: "utf8", timeout: 45000 },
    );
  } catch {
    throw Error(`Browser ${s} failed at ${args[0]}`);
  }
}
function evaluate(s, code) {
  try {
    return execFileSync(
      cli ? process.execPath : "npx",
      cli
        ? [cli, "--session", s, "eval", "--stdin"]
        : ["--yes", "agent-browser", "--session", s, "eval", "--stdin"],
      {
        input: `(async()=>{const pause=()=>new Promise(r=>setTimeout(r,900));const assert=(value,message)=>{if(!value)throw Error(message)};const submit=async(sel,values)=>{const f=document.querySelector(sel);assert(f,'Missing '+sel);for(const[k,v]of Object.entries(values)){if(f.elements[k].type==="checkbox")f.elements[k].checked=Boolean(v);else f.elements[k].value=v;}f.requestSubmit();await pause();};${code}})()`,
        encoding: "utf8",
        timeout: 45000,
      },
    );
  } catch (error) {
    throw Error(
      `Browser check ${s}: ${error.stdout || error.stderr || "evaluation failed"}`,
    );
  }
}
try {
  run(session, "open", "http://localhost:4301/apps/admin/");
  evaluate(
    session,
    `assert(document.querySelector('.screen.login-screen .login-card .field'),'Original login layout missing');document.querySelector('#themeToggle').click();assert(document.body.classList.contains('msd-light'),'Light theme failed');document.querySelector('#themeToggle').click();await submit('#login',{email:'template-admin@example.test',password:'wrong-password'});assert(document.querySelector('#error').textContent.includes('invalid'),'Invalid login not reported');await submit('#login',{email:'template-admin@example.test',password:'TemplateAdmin!2026'});assert(document.querySelector('#reports'),'Dashboard missing');document.querySelector('#account').click();assert(document.querySelector('#password-dialog').open,'Account dialog missing');document.querySelector('#close-password').click();assert(!document.querySelector('#password-dialog').open,'Account cancel failed');document.querySelector('#refresh').click();await pause();assert(document.querySelector('#operations').textContent.includes('healthy'),'Service status missing');return true;`,
  );
  run(session, "screenshot", "/tmp/msd-template-admin-dark.png");
  const nonce = Date.now();
  evaluate(
    session,
    `await submit('#agent',{name:'Recovery Test ${nonce}',email:'recovery-${nonce}@example.test',password:'RecoveryOriginal!2026',capacity:'3'});assert(document.querySelector('#agents').textContent.includes('Recovery Test ${nonce}'),'Agent create failed');document.querySelector('#issue-reset').closest('details').open=true;const option=[...document.querySelector('#reset-agent').options].find(o=>o.textContent.includes('Recovery Test ${nonce}'));await submit('#issue-reset',{userId:option.value,currentPassword:'TemplateAdmin!2026',reason:'Isolated UI recovery verification'});assert(document.querySelector('#reset-credential').textContent.includes('reset')||document.querySelector('#reset-credential input'),'Reset credential missing');document.querySelector('#reveal-reset').click();assert(document.querySelector('#reset-code').type==='text','Reset reveal failed');document.querySelector('#reveal-reset').click();assert(document.querySelector('#reset-code').type==='password','Reset hide failed');document.querySelector('#dismiss-reset').click();assert(!document.querySelector('#reset-code'),'Reset dismiss failed');return true;`,
  );
  evaluate(
    session,
    `document.querySelector('[data-review]').click();await pause();assert(document.querySelector('#status'),'Review missing');const f=document.querySelector('.faq-edit');if(f){await submit('.faq-edit',{question:f.elements.question.value,answer:f.elements.answer.value});assert(document.querySelector('.faq-edit'),'Central FAQ save failed');}await submit('#broadcast',{question:'UI check ${nonce}?',answer:'Verified centrally published guidance.',all:'on'});assert(!document.querySelector('#error').textContent,'Broadcast error');document.querySelector('[data-review]').click();await pause();assert([...document.querySelectorAll('.faq-edit [name=question]')].some(i=>i.value.includes('${nonce}')),'Broadcast FAQ missing');document.querySelector('#themeToggle').click();assert(document.body.classList.contains('msd-light'),'Admin theme failed');return true;`,
  );
  run(session, "screenshot", "/tmp/msd-template-admin-light.png");
  run(owner, "open", "http://localhost:4303/apps/dummy-site/admin.html");
  evaluate(
    owner,
    `assert(document.querySelector('.login-screen .field'),'Host login does not use template');await submit('#host-login',{password:'LocalSite!2026'});assert(document.querySelector('#settings'),'Host setup missing');const old=document.querySelector('#settings [name=title]').value;await submit('#settings',{title:'MSD Template Support'});assert(document.querySelector('#settings [name=title]').value==='MSD Template Support','Settings not persisted');await submit('#settings',{title:old});await submit('#faq',{question:'Temporary local FAQ ${nonce}?',answer:'Local FAQ edit/delete verification.'});const edit=[...document.querySelectorAll('[data-faq]')].find(f=>f.elements.question.value.includes('${nonce}'));assert(edit,'Local FAQ not created');edit.elements.answer.value='Updated local answer';edit.requestSubmit();await pause();const again=[...document.querySelectorAll('[data-faq]')].find(f=>f.elements.question.value.includes('${nonce}'));assert(again.elements.answer.value==='Updated local answer','Local FAQ save failed');again.querySelector('[data-delete]').click();await pause();assert(!document.querySelector('#setup').textContent.includes('Temporary local FAQ ${nonce}'),'Local FAQ delete failed');document.querySelector('#refresh').click();await pause();return true;`,
  );
  run(owner, "screenshot", "/tmp/msd-template-host-dark.png");
  evaluate(
    owner,
    `document.querySelector('#themeToggle').click();assert(document.body.classList.contains('msd-light'),'Host theme failed');document.querySelector('#host-logout').click();await pause();assert(document.querySelector('#host-login'),'Host logout failed');return true;`,
  );
  run(session, "click", "#logout");
  run(session, "wait", "#login");
  run(session, "open", "http://localhost:4303/apps/about/");
  evaluate(
    session,
    `assert(document.querySelector('.about-wrap .credits').textContent.includes('George Benson'),'About credits missing');assert(document.querySelectorAll('.about-card').length===6,'Original About cards missing');document.querySelector('#themeToggle').click();return true;`,
  );
  run(session, "screenshot", "/tmp/msd-template-about.png");
  for (const s of [session, owner]) {
    const errors = run(s, "errors");
    if (errors.trim()) throw Error(errors);
  }
  console.log(
    "PASS: original login structure, both themes, invalid/valid authentication, account dialog/cancel, refresh/reports, agent creation/reset issue, FAQ override/broadcast, host settings/local FAQ create/edit/delete, sign-outs, and original About cards/credits.",
  );
} finally {
  for (const s of [session, owner])
    try {
      run(s, "close");
    } catch {}
}
