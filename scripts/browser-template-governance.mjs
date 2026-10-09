// Exercise governance and account controls against the isolated local template fixture.
// Main fixture passwords remain unchanged; password mutations use a disposable agent.
import { execFileSync } from "node:child_process";

const apiOrigin = process.env.TEMPLATE_API || "http://localhost:4300";
const adminOrigin = process.env.TEMPLATE_ADMIN || "http://localhost:4301";
const agentOrigin = process.env.TEMPLATE_AGENT || "http://localhost:4302";
const siteOrigin = process.env.TEMPLATE_SITE || "http://localhost:4303";
for (const value of [apiOrigin, adminOrigin, agentOrigin, siteOrigin]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(value).hostname))
    throw Error("Use the isolated local template fixture.");
}
const suffix = Date.now();
const sessions = Object.fromEntries(
  ["admin", "host", "visitor", "old", "account"].map((kind) => [
    kind,
    `msd-template-governance-${suffix}-${kind}`,
  ]),
);
const administrator = {
  email: "template-admin@example.test",
  password: "TemplateAdmin!2026",
};
const account = {
  name: "Governance Browser Agent",
  email: `governance-${suffix}@example.test`,
  password: "GovernanceInitial!2026",
  capacity: 1,
};
const resetPassword = "GovernanceReset!2026",
  changedPassword = "GovernanceChanged!2026";
let adminToken,
  site,
  credentials,
  faqId,
  restored = false,
  reconnected = false;
const run = (session, ...args) => {
  try {
    const bin = process.env.AGENT_BROWSER_BIN;
    return execFileSync(
      bin ? process.execPath : "npx",
      bin
        ? [bin, "--session", session, ...args]
        : [
            "--offline",
            "--yes",
            "agent-browser",
            "--session",
            session,
            ...args,
          ],
      { encoding: "utf8", timeout: 45000 },
    );
  } catch (error) {
    // Never print execFileSync's message/arguments: eval can contain a test credential.
    throw Error(
      `Governance browser step failed (${args[0]}). ${String(error.stdout || "").slice(-1200)}`,
    );
  }
};
const evaluate = (kind, code) =>
  run(
    sessions[kind],
    "eval",
    `(async()=>{const $=s=>document.querySelector(s);const assert=(v,m)=>{if(!v)throw Error(m)};const pause=(ms=250)=>new Promise(r=>setTimeout(r,ms));const waitFor=async(fn,label)=>{for(let i=0;i<60;i++){if(fn())return;await pause();}throw Error('Timed out: '+label+'; '+($('#error')?.textContent||''));};const click=async(s)=>{await waitFor(()=>$(s),'Control '+s);$(s).click();await pause();};const submit=async(s,values)=>{const f=$(s);assert(f,'Missing '+s);for(const [k,v]of Object.entries(values))f.elements[k].value=v;f.requestSubmit();await pause();};${code}})()`,
  );
async function request(
  path,
  method = "GET",
  body,
  auth = adminToken,
  expected,
) {
  const response = await fetch(apiOrigin + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (expected !== undefined) {
    if (response.status !== expected)
      throw Error(`Unexpected API status for ${path}: ${response.status}`);
  } else if (!response.ok)
    throw Error(`Test API ${path}: ${response.status} ${data.error}`);
  return data;
}
function open(kind, url) {
  run(sessions[kind], "open", url);
  run(sessions[kind], "snapshot", "-i");
}
try {
  adminToken = (await request("/api/auth/login", "POST", administrator, null))
    .token;
  const widget = await (await fetch(siteOrigin + "/host-api/widget")).json();
  site = (await request("/api/admin/sites")).find(
    (item) => item.siteKey === widget.siteKey,
  );
  if (!site || site.status !== "approved")
    throw Error("The isolated host fixture must be installed and approved.");
  const dedicated = await request("/api/admin/agents", "POST", account);
  open("admin", adminOrigin + "/apps/admin/");
  evaluate(
    "admin",
    `await submit('#login',${JSON.stringify(administrator)});await waitFor(()=>$('#sites'),'Administrator login');await click('[data-review="${site.id}"]');await waitFor(()=>$('#status'),'Site review');return true;`,
  );
  open("host", siteOrigin + "/apps/dummy-site/admin.html");
  evaluate(
    "host",
    `await submit('#host-login',{password:'LocalSite!2026'});await waitFor(()=>$('#faq'),'Host login');return true;`,
  );
  open("visitor", siteOrigin + "/apps/dummy-site/");
  evaluate(
    "visitor",
    `await waitFor(()=>document.querySelector('chat-msd-widget'),'Widget');await document.querySelector('chat-msd-widget').sync();assert(document.querySelector('chat-msd-widget').style.display!=='none','Approved widget hidden');return true;`,
  );
  evaluate(
    "admin",
    `await submit('#status',{status:'suspended',reason:''});await waitFor(()=>$('#error').textContent,'Required suspension reason');assert($('#status').elements.status.value==='suspended','Invalid decision changed state');await submit('#status',{status:'suspended',reason:'Template browser governance verification'});await waitFor(()=>$('#status').elements.status.value==='approved','Suspended decision saved');assert(!$('#error').textContent,'Successful suspension retained validation error');return true;`,
  );
  evaluate(
    "visitor",
    `const w=document.querySelector('chat-msd-widget');await w.sync();assert(w.style.display==='none','Suspension did not hide widget');return true;`,
  );
  evaluate(
    "admin",
    `await submit('#status',{status:'approved',reason:''});await waitFor(()=>$('#status').elements.status.value==='suspended','Approval restored');return true;`,
  );
  restored = true;
  evaluate(
    "visitor",
    `const w=document.querySelector('chat-msd-widget');await w.sync();assert(w.style.display!=='none','Restored widget hidden');return true;`,
  );
  run(sessions.visitor, "close");
  console.log(
    "Suspension requires a reason, hides the live widget, and restoration returns approved support.",
  );

  evaluate(
    "admin",
    `$('#rotate').closest('details').open=true;await submit('#rotate',{reason:'   '});await waitFor(()=>$('#error').textContent,'Rotation reason guard');assert(!$('#recovered-token'),'Blank reason rotated credentials');await submit('#rotate',{reason:'Template browser reconnect verification'});await waitFor(()=>$('#recovered-token')?.value,'Replacement credential');assert(!$('#error').textContent,'Successful rotation retained validation error');assert($('#recovered-token').type==='password','Credential initially visible');await click('#reveal-token');assert($('#recovered-token').type==='text','Reveal credential');await click('#reveal-token');assert($('#recovered-token').type==='password','Hide credential');return true;`,
  );
  credentials = JSON.parse(
    evaluate(
      "admin",
      `return {siteKey:$('#recovered-key').value,installToken:$('#recovered-token').value};`,
    ),
  );
  evaluate(
    "host",
    `await click('#refresh');await waitFor(()=>$('#retry'),'Revoked installation credential not rejected');$('#reconnect').closest('details').open=true;await submit('#reconnect',{siteKey:${JSON.stringify(site.siteKey)},installToken:'invalid-test-installation-credential'});await waitFor(()=>$('#error').textContent.includes('invalid_install_token'),'Wrong reconnect credential');await submit('#reconnect',${JSON.stringify(credentials)});await waitFor(()=>$('#faq'),'Host reconnect');assert($('#reconnect').elements.installToken.value==='','Reconnected credential left in form');assert(!$('#error').textContent,'Successful reconnect retained error');return true;`,
  );
  reconnected = true;
  run(sessions.host, "reload");
  evaluate(
    "host",
    `await waitFor(()=>$('#faq'),'Private credential persistence after reload');assert($('#reconnect').elements.installToken.value==='','Credential displayed after reload');assert(![...Object.keys(localStorage),...Object.keys(sessionStorage)].some(key=>String(localStorage.getItem(key)||sessionStorage.getItem(key)).includes(${JSON.stringify(credentials.installToken)})),'Credential stored in browser');return true;`,
  );
  evaluate(
    "admin",
    `await click('#dismiss-token');assert(!$('#recovered-token'),'Credential dismiss');return true;`,
  );
  console.log(
    "Credential rotation reason guard, reveal/hide/dismiss, invalid reconnect, private reconnect and reload persistence passed.",
  );

  const question = `Governance delete FAQ ${suffix}`;
  await request("/api/admin/faqs/broadcast", "POST", {
    question,
    answer: "Disposable FAQ for the central Delete button.",
    siteIds: [site.id],
  });
  faqId = (await request(`/api/sites/${site.siteKey}/faqs`)).find(
    (faq) => faq.question === question,
  ).id;
  evaluate(
    "admin",
    `await click('#refresh');await click('[data-review="${site.id}"]');await waitFor(()=>$('[data-delete="${faqId}"]'),'Disposable FAQ');await click('[data-delete="${faqId}"]');await waitFor(()=>!$('[data-delete="${faqId}"]'),'Central FAQ delete');return true;`,
  );
  if (
    (await request(`/api/sites/${site.siteKey}/faqs`)).some(
      (faq) => faq.id === faqId,
    )
  )
    throw Error("Deleted FAQ remains published");
  faqId = null;
  const pending = await request(
    "/api/sites/register",
    "POST",
    {
      name: `Governance pending ${suffix}`,
      url: `https://governance-${suffix}.test`,
    },
    null,
  );
  const pendingSite = (await request("/api/admin/sites")).find(
    (item) => item.siteKey === pending.siteKey,
  );
  evaluate(
    "admin",
    `await click('#refresh');await click('[data-review="${pendingSite.id}"]');await waitFor(()=>$('#status'),'Pending review');await submit('#status',{status:'declined',reason:''});await waitFor(()=>$('#error').textContent,'Decline reason guard');await submit('#status',{status:'declined',reason:'Template review asks for updated content'});await waitFor(()=>$('#status').elements.status.options.length===1,'Declined decision');return true;`,
  );
  await request(
    `/api/sites/${pending.siteKey}/resubmit`,
    "POST",
    { installToken: pending.installToken },
    null,
  );
  evaluate(
    "admin",
    `await click('#refresh');await click('[data-review="${pendingSite.id}"]');await waitFor(()=>$('#status').elements.status.options.length===2,'Resubmitted pending status');await submit('#status',{status:'approved',reason:''});await waitFor(()=>$('#status').elements.status.value==='suspended','New approval');return true;`,
  );
  console.log(
    "Central FAQ deletion and decline/review/approve controls passed; a separate registration resubmitted through its scoped API.",
  );

  open("old", agentOrigin + "/apps/agent/");
  evaluate(
    "old",
    `await submit('#login',${JSON.stringify({ email: account.email, password: account.password })});await waitFor(()=>$('#agentShell'),'Disposable agent login');return true;`,
  );
  const initialToken = JSON.parse(
    evaluate("old", `return sessionStorage.getItem('msd-token');`),
  );
  evaluate(
    "admin",
    `await click('#refresh');$('#issue-reset').closest('details').open=true;await submit('#issue-reset',{userId:${JSON.stringify(dedicated.id)},currentPassword:'WrongAdministrator!2026',reason:'Template account recovery verification'});await waitFor(()=>$('#error').textContent.includes('invalid_current_password'),'Reset administrator reauthentication');assert(!$('#reset-code'),'Invalid administrator issued reset');await submit('#issue-reset',{userId:${JSON.stringify(dedicated.id)},currentPassword:${JSON.stringify(administrator.password)},reason:'Template account recovery verification'});await waitFor(()=>$('#reset-code')?.value,'One-time reset');assert($('#issue-reset').elements.currentPassword.value==='','Administrator password left in reset form');assert($('#reset-code').type==='password','Reset code visible initially');await click('#reveal-reset');assert($('#reset-code').type==='text','Reveal reset code');await click('#reveal-reset');assert($('#reset-code').type==='password','Hide reset code');return true;`,
  );
  const resetToken = JSON.parse(
    evaluate("admin", `return $('#reset-code').value;`),
  );
  open("account", agentOrigin + "/apps/agent/");
  evaluate(
    "account",
    `$('#password-reset').closest('details').open=true;await submit('#password-reset',${JSON.stringify({ email: account.email, resetToken, newPassword: resetPassword, confirmPassword: "DifferentConfirm!2026" })});await waitFor(()=>$('#error').textContent.includes('Passwords do not match'),'Reset confirmation guard');await submit('#password-reset',${JSON.stringify({ email: account.email, resetToken, newPassword: resetPassword, confirmPassword: resetPassword })});await waitFor(()=>$('#reset-status').textContent.includes('Password reset'),'Reset redemption');assert($('#password-reset').elements.resetToken.value==='','Reset code retained after success');return true;`,
  );
  evaluate(
    "old",
    `await waitFor(()=>$('#login'),'Old agent session revoked');assert(!sessionStorage.getItem('msd-token'),'Old token remains in browser');return true;`,
  );
  await request(
    "/api/agent/conversations",
    "GET",
    undefined,
    initialToken,
    401,
  );
  evaluate(
    "admin",
    `await click('#dismiss-reset');assert(!$('#reset-code'),'Dismiss reset code');return true;`,
  );
  evaluate(
    "account",
    `await submit('#login',${JSON.stringify({ email: account.email, password: resetPassword })});await waitFor(()=>$('#agentShell'),'Login with reset password');await click('#account');assert($('#password-dialog').open,'Open change password');await click('#close-password');assert(!$('#password-dialog').open,'Cancel change password');await click('#account');await submit('#password-change',${JSON.stringify({ currentPassword: "WrongCurrent!2026", newPassword: changedPassword, confirmPassword: changedPassword })});await waitFor(()=>$('#password-error').textContent.includes('invalid_current_password'),'Current password guard');return true;`,
  );
  const beforeChangeToken = JSON.parse(
    evaluate("account", `return sessionStorage.getItem('msd-token');`),
  );
  evaluate(
    "account",
    `const f=$('#password-change');for(const [k,v]of Object.entries(${JSON.stringify({ currentPassword: resetPassword, newPassword: changedPassword, confirmPassword: changedPassword })}))f.elements[k].value=v;f.requestSubmit();return true;`,
  );
  run(sessions.account, "wait", "#login");
  evaluate(
    "account",
    `assert(!sessionStorage.getItem('msd-token'),'Changed-password token retained');return true;`,
  );
  await request(
    "/api/agent/conversations",
    "GET",
    undefined,
    beforeChangeToken,
    401,
  );
  evaluate(
    "account",
    `await submit('#login',${JSON.stringify({ email: account.email, password: resetPassword })});await waitFor(()=>$('#error').textContent.includes('invalid_credentials'),'Previous password still accepted');await submit('#login',${JSON.stringify({ email: account.email, password: changedPassword })});await waitFor(()=>$('#agentShell'),'Login with changed password');return true;`,
  );
  run(sessions.account, "click", "#logout");
  run(sessions.account, "wait", "#login");
  evaluate(
    "account",
    `$('#password-reset').closest('details').open=true;await submit('#password-reset',${JSON.stringify({ email: account.email, resetToken, newPassword: resetPassword, confirmPassword: resetPassword })});await waitFor(()=>$('#error').textContent.includes('invalid_or_expired_reset'),'Reset code reuse rejection');return true;`,
  );
  console.log(
    "Disposable-agent reset issue/reveal/hide/dismiss, mismatch guards, redemption, live old-session revocation, password change/cancel, old-password rejection and logout passed.",
  );

  evaluate(
    "host",
    `await click('#host-logout');await waitFor(()=>$('#host-login'),'Host logout');return true;`,
  );
  run(sessions.admin, "click", "#logout");
  run(sessions.admin, "wait", "#login");
  evaluate(
    "admin",
    `$('#bootstrap').closest('details').open=true;await submit('#bootstrap',{name:'Duplicate Administrator',email:'duplicate@example.test',password:'DuplicateAdmin!2026',bootstrapSecret:''});await waitFor(()=>$('#error').textContent.includes('central_admin_exists'),'Existing administrator bootstrap guard');return true;`,
  );
  for (const kind of ["admin", "host", "old", "account"]) {
    const errors = run(sessions[kind], "errors");
    if (errors.trim())
      throw Error(`Unexpected browser errors in ${kind}: ${errors}`);
  }
  console.log(
    "Host/admin logout and existing-administrator bootstrap protection passed. No browser errors. Template governance verification passed.",
  );
} finally {
  if (site && !restored) {
    try {
      await request(`/api/admin/sites/${site.id}/status`, "PATCH", {
        status: "approved",
      });
    } catch {}
  }
  if (credentials && !reconnected) {
    try {
      evaluate(
        "host",
        `const f=$('#reconnect');if(f){f.closest('details').open=true;await submit('#reconnect',${JSON.stringify(credentials)});await waitFor(()=>$('#faq'),'Restore host connection');}return true;`,
      );
    } catch {}
  }
  if (faqId) {
    try {
      await request(`/api/admin/faqs/${faqId}`, "DELETE");
    } catch {}
  }
  for (const session of Object.values(sessions)) {
    try {
      run(session, "close");
    } catch {}
  }
}
