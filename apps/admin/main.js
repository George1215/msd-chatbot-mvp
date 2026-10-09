import {
  root,
  api,
  esc,
  form,
  header,
  login,
  logout,
  error,
  faqForm,
  pageUrl,
} from "../shared/client.js";
let sites = [];
async function start() {
  root.innerHTML =
    header("Administration") +
    `<nav class="page-links"><a href="${pageUrl("/apps/dummy-site/")}">Customer Chatbot</a><a href="${pageUrl("/apps/dummy-site/admin.html")}">Website administration</a><a href="${pageUrl("/apps/about/")}">About MVP</a></nav><div class="row"><button id="refresh">Refresh dashboard</button><a class="button" href="${import.meta.env.PROD ? "/apps/agent/" : "http://localhost:4302/apps/agent/"}" target="_blank">Conversation monitor</a></div><section class="card"><h2>Support report · last 30 days</h2><div id="reports"></div><p id="operations"></p></section><h2>Connected sites</h2><div id="sites" class="grid"></div><section id="review"></section><div class="grid"><section class="card"><h2>Publish FAQ</h2><p>Choose one or several sites, or publish to all.</p><form id="broadcast">${faqForm}<label>Sites<select name="siteIds" id="targets" multiple></select></label><label><input type="checkbox" name="all" style="width:auto"> All connected sites</label><button>Publish FAQ</button></form></section><section class="card"><h2>Create agent</h2><form id="agent"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" minlength="10" required></label><label>Capacity<input name="capacity" type="number" min="1" max="50" value="5"></label><button>Create agent</button></form><div id="agents"></div><details><summary>Issue an agent password reset</summary><p>Verify the agent’s identity before giving them a reset code. Codes expire after 15 minutes.</p><form id="issue-reset"><label>Agent<select id="reset-agent" name="userId" required></select></label><label>Your administrator password<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>Reason<input name="reason" required minlength="3" maxlength="1000"></label><button>Generate reset code</button></form><div id="reset-credential"></div></details></section></div><section class="card"><h2>Audit history</h2><div id="audit"></div></section>`;
  logout();
  document.querySelector("#refresh").onclick = () => refresh().catch(error);
  form("#broadcast", async (b) => {
    const ids = [...document.querySelector("#targets").selectedOptions].map(
      (o) => o.value,
    );
    if (!b.all && !ids.length) throw Error("Select at least one site");
    await api("/api/admin/faqs/broadcast", "POST", {
      question: b.question,
      answer: b.answer,
      ...(b.all ? {} : { siteIds: ids }),
    });
    await refresh();
  });
  form("#agent", async (b) => {
    await api("/api/admin/agents", "POST", {
      ...b,
      capacity: Number(b.capacity),
    });
    document.querySelector("#agent").reset();
    await refresh();
  });
  form("#issue-reset", async (body) => {
    const data = await api(
      `/api/admin/agents/${body.userId}/password-reset`,
      "POST",
      { currentPassword: body.currentPassword, reason: body.reason },
    );
    document.querySelector("#issue-reset input[name=currentPassword]").value =
      "";
    document.querySelector("#reset-credential").innerHTML =
      `<p>Reset code for ${esc(data.email)}. Expires ${esc(new Date(data.expiresAt).toLocaleTimeString())}. Share privately with the verified agent; no message has been sent.</p><label>One-time reset code<input id="reset-code" readonly type="password" autocomplete="off"></label><button id="reveal-reset" type="button">Show code</button> <button id="dismiss-reset" type="button">Dismiss</button>`;
    document.querySelector("#reset-code").value = data.resetToken;
    document.querySelector("#reveal-reset").onclick = () => {
      const field = document.querySelector("#reset-code");
      field.type = field.type === "password" ? "text" : "password";
    };
    document.querySelector("#dismiss-reset").onclick = () =>
      document.querySelector("#reset-credential").replaceChildren();
  });
  await refresh();
}
async function refresh() {
  sites = await api("/api/admin/sites");
  document.querySelector("#sites").innerHTML =
    sites
      .map(
        (s) =>
          `<article class="card"><span class="badge">${esc(s.status)}</span><h2>${esc(s.name)}</h2><p>${esc(s.url)}</p><p>${s.faqCount} FAQs · ${esc(s.declineReason || s.suspendedReason || "")}</p><button data-review="${s.id}">Review site</button></article>`,
      )
      .join("") || "<p>No installations yet.</p>";
  document.querySelector("#targets").innerHTML = sites
    .map((s) => `<option value="${s.id}">${esc(s.name)}</option>`)
    .join("");
  document
    .querySelectorAll("[data-review]")
    .forEach((b) => (b.onclick = () => review(b.dataset.review).catch(error)));
  const [agents, audit, report, operations] = await Promise.all([
    api("/api/agents"),
    api("/api/admin/audit"),
    api("/api/admin/reports?days=30"),
    api("/api/admin/operations"),
  ]);
  document.querySelector("#reports").innerHTML =
    `<p>${report.totals.conversations} conversations · ${report.totals.open} open · ${report.totals.pending} pending · ${report.totals.closed} closed</p>${report.sites.map((s) => `<p>${esc(s.name)}: ${s.conversations} conversations</p>`).join("")}`;
  document.querySelector("#operations").textContent =
    `Service ${operations.storageHealthy ? "healthy" : "needs attention"} · ${operations.serverErrors} server errors since restart · average response ${operations.meanResponseMs} ms`;
  const selection = document.querySelector("#reset-agent").value;
  document.querySelector("#reset-agent").innerHTML = agents
    .map(
      (a) =>
        `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.email)})</option>`,
    )
    .join("");
  if (agents.some((a) => a.id === selection))
    document.querySelector("#reset-agent").value = selection;
  document.querySelector("#agents").innerHTML = agents
    .map(
      (a) =>
        `<p>${esc(a.name)} · ${a.available ? "Available" : "Away"} · ${a.active}/${a.capacity} active · ${a.closed} closed</p>`,
    )
    .join("");
  document.querySelector("#audit").innerHTML = audit
    .slice(0, 40)
    .map(
      (a) =>
        `<p>${esc(a.at)} · ${esc(a.action)} · ${esc(JSON.stringify(a.meta))}</p>`,
    )
    .join("");
}
async function review(id) {
  const s = sites.find((s) => s.id === id);
  const faqs = await api(`/api/sites/${s.siteKey}/faqs`);
  document.querySelector("#review").innerHTML =
    `<section class="card"><h2>Review ${esc(s.name)}</h2><form id="status"><label>Decision<select name="status">${(s.status === "approved" ? ["suspended"] : s.status === "pending" ? ["approved", "declined"] : ["approved"]).map((v) => `<option>${v}</option>`).join("")}</select></label><label>Reason (required to decline or suspend)<input name="reason" maxlength="1000"></label><button>Apply decision</button></form><details><summary>Recover installation access</summary><p>Generate a replacement credential. The previous credential stops working immediately.</p><form id="rotate"><label>Reason<input name="reason" required minlength="3" maxlength="1000"></label><button>Replace installation credential</button></form><div id="credential-result"></div></details><h2>Site FAQs</h2>${faqs.map((f) => `<form class="faq-edit" data-id="${f.id}">${faqForm}<button>Save central override</button> <button type="button" data-delete="${f.id}">Delete</button></form>`).join("") || "<p>No FAQs yet. Use Publish FAQ to add one.</p>"}</section>`;
  form("#rotate", async (body) => {
    const credentials = await api(
      `/api/admin/sites/${id}/install-credentials`,
      "POST",
      body,
    );
    document.querySelector("#credential-result").innerHTML =
      '<p>Save this credential in the host’s private configuration. It is shown only here and cannot be retrieved later.</p><label>Site key<input id="recovered-key" readonly></label><label>Installation credential<input id="recovered-token" readonly type="password" autocomplete="off"></label><button id="reveal-token" type="button">Show credential</button><button id="dismiss-token" type="button">Dismiss</button>';
    document.querySelector("#recovered-key").value = credentials.siteKey;
    document.querySelector("#recovered-token").value = credentials.installToken;
    document.querySelector("#reveal-token").onclick = () => {
      const input = document.querySelector("#recovered-token");
      input.type = input.type === "password" ? "text" : "password";
    };
    document.querySelector("#dismiss-token").onclick = () =>
      document.querySelector("#credential-result").replaceChildren();
    await refresh();
  });
  form("#status", async (b) => {
    await api(`/api/admin/sites/${id}/status`, "PATCH", b);
    await refresh();
    await review(id);
  });
  document.querySelectorAll(".faq-edit").forEach((f, i) => {
    f.elements.question.value = faqs[i].question;
    f.elements.answer.value = faqs[i].answer;
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(
          "/api/admin/faqs/" + f.dataset.id,
          "PUT",
          Object.fromEntries(new FormData(f)),
        );
        await refresh();
        await review(id);
      } catch (e) {
        error(e);
      }
    };
  });
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api("/api/admin/faqs/" + b.dataset.delete, "DELETE");
          await refresh();
          await review(id);
        } catch (e) {
          error(e);
        }
      }),
  );
}
login("admin", start);
