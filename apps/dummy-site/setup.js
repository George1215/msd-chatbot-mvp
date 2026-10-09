import {
  root,
  esc,
  form,
  error,
  faqForm,
  navigation,
  bindTheme,
  themeControl,
} from "../shared/client.js";
import { host } from "./host-client.js";
sessionStorage.removeItem("msd-local-install");
localStorage.removeItem("chat-msd:registration");
function login() {
  document.body.classList.add("auth-screen");
  root.innerHTML = `${navigation()}<section class="screen login-screen active"><div class="login-card"><div class="login-logo">msd</div><h1>Website administrator</h1><p>Sign in to install and manage support for this website.</p><form id="host-login"><div class="field"><label>Administrator password<input name="password" type="password" autocomplete="current-password" required></label></div><button class="login-button">Sign in</button></form><div id="error" class="error" role="alert"></div><a href="/apps/dummy-site/">Back to website</a></div></section>`;
  bindTheme();
  form("#host-login", async (body) => {
    await host("/login", "POST", body);
    await render();
  });
}
async function render() {
  document.body.classList.remove("auth-screen");
  root.innerHTML = `${themeControl()}<header class="extension-header"><div><h1>MSD · Site administration</h1><p>Manage your website’s support installation</p></div><div class="row"><a href="/apps/dummy-site/">View website</a><button id="host-logout">Sign out</button></div></header><div id="error" class="error" role="alert"></div><section id="setup" class="card"></section><details class="card"><summary>Reconnect an existing installation</summary><p>Use a replacement credential from central administration. It is saved privately on this website’s server.</p><form id="reconnect"><label>Site key<input name="siteKey" required></label><label>Replacement credential<input name="installToken" type="password" autocomplete="off" required></label><button>Reconnect installation</button></form></details>`;
  bindTheme();
  document.querySelector("#host-logout").onclick = async () => {
    try {
      await host("/logout", "POST", {});
      login();
    } catch (e) {
      error(e);
    }
  };
  form("#reconnect", async (body) => {
    await host("/reconnect", "POST", body);
    document.querySelector("#reconnect").reset();
    await render();
  });
  let site;
  try {
    site = await host("/setup");
  } catch (e) {
    if (e.status === 401 && e.message === "host_sign_in_required") {
      login();
      return;
    }
    document.querySelector("#setup").innerHTML =
      '<p>Cannot load support settings. Retry when the central service is available, or reconnect with a replacement credential.</p><button id="retry">Retry</button>';
    document.querySelector("#retry").onclick = render;
    error(e);
    return;
  }
  if (!site.installed) {
    document.querySelector("#setup").innerHTML =
      `<h2>Install customer support</h2><p>${site.retryPending ? "An earlier registration is incomplete. Retry to resume it safely." : "Installation registers this website for central approval automatically."}</p><form id="install"><label>Website name<input name="name" required minlength="2" maxlength="100" value="MSD Demo"></label><label>Admin email<input name="adminEmail" type="email" required></label><button>Install support widget</button></form>`;
    form("#install", async (body) => {
      await host("/install", "POST", body);
      await render();
    });
    return;
  }
  document.querySelector("#setup").innerHTML =
    `<h2>${esc(site.name)} <span class="badge">${esc(site.status)}</span></h2><p>${esc(site.declineReason || site.suspendedReason || "Approval activates the widget automatically on every visitor’s browser.")}</p><button id="refresh">Refresh status</button>${site.status === "declined" ? '<button id="resubmit">Resubmit for approval</button>' : ""}<form id="settings"><label>Widget title<input name="title" required maxlength="80" value="${esc(site.widget.title)}"></label><button>Save settings</button></form><h2>Site FAQs</h2><form id="faq">${faqForm}<button>Add FAQ</button></form>${site.faqs.map((f) => `<article class="card"><h2>${esc(f.question)}</h2><p>${esc(f.answer)}</p><small>${esc(f.source)} · revision ${f.version}</small>${f.source === "local" ? `<form data-faq="${esc(f.id)}">${faqForm}<button>Save changes</button> <button type="button" data-delete="${esc(f.id)}">Delete</button></form>` : "<p>Managed by central administration</p>"}</article>`).join("")}`;
  document.querySelector("#refresh").onclick = render;
  if (site.status === "declined")
    document.querySelector("#resubmit").onclick = async () => {
      try {
        await host("/resubmit", "POST", {});
        await render();
      } catch (e) {
        error(e);
      }
    };
  form("#settings", async (body) => {
    await host("/settings", "PATCH", body);
    await render();
  });
  form("#faq", async (body) => {
    await host("/faqs", "POST", body);
    await render();
  });
  document.querySelectorAll("[data-faq]").forEach((f) => {
    const faq = site.faqs.find((item) => item.id === f.dataset.faq);
    f.elements.question.value = faq.question;
    f.elements.answer.value = faq.answer;
    f.onsubmit = async (event) => {
      event.preventDefault();
      try {
        await host(`/faqs/${faq.id}`, "PUT", {
          ...Object.fromEntries(new FormData(f)),
          version: faq.version,
        });
        await render();
      } catch (e) {
        error(e);
      }
    };
  });
  document.querySelectorAll("[data-delete]").forEach(
    (button) =>
      (button.onclick = async () => {
        try {
          const faq = site.faqs.find(
            (item) => item.id === button.dataset.delete,
          );
          await host(`/faqs/${faq.id}`, "DELETE", { version: faq.version });
          await render();
        } catch (e) {
          error(e);
        }
      }),
  );
}
try {
  await host("/session");
  await render();
} catch (e) {
  if (e.status === 401) login();
  else {
    login();
    error(e);
  }
}
