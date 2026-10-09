import { execFileSync } from "node:child_process";
const admin = "msd-recovery-admin",
  site = "msd-recovery-site";
const run = (session, ...args) => {
  try {
    return execFileSync(
      "npx",
      ["--yes", "agent-browser", "--session", session, ...args],
      { encoding: "utf8", timeout: 45000 },
    );
  } catch {
    throw Error(
      "Browser recovery step failed; inspect the verification browser. Credential-bearing arguments were suppressed.",
    );
  }
};
const evaluate = (session, code) =>
  run(
    session,
    "eval",
    `(async()=>{const pause=()=>new Promise(r=>setTimeout(r,1000));${code}})()`,
  );
try {
  run(admin, "open", "http://localhost:4301/apps/admin/");
  evaluate(
    admin,
    `await pause();const f=document.querySelector('#login');if(f){f.elements.email.value='admin@msd.local';f.elements.password.value='LocalDemo!2026';f.requestSubmit();await pause();}document.querySelector('[data-review]').click();await pause();const details=document.querySelector('#rotate').closest('details');details.open=true;const r=document.querySelector('#rotate');r.elements.reason.value='Browser verification: recover a lost installation session';r.requestSubmit();await pause();if(!document.querySelector('#recovered-token')?.value)throw Error('Missing replacement credential');return true;`,
  );
  const raw = evaluate(
    admin,
    `return {siteKey:document.querySelector('#recovered-key').value,installToken:document.querySelector('#recovered-token').value};`,
  );
  const credentials = JSON.parse(raw);
  console.log("Administrator generated a replacement credential.");
  run(site, "open", "http://localhost:4303/apps/dummy-site/admin.html");
  evaluate(
    site,
    `await pause();const login=document.querySelector('#host-login');if(login){login.elements.password.value='LocalSite!2026';login.requestSubmit();await pause();}const f=document.querySelector('#reconnect');f.closest('details').open=true;const credentials=${JSON.stringify(credentials)};f.elements.siteKey.value=credentials.siteKey;f.elements.installToken.value=credentials.installToken;f.requestSubmit();await pause();if(!document.querySelector('#faq'))throw Error('Setup not restored');if(document.querySelector('#error').textContent)throw Error('Unexpected setup error');return true;`,
  );
  console.log(
    "Authenticated host session reconnected; the credential is persisted server-side.",
  );
  run(site, "reload");
  evaluate(
    site,
    `await pause();if(!document.querySelector('#faq'))throw Error('Reload lost setup access');if(document.querySelector('#reconnect input[name=installToken]').value)throw Error('Credential left in form');return true;`,
  );
  evaluate(
    admin,
    `document.querySelector('#dismiss-token').click();if(document.querySelector('#recovered-token'))throw Error('Credential not dismissed');return true;`,
  );
  run(site, "screenshot", "/tmp/msd-recovery-site.png");
  console.log(
    "Reload retains recovered setup; credential fields clear and the admin can dismiss the one-time credential.",
  );
  console.log("Browser installation recovery passed.");
} finally {
  for (const session of [admin, site]) {
    try {
      run(session, "close");
    } catch {}
  }
}
