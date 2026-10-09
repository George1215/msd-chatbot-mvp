import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
const admin = "msd-password-admin",
  agent = "msd-password-agent",
  reset = "msd-password-reset";
const email = `recovery-check-${Date.now()}@msd.local`;
const original = "RecoveryOriginal!2026",
  replacement = "RecoveryReplacement!2026",
  changed = "RecoveryChanged!2026";
const sockets = [];
function run(session, ...args) {
  try {
    return execFileSync(
      "npx",
      ["--yes", "agent-browser", "--session", session, ...args],
      { encoding: "utf8", timeout: 45000 },
    );
  } catch {
    throw Error(
      "Browser password step failed. Sensitive command arguments suppressed.",
    );
  }
}
const evaluate = (session, code) =>
  run(
    session,
    "eval",
    `(async()=>{const pause=()=>new Promise(r=>setTimeout(r,1200));const submit=async(sel,values)=>{const f=document.querySelector(sel);if(!f)throw Error('Missing form '+sel);for(const [k,v]of Object.entries(values))f.elements[k].value=v;f.requestSubmit();await pause();};${code}})()`,
  );
const event = (socket, name) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(Error(`Socket ${name} timed out`)),
      10000,
    );
    socket.once(name, (value) => {
      clearTimeout(t);
      resolve(value);
    });
  });
try {
  run(admin, "open", "http://localhost:4301/apps/admin/");
  evaluate(
    admin,
    `await pause();if(!document.body.textContent.trim()||document.querySelector('vite-error-overlay'))throw Error('Page failed verification');if(document.querySelector('#login'))await submit('#login',{email:'admin@msd.local',password:'LocalDemo!2026'});await submit('#agent',{name:'Password recovery verification',email:${JSON.stringify(email)},password:${JSON.stringify(original)},capacity:'1'});if(document.querySelector('#error').textContent)throw Error('Agent creation failed');return true;`,
  );
  run(agent, "open", "http://localhost:4302/apps/agent/");
  evaluate(
    agent,
    `await pause();await submit('#login',{email:${JSON.stringify(email)},password:${JSON.stringify(original)}});if(!document.querySelector('#logout'))throw Error('Agent login failed');return true;`,
  );
  const oldToken = JSON.parse(
    evaluate(agent, `return sessionStorage.getItem('msd-token');`),
  );
  const live = io("http://localhost:4300", {
    auth: { token: oldToken },
    forceNew: true,
    reconnection: false,
  });
  sockets.push(live);
  await event(live, "connect");
  console.log(
    "Admin and agent screens loaded; dedicated test agent signed in.",
  );
  evaluate(
    admin,
    `const f=document.querySelector('#issue-reset');f.closest('details').open=true;const option=[...f.elements.userId.options].find(o=>o.textContent.includes(${JSON.stringify(email)}));await submit('#issue-reset',{userId:option.value,currentPassword:'LocalDemo!2026',reason:'Verified local browser test account'});if(!document.querySelector('#reset-code')?.value)throw Error('Reset code not issued');return true;`,
  );
  const resetToken = JSON.parse(
    evaluate(admin, `return document.querySelector('#reset-code').value;`),
  );
  const disconnected = event(live, "disconnect");
  run(reset, "open", "http://localhost:4302/apps/agent/");
  evaluate(
    reset,
    `await pause();document.querySelector('#password-reset').closest('details').open=true;await submit('#password-reset',{email:${JSON.stringify(email)},resetToken:${JSON.stringify(resetToken)},newPassword:${JSON.stringify(replacement)},confirmPassword:${JSON.stringify(replacement)}});if(!document.querySelector('#reset-status').textContent.includes('Password reset'))throw Error('Reset failed');if(document.querySelector('#password-reset input[name=resetToken]').value)throw Error('Reset code retained');return true;`,
  );
  assert.equal(await disconnected, "io server disconnect");
  evaluate(
    agent,
    `await pause();if(!document.querySelector('#login'))throw Error('Old browser session not signed out');return true;`,
  );
  const denied = await fetch("http://localhost:4300/api/agents", {
    headers: { authorization: `Bearer ${oldToken}` },
  });
  assert.equal(denied.status, 401);
  const revoked = io("http://localhost:4300", {
    auth: { token: oldToken },
    forceNew: true,
    reconnection: false,
  });
  sockets.push(revoked);
  await event(revoked, "connect_error");
  console.log(
    "Reset succeeded; old browser, HTTP token and live socket access were revoked.",
  );
  evaluate(
    agent,
    `await submit('#login',{email:${JSON.stringify(email)},password:${JSON.stringify(replacement)}});document.querySelector('#account').click();const f=document.querySelector('#password-change');f.elements.currentPassword.value=${JSON.stringify(replacement)};f.elements.newPassword.value=${JSON.stringify(changed)};f.elements.confirmPassword.value=${JSON.stringify(changed)};f.requestSubmit();return true;`,
  );
  evaluate(
    agent,
    `await pause();if(!document.querySelector('#login'))throw Error('Password change did not sign out');await submit('#login',{email:${JSON.stringify(email)},password:${JSON.stringify(changed)}});if(!document.querySelector('#logout'))throw Error('Changed password login failed');return true;`,
  );
  evaluate(
    admin,
    `document.querySelector('#dismiss-reset').click();if(document.querySelector('#reset-code'))throw Error('Reset code not dismissed');return true;`,
  );
  run(agent, "screenshot", "/tmp/msd-password-agent.png");
  console.log(
    "Self-service password change and new-password sign-in passed. Reset codes were cleared/dismissed.",
  );
  console.log("Browser password recovery and session revocation passed.");
} finally {
  sockets.forEach((s) => s.disconnect());
  for (const session of [admin, agent, reset]) {
    try {
      run(session, "close");
    } catch {}
  }
}
