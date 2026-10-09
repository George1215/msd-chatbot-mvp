import { io } from "socket.io-client";
export const API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? location.origin : "http://localhost:4300");
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const root = document.querySelector("#app");
export const token = () => sessionStorage.getItem("msd-token");
export async function api(path, method = "GET", body, headers = {}) {
  const r = await fetch(API + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = await r.json();
  if (!r.ok) {
    if (
      r.status === 401 &&
      token() &&
      !path.startsWith("/api/auth/") &&
      !path.endsWith("/password-reset")
    ) {
      sessionStorage.removeItem("msd-token");
      sessionStorage.removeItem("msd-user");
      location.reload();
    }
    throw Error(data.error || r.statusText);
  }
  return data;
}
export function error(e) {
  const node = document.querySelector("#error");
  if (node) {
    node.textContent = e.message;
    node.dataset.transient = String(
      ["TimeoutError", "AbortError", "TypeError"].includes(e.name),
    );
  }
}
export function form(id, fn) {
  document.querySelector(id).onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector(
      "button[type=submit],button:not([type])",
    );
    if (button) button.disabled = true;
    const errorNode = document.querySelector("#error");
    if (errorNode) errorNode.textContent = "";
    try {
      await fn(Object.fromEntries(new FormData(e.target)));
    } catch (e) {
      error(e);
    } finally {
      if (button) button.disabled = false;
    }
  };
}
export function themeControl() {
  return '<button class="theme-toggle" id="themeToggle" type="button">MSD Light</button>';
}
export function applyTheme(value) {
  const theme = value === "msd-light" ? "msd-light" : "msd-dark";
  document.body.classList.remove("msd-dark", "msd-light");
  document.body.classList.add(theme);
  try {
    localStorage.setItem("msd-theme", theme);
  } catch {}
  const button = document.querySelector("#themeToggle");
  if (button) {
    button.textContent = theme === "msd-light" ? "MSD Dark" : "MSD Light";
    button.setAttribute("aria-pressed", String(theme === "msd-light"));
  }
  window.dispatchEvent(new CustomEvent("msd:theme", { detail: theme }));
}
export function bindTheme() {
  let theme = "msd-dark";
  try {
    theme = localStorage.getItem("msd-theme") || theme;
  } catch {}
  applyTheme(theme);
  const button = document.querySelector("#themeToggle");
  if (button)
    button.onclick = () =>
      applyTheme(
        document.body.classList.contains("msd-light")
          ? "msd-dark"
          : "msd-light",
      );
}
export function pageUrl(path) {
  if (import.meta.env.PROD) return path;
  const port = path.startsWith("/apps/agent")
    ? 4302
    : path.startsWith("/apps/admin")
      ? 4301
      : 4303;
  return `http://localhost:${port}${path}`;
}
export function navigation() {
  return `<nav class="demo-bar" aria-label="Application pages"><a href="${pageUrl("/apps/dummy-site/")}">Customer Chatbot</a><a href="${pageUrl("/apps/agent/?login=1")}">Agent Login</a><a href="${pageUrl("/apps/agent/")}">Agent Inbox</a><a href="${pageUrl("/apps/about/")}">About MVP</a></nav>${themeControl()}`;
}
export function header(title, extrasHTML = "") {
  const agent = document.body.classList.contains("template-agent");
  return `<header class="${agent ? "staff-toolbar" : "extension-header"}"><div><h1>MSD · ${esc(title)}</h1>${agent ? "" : "<p>Central customer support</p>"}</div><div class="row">${extrasHTML}<button id="account" type="button">Change password</button><button id="logout" type="button">Sign out</button></div></header>${themeControl()}<dialog id="password-dialog" class="account-dialog"><h2>Change your password</h2><p>All your current sessions will be signed out.</p><form id="password-change"><div class="field"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label></div><div class="field"><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="10" maxlength="72" required></label></div><div class="field"><label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="72" required></label></div><button class="login-button">Change password</button><button class="secondary-button" type="button" id="close-password">Cancel</button></form><p id="password-error" class="error" role="alert"></p></dialog><div id="error" role="alert" class="error"></div>`;
}
export async function login(role, start) {
  if (token() && !new URLSearchParams(location.search).has("login")) {
    try {
      await api(
        role === "admin" ? "/api/admin/sites" : "/api/agent/conversations",
      );
      document.body.classList.remove("auth-screen");
      await start();
      return;
    } catch {
      sessionStorage.removeItem("msd-token");
    }
  }
  document.body.classList.add("auth-screen");
  root.innerHTML = `${navigation()}<section class="screen login-screen active" id="loginScreen"><div class="login-card"><div class="login-logo">msd</div><h1>${role === "admin" ? "Administrator Login" : "Agent Login"}</h1><p>Sign in to open the ${role === "admin" ? "central administration" : "customer support agent"} workspace.</p><form id="login"><div class="field"><label>Email<input name="email" type="email" required autocomplete="username"></label></div><div class="field"><label>Password<input name="password" type="password" required autocomplete="current-password"></label></div><button class="login-button">${role === "admin" ? "Login as Administrator" : "Login as Support Agent"}</button></form><div id="error" class="error" role="alert"></div><div class="login-note">${role === "admin" ? "Manage connected websites, support agents, FAQs and service reports." : "Your configured capacity determines how many active clients or tickets you can handle at the same time."}</div><details class="account-details"><summary>Reset your password</summary><p>Ask your central administrator for a reset code. Codes expire after 15 minutes.</p><form id="password-reset"><div class="field"><label>Email<input name="email" type="email" autocomplete="username" required></label></div><div class="field"><label>Reset code<input name="resetToken" type="password" autocomplete="off" required></label></div><div class="field"><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="10" maxlength="72" required></label></div><div class="field"><label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="72" required></label></div><button class="login-button">Reset password</button></form><p id="reset-status" role="status"></p></details>${role === "admin" ? '<details class="account-details"><summary>First administrator setup</summary><form id="bootstrap"><div class="field"><label>Name<input name="name" required minlength="2"></label></div><div class="field"><label>Email<input name="email" type="email" required></label></div><div class="field"><label>Password<input name="password" type="password" required minlength="10"></label></div><div class="field"><label>Bootstrap secret (production)<input name="bootstrapSecret" type="password" autocomplete="off"></label></div><button class="login-button">Create administrator</button></form></details>' : ""}</div></section>`;
  bindTheme();
  const accept = async (path, b) => {
    const { bootstrapSecret, ...body } = b;
    const data = await api(
      path,
      "POST",
      body,
      bootstrapSecret ? { "x-bootstrap-secret": bootstrapSecret } : {},
    );
    if (role === "admin" && data.user.role !== "central_admin")
      throw Error("Administrator account required");
    sessionStorage.setItem("msd-token", data.token);
    sessionStorage.setItem("msd-user", JSON.stringify(data.user));
    const address = new URL(location.href);
    address.searchParams.delete("login");
    history.replaceState(null, "", address);
    document.body.classList.remove("auth-screen");
    await start();
  };
  form("#password-reset", async (body) => {
    if (body.newPassword !== body.confirmPassword)
      throw Error("Passwords do not match");
    await api("/api/auth/reset-password", "POST", body);
    document.querySelector("#password-reset").reset();
    document.querySelector("#error").textContent = "";
    document.querySelector("#reset-status").textContent =
      "Password reset. Sign in above with your new password.";
  });
  form("#login", (b) => accept("/api/auth/login", b));
  if (role === "admin")
    form("#bootstrap", (b) => accept("/api/auth/bootstrap-admin", b));
}
export function logout() {
  bindTheme();
  const dialog = document.querySelector("#password-dialog");
  document.querySelector("#account").onclick = () => dialog.showModal();
  document.querySelector("#close-password").onclick = () => {
    dialog.close();
    document.querySelector("#password-change").reset();
    document.querySelector("#password-error").textContent = "";
  };
  dialog.addEventListener("close", () =>
    document.querySelector("#password-change").reset(),
  );
  form("#password-change", async (body) => {
    try {
      if (body.newPassword !== body.confirmPassword)
        throw Error("Passwords do not match");
      await api("/api/auth/change-password", "POST", body);
      sessionStorage.removeItem("msd-token");
      sessionStorage.removeItem("msd-user");
      location.reload();
    } catch (e) {
      document.querySelector("#password-error").textContent = e.message;
    }
  });
  document.querySelector("#logout").onclick = () => {
    sessionStorage.clear();
    location.reload();
  };
}
export function socket(refresh) {
  const s = io(API, { auth: { token: token() } });
  for (const event of [
    "conversation:new",
    "conversation:changed",
    "message:new",
    "site:status",
    "faq:changed",
  ])
    s.on(event, () => refresh().catch(error));
  s.on("disconnect", (reason) => {
    if (reason === "io server disconnect") {
      sessionStorage.removeItem("msd-token");
      sessionStorage.removeItem("msd-user");
      location.reload();
    }
  });
  return s;
}
export const faqForm = `<label>Question<input name="question" required minlength="3" maxlength="300"></label><label>Answer<textarea name="answer" required maxlength="5000"></textarea></label>`;

export function clearConnectionError() {
  const node = document.querySelector("#error");
  if (node?.dataset.transient === "true") {
    node.textContent = "";
    node.dataset.transient = "false";
  }
}
