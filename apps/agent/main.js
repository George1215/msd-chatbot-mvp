import {
  root,
  api,
  API,
  token,
  esc,
  header,
  login,
  logout,
  error,
  socket,
  clearConnectionError,
} from "../shared/client.js";
import "./template.css";

document.body.classList.add("template-agent");
root.classList.add("app");
let selected,
  conversations = [],
  agents = [],
  user,
  filter = "all";
let refreshPromise, renderedConversation, renderedPermission, messageVersion;
let sending = false,
  transferAgent,
  transferOpener,
  mediaObjectUrl;
const drafts = new Map(),
  pendingMessages = new Map(),
  pendingFiles = new Map();
const faqCache = new Map();
const previewUrls = new Map();
const greetings = [
  [
    "Welcome",
    "Hello, thank you for contacting MSD support. How can I help you today?",
  ],
  [
    "Introduce yourself",
    () => `Hello, my name is ${user.name}. I will help you with your request.`,
  ],
  ["Welcome back", "Welcome back. What would you like help with today?"],
];
const quickTexts = [
  [
    "More details",
    "Could you share a little more detail about the issue so I can help?",
  ],
  [
    "Order reference",
    "Please share your order reference, if available. Do not send passwords or payment details.",
  ],
  ["Anything else?", "Is there anything else I can help you with?"],
  ["Thank you", "Thank you for contacting MSD support."],
];
const $ = (query) => document.querySelector(query);
const clearActionError = () => {
  if ($("#error")) {
    $("#error").textContent = "";
    $("#error").dataset.transient = "false";
  }
};
const getConversation = () => conversations.find((c) => c.id === selected);
const agentName = (id) =>
  agents.find((a) => a.id === id)?.name ||
  (id === user?.id ? user.name : id ? "Support agent" : "Not assigned");
const statusLabel = (c) =>
  c.status === "closed" ? "resolved" : c.assignedAgentId ? "active" : "new";
const shortId = (id) =>
  id
    ? `#${id
        .replace(/^conv_/, "")
        .slice(-8)
        .toUpperCase()}`
    : "";
const displayTime = (date) =>
  date && !Number.isNaN(Date.parse(date))
    ? new Date(date).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const fullTime = (date) =>
  date && !Number.isNaN(Date.parse(date))
    ? new Date(date).toLocaleString()
    : "";
const subject = (c) =>
  c.subject ||
  c.messages.find((m) => m.sender === "visitor")?.text ||
  "Customer support request";
const canReply = (c) =>
  !!c &&
  c.status !== "closed" &&
  c.site.status === "approved" &&
  (user.role === "central_admin" || c.assignedAgentId === user.id);
const ownsConversation = (c) =>
  user.role === "central_admin" || c.assignedAgentId === user.id;

async function start() {
  user = JSON.parse(sessionStorage.getItem("msd-user"));
  root.innerHTML =
    header(
      "Support inbox",
      `<div class="agent-account-tools"><label for="availability">Availability</label><select id="availability"><option value="true">Available</option><option value="false">Away</option></select><button id="refresh" type="button" title="Refresh inbox">Refresh</button></div>`,
    ) +
    `
    <section class="screen agent-screen active" id="agentScreen">
      <div class="agent-shell" id="agentShell">
        <aside class="agent-sidebar">
          <div class="agent-top"><div class="agent-title"><h1>Support Inbox</h1><p>Incoming chats and chatbot escalations</p></div><div class="capacity-pill" id="capacityPill">Loading…</div></div>
          <div class="inbox-search"><input id="ticketSearch" type="search" aria-label="Search conversations" placeholder="Search customer, ticket, message..."></div>
          <div class="inbox-tabs" aria-label="Conversation filters">${["all", "new", "active", "resolved"].map((v) => `<button type="button" data-filter="${v}" class="${filter === v ? "active" : ""}" aria-pressed="${filter === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div>
          <div class="ticket-list" id="ticketList"></div>
        </aside>
        <main class="agent-main" id="agentMain"><div class="empty-chat"><div><h2>Select a customer query</h2><p>Click an incoming chat from the inbox to open the conversation.</p></div></div></main>
      </div>
    </section>
    <div class="transfer-overlay" id="transferOverlay" role="dialog" aria-modal="true" aria-labelledby="transferTitle" hidden>
      <div class="transfer-modal"><h2 id="transferTitle">Transfer Ticket</h2><p>Select a fellow agent or type an agent name starting with @. The transfer will be added to the ticket timeline.</p><div class="agent-options" id="agentOptions"></div><input class="transfer-input" id="transferInput" aria-label="Search agents" placeholder="Or type @agentname..."><p id="transferStatus" role="status"></p><div class="transfer-actions"><button type="button" class="cancel-transfer" id="cancelTransfer">Cancel</button><button type="button" class="confirm-transfer" id="confirmTransfer" disabled>Transfer Ticket</button></div></div>
    </div>
    <div class="transfer-overlay" id="mediaOverlay" role="dialog" aria-modal="true" aria-labelledby="mediaTitle" hidden><div class="transfer-modal agent-media-modal"><h2 id="mediaTitle">Attachment</h2><div id="mediaContent"></div><div class="transfer-actions"><button type="button" class="cancel-transfer" id="closeMedia">Close</button></div></div></div>`;
  logout();
  // The shared header owns the account controls; these controls are additions to the original inbox.
  if (!$("#availability")) {
    const tools = document.createElement("div");
    tools.className = "agent-account-tools agent-account-fallback";
    tools.innerHTML =
      '<label for="availability">Availability</label><select id="availability"><option value="true">Available</option><option value="false">Away</option></select><button id="refresh" type="button">Refresh</button>';
    root.prepend(tools);
  }
  $("#availability").disabled = user.role !== "agent";
  $("#availability").onchange = async (event) => {
    const node = event.currentTarget;
    clearActionError();
    node.disabled = true;
    try {
      await api("/api/agent/availability", "PATCH", {
        available: node.value === "true",
      });
      await refresh();
    } catch (e) {
      error(e);
      await refresh().catch(error);
    } finally {
      node.disabled = user.role !== "agent";
    }
  };
  $("#refresh").onclick = () => refresh().catch(error);
  $("#ticketSearch").oninput = renderTickets;
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.onclick = () => {
      filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((node) => {
        node.classList.toggle("active", node === button);
        node.setAttribute("aria-pressed", String(node === button));
      });
      renderTickets();
    };
  });
  $("#cancelTransfer").onclick = closeTransfer;
  $("#transferInput").oninput = () => {
    transferAgent = null;
    renderTransferOptions();
  };
  $("#confirmTransfer").onclick = confirmTransfer;
  $("#closeMedia").onclick = closeMedia;
  for (const id of ["transferOverlay", "mediaOverlay"])
    $("#" + id).onclick = (event) => {
      if (event.target.id === id)
        id === "transferOverlay" ? closeTransfer() : closeMedia();
    };
  document.addEventListener("keydown", handleDialogKeys);
  await refresh();
  socket(async () => {
    faqCache.clear();
    await refresh();
  });
  setInterval(() => refresh().catch(error), 5000);
}

async function refresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    [conversations, agents] = await Promise.all([
      api("/api/agent/conversations"),
      api("/api/agents"),
    ]);
    clearConnectionError();
    const me = agents.find((a) => a.id === user.id);
    $("#capacityPill").textContent = me
      ? `${me.active}/${me.capacity} Active`
      : "Administrator";
    if (me) $("#availability").value = String(me.available);
    $("#capacityPill").classList.toggle(
      "at-capacity",
      !!me && me.active >= me.capacity,
    );
    renderTickets();
    renderConversation();
    const current = getConversation();
    if (
      $("#toolSection-faq")?.classList.contains("open") &&
      current?.site.siteKey &&
      !faqCache.has(current.site.siteKey)
    )
      loadFaqs().catch(error);
    if (!$("#transferOverlay").hidden) renderTransferOptions();
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function renderTickets() {
  const search = $("#ticketSearch").value.trim().toLocaleLowerCase();
  const visible = conversations
    .filter(
      (c) =>
        (filter === "all" ||
          (statusLabel(c) === filter &&
            (user.role === "central_admin" ||
              !["active", "resolved"].includes(filter) ||
              (filter === "active"
                ? c.assignedAgentId === user.id
                : c.timeline?.findLast(
                    (entry) =>
                      entry.type === "status" && entry.toStatus === "closed",
                  )?.actor?.id === user.id)))) &&
        [
          c.visitorName,
          c.id,
          subject(c),
          c.site.name,
          ...c.messages.map((m) => m.text),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  $("#ticketList").innerHTML =
    visible
      .map((c) => {
        const last = c.messages.at(-1);
        return `<button type="button" class="ticket-chat-row ${selected === c.id ? "active" : ""}" data-conversation="${esc(c.id)}" aria-pressed="${selected === c.id}">
      <div class="inbox-avatar">${esc((c.visitorName || "V").charAt(0).toUpperCase())}</div>
      <div class="inbox-middle"><div class="inbox-name-line"><div class="inbox-name">${esc(c.visitorName)}</div><div class="inbox-channel">${esc(c.phone || c.visitorPhone || "")}</div></div><div class="inbox-subject">${esc(subject(c))}</div><div class="inbox-preview">${esc(last?.text || last?.attachment?.name || "")}</div><div class="inbox-meta-line"><span class="inbox-ticket-id" title="${esc(c.id)}">${shortId(c.id)}</span><span class="inbox-dot">•</span><span class="inbox-region">Website</span><span class="inbox-dot">•</span><span class="inbox-region">${esc(c.site.name)}</span></div></div>
      <div class="inbox-side"><span class="inbox-time">${displayTime(c.updatedAt)}</span>${c.priority ? `<span class="inbox-priority ${["high", "medium", "low"].includes(c.priority) ? c.priority : "low"}">${esc(c.priority.toUpperCase())}</span>` : ""}<span class="inbox-status">${statusLabel(c).toUpperCase()}</span></div>
    </button>`;
      })
      .join("") ||
    '<div class="inbox-empty">No conversations match this view.</div>';
  document.querySelectorAll("[data-conversation]").forEach((button) => {
    button.onclick = () => {
      saveDraft();
      selected = button.dataset.conversation;
      $("#agentShell").classList.add("mobile-open");
      renderTickets();
      renderConversation();
    };
  });
}

function saveDraft() {
  if (!renderedConversation) return;
  const input = $("#agentReplyInput");
  if (input)
    drafts.set(renderedConversation, {
      text: input.value,
      open: $("#agentToolMenu")?.classList.contains("open"),
      section: $(".agent-tool-option.active")?.dataset.tool,
      linkTitle: $("#linkTitle")?.value || "",
      linkUrl: $("#linkUrl")?.value || "",
    });
}

function renderConversation() {
  const c = getConversation();
  if (!c) {
    if (renderedConversation) {
      saveDraft();
      releasePreviews();
      selected = undefined;
      renderedConversation = undefined;
      $("#agentMain").innerHTML =
        '<div class="empty-chat"><div><h2>Select a customer query</h2><p>Click an incoming chat from the inbox to open the conversation.</p></div></div>';
    }
    return;
  }
  const permitted = canReply(c);
  if (renderedConversation !== c.id || renderedPermission !== permitted) {
    saveDraft();
    if (renderedConversation !== c.id) releasePreviews();
    renderedConversation = c.id;
    renderedPermission = permitted;
    messageVersion = null;
    $("#agentMain").innerHTML =
      `<div class="conversation-top"><div class="selected-title" id="selectedTitle"></div><div class="ticket-actions"><button type="button" class="transfer" id="backInbox">Inbox</button><button type="button" class="accept" id="claim">Accept</button><button type="button" class="resolve" id="resolve">Resolve</button><button type="button" class="transfer" id="transfer">Transfer</button></div></div><div class="conversation-area"><div class="agent-chat"><div class="agent-chat-body" id="agentChatBody"></div>${permitted ? replyMarkup() : '<div class="agent-reply locked" id="replyLocked"></div>'}</div><aside class="info-panel" id="infoPanel"></aside></div>`;
    $("#backInbox").onclick = () => {
      saveDraft();
      $("#agentShell").classList.remove("mobile-open");
      $("#ticketSearch").focus();
    };
    $("#claim").onclick = () =>
      updateConversation({ assignedAgentId: user.id });
    $("#resolve").onclick = () => updateConversation({ status: "closed" });
    $("#transfer").onclick = openTransfer;
    if (permitted) bindComposer();
  }
  const me = agents.find((a) => a.id === user.id);
  const full = !!me && me.active >= me.capacity;
  $("#selectedTitle").innerHTML =
    `<h2 title="${esc(subject(c))}">${esc(subject(c))}</h2><p>${esc(c.visitorName)} · ${shortId(c.id)} · Assigned: ${esc(agentName(c.assignedAgentId))} · ${statusLabel(c).toUpperCase()}</p>`;
  $("#claim").disabled =
    sending ||
    user.role !== "agent" ||
    !!c.assignedAgentId ||
    c.status === "closed" ||
    c.site.status !== "approved" ||
    !me?.available ||
    full;
  $("#claim").textContent = full && !c.assignedAgentId ? "Full" : "Accept";
  $("#claim").title =
    !me?.available && user.role === "agent"
      ? "Set availability to Available before accepting"
      : "Accept this conversation";
  $("#resolve").disabled = sending || !permitted;
  $("#transfer").disabled =
    sending ||
    c.status === "closed" ||
    !ownsConversation(c) ||
    (!c.assignedAgentId && user.role !== "central_admin");
  if (!permitted)
    $("#replyLocked").textContent =
      c.site.status !== "approved"
        ? "This website is not approved. Replies are unavailable until it is restored."
        : c.status === "closed"
          ? `This ticket is resolved${c.resolvedBy ? ` by ${agentName(c.resolvedBy)}` : ""}.`
          : !c.assignedAgentId
            ? "This is a new ticket. Click Accept before replying to the customer."
            : `This ticket is assigned to ${agentName(c.assignedAgentId)}. Only the assigned active agent can reply.`;
  renderMessages(c);
  renderInfo(c);
}

function replyMarkup() {
  return `<form class="agent-reply" id="reply"><div class="agent-tool-wrap"><button type="button" class="agent-tool-btn" id="agentToolButton" aria-label="Agent quick actions" aria-expanded="false">☺</button><div class="agent-tool-menu" id="agentToolMenu"><div class="agent-tool-head"><strong>Agent quick actions</strong><span>Choose what you want to send</span></div><div class="agent-tool-grid">${[
    ["greetings", "👋", "Greeting"],
    ["file", "📄", "File"],
    ["image", "🖼", "Image"],
    ["video", "🎥", "Video"],
    ["link", "🔗", "Link"],
    ["faq", "❔", "FAQ"],
    ["quickText", "💬", "Text"],
    ["voice", "🎙", "Voice"],
  ]
    .map(
      ([key, icon, label]) =>
        `<button type="button" class="agent-tool-option" data-tool="${key}"><div class="tool-icon">${icon}</div><span>${label}</span></button>`,
    )
    .join(
      "",
    )}</div><div class="agent-tool-section" id="toolSection-greetings">${quickMarkup(greetings, "greeting")}</div><div class="agent-tool-section" id="toolSection-quickText">${quickMarkup(quickTexts, "text")}</div><div class="agent-tool-section" id="toolSection-faq"><p class="tool-note">Loading this website’s FAQs…</p></div><div class="agent-tool-section" id="toolSection-link"><div class="tool-mini-form"><input id="linkTitle" aria-label="Link title" placeholder="Link title e.g. MSD GePG Guide" maxlength="200"><input id="linkUrl" type="url" aria-label="Link URL" placeholder="URL e.g. https://msd.go.tz" maxlength="2000"><button type="button" id="sendLink">Send Link</button></div></div><p class="tool-note" id="uploadNote" role="status"></p></div></div><input id="agentReplyInput" name="text" type="text" aria-label="Reply" placeholder="Type reply to customer..." maxlength="5000" autocomplete="off"><button class="send-agent-btn" type="submit">Send</button><input type="file" id="attachmentInput" hidden></form>`;
}
function quickMarkup(items, kind) {
  return items
    .map(
      ([label, text], index) =>
        `<button type="button" class="quick-action-item" data-quick="${kind}" data-index="${index}"><b>${esc(label)}</b><small>${esc(typeof text === "function" ? text() : text)}</small></button>`,
    )
    .join("");
}
function bindComposer() {
  const draft = drafts.get(selected);
  if (draft) {
    $("#agentReplyInput").value = draft.text;
    $("#linkTitle").value = draft.linkTitle;
    $("#linkUrl").value = draft.linkUrl;
    if (draft.open) setToolsOpen(true);
    if (draft.section) showTool(draft.section);
  }
  $("#reply").onsubmit = (event) => {
    event.preventDefault();
    sendText($("#agentReplyInput").value, true);
  };
  $("#agentReplyInput").oninput = saveDraft;
  $("#agentToolButton").onclick = () => {
    setToolsOpen(!$("#agentToolMenu").classList.contains("open"));
    saveDraft();
  };
  document.querySelectorAll("[data-tool]").forEach((node) => {
    node.onclick = () => {
      if (["file", "image", "video", "voice"].includes(node.dataset.tool))
        chooseFile(node.dataset.tool);
      else showTool(node.dataset.tool);
    };
  });
  document.querySelectorAll("[data-quick]").forEach((node) => {
    node.onclick = () => {
      const text = (node.dataset.quick === "greeting" ? greetings : quickTexts)[
        Number(node.dataset.index)
      ][1];
      sendText(typeof text === "function" ? text() : text);
    };
  });
  $("#sendLink").onclick = () => {
    try {
      const title = $("#linkTitle").value.trim(),
        raw = $("#linkUrl").value.trim();
      if (!title || !raw) throw Error("Enter a link title and URL.");
      const url = new URL(raw);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error("Use an HTTP or HTTPS link without embedded credentials.");
      sendText(`${title}\n${url.href}`);
    } catch (e) {
      error(e);
    }
  };
  $("#attachmentInput").onchange = uploadAttachment;
  $("#linkTitle").oninput = saveDraft;
  $("#linkUrl").oninput = saveDraft;
  setSending(sending);
}
function setToolsOpen(open) {
  $("#agentToolMenu")?.classList.toggle("open", open);
  $("#agentToolButton")?.setAttribute("aria-expanded", String(open));
}
function showTool(section) {
  document
    .querySelectorAll("[data-tool]")
    .forEach((node) =>
      node.classList.toggle("active", node.dataset.tool === section),
    );
  document
    .querySelectorAll(".agent-tool-section")
    .forEach((node) =>
      node.classList.toggle("open", node.id === `toolSection-${section}`),
    );
  if (section === "faq") loadFaqs().catch(error);
  saveDraft();
}
async function loadFaqs() {
  const c = getConversation();
  if (!c?.site.siteKey) throw Error("This website’s FAQs are unavailable.");
  const key = c.site.siteKey;
  const faqs =
    faqCache.get(key) ||
    (await api(`/api/sites/${encodeURIComponent(key)}/faqs`));
  faqCache.set(key, faqs);
  if (selected !== c.id || !$("#toolSection-faq")) return;
  $("#toolSection-faq").innerHTML =
    faqs
      .map(
        (faq, index) =>
          `<button type="button" class="quick-action-item" data-faq="${index}"><b>${esc(faq.question)}</b><small>${esc(faq.answer)}</small></button>`,
      )
      .join("") ||
    '<p class="tool-note">No published FAQs for this website.</p>';
  document.querySelectorAll("[data-faq]").forEach((node) => {
    node.onclick = () => {
      const faq = faqs[Number(node.dataset.faq)];
      const combined = `${faq.question}\n${faq.answer}`;
      sendText(combined.length <= 5000 ? combined : faq.answer);
    };
  });
}
function setSending(value) {
  sending = value;
  document.querySelectorAll("#reply button").forEach((node) => {
    node.disabled = value;
  });
}
async function sendText(value, composer = false) {
  const text = value.trim(),
    c = getConversation();
  if (!text || sending) return;
  if (!canReply(c)) {
    error(Error("Accept this active conversation before replying."));
    return;
  }
  const key = `${c.id}:${text}`,
    requestKey = pendingMessages.get(key) || crypto.randomUUID();
  pendingMessages.set(key, requestKey);
  clearActionError();
  setSending(true);
  try {
    await api(
      `/api/conversations/${encodeURIComponent(c.id)}/messages`,
      "POST",
      { text, requestKey },
    );
    pendingMessages.delete(key);
    if (selected === c.id) {
      if (composer && $("#agentReplyInput")?.value.trim() === text)
        $("#agentReplyInput").value = "";
      setToolsOpen(false);
      saveDraft();
    }
    await refresh();
  } catch (e) {
    error(e);
  } finally {
    setSending(false);
    renderConversation();
  }
}
function chooseFile(kind) {
  clearActionError();
  const input = $("#attachmentInput");
  input.accept = {
    file: ".pdf,.txt,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mp3,.wav,.ogg",
    image: "image/png,image/jpeg,image/webp,image/gif",
    video: "video/mp4,video/webm",
    voice: "audio/mpeg,audio/wav,audio/ogg",
  }[kind];
  input.dataset.kind = kind;
  input.value = "";
  $("#uploadNote").textContent = "Choose a file to send (maximum 2 MiB).";
  input.click();
}
async function uploadAttachment(event) {
  const file = event.currentTarget.files[0],
    c = getConversation();
  if (!file || !c || sending) return;
  if (file.size > 2 * 1024 * 1024) {
    error(Error("Attachments must be 2 MiB or smaller."));
    return;
  }
  const fallback = {
    pdf: "application/pdf",
    txt: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
  };
  const mime = fallback[file.name.split(".").at(-1).toLowerCase()] || file.type;
  const allowed = new Set(Object.values(fallback));
  if (!allowed.has(mime)) {
    error(Error("Choose a supported document, image, video, or audio file."));
    return;
  }
  const key = `${c.id}:${file.name}:${file.size}:${file.lastModified}`,
    requestKey = pendingFiles.get(key) || crypto.randomUUID();
  pendingFiles.set(key, requestKey);
  setSending(true);
  $("#uploadNote").textContent = `Sending ${file.name}…`;
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(Error("Unable to read this file."));
      reader.readAsDataURL(file);
    });
    await api(
      `/api/conversations/${encodeURIComponent(c.id)}/attachments`,
      "POST",
      { name: file.name, mime, data, requestKey },
    );
    pendingFiles.delete(key);
    if (selected === c.id) {
      $("#attachmentInput").value = "";
      $("#uploadNote").textContent = "";
      setToolsOpen(false);
      saveDraft();
    }
    await refresh();
  } catch (e) {
    error(e);
    if ($("#uploadNote"))
      $("#uploadNote").textContent =
        "Upload failed. Choose the same file again to retry safely.";
  } finally {
    setSending(false);
    renderConversation();
  }
}

function renderMessages(c) {
  const nextVersion = JSON.stringify(c.messages);
  if (messageVersion === nextVersion) return;
  const body = $("#agentChatBody"),
    nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  const first = messageVersion === null;
  messageVersion = nextVersion;
  body.innerHTML = c.messages
    .map(
      (m) =>
        `<div class="agent-message ${m.sender === "visitor" ? "customer" : "agent"}"><div class="agent-bubble-wrap"><span class="agent-label">${esc(m.sender === "visitor" ? c.visitorName : agentName(m.senderId))}</span><div class="agent-bubble">${safeMessageText(m.text)}${m.attachment ? attachmentMarkup(m.attachment) : ""}<small>${displayTime(m.createdAt)}</small></div></div></div>`,
    )
    .join("");
  body.querySelectorAll("[data-attachment]").forEach((button) => {
    button.onclick = () =>
      openAttachment(
        c.id,
        c.messages.find((m) => m.attachment?.id === button.dataset.attachment)
          ?.attachment,
      ).catch(error);
  });
  for (const node of body.querySelectorAll("[data-preview]")) {
    const attachment = c.messages.find(
      (message) => message.attachment?.id === node.dataset.preview,
    )?.attachment;
    if (attachment)
      loadPreview(c.id, attachment).then((url) => {
        if (url && node.isConnected && selected === c.id) node.src = url;
      });
  }
  if (nearBottom || first) body.scrollTop = body.scrollHeight;
}
function safeMessageText(text) {
  return esc(text || "").replace(/https?:\/\/[^\s<>]+/g, (raw) => {
    // URL parsing uses the original text before escaping so entity sequences cannot alter hrefs.
    const decoded = raw
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    try {
      const url = new URL(decoded);
      if (url.username || url.password) return raw;
      return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${raw}</a>`;
    } catch {
      return raw;
    }
  });
}
function attachmentMarkup(a) {
  const picture = a.mime.startsWith("image/"),
    video = a.mime.startsWith("video/");
  const icon = picture
    ? "🖼"
    : video
      ? "🎥"
      : a.mime.startsWith("audio/")
        ? "🎙"
        : "📄";
  const metadata = `<div class="attachment-file"><div class="attachment-icon">${icon}</div><div class="attachment-info"><b>${esc(a.name)}</b><span>${esc(a.mime)} · ${Math.ceil(a.size / 1024)} KB · ${/^(image|video|audio)\//.test(a.mime) ? "Open" : "Download"}</span></div></div>`;
  const preview = picture
    ? `<div class="attachment-image"><img data-preview="${esc(a.id)}" alt="${esc(a.name)}"><span>${esc(a.name)}</span></div>`
    : video
      ? `<div class="attachment-video"><video data-preview="${esc(a.id)}" muted playsinline preload="metadata" aria-label="${esc(a.name)}"></video><div class="play-icon">▶</div></div>`
      : "";
  return `<div class="attachment-card"><button type="button" class="attachment-open" data-attachment="${esc(a.id)}" aria-label="${picture || video ? "Open " : ""}${esc(a.name)}">${preview}${picture ? "" : metadata}</button></div>`;
}
function releasePreviews() {
  for (const promise of previewUrls.values())
    promise.then((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  previewUrls.clear();
}
function loadPreview(conversationId, attachment) {
  if (previewUrls.has(attachment.id)) return previewUrls.get(attachment.id);
  const promise = (async () => {
    try {
      const response = await fetch(
        `${API}/api/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachment.id)}`,
        {
          headers: { Authorization: `Bearer ${token()}` },
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!response.ok) return null;
      const url = URL.createObjectURL(await response.blob());
      if (selected !== conversationId) {
        URL.revokeObjectURL(url);
        return null;
      }
      return url;
    } catch {
      return null;
    }
  })();
  previewUrls.set(attachment.id, promise);
  return promise;
}
async function openAttachment(conversationId, attachment) {
  if (!attachment) return;
  const response = await fetch(
    `${API}/api/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachment.id)}`,
    {
      headers: { Authorization: `Bearer ${token()}` },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok)
    throw Error(
      "Unable to open attachment. Refresh your session and try again.",
    );
  const blob = await response.blob(),
    url = URL.createObjectURL(blob);
  if (!/^(image|video|audio)\//.test(attachment.mime)) {
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 10000);
    return;
  }
  closeMedia();
  mediaObjectUrl = url;
  $("#mediaTitle").textContent = attachment.name;
  const media = document.createElement(
    attachment.mime.startsWith("image/")
      ? "img"
      : attachment.mime.startsWith("video/")
        ? "video"
        : "audio",
  );
  media.src = url;
  if (media.tagName === "IMG") media.alt = attachment.name;
  else media.controls = true;
  $("#mediaContent").replaceChildren(media);
  $("#mediaOverlay").hidden = false;
  $("#mediaOverlay").classList.add("open");
  $("#closeMedia").focus();
}
function closeMedia() {
  if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
  mediaObjectUrl = null;
  $("#mediaContent")?.replaceChildren();
  $("#mediaOverlay")?.classList.remove("open");
  if ($("#mediaOverlay")) $("#mediaOverlay").hidden = true;
}

function renderInfo(c) {
  const resolution =
    c.status === "closed"
      ? c.timeline?.findLast(
          (entry) => entry.type === "status" && entry.toStatus === "closed",
        )
      : null;
  const resolvedBy = c.resolvedBy
    ? agentName(c.resolvedBy)
    : resolution?.actor?.name || "—";
  const rows = [
    ["Customer", c.visitorName],
    ["Phone", c.phone || c.visitorPhone || "Not provided"],
    ["Region", c.region || c.visitorRegion || "Not provided"],
    ["Channel", "Website"],
    ["Status", statusLabel(c).toUpperCase()],
    ["Assigned", agentName(c.assignedAgentId)],
    ["Resolved By", resolvedBy],
    [
      "Review",
      c.feedback
        ? `${c.feedback.rating}/5${c.feedback.comment ? ` · ${c.feedback.comment}` : ""}`
        : "Not reviewed",
    ],
  ];
  const transfers = c.transferHistory || [];
  const timeline = c.timeline || [{ action: "created", at: c.createdAt }];
  $("#infoPanel").innerHTML =
    `<div class="info-card"><h3>Customer Details</h3>${rows.map(([label, value]) => `<div class="info-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`).join("")}</div><div class="info-card"><h3>Transfer History</h3>${transfers.length ? transfers.map((entry) => `<div class="timeline-item"><b>${esc(typeof entry === "string" ? agentName(entry) : entry.toAgentName || agentName(entry.toAgentId || entry.to))}</b>${typeof entry === "object" ? `Received from ${esc(entry.fromAgentName || (entry.fromAgentId || entry.from ? agentName(entry.fromAgentId || entry.from) : "the unassigned queue"))}. ${esc(fullTime(entry.at || entry.createdAt))}` : "Handled or received this ticket."}</div>`).join("") : '<div class="timeline-item"><b>No transfer yet</b>This ticket has not been transferred.</div>'}</div><div class="info-card"><h3>Ticket Timeline</h3>${timeline.map((entry) => `<div class="timeline-item"><b>${esc(timelineLabel(entry))}</b>${esc(typeof entry === "object" ? fullTime(entry.at || entry.createdAt) : "")}</div>`).join("")}</div>`;
}
function timelineLabel(entry) {
  if (typeof entry === "string") return entry;
  if (entry.text || entry.label) return entry.text || entry.label;
  const action = entry.action || entry.type;
  const actor = entry.actor?.name || agentName(entry.actorId || entry.agentId);
  if (action === "assignment")
    return entry.fromAgentId
      ? `${entry.fromAgentName || agentName(entry.fromAgentId)} transferred this ticket to ${entry.toAgentName || agentName(entry.toAgentId)}`
      : `${entry.toAgentName || agentName(entry.toAgentId)} accepted this ticket`;
  if (action === "status")
    return `${actor} ${entry.toStatus === "closed" ? "resolved" : entry.toStatus === "pending" ? "marked pending" : "reopened"} this ticket`;
  return (
    {
      created: "Ticket created",
      claimed: `${actor} accepted this ticket`,
      transferred: `Transferred to ${agentName(entry.toAgentId)}`,
      resolved: `${actor} resolved this ticket`,
      reopened: "Ticket reopened",
      escalated: "Visitor requested escalation",
      feedback: "Visitor submitted feedback",
      pending: "Ticket marked pending",
    }[action] || String(action || "Ticket updated").replaceAll("_", " ")
  );
}
async function updateConversation(body) {
  const c = getConversation();
  if (!c || sending) return;
  clearActionError();
  setSending(true);
  renderConversation();
  try {
    await api(`/api/conversations/${encodeURIComponent(c.id)}`, "PATCH", body);
    await refresh();
  } catch (e) {
    error(e);
  } finally {
    setSending(false);
    renderConversation();
  }
}
function openTransfer(event) {
  transferOpener = event.currentTarget;
  transferAgent = null;
  $("#transferInput").value = "";
  $("#transferStatus").textContent = "";
  $("#transferOverlay").hidden = false;
  $("#transferOverlay").classList.add("open");
  renderTransferOptions();
  $("#transferInput").focus();
}
function renderTransferOptions() {
  const c = getConversation(),
    search = $("#transferInput")
      .value.replace(/^@/, "")
      .trim()
      .toLocaleLowerCase();
  const possible = agents.filter(
    (a) =>
      a.id !== c?.assignedAgentId &&
      `${a.name} ${a.email}`.toLocaleLowerCase().includes(search),
  );
  $("#agentOptions").innerHTML =
    possible
      .map(
        (a) =>
          `<button type="button" class="agent-chip ${a.id === transferAgent ? "selected" : ""}" data-agent="${esc(a.id)}" ${!a.available || a.active >= a.capacity ? "disabled" : ""}>@${esc(a.name)} <small>${a.active}/${a.capacity}${a.available ? "" : " · Away"}</small></button>`,
      )
      .join("") || "<p>No matching agents.</p>";
  const chosen = agents.find((a) => a.id === transferAgent);
  $("#confirmTransfer").disabled =
    sending || !chosen || !chosen.available || chosen.active >= chosen.capacity;
  document.querySelectorAll("[data-agent]").forEach((node) => {
    node.onclick = () => {
      transferAgent = node.dataset.agent;
      renderTransferOptions();
    };
  });
}
async function confirmTransfer() {
  const c = getConversation();
  if (!c || !transferAgent || sending) return;
  const destination = transferAgent;
  setSending(true);
  $("#confirmTransfer").disabled = true;
  try {
    await api(`/api/conversations/${encodeURIComponent(c.id)}`, "PATCH", {
      assignedAgentId: destination,
    });
    closeTransfer();
    await refresh();
  } catch (e) {
    $("#transferStatus").textContent = e.message;
  } finally {
    setSending(false);
    renderConversation();
    renderTransferOptions();
  }
}
function closeTransfer() {
  $("#transferOverlay").hidden = true;
  $("#transferOverlay").classList.remove("open");
  transferAgent = null;
  transferOpener?.focus();
}
function handleDialogKeys(event) {
  const overlay = !$("#mediaOverlay")?.hidden
    ? $("#mediaOverlay")
    : !$("#transferOverlay")?.hidden
      ? $("#transferOverlay")
      : null;
  if (!overlay) {
    if (event.key === "Escape") setToolsOpen(false);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    overlay.id === "mediaOverlay" ? closeMedia() : closeTransfer();
  }
  if (event.key === "Tab") {
    const nodes = [
      ...overlay.querySelectorAll(
        "button:not(:disabled),input:not(:disabled),video,audio",
      ),
    ];
    if (!nodes.length) return;
    if (event.shiftKey && document.activeElement === nodes[0]) {
      event.preventDefault();
      nodes.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
      event.preventDefault();
      nodes[0].focus();
    }
  }
}
login("agent", start);
