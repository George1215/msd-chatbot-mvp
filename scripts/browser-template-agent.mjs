// Run against the isolated template fixture on ports 4300–4304; all mutations use test accounts.
// Override AGENT_BROWSER_BIN with a cached CLI path, or use the installed/npx CLI.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const apiOrigin = process.env.TEMPLATE_API || "http://localhost:4300";
const agentOrigin = process.env.TEMPLATE_AGENT || "http://localhost:4302";
const siteOrigin = process.env.TEMPLATE_SITE || "http://localhost:4303";
for (const value of [apiOrigin, agentOrigin, siteOrigin]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(value).hostname))
    throw Error("Use an isolated local test stack.");
}
const suffix = Date.now(),
  session = `msd-template-agent-${suffix}`,
  second = `${session}-transfer`;
const temp = mkdtempSync(join(tmpdir(), "msd-agent-fixtures-"));
const password = "TemplateAgent!2026";
const created = [];
let adminToken, initialAvailability, mainUser, longFaqId;
const run = (which, ...args) => {
  try {
    const bin = process.env.AGENT_BROWSER_BIN;
    return execFileSync(
      bin ? process.execPath : "npx",
      bin
        ? [bin, "--session", which, ...args]
        : ["--yes", "agent-browser", "--session", which, ...args],
      { encoding: "utf8", timeout: 45000 },
    );
  } catch (error) {
    const detail = String(error.stdout || "").slice(-1500);
    throw Error(`Agent template browser step failed (${args[0]}). ${detail}`);
  }
};
const evaluate = (code, which = session) =>
  run(
    which,
    "eval",
    `(async()=>{const $=s=>document.querySelector(s);const assert=(v,m)=>{if(!v)throw Error(m)};const pause=(ms=250)=>new Promise(r=>setTimeout(r,ms));const waitFor=async(fn,label)=>{for(let i=0;i<48;i++){if(fn())return;await pause();}throw Error('Timed out: '+label+'; '+($('#error')?.textContent||''));};const click=async(s)=>{assert($(s),'Missing '+s);$(s).click();await pause();};const submit=async(s,values)=>{const f=$(s);assert(f,'Missing '+s);for(const [k,v]of Object.entries(values))f.elements[k].value=v;f.requestSubmit();await pause();};${code}})()`,
  );
async function request(path, method = "GET", body, auth = adminToken) {
  const response = await fetch(apiOrigin + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok)
    throw Error(`Test API ${method} ${path}: ${response.status} ${json.error}`);
  return json;
}
async function createConversation(siteKey, label) {
  const result = await request(
    "/api/conversations",
    "POST",
    {
      siteKey,
      visitorName: `Agent browser ${label}`,
      text: `Template regression ${label} ${suffix}`,
      requestKey: crypto.randomUUID(),
    },
    null,
  );
  created.push(result.conversationId);
  return result;
}
function selected(id) {
  return `[data-conversation="${id}"]`;
}
function waveform() {
  const pcm = Buffer.alloc(800),
    head = Buffer.alloc(44);
  head.write("RIFF");
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(8000, 24);
  head.writeUInt32LE(8000, 28);
  head.writeUInt16LE(1, 32);
  head.writeUInt16LE(8, 34);
  head.write("data", 36);
  head.writeUInt32LE(pcm.length, 40);
  pcm.fill(128);
  return Buffer.concat([head, pcm]);
}
try {
  const login = await request(
    "/api/auth/login",
    "POST",
    { email: "template-admin@example.test", password: "TemplateAdmin!2026" },
    null,
  );
  adminToken = login.token;
  const people = await request("/api/agents");
  mainUser = people.find((u) => u.email === "template-agent@example.test");
  const receiver = people.find(
    (u) => u.email === "transfer-agent@example.test",
  );
  if (!mainUser || !receiver)
    throw Error(
      "Create the isolated template agent fixtures before this check.",
    );
  initialAvailability = mainUser.available;
  const mainLogin = await request(
    "/api/auth/login",
    "POST",
    { email: mainUser.email, password },
    null,
  );
  await request(
    "/api/agent/availability",
    "PATCH",
    { available: true },
    mainLogin.token,
  );
  const receiverLogin = await request(
    "/api/auth/login",
    "POST",
    { email: receiver.email, password },
    null,
  );
  await request(
    "/api/agent/availability",
    "PATCH",
    { available: true },
    receiverLogin.token,
  );
  const widget = await (await fetch(siteOrigin + "/host-api/widget")).json();
  if (!widget.siteKey)
    throw Error("The isolated site must be installed and approved.");
  const main = await createConversation(widget.siteKey, "main");
  const future = await createConversation(widget.siteKey, "capacity");
  run(session, "open", agentOrigin + "/apps/agent/");
  run(session, "snapshot", "-i");
  evaluate(
    `await submit('#login',{email:'template-agent@example.test',password:${JSON.stringify(password)}});await waitFor(()=>$('#agentShell'),'Agent login');assert(!document.querySelector('vite-error-overlay'),'Vite error');assert($('.agent-sidebar')&&$('.agent-main')&&$('.inbox-search')&&$('.inbox-tabs'),'Original shell');assert(document.querySelectorAll('[data-filter]').length===4,'Four original tabs');return true;`,
  );
  run(session, "set", "viewport", "1440", "1000");
  evaluate(
    `$('#ticketSearch').value='${suffix}';$('#ticketSearch').dispatchEvent(new Event('input'));assert(document.querySelectorAll('[data-conversation]').length===2,'Search by message');await click('[data-filter=new]');assert(document.querySelectorAll('[data-conversation]').length===2,'New filter');await click(${JSON.stringify(selected(main.conversationId))});assert($('#replyLocked')&&!$('#reply'),'Unclaimed reply guard');assert(!$('#claim').disabled,'Accept enabled');$('#availability').value='false';$('#availability').dispatchEvent(new Event('change'));await waitFor(()=>$('#claim').disabled,'Away claim guard');$('#availability').value='true';$('#availability').dispatchEvent(new Event('change'));await waitFor(()=>!$('#claim').disabled,'Available claim');await click('#claim');await waitFor(()=>$('#reply'),'Claim composer');await click('[data-filter=active]');assert(document.querySelectorAll('[data-conversation]').length===1,'Active filter');await click('[data-filter=all]');assert($('#infoPanel').textContent.includes('Customer Details')&&$('#infoPanel').textContent.includes('Transfer History')&&$('#infoPanel').textContent.includes('Ticket Timeline'),'Original context sections');await submit('#reply',{text:'Agent template main reply'});await waitFor(()=>$('#agentChatBody').textContent.includes('Agent template main reply'),'Reply sent');return true;`,
  );
  console.log(
    "Original inbox, search and four tabs, real accept/reply, availability and unclaimed-reply guards passed.",
  );
  evaluate(
    `await click('#agentToolButton');assert(document.querySelectorAll('[data-tool]').length===8,'Eight original tools');await click('[data-tool=greetings]');await click('[data-quick=greeting]');await waitFor(()=>$('#agentChatBody').textContent.includes('thank you for contacting MSD support'),'Greeting');await click('#agentToolButton');await click('[data-tool=quickText]');await click('[data-quick=text]');await waitFor(()=>$('#agentChatBody').textContent.includes('Could you share a little more detail'),'Quick text');await click('#agentToolButton');await click('[data-tool=faq]');await waitFor(()=>document.querySelectorAll('[data-faq]').length>=2,'Site FAQs');const answer=$('[data-faq] small').textContent;await click('[data-faq]');await waitFor(()=>$('#agentChatBody').textContent.includes(answer),'FAQ sent');await click('#agentToolButton');await click('[data-tool=link]');$('#linkTitle').value='MSD information';$('#linkUrl').value='javascript:alert(1)';await click('#sendLink');assert($('#error').textContent.includes('HTTP'),'Unsafe link rejected');$('#linkUrl').value='https://www.msd.go.tz/';await click('#sendLink');await waitFor(()=>$('#agentChatBody a[href="https://www.msd.go.tz/"]'),'Real safe link');$('#agentReplyInput').value='Retained composer draft';$('#agentReplyInput').dispatchEvent(new Event('input'));await click('#agentToolButton');await click('[data-tool=link]');$('#linkTitle').value='Retained link title';$('#linkUrl').value='https://example.com/test';$('#linkUrl').dispatchEvent(new Event('input'));await pause(5600);assert($('#agentReplyInput').value==='Retained composer draft'&&$('#agentToolMenu').classList.contains('open')&&$('#linkTitle').value==='Retained link title'&&$('#ticketSearch').value==='${suffix}','Polling erased working state');await click(${JSON.stringify(selected(future.conversationId))});await click(${JSON.stringify(selected(main.conversationId))});assert($('#agentReplyInput').value==='Retained composer draft'&&$('#linkTitle').value==='Retained link title','Switching erased draft');$('#agentReplyInput').value='';$('#agentReplyInput').dispatchEvent(new Event('input'));return true;`,
  );
  console.log(
    "Greeting, Text, FAQ and validated Link tools passed; polling and conversation switching preserve drafts, menu and search.",
  );
  const site = (await request("/api/admin/sites")).find(
    (item) => item.siteKey === widget.siteKey,
  );
  const longQuestion = `Full FAQ answer ${suffix}`,
    longAnswer = "A".repeat(5000);
  await request("/api/admin/faqs/broadcast", "POST", {
    siteIds: [site.id],
    question: longQuestion,
    answer: longAnswer,
  });
  longFaqId = (await request(`/api/sites/${widget.siteKey}/faqs`)).find(
    (item) => item.question === longQuestion,
  ).id;
  evaluate(
    `if(!$('#agentToolMenu').classList.contains('open'))await click('#agentToolButton');await click('[data-tool=faq]');await waitFor(()=>[...document.querySelectorAll('[data-faq]')].some(n=>n.querySelector('b').textContent===${JSON.stringify(longQuestion)}),'Long FAQ available');[...document.querySelectorAll('[data-faq]')].find(n=>n.querySelector('b').textContent===${JSON.stringify(longQuestion)}).click();await waitFor(()=>$('#agentChatBody').textContent.includes('A'.repeat(5000)),'Untruncated 5000-character FAQ');return true;`,
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFRkAAAAASUVORK5CYII=",
    "base64",
  );
  const video = Buffer.from(
    "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIkEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEyTbuMU6uEHFO7a1OsggIO7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDFEiYhAf0AAAAAAABZUrmvXrgEAAAAAAABO14EBc8WIp6+mYEHcW1icgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QO5rKA4JCwgRC6gRCagQJVsIRVuYEBVe6BAOwBAAAAAAAAAgAAElTDZ/pzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYzLjEuMTAxc3PVY8CLY8WIp6+mYEHcW1hnyKBFo4dFTkNPREVSRIeTTGF2YzYzLjEuMTAxIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuNTAwMDAwMDAwAB9DtnXY54EAo7yBAACAsAIAnQEqEAAQAABHCIWFiIWEiAICAnWqA/gCDP0oAP7/TRL//FhX8WFfxYV/8WFf/PzO7cX85gCjlYEA+gCxAQAFEKwAGAAYWC/0AAgAABxTu2uRu4+zgQC3iveBAfGCAbHwgQM=",
    "base64",
  );
  const files = [
    [
      "file",
      "agent-document.txt",
      Buffer.from("Agent template document contents"),
    ],
    ["image", "agent-image.png", png],
    ["video", "agent-video.webm", video],
    ["voice", "agent-voice.wav", waveform()],
  ];
  for (const [kind, name, data] of files) {
    const path = join(temp, name);
    writeFileSync(path, data);
    evaluate(
      `if(!$('#agentToolMenu').classList.contains('open'))await click('#agentToolButton');await click('[data-tool=${kind}]');assert($('#attachmentInput').accept,'File type selection');return true;`,
    );
    run(session, "upload", "#attachmentInput", path);
    evaluate(
      `await waitFor(()=>$('#agentChatBody').textContent.includes(${JSON.stringify(name)}),'${kind} upload');return true;`,
    );
    const conversation = await request(
      `/api/conversations/${main.conversationId}`,
    );
    const attachment = conversation.messages.find(
      (m) => m.attachment?.name === name,
    )?.attachment;
    if (!attachment) throw Error(`${kind} was not persisted`);
    const control = `[data-attachment="${attachment.id}"]`;
    if (kind === "image" || kind === "video")
      evaluate(
        `await waitFor(()=>${kind === "image" ? "$('#agentChatBody .attachment-image img')?.naturalWidth>0" : "Number.isFinite($('#agentChatBody .attachment-video video')?.duration)"},'Original inline ${kind} preview');assert(Math.round($('#agentChatBody .attachment-${kind}').getBoundingClientRect().height)===150,'Original preview height');return true;`,
      );
    if (kind === "file") {
      // Observe the actual generated download without depending on the browser CLI's OS save-path support.
      evaluate(
        `window.__agentDownload=null;const native=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__agentDownload={name:this.download,url:this.href};return native.call(this);};try{await click(${JSON.stringify(control)});await waitFor(()=>window.__agentDownload,'Download initiated');assert(window.__agentDownload.name==='agent-document.txt','Download filename');assert((await(await fetch(window.__agentDownload.url)).text())==='Agent template document contents','Downloaded document bytes');}finally{HTMLAnchorElement.prototype.click=native;}return true;`,
      );
    } else {
      evaluate(
        `await click(${JSON.stringify(control)});await waitFor(()=>!$('#mediaOverlay').hidden,'Media preview');await waitFor(()=>${kind === "image" ? "$('#mediaContent img')?.naturalWidth>0" : "Number.isFinite($('#mediaContent " + (kind === "video" ? "video" : "audio") + "')?.duration)"},'Playable ${kind}');await click('#closeMedia');assert($('#mediaOverlay').hidden,'Close preview');return true;`,
      );
    }
  }
  writeFileSync(join(temp, "too-large.txt"), Buffer.alloc(2 * 1024 * 1024 + 1));
  evaluate(
    `await click('#agentToolButton');await click('[data-tool=file]');return true;`,
  );
  run(session, "upload", "#attachmentInput", join(temp, "too-large.txt"));
  evaluate(
    `assert($('#error').textContent.includes('2 MiB'),'Oversized file rejected');assert(!$('#agentChatBody').textContent.includes('too-large.txt'),'Oversized file persisted');await click('#agentToolButton');return true;`,
  );
  console.log(
    "All four file tools selected real files; protected download and image/video/audio previews passed; oversized files rejected.",
  );
  const retryFile = join(temp, "agent-retry.txt");
  writeFileSync(retryFile, "Retry-safe attachment");
  evaluate(
    `window.__realAgentFetch=window.fetch;window.__retryKeys=[];window.fetch=async(...args)=>{if(String(args[0]).endsWith('/attachments')&&args[1]?.method==='POST'){window.__retryKeys.push(JSON.parse(args[1].body).requestKey);const response=await window.__realAgentFetch(...args);if(window.__retryKeys.length===1)throw new TypeError('Simulated lost upload response');return response;}return window.__realAgentFetch(...args);};if(!$('#agentToolMenu').classList.contains('open'))await click('#agentToolButton');await click('[data-tool=file]');return true;`,
  );
  run(session, "upload", "#attachmentInput", retryFile);
  evaluate(
    `await waitFor(()=>$('#uploadNote').textContent.includes('retry safely'),'Lost-response feedback');await click('[data-tool=file]');assert($('#attachmentInput').value==='','Same-file picker reset');return true;`,
  );
  run(session, "upload", "#attachmentInput", retryFile);
  evaluate(
    `await waitFor(()=>$('#uploadNote').textContent==='','Retry success');assert(window.__retryKeys.length===2&&window.__retryKeys[0]===window.__retryKeys[1],'Retry request key changed');window.fetch=window.__realAgentFetch;delete window.__realAgentFetch;assert(!$('#error').textContent,'Successful retry left stale error');return true;`,
  );
  const retried = await request(`/api/conversations/${main.conversationId}`);
  if (
    retried.messages.filter((m) => m.attachment?.name === "agent-retry.txt")
      .length !== 1
  )
    throw Error("Attachment duplicated after lost-response retry");
  console.log(
    "Maximum-length FAQ sent without truncation; same-file lost-response retry reuses the request key and produces one attachment.",
  );
  run(session, "screenshot", "/tmp/msd-template-agent-dark.png");
  evaluate(
    `await click('#themeToggle');assert(document.body.classList.contains('msd-light'),'Light theme');return true;`,
  );
  run(session, "screenshot", "/tmp/msd-template-agent-light.png");
  evaluate(
    `await click('#themeToggle');await click('#transfer');assert(!$('#transferOverlay').hidden,'Transfer opens');$('#transferInput').value='@no-such-agent';$('#transferInput').dispatchEvent(new Event('input'));assert($('#confirmTransfer').disabled&&$('#agentOptions').textContent.includes('No matching'),'Unknown recipient guard');$('#transferInput').value=${JSON.stringify("@" + receiver.name)};$('#transferInput').dispatchEvent(new Event('input'));assert(document.querySelectorAll('[data-agent]').length===1,'Recipient search');await click('#cancelTransfer');assert($('#transferOverlay').hidden,'Transfer cancel');return true;`,
  );
  const beforeFill = (await request("/api/agents")).find(
    (a) => a.id === mainUser.id,
  );
  for (let i = beforeFill.active; i < beforeFill.capacity; i++) {
    const item = await createConversation(widget.siteKey, `filler-${i}`);
    await request(`/api/conversations/${item.conversationId}`, "PATCH", {
      assignedAgentId: mainUser.id,
    });
  }
  evaluate(
    `$('#ticketSearch').value='${suffix}';$('#ticketSearch').dispatchEvent(new Event('input'));await click('#refresh');await click(${JSON.stringify(selected(future.conversationId))});await waitFor(()=>$('#claim').textContent==='Full','Capacity label');assert($('#claim').disabled,'Full agent accepted ticket');await click(${JSON.stringify(selected(main.conversationId))});return true;`,
  );
  for (const id of created.filter(
    (id) => ![main.conversationId, future.conversationId].includes(id),
  ))
    await request(`/api/conversations/${id}`, "PATCH", { status: "closed" });
  evaluate(
    `await click('#refresh');await click('#transfer');$('#transferInput').value=${JSON.stringify("@" + receiver.name)};$('#transferInput').dispatchEvent(new Event('input'));await click('[data-agent="${receiver.id}"]');assert(!$('#confirmTransfer').disabled,'Chosen recipient');await click('#confirmTransfer');await waitFor(()=>$('#replyLocked'),'Transfer removed former ownership');assert($('#transferOverlay').hidden,'Transfer closes');assert($('#infoPanel').textContent.includes(${JSON.stringify(receiver.name)}),'Transfer history');return true;`,
  );
  run(second, "open", agentOrigin + "/apps/agent/");
  evaluate(
    `await submit('#login',{email:'transfer-agent@example.test',password:${JSON.stringify(password)}});await waitFor(()=>$('#agentShell'),'Transfer-agent login');await click(${JSON.stringify(selected(main.conversationId))});assert($('#reply'),'Recipient can reply');await submit('#reply',{text:'Transferred agent real reply'});await waitFor(()=>$('#agentChatBody').textContent.includes('Transferred agent real reply'),'Recipient reply');await click('#resolve');await waitFor(()=>$('#replyLocked')&&$('#selectedTitle').textContent.includes('RESOLVED'),'Resolve');assert($('#claim').disabled&&$('#resolve').disabled&&$('#transfer').disabled,'Resolved guards');assert($('#infoPanel').textContent.includes(${JSON.stringify(receiver.name)}),'Resolved By');await click('[data-filter=resolved]');assert(document.querySelector(${JSON.stringify(selected(main.conversationId))}),'Resolved tab');return true;`,
    second,
  );
  evaluate(
    `await click('#refresh');await click(${JSON.stringify(selected(future.conversationId))});await click('#claim');await waitFor(()=>$('#reply'),'Capacity released');await click('#resolve');await waitFor(()=>$('#replyLocked'),'Original agent resolve');return true;`,
  );
  console.log(
    "Transfer search/cancel/confirm, capacity limits/release, recipient reply, both-agent resolution and resolved controls passed.",
  );
  run(session, "set", "viewport", "390", "844");
  evaluate(
    `assert($('#agentShell').classList.contains('mobile-open'),'Mobile selected view');assert(getComputedStyle($('.agent-sidebar')).display==='none','Mobile sidebar hidden');assert(getComputedStyle($('.agent-main')).display==='flex','Mobile chat visible');await click('#backInbox');assert(!$('#agentShell').classList.contains('mobile-open'),'Mobile Inbox back');assert(getComputedStyle($('.agent-sidebar')).display!=='none','Mobile inbox visible');await click(${JSON.stringify(selected(main.conversationId))});assert($('#agentShell').classList.contains('mobile-open'),'Mobile row opens');assert(document.documentElement.scrollWidth<=390,'Mobile overflow');return true;`,
  );
  run(session, "screenshot", "/tmp/msd-template-agent-mobile.png");
  evaluate(
    `await click('#account');assert($('#password-dialog').open,'Password dialog opens');await submit('#password-change',{currentPassword:'unused-password',newPassword:'NewPassword!2026',confirmPassword:'DifferentPassword!2026'});assert($('#password-error').textContent.includes('do not match'),'Password mismatch');await click('#close-password');assert(!$('#password-dialog').open&&!$('#password-change').elements.currentPassword.value,'Cancel clears password');return true;`,
  );
  const adminAssignment = await createConversation(
    widget.siteKey,
    "administrator-assignment",
  );
  run(second, "click", "#logout");
  run(second, "wait", "#login");
  evaluate(
    `await submit('#login',{email:'template-admin@example.test',password:'TemplateAdmin!2026'});await waitFor(()=>$('#agentShell'),'Administrator monitor login');await click(${JSON.stringify(selected(adminAssignment.conversationId))});assert(!$('#transfer').disabled,'Administrator can assign unclaimed ticket');await click('#transfer');await click('[data-agent="${receiver.id}"]');await click('#confirmTransfer');await waitFor(()=>$('#selectedTitle').textContent.includes(${JSON.stringify(receiver.name)}),'Administrator assignment');return true;`,
    second,
  );
  run(session, "click", "#logout");
  run(session, "wait", "#login");
  evaluate(
    `assert(!sessionStorage.getItem('msd-token'),'Session token survived sign out');return true;`,
  );
  console.log(
    "Account modal validation/cancel/sign-out and administrator assignment of an unclaimed ticket passed.",
  );
  const errors = run(session, "errors") + run(second, "errors");
  if (errors.trim()) throw Error("Unexpected browser errors: " + errors);
  console.log(
    "Dark/light and mobile inbox/chat views passed; no browser JavaScript errors.",
  );
  console.log("Agent template full browser regression passed.");
} finally {
  if (adminToken && longFaqId) {
    try {
      await request(`/api/admin/faqs/${longFaqId}`, "DELETE");
    } catch {}
  }
  if (adminToken)
    for (const id of created) {
      try {
        await request(`/api/conversations/${id}`, "PATCH", {
          status: "closed",
        });
      } catch {}
    }
  if (mainUser && initialAvailability !== undefined) {
    try {
      const auth = await request(
        "/api/auth/login",
        "POST",
        { email: mainUser.email, password },
        null,
      );
      await request(
        "/api/agent/availability",
        "PATCH",
        { available: initialAvailability },
        auth.token,
      );
    } catch {}
  }
  for (const which of [session, second]) {
    try {
      run(which, "close");
    } catch {}
  }
}
