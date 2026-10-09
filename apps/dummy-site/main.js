import { root, pageUrl } from "../shared/client.js";
import "../../packages/widget/src/widget.js";
// Installation credentials live in the host service; this page receives only public configuration.
sessionStorage.removeItem("msd-local-install");
localStorage.removeItem("msd-public-site-key");
localStorage.removeItem("chat-msd:registration");
document.body.classList.add("template-customer");
root.classList.add("app");
root.innerHTML = `<nav class="demo-bar" aria-label="Application"><button class="active" aria-current="page">Customer Chatbot</button><button data-href="/apps/agent/?login=1">Agent Login</button><button data-href="/apps/agent/">Agent Inbox</button><button data-href="/apps/about/">About MVP</button></nav><div id="mount"></div><p id="connection" role="status" style="position:fixed;bottom:12px;left:20px;color:var(--text-muted);font-size:12px"></p>`;
root.querySelectorAll("[data-href]").forEach(
  (button) =>
    (button.onclick = () => {
      location.href = pageUrl(button.dataset.href);
    }),
);
root.querySelector(".active").onclick = () =>
  document.querySelector("chat-msd-widget")?.goHome();
let loading = false;
async function mount() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch("/host-api/widget", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw Error("Configuration unavailable");
    const { siteKey, api } = await response.json();
    const current = document.querySelector("chat-msd-widget");
    if (
      current &&
      (current.getAttribute("site-key") !== siteKey ||
        current.getAttribute("api") !== api)
    )
      current.remove();
    if (siteKey && !document.querySelector("chat-msd-widget")) {
      const widget = document.createElement("chat-msd-widget");
      widget.setAttribute("site-key", siteKey);
      widget.setAttribute("api", api);
      widget.setAttribute("inline", "");
      document.querySelector("#mount").append(widget);
    }
    document.querySelector("#connection").textContent = siteKey
      ? ""
      : "Support has not been installed. Open website administration to connect this website.";
  } catch {
    document.querySelector("#connection").textContent =
      "Support configuration is temporarily unavailable.";
  } finally {
    loading = false;
  }
}
mount();
setInterval(mount, 5000);
