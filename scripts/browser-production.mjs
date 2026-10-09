import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const dir = path.resolve(
  process.env.SIMULATION_DIR || ".test-artifacts/production",
);
const config = JSON.parse(fs.readFileSync(path.join(dir, "config.json")));
const session = "msd-production-browser";
function invoke(args, input) {
  try {
    const bin = process.env.AGENT_BROWSER_CLI;
    return execFileSync(
      bin ? process.execPath : "npx",
      bin
        ? [bin, "--session", session, ...args]
        : ["--yes", "agent-browser", "--session", session, ...args],
      { input, encoding: "utf8", timeout: 45000, maxBuffer: 2e6 },
    );
  } catch {
    throw Error(
      `Browser command failed: ${args[0]}${args[0] === "wait" ? " " + args[1] : ""}`,
    );
  }
}
function browser(...args) {
  return invoke(args);
}
const evalJS = (source) => invoke(["eval", "--stdin"], source);
try {
  browser(
    "--ignore-https-errors",
    "open",
    "https://localhost:4443/apps/admin/",
  );
  evalJS(
    `document.querySelector('#login [name=email]').value='simulation-admin@example.test'; document.querySelector('#login [name=password]').value=${JSON.stringify(config.adminPassword)}; document.querySelector('#login').requestSubmit(); 'Submitted';`,
  );
  browser("wait", "#reports");
  evalJS(
    `(() => { if (!document.querySelector('#reports').innerText.includes('conversations')) throw Error('Missing report'); const link = document.querySelector('a[href="/apps/agent/"]'); if (!link) throw Error('Wrong production navigation'); return 'Admin reports and same-origin navigation verified'; })()`,
  );
  browser("screenshot", path.join(dir, "admin.png"));
  let errors = browser("errors");
  if (errors.trim()) throw Error(errors);
  browser("open", "https://localhost:4443/apps/dummy-site/admin.html");
  const snapshot = browser("snapshot", "-i");
  // The protected page exposes one password field before login.
  evalJS(
    `document.querySelector('input[type=password]').value=${JSON.stringify(config.hostPassword)}; document.querySelector('form').requestSubmit(); 'Submitted';`,
  );
  browser("wait", "#host-logout");
  evalJS(
    `(() => { if (document.cookie.includes('msd-host-session')) throw Error('Host cookie exposed'); if (sessionStorage.getItem('msd-local-install')) throw Error('Legacy credential storage'); return 'HttpOnly host session verified'; })()`,
  );
  browser("screenshot", path.join(dir, "host.png"));
  errors = browser("errors");
  if (errors.trim()) throw Error(errors);
  browser("open", "https://localhost:4443/apps/dummy-site/");
  evalJS(
    '(async () => { for (let i=0; i<50 && !document.querySelector("chat-msd-widget"); i++) await new Promise(r => setTimeout(r,100)); if (!document.querySelector("chat-msd-widget")) throw Error("Widget not mounted"); return true; })()',
  );
  evalJS(
    `(async () => { const w=document.querySelector('chat-msd-widget'); await w.sync(); if (getComputedStyle(w).display === 'none') throw Error('Widget hidden'); return 'Approved HTTPS widget verified'; })()`,
  );
  browser("screenshot", path.join(dir, "public.png"));
  errors = browser("errors");
  if (errors.trim()) throw Error(errors);
  console.log(
    "PASS: production browser admin login/report/navigation, protected host login, HttpOnly session, public widget, and no browser errors.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    browser("close");
  } catch {}
}
