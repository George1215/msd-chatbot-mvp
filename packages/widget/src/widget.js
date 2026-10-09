import { io } from "socket.io-client";
import approvedCss from "../../../apps/shared/approved.css?raw";
import { customerMarkup, translations } from "./template.js";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const readCache = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const scopedCss = approvedCss
  .replace(/body\.([\w-]+)/g, ":host(.$1)")
  .replace(/:root/g, ":host")
  .replace(/(^|[\s,])body(?=[\s.{:#,]|$)/gm, "$1:host");
const copy = {
  en: {
    newTicket: "Open New Ticket",
    newDescription: "Start a fresh support request for a different issue.",
    ai: "Speak with MediAssist AI",
    aiDescription:
      "AI assistant that will help answer MSD service questions instantly.",
    phase: "Coming in Phase Two",
    openChat: "Open Chat",
    online: "Connected · send a message to join the support queue",
    offline: "Offline · saved FAQs available. Live chat unavailable.",
    closed: "Conversation closed · start a new conversation below",
    newConversation: "Start a new conversation",
    noFaqs: "No published FAQs yet. Ask the support team.",
    noTickets: "No saved tickets in this browser yet.",
    ticketDescription:
      "Continue support requests saved in this browser. Your identity has not been verified.",
    total: "Total Tickets",
    active: "Active",
    resolved: "Resolved",
    ticketInbox: "Ticket Inbox",
    continue: "Continue Ticket",
    download: "Download transcript",
    orderDescription:
      "Track submitted orders and delivery progress when your ordering service is connected.",
    orderMissing:
      "An order service has not been connected. No order records or delivery estimates are available. Send your reference to support for help.",
    contactsDescription:
      "Find the correct MSD zonal office and support route for your facility.",
    contactsMissing:
      "A verified zonal contact directory has not been connected. Ask support for the correct office details.",
    provider: "Service connection required",
    publishedFaqs: "Published guidance",
    toolsDescription: "Support tools, published guidance, and requests.",
    forms: "Support request form",
    facility: "Facility or name (optional)",
    category: "Issue Category",
    reference: "Reference Details (optional)",
    description: "Problem Description",
    submit: "Submit Ticket",
    next: "What Happens Next?",
    submitted: "Ticket submitted",
    submittedDescription:
      "Your request is saved with a unique ticket reference.",
    reviewed: "Agent reviews request",
    reviewedDescription:
      "A support agent can claim and respond to your request.",
    resume: "Continue your conversation",
    resumeDescription:
      "Return to My Tickets in this browser to read replies and continue.",
    loading: "Loading…",
    unavailable: "This ticket is no longer available.",
    identity: "Your identity is unverified.",
    chooseFile: "Choose a file",
    fileLimit: "PDF, text, image, audio or video · up to 2 MiB",
    fileMissing: "Choose a file to send to support.",
    fileTooLarge: "The file must be 2 MiB or smaller.",
    attachStart: "File shared with support",
    noMessages: "No messages yet.",
    theme: "Switch theme",
    expanded: "Restore chat size",
    expand: "Expand chat",
    leave: "Leave chat",
    request: "Support request",
    question: "Ask support",
    aiMissing:
      "MediAssist AI is planned for Phase Two. A live AI provider is not connected. Our support team can help you now.",
    askOrder: "I need help with my order.",
    askContacts: "Please help me find the correct zonal office contact.",
    escalate:
      "Please escalate this request to the appropriate support officer.",
    feedback: "I would like to share feedback: ",
    saved: "Saved FAQs",
    all: "All published FAQs",
    downloadFile: "Download file",
    sessionLeft: "You can return to this conversation from My Tickets.",
    retry: "Please retry when connected.",
    formError: "Enter a description of the issue.",
    status: "Status",
    open: "Open",
    pending: "Pending",
    assigned: "Assigned",
    closedLabel: "Closed",
    downloadOrder: "Download Order Summary",
    copyContacts: "Copy Contacts",
    openForms: "Open Forms",
    recoveredDraft:
      "Your earlier message was recovered. Your changed draft is still here; send it when ready.",
    ticketChanged:
      "The selected ticket changed. Choose the file again in the intended conversation.",
    recoveredFile:
      "Your earlier support request was recovered. Check that conversation, then choose the file again.",
  },
  sw: {
    newTicket: "Fungua Tiketi Mpya",
    newDescription: "Anzisha ombi jipya kwa tatizo tofauti.",
    ai: "Zungumza na MediAssist AI",
    aiDescription: "Msaidizi wa AI atasaidia kujibu maswali ya huduma za MSD.",
    phase: "Inakuja Awamu ya Pili",
    openChat: "Fungua Chat",
    online: "Imeunganishwa · tuma ujumbe kupata msaada",
    offline:
      "Hakuna mtandao · maswali yaliyohifadhiwa yanapatikana. Chat haipatikani.",
    closed: "Mazungumzo yamefungwa · anza mazungumzo mapya",
    newConversation: "Anza mazungumzo mapya",
    noFaqs: "Bado hakuna maswali yaliyochapishwa. Uliza timu ya msaada.",
    noTickets: "Bado hakuna tiketi zilizohifadhiwa kwenye kivinjari hiki.",
    ticketDescription:
      "Endelea na maombi yaliyohifadhiwa kwenye kivinjari hiki. Utambulisho wako haujathibitishwa.",
    total: "Tiketi Zote",
    active: "Zinazoendelea",
    resolved: "Zilizofungwa",
    ticketInbox: "Kikasha cha Tiketi",
    continue: "Endelea na Tiketi",
    download: "Pakua mazungumzo",
    orderDescription:
      "Fuatilia oda na usafirishaji huduma ya oda ikiunganishwa.",
    orderMissing:
      "Huduma ya oda haijaunganishwa. Hakuna taarifa za oda au makadirio ya usafirishaji. Tuma kumbukumbu yako kwa timu ya msaada.",
    contactsDescription: "Pata ofisi sahihi ya kanda ya MSD kwa kituo chako.",
    contactsMissing:
      "Orodha ya mawasiliano iliyothibitishwa haijaunganishwa. Omba taarifa sahihi kutoka kwa timu ya msaada.",
    provider: "Muunganisho wa huduma unahitajika",
    publishedFaqs: "Mwongozo uliochapishwa",
    toolsDescription: "Zana za msaada, mwongozo na maombi.",
    forms: "Fomu ya ombi la msaada",
    facility: "Kituo au jina (si lazima)",
    category: "Aina ya Tatizo",
    reference: "Kumbukumbu (si lazima)",
    description: "Maelezo ya Tatizo",
    submit: "Tuma Tiketi",
    next: "Nini Kinafuata?",
    submitted: "Tiketi imetumwa",
    submittedDescription: "Ombi lako huhifadhiwa na namba ya kipekee.",
    reviewed: "Afisa anapitia ombi",
    reviewedDescription: "Afisa anaweza kuchukua na kujibu ombi lako.",
    resume: "Endelea na mazungumzo",
    resumeDescription: "Rudi Tiketi Zangu hapa kusoma na kujibu.",
    loading: "Inapakia…",
    unavailable: "Tiketi hii haipatikani tena.",
    identity: "Utambulisho wako haujathibitishwa.",
    chooseFile: "Chagua faili",
    fileLimit: "PDF, maandishi, picha, sauti au video · hadi 2 MiB",
    fileMissing: "Chagua faili utume kwa msaada.",
    fileTooLarge: "Faili lazima liwe 2 MiB au chini.",
    attachStart: "Faili limetumwa kwa msaada",
    noMessages: "Bado hakuna ujumbe.",
    theme: "Badilisha mandhari",
    expanded: "Rudisha ukubwa",
    expand: "Panua chat",
    leave: "Ondoka kwenye chat",
    request: "Ombi la msaada",
    question: "Uliza msaada",
    aiMissing:
      "MediAssist AI imepangwa kwa Awamu ya Pili. Huduma ya AI haijaunganishwa. Timu yetu ya msaada inaweza kukusaidia sasa.",
    askOrder: "Nahitaji msaada kuhusu oda yangu.",
    askContacts: "Nisaidie kupata mawasiliano ya ofisi sahihi ya kanda.",
    escalate: "Tafadhali peleka ombi hili kwa afisa sahihi wa msaada.",
    feedback: "Ningependa kutoa maoni: ",
    saved: "Maswali yaliyohifadhiwa",
    all: "Maswali yote yaliyochapishwa",
    downloadFile: "Pakua faili",
    sessionLeft: "Unaweza kurudi kwenye mazungumzo kupitia Tiketi Zangu.",
    retry: "Jaribu tena mtandao ukirudi.",
    formError: "Andika maelezo ya tatizo.",
    status: "Hali",
    open: "Wazi",
    pending: "Inasubiri",
    assigned: "Imechukuliwa",
    closedLabel: "Imefungwa",
    downloadOrder: "Pakua Muhtasari wa Oda",
    copyContacts: "Nakili Mawasiliano",
    openForms: "Fungua Fomu",
    recoveredDraft:
      "Ujumbe wako wa awali umerejeshwa. Rasimu uliyobadilisha bado ipo; itume ukiwa tayari.",
    ticketChanged:
      "Tiketi iliyochaguliwa imebadilika. Chagua faili tena kwenye mazungumzo sahihi.",
    recoveredFile:
      "Ombi lako la awali limerejeshwa. Kagua mazungumzo hayo, kisha uchague faili tena.",
  },
  fr: {
    newTicket: "Ouvrir un nouveau ticket",
    newDescription: "Créez une demande pour un autre problème.",
    ai: "Parler à MediAssist AI",
    aiDescription:
      "Un assistant IA pour répondre aux questions sur les services MSD.",
    phase: "Prévu pour la phase deux",
    openChat: "Ouvrir le chat",
    online: "Connecté · envoyez un message pour contacter le support",
    offline: "Hors ligne · FAQ enregistrées disponibles. Chat indisponible.",
    closed: "Conversation fermée · commencez une nouvelle conversation",
    newConversation: "Commencer une nouvelle conversation",
    noFaqs: "Aucune FAQ publiée. Contactez le support.",
    noTickets: "Aucun ticket enregistré dans ce navigateur.",
    ticketDescription:
      "Reprenez les demandes enregistrées dans ce navigateur. Votre identité n’est pas vérifiée.",
    total: "Total des tickets",
    active: "Actifs",
    resolved: "Résolus",
    ticketInbox: "Boîte des tickets",
    continue: "Continuer le ticket",
    download: "Télécharger la conversation",
    orderDescription:
      "Suivez les commandes et livraisons lorsque le service est connecté.",
    orderMissing:
      "Aucun service de commandes connecté. Les commandes et délais ne sont pas disponibles. Envoyez votre référence au support.",
    contactsDescription:
      "Trouvez le bureau zonal MSD adapté à votre établissement.",
    contactsMissing:
      "Aucun annuaire de contacts vérifiés connecté. Demandez les coordonnées au support.",
    provider: "Connexion au service requise",
    publishedFaqs: "Conseils publiés",
    toolsDescription: "Outils de support, conseils publiés et demandes.",
    forms: "Formulaire d’assistance",
    facility: "Établissement ou nom (facultatif)",
    category: "Catégorie du problème",
    reference: "Référence (facultative)",
    description: "Description du problème",
    submit: "Envoyer le ticket",
    next: "Que se passe-t-il ensuite ?",
    submitted: "Ticket envoyé",
    submittedDescription:
      "Votre demande est enregistrée avec une référence unique.",
    reviewed: "Un agent examine la demande",
    reviewedDescription:
      "Un agent peut prendre en charge votre demande et répondre.",
    resume: "Continuer la conversation",
    resumeDescription:
      "Revenez à Mes Tickets pour lire les réponses et continuer.",
    loading: "Chargement…",
    unavailable: "Ce ticket n’est plus disponible.",
    identity: "Votre identité n’est pas vérifiée.",
    chooseFile: "Choisir un fichier",
    fileLimit: "PDF, texte, image, audio ou vidéo · 2 Mio maximum",
    fileMissing: "Choisissez un fichier à envoyer au support.",
    fileTooLarge: "Le fichier doit faire au maximum 2 Mio.",
    attachStart: "Fichier partagé avec le support",
    noMessages: "Aucun message.",
    theme: "Changer de thème",
    expanded: "Rétablir la taille",
    expand: "Agrandir le chat",
    leave: "Quitter le chat",
    request: "Demande d’assistance",
    question: "Demander au support",
    aiMissing:
      "MediAssist AI est prévu pour la phase deux. Aucun fournisseur IA connecté. Notre équipe peut vous aider maintenant.",
    askOrder: "J’ai besoin d’aide pour ma commande.",
    askContacts: "Aidez-moi à trouver le contact du bureau zonal approprié.",
    escalate: "Veuillez transmettre cette demande au responsable du support.",
    feedback: "Je souhaite donner mon avis : ",
    saved: "FAQ enregistrées",
    all: "Toutes les FAQ publiées",
    downloadFile: "Télécharger le fichier",
    sessionLeft: "Vous pouvez reprendre cette conversation dans Mes Tickets.",
    retry: "Réessayez une fois connecté.",
    formError: "Décrivez le problème.",
    status: "Statut",
    open: "Ouvert",
    pending: "En attente",
    assigned: "Attribué",
    closedLabel: "Fermé",
    downloadOrder: "Télécharger le récapitulatif",
    copyContacts: "Copier les contacts",
    openForms: "Ouvrir les formulaires",
    recoveredDraft:
      "Votre message précédent a été récupéré. Votre nouveau brouillon est conservé ; envoyez-le quand vous êtes prêt.",
    ticketChanged:
      "Le ticket sélectionné a changé. Choisissez à nouveau le fichier dans la conversation souhaitée.",
    recoveredFile:
      "Votre demande précédente a été récupérée. Vérifiez cette conversation, puis choisissez à nouveau le fichier.",
  },
};

class ChatMsdWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.messages = [];
    this.faqs = [];
    this.online = false;
    this.page = "home";
    this.blobs = new Map();
    this.pendingAttachments = new Map();
    this.selectionVersion = 0;
  }
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    this.style.display = "none";
    this.api = (this.getAttribute("api") || "http://localhost:4300").replace(
      /\/$/,
      "",
    );
    this.siteKey = this.getAttribute("site-key");
    if (!this.siteKey) return;
    if (
      document.querySelector(
        `chat-msd-widget[site-key="${CSS.escape(this.siteKey)}"]`,
      ) !== this
    )
      return;
    this.key = `msd:${this.api}:${this.siteKey}`;
    this.chat = readCache(this.key + ":chat");
    this.tickets = readCache(this.key + ":tickets") || [];
    if (
      this.chat &&
      !this.tickets.some((t) => t.conversationId === this.chat.conversationId)
    )
      this.tickets.push(this.chat);
    this.language = readCache(this.key + ":language") || "en";
    if (!translations[this.language]) this.language = "en";
    this.shadowRoot.innerHTML = `<style>${scopedCss}\n${extraCss}</style><button class="launcher" aria-expanded="false">Support</button><div class="panel">${customerMarkup}</div><input id="attachmentInput" type="file" hidden accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mp3,.wav,.ogg"><button class="theme-toggle" aria-label="Switch theme">MSD Light</button>`;
    this.$(".launcher").onclick = () => this.toggle();
    this.$(".theme-toggle").onclick = () => {
      const next = this.classList.contains("msd-light")
        ? "msd-dark"
        : "msd-light";
      try {
        localStorage.setItem("msd-theme", next);
      } catch {}
      document.body.classList.remove("msd-light", "msd-dark");
      document.body.classList.add(next);
      window.dispatchEvent(new CustomEvent("msd:theme", { detail: next }));
    };
    this.themeListener = (e) => this.setTheme(e.detail);
    window.addEventListener("msd:theme", this.themeListener);
    let theme = "msd-dark";
    try {
      theme = localStorage.getItem("msd-theme") || theme;
    } catch {}
    this.setTheme(theme);
    this.$("#moreToolsBtn").onclick = () => this.openPage("tools");
    for (const language of ["en", "sw", "fr"])
      this.$(`#lang-${language}`).onclick = () => this.setLanguage(language);
    const quick = this.shadowRoot.querySelectorAll(".quick-card");
    ["order", "zonal", "tickets"].forEach(
      (page, i) => (quick[i].onclick = () => this.openPage(page)),
    );
    this.$(".ticket-card-shape").onclick = () => this.openPage("new-ticket");
    this.$(".ai-card").onclick = () => this.openPage("ai");
    this.$("#viewAllBtn").onclick = () => this.openPage("faqs");
    [
      "msdServices",
      "orderGuidance",
      "zonalContacts",
      "gepg",
      "complaints",
      "feedback",
    ].forEach(
      (key, i) =>
        (this.shadowRoot.querySelectorAll(".topic-card")[i].onclick = () =>
          this.openTopic(key)),
    );
    this.$(".floating-chat-btn").onclick = () => this.openChat();
    this.$("#historyBtn").onclick = () => this.openPage("tickets");
    this.$("#seeOriginalBtn").onclick = () => this.openPage("faqs");
    this.$("#customerPlusBtn").onclick = () => {
      const open = this.$("#customerToolDrawer").classList.toggle("open");
      this.$("#customerPlusBtn").setAttribute("aria-expanded", String(open));
      this.$("#customerPlusBtn").textContent = open ? "×" : "+";
    };
    this.$("#customerInput").oninput = () => this.suggestions();
    this.$("#customerInput").onkeydown = (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        this.send();
      }
    };
    this.$(".send-btn").onclick = () => this.send();
    this.$("#new").onclick = () => {
      this.clearChat();
      this.openChat();
    };
    this.$("#endSession").onclick = () => {
      this.goHome();
    };
    this.$("#expandChat").onclick = () => {
      const expanded = this.classList.toggle("expanded");
      this.$("#expandChat").setAttribute(
        "aria-label",
        this.c(expanded ? "expanded" : "expand"),
      );
    };
    [
      "faqs",
      "tools",
      "order",
      "zonal",
      "files",
      "escalate",
      "feedback",
    ].forEach(
      (action, i) =>
        (this.shadowRoot.querySelectorAll(".drawer-tool")[i].onclick = () =>
          this.tool(action)),
    );
    this.$("#attachmentInput").onchange = () =>
      this.sendFile(this.$("#attachmentInput").files?.[0]);
    this.shadowRoot.addEventListener("click", (e) => {
      const button = e.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      if (action === "home") this.goHome();
      if (action === "back")
        this.previousPage === "chat" ? this.openChat() : this.goHome();
      if (action === "close-suggestions")
        this.$("#suggestionPanel").classList.remove("open");
      if (action === "open-chat") this.openChat();
      if (action === "page") this.openPage(button.dataset.page);
      if (action === "ask") this.openChat(button.dataset.text || "");
      if (action === "faq") this.openFaq(button.dataset.id);
      if (action === "ticket") this.selectTicket(button.dataset.id);
      if (action === "transcript") this.downloadTranscript();
      if (action === "provider-unavailable")
        this.error(
          this.c(
            button.dataset.page === "order"
              ? "orderMissing"
              : "contactsMissing",
          ),
        );
      if (action === "continue-ticket") {
        if (this.tickets[0]) this.selectTicket(this.tickets[0].conversationId);
        else this.error(this.c("noTickets"));
      }
      if (action === "attachment") this.downloadAttachment(button.dataset.id);
    });
    this.setLanguage(this.language);
    this.resume = () => this.sync();
    window.addEventListener("online", this.resume);
    this.timer = setInterval(() => this.sync(), 3000);
    this.sync();
  }
  $(selector) {
    return this.shadowRoot.querySelector(selector);
  }
  c(key) {
    return copy[this.language]?.[key] || copy.en[key] || key;
  }
  t(key) {
    return translations[this.language]?.[key] || translations.en[key] || key;
  }
  setTheme(theme) {
    this.classList.toggle("msd-light", theme === "msd-light");
    this.classList.toggle("msd-dark", theme !== "msd-light");
    this.$(".theme-toggle").textContent =
      theme === "msd-light" ? "MSD Dark" : "MSD Light";
  }
  setLanguage(language) {
    this.language = language;
    save(this.key + ":language", language);
    this.setAttribute("lang", language);
    const ids = {
      homeTitle: "homeTitle",
      homeSubtitle: "homeSubtitle",
      quickAccessTitle: "quickAccess",
      languageTitle: "language",
      languageHint: "languageHint",
      orderStatusCard: "orderStatus",
      zonalContactsCard: "zonalContacts",
      myTicketsCard: "myTickets",
      reviewText: "review",
      topicsTitle: "topics",
      servicesTopic: "msdServices",
      orderGuidanceTopic: "orderGuidance",
      zonalTopic: "zonalContacts",
      gepgTopic: "gepg",
      complaintsTopic: "complaints",
      feedbackTopic: "feedback",
      welcomeBubble: "welcome",
      faqTitle: "faq",
      seeOriginalBtn: "seeOriginal",
      historyBtn: "history",
      suggestedTopicsLabel: "suggested",
      drawerFaqs: "faqs",
      drawerSelfService: "selfService",
      drawerOrders: "orders",
      drawerContacts: "contacts",
      drawerFiles: "files",
      drawerEscalate: "escalate",
      drawerFeedback: "feedback",
    };
    for (const [id, key] of Object.entries(ids))
      this.$("#" + id).textContent = this.t(key);
    this.$("#moreToolsBtn").textContent = this.t("moreTools") + " ›";
    this.$("#viewAllBtn").textContent = this.t("viewAll") + " ›";
    this.$(".ticket-card-shape strong").textContent = this.c("newTicket");
    this.$(".ticket-card-shape .home-action-text span").textContent =
      this.c("newDescription");
    this.$(".ai-card strong").textContent = this.c("ai");
    this.$(".ai-card .home-action-text span").textContent =
      this.c("aiDescription");
    this.$(".phase-pill").textContent = this.c("phase");
    this.$("#customerInput").placeholder = this.t("chatPlaceholder");
    this.$("#new").textContent = this.c("newConversation");
    for (const lang of ["en", "sw", "fr"]) {
      const button = this.$(`#lang-${lang}`);
      button.classList.toggle("active", lang === language);
      button.setAttribute("aria-pressed", String(lang === language));
    }
    this.setOnline(this.online);
    this.renderMessages(true);
    if (this.page !== "home" && this.page !== "chat") this.renderPage();
  }
  toggle() {
    const open = this.$(".panel").classList.toggle("open");
    this.$(".launcher").setAttribute("aria-expanded", String(open));
  }
  show(page) {
    this.page = page;
    for (const [id, which] of [
      ["customerHome", "home"],
      ["customerChat", "chat"],
      ["dummyPage", "service"],
    ])
      this.$("#" + id).classList.toggle(
        "active",
        page === which ||
          (which === "service" && page !== "home" && page !== "chat"),
      );
  }
  goHome() {
    this.show("home");
    this.$("#suggestionPanel").classList.remove("open");
  }
  openChat(draft = "") {
    this.show("chat");
    if (draft) this.$("#customerInput").value = draft;
    this.$("#suggestionPanel").classList.remove("open");
    this.$("#customerInput").focus();
  }
  clearChat() {
    this.selectionVersion++;
    this.chat = null;
    this.closed = false;
    this.messages = [];
    this.messageHtml = null;
    save(this.key + ":chat", null);
    this.pendingMessage = null;
    this.releaseBlobs();
    this.renderMessages();
    this.setOnline(this.online);
    this.connectSocket();
  }
  openPage(type) {
    if (this.page === "chat" || this.page === "home")
      this.previousPage = this.page;
    this.show(type);
    this.renderPage();
    if (type === "tickets") this.refreshTickets();
  }
  openTopic(key) {
    if (key === "zonalContacts") return this.openPage("zonal");
    if (key === "feedback") return this.openChat(this.c("feedback"));
    if (key === "complaints") return this.openPage("new-ticket");
    this.topic = this.t(key);
    this.openPage("faqs");
  }
  tool(action) {
    this.$("#customerToolDrawer").classList.remove("open");
    this.$("#customerPlusBtn").textContent = "+";
    this.$("#customerPlusBtn").setAttribute("aria-expanded", "false");
    if (action === "files") {
      // A failed upload must still allow selecting exactly the same file again.
      this.$("#attachmentInput").value = "";
      this.$("#attachmentInput").click();
      return;
    }
    if (action === "escalate") {
      this.openChat(this.c("escalate"));
      return;
    }
    if (action === "feedback") {
      this.openChat(this.c("feedback"));
      return;
    }
    this.openPage(action);
  }
  disconnectedCallback() {
    clearInterval(this.timer);
    window.removeEventListener("online", this.resume);
    window.removeEventListener("msd:theme", this.themeListener);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.releaseBlobs();
    this.started = false;
    this.socketIdentity = null;
  }
  async request(path, method = "GET", body, capability = this.chat) {
    const response = await fetch(this.api + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(capability ? { "x-visitor-token": capability.visitorToken } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const error = Error(
        (await response.json().catch(() => ({}))).error || "Request failed",
      );
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  sync() {
    if (!this.syncTask)
      this.syncTask = this.performSync().finally(() => {
        this.syncTask = null;
      });
    return this.syncTask;
  }
  async performSync() {
    try {
      const data = await this.request(`/api/sites/${this.siteKey}/bootstrap`);
      save(this.key + ":bootstrap", data);
      this.render(data, true);
      if (data.site.status === "approved" && this.chat) {
        const capability = this.chat;
        const selectionVersion = this.selectionVersion;
        try {
          const conversation = await this.request(
            `/api/conversations/${capability.conversationId}`,
            "GET",
            undefined,
            capability,
          );
          if (!this.isSelected(capability, selectionVersion)) return;
          this.closed = conversation.status === "closed";
          this.messages = conversation.messages;
          this.remember(this.chat, conversation);
          this.renderMessages();
          this.setOnline(true);
        } catch (error) {
          if (!this.isSelected(capability, selectionVersion)) return;
          if ([401, 403, 404].includes(error.status)) {
            this.clearChat();
          } else throw error;
        }
      }
      if (data.site.status === "approved") this.connectSocket();
      else {
        this.socket?.removeAllListeners();
        this.socket?.disconnect();
        this.socketIdentity = null;
      }
    } catch (error) {
      if (error.status) {
        save(this.key + ":bootstrap", null);
        this.style.display = "none";
      } else {
        const cached = readCache(this.key + ":bootstrap");
        if (cached) this.render(cached, false);
        else this.style.display = "none";
      }
    }
  }
  connectSocket() {
    const identity = this.chat?.conversationId || this.siteKey;
    if (this.socketIdentity === identity) return;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socketIdentity = identity;
    this.socket = io(this.api, {
      auth: this.chat
        ? { ...this.chat, siteKey: this.siteKey }
        : { siteKey: this.siteKey },
    });
    for (const event of [
      "connect",
      "message:new",
      "conversation:changed",
      "site:status",
      "faq:changed",
    ])
      this.socket.on(event, () => this.sync());
    this.socket.on("disconnect", () => this.setOnline(false));
  }
  setOnline(online) {
    this.online = online;
    if (!this.$(".status")) return;
    this.$(".status").textContent = this.c(
      !online ? "offline" : this.closed ? "closed" : "online",
    );
    this.$(".status").classList.toggle("offline", !online);
    this.$(".send-btn").disabled = !online || this.sending || this.closed;
    this.$("#customerInput").disabled = this.closed;
    this.$("#new").hidden = !this.closed;
    this.$("#chatSupportSubtitle").textContent = this.chat
      ? `${this.chat.conversationId} · ${this.c(this.closed ? "closedLabel" : "open")}`
      : this.c("request");
    const submit = this.$("#ticketSubmit");
    if (submit) submit.disabled = !online || this.sending;
  }
  render(data, online) {
    this.style.display = data.site.status === "approved" ? "" : "none";
    if (data.site.status !== "approved") {
      this.setOnline(false);
      return;
    }
    this.site = data.site;
    this.$(".launcher").textContent = data.site.widget.title || "Support";
    this.$("#chatSupportTitle").textContent =
      data.site.widget.title || "MSD Support";
    this.setOnline(online);
    const next = JSON.stringify(data.faqs);
    if (this.faqJson !== next) {
      this.faqJson = next;
      this.faqs = data.faqs;
      if (["faqs", "order", "zonal", "tools"].includes(this.page))
        this.renderPage();
    }
    this.updateCounts();
  }
  updateCounts() {
    this.$("#ticketCount").textContent = `${this.tickets.length} ›`;
  }
  remember(capability, conversation) {
    const existing = this.tickets.find(
      (t) => t.conversationId === capability.conversationId,
    );
    const data = {
      ...capability,
      status: conversation?.status || existing?.status || "open",
      title:
        conversation?.messages?.[0]?.text?.slice(0, 100) ||
        existing?.title ||
        this.c("request"),
      updatedAt:
        conversation?.updatedAt ||
        existing?.updatedAt ||
        new Date().toISOString(),
    };
    this.tickets = [
      data,
      ...this.tickets.filter(
        (t) => t.conversationId !== capability.conversationId,
      ),
    ].slice(0, 100);
    save(this.key + ":tickets", this.tickets);
    this.updateCounts();
  }
  renderMessages(force = false) {
    const html = this.messages
      .map(
        (message) =>
          `<div class="message ${message.sender === "visitor" ? "user visitor" : "bot agent"}"><div class="bubble"><span class="message-copy">${escape(message.text)}</span>${message.attachment ? `<div class="attachment"><span>${escape(message.attachment.name)} · ${Math.ceil(message.attachment.size / 1024)} KB</span><div data-media="${escape(message.attachment.id)}"></div><button class="attachment-download" data-action="attachment" data-id="${escape(message.attachment.id)}">${escape(this.c("downloadFile"))}</button></div>` : ""}<small class="message-time">${escape(new Date(message.createdAt).toLocaleTimeString(this.language, { hour: "2-digit", minute: "2-digit" }))}</small></div></div>`,
      )
      .join("");
    if (force || this.messageHtml !== html) {
      this.$("#messages").innerHTML = html;
      this.messageHtml = html;
      const body = this.$(".body");
      body.scrollTop = body.scrollHeight;
      this.renderMedia();
    }
  }
  async renderMedia() {
    for (const message of this.messages) {
      const a = message.attachment;
      if (!a || !/^(image|audio|video)\//.test(a.mime)) continue;
      const target = this.$(`[data-media="${CSS.escape(a.id)}"]`);
      if (!target) continue;
      try {
        const url = await this.attachmentUrl(a.id);
        if (!target.isConnected) continue;
        const element = document.createElement(
          a.mime.split("/")[0] === "image" ? "img" : a.mime.split("/")[0],
        );
        element.src = url;
        if (element.tagName === "IMG") {
          element.alt = a.name;
          element.loading = "lazy";
        } else {
          element.controls = true;
          element.preload = "metadata";
        }
        target.replaceChildren(element);
      } catch {
        /* Download remains available for retry. */
      }
    }
  }
  async attachmentUrl(id) {
    if (this.blobs.has(id)) return this.blobs.get(id);
    const response = await fetch(
      `${this.api}/api/conversations/${this.chat.conversationId}/attachments/${encodeURIComponent(id)}`,
      {
        headers: { "x-visitor-token": this.chat.visitorToken },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw Error("File unavailable");
    const url = URL.createObjectURL(await response.blob());
    this.blobs.set(id, url);
    return url;
  }
  async downloadAttachment(id) {
    try {
      const attachment = this.messages.find(
        (m) => m.attachment?.id === id,
      )?.attachment;
      if (!attachment) return;
      const url = await this.attachmentUrl(id);
      this.download(url, attachment.name);
    } catch (error) {
      this.error(error.message);
    }
  }
  releaseBlobs() {
    for (const url of this.blobs.values()) URL.revokeObjectURL(url);
    this.blobs.clear();
  }
  error(message) {
    this.$("#error").textContent = message;
    const pageError = this.$("#pageError");
    if (pageError) pageError.textContent = message;
  }
  isSelected(capability, selectionVersion) {
    return (
      this.selectionVersion === selectionVersion &&
      this.chat?.conversationId === capability?.conversationId
    );
  }
  async createConversation(text, visitorName) {
    const selectionVersion = this.selectionVersion;
    let pending = readCache(this.key + ":pending");
    if (!pending) {
      pending = {
        requestKey: crypto.randomUUID(),
        text,
        ...(visitorName ? { visitorName } : {}),
      };
      save(this.key + ":pending", pending);
    }
    const capability = await this.request(
      "/api/conversations",
      "POST",
      {
        siteKey: this.siteKey,
        ...pending,
      },
      null,
    );
    save(this.key + ":pending", null);
    this.remember(capability, { messages: [{ text: pending.text }] });
    const selected = this.selectionVersion === selectionVersion;
    if (selected) {
      this.chat = capability;
      save(this.key + ":chat", capability);
    }
    return {
      capability,
      selected,
      sentText: pending.text,
      recovered:
        pending.text !== text ||
        (pending.visitorName || "") !== (visitorName || ""),
    };
  }
  async send() {
    if (this.sending || !this.online || this.closed) return;
    const input = this.$("#customerInput"),
      text = input.value.trim();
    if (!text) return;
    this.sending = true;
    this.setOnline(this.online);
    this.error("");
    try {
      const selectionVersion = this.selectionVersion;
      let capability = this.chat;
      let sentText;
      if (!capability) {
        const result = await this.createConversation(text);
        capability = result.capability;
        sentText = result.sentText;
      } else {
        const pendingKey =
          this.key + ":pending-message:" + capability.conversationId;
        const pending = readCache(pendingKey) || {
          text,
          requestKey: crypto.randomUUID(),
        };
        save(pendingKey, pending);
        await this.request(
          `/api/conversations/${capability.conversationId}/messages`,
          "POST",
          pending,
          capability,
        );
        save(pendingKey, null);
        sentText = pending.text;
      }
      if (!this.isSelected(capability, selectionVersion)) return;
      // A retry settles the original request. Never erase or automatically send
      // a different draft entered while that request's outcome was uncertain.
      if (input.value.trim() === sentText) input.value = "";
      else this.error(this.c("recoveredDraft"));
      this.$("#suggestionPanel").classList.remove("open");
      await this.sync();
    } catch (error) {
      this.error(error.message);
    } finally {
      this.sending = false;
      this.setOnline(this.online);
    }
  }
  async sendFile(file) {
    if (!file) return;
    this.openChat();
    if (!this.online || this.closed) {
      this.error(this.c("retry"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.error(this.c("fileTooLarge"));
      return;
    }
    if (this.sending) return;
    this.sending = true;
    this.error("");
    this.setOnline(this.online);
    try {
      const selectionVersion = this.selectionVersion;
      let capability = this.chat;
      if (!capability) {
        const result = await this.createConversation(this.c("attachStart"));
        if (!result.selected) throw Error(this.c("ticketChanged"));
        if (result.recovered) throw Error(this.c("recoveredFile"));
        capability = result.capability;
      }
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      const pendingKey = `${capability.conversationId}:${fingerprint}`;
      let pending = this.pendingAttachments.get(pendingKey);
      if (!pending) {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        pending = {
          name: file.name,
          mime: file.type || "text/plain",
          data,
          requestKey: crypto.randomUUID(),
        };
      }
      if (!this.isSelected(capability, selectionVersion))
        throw Error(this.c("ticketChanged"));
      this.pendingAttachments.set(pendingKey, pending);
      await this.request(
        `/api/conversations/${capability.conversationId}/attachments`,
        "POST",
        pending,
        capability,
      );
      this.pendingAttachments.delete(pendingKey);
      this.$("#attachmentInput").value = "";
      await this.sync();
    } catch (error) {
      this.error(error.message);
    } finally {
      this.sending = false;
      this.setOnline(this.online);
    }
  }
  suggestions() {
    const query = this.$("#customerInput").value.trim().toLocaleLowerCase();
    const matches =
      query.length > 1
        ? this.faqs
            .filter((f) =>
              `${f.question} ${f.answer}`.toLocaleLowerCase().includes(query),
            )
            .slice(0, 5)
        : [];
    this.$("#suggestionPanel").classList.toggle("open", !!matches.length);
    this.$("#suggestionList").innerHTML = matches
      .map(
        (f) =>
          `<button class="suggestion-item" data-action="faq" data-id="${escape(f.id)}"><span class="suggestion-icon">?</span><span>${escape(f.question)}</span></button>`,
      )
      .join("");
  }
  faqList(list = this.faqs) {
    return list.length
      ? list
          .map(
            (f) =>
              `<details class="dummy-row"><summary>${escape(f.question)}</summary><p class="faq-answer">${escape(f.answer)}</p><div class="dummy-pill-row"><span class="dummy-pill">${escape(f.scope === "central" ? "MSD" : this.site?.name || "MSD")}</span></div></details>`,
          )
          .join("")
      : `<div class="dummy-row"><p>${escape(this.c("noFaqs"))}</p></div>`;
  }
  openFaq(id) {
    this.topic = null;
    this.openPage("faqs");
    const index = this.faqs.findIndex((f) => f.id === id);
    const detail = this.shadowRoot.querySelectorAll("#faqs details")[index];
    if (detail) {
      detail.open = true;
      detail.scrollIntoView({ block: "nearest" });
    }
  }
  hero(icon, title, description) {
    return `<div class="dummy-hero"><div class="dummy-icon">${icon}</div><div><h1>${escape(title)}</h1><p>${escape(description)}</p></div></div>`;
  }
  section(title, content, meta = "") {
    return `<div class="dummy-section"><div class="dummy-section-title"><h3>${escape(title)}</h3><span>${escape(meta)}</span></div><div class="dummy-list">${content}</div></div>`;
  }
  actions(
    primary = this.c("openChat"),
    secondary = "",
    secondaryAction = "page",
    page = "faqs",
  ) {
    return `<div class="dummy-actions">${secondary ? `<button class="dummy-secondary" data-action="${secondaryAction}" data-page="${page}">${escape(secondary)}</button>` : "<span></span>"}<button class="dummy-primary" data-action="open-chat">${escape(primary)}</button></div>`;
  }
  renderPage() {
    const page = this.page;
    if (page === "home" || page === "chat") return;
    const title =
      {
        order: this.t("orderStatus"),
        zonal: this.t("zonalContacts"),
        tickets: this.t("myTickets"),
        "new-ticket": this.c("newTicket"),
        tools: this.t("moreTools"),
        faqs: this.t("faqs"),
        ai: "MediAssist AI",
      }[page] || this.c("request");
    this.$("#dummyTitle").textContent = title;
    this.$("#dummySubtitle").textContent = this.site?.name || "MSD Support";
    let html = "";
    if (page === "order" || page === "zonal") {
      const order = page === "order";
      html =
        this.hero(
          order ? "📦" : "☎",
          title,
          this.c(order ? "orderDescription" : "contactsDescription"),
        ) +
        `<div class="dummy-stats">${[
          ["—", this.c("status")],
          ["MSD", this.c("question")],
          [String(this.faqs.length), this.t("faqs")],
        ]
          .map(
            ([value, label]) =>
              `<div class="dummy-stat"><strong>${escape(value)}</strong><span>${escape(label)}</span></div>`,
          )
          .join("")}</div>` +
        this.section(
          this.c("provider"),
          `<div class="dummy-row"><p>${escape(this.c(order ? "orderMissing" : "contactsMissing"))}</p></div>`,
        ) +
        this.section(this.c("publishedFaqs"), this.faqList()) +
        `<div class="dummy-actions"><button class="dummy-secondary" data-action="provider-unavailable" data-page="${page}">${escape(this.c(order ? "downloadOrder" : "copyContacts"))}</button><button class="dummy-primary" data-action="ask" data-text="${escape(this.c(order ? "askOrder" : "askContacts"))}">${escape(this.c("openChat"))}</button></div>`;
    } else if (page === "faqs")
      html =
        this.hero(
          "?",
          this.topic || this.t("faqs"),
          this.c(this.online ? "all" : "saved"),
        ) +
        `<div id="faqs" class="dummy-list">${this.faqList()}</div>` +
        this.actions();
    else if (page === "ai")
      html =
        this.hero("AI", "MediAssist AI", this.c("phase")) +
        this.section(
          this.c("phase"),
          `<div class="dummy-row"><p>${escape(this.c("aiMissing"))}</p></div>`,
        ) +
        this.actions();
    else if (page === "tools")
      html =
        this.hero("🧰", title, this.c("toolsDescription")) +
        this.section(
          this.t("selfService"),
          [
            ["new-ticket", this.c("forms"), "＋"],
            ["faqs", this.t("faqs"), "?"],
            ["order", this.t("orders"), "📦"],
            ["zonal", this.t("contacts"), "☎"],
            ["tickets", this.t("myTickets"), "🎫"],
          ]
            .map(
              ([target, label, icon]) =>
                `<button class="dummy-row tool-row" data-action="page" data-page="${target}"><div class="dummy-row-top"><strong>${icon} ${escape(label)}</strong><span>›</span></div></button>`,
            )
            .join(""),
        ) +
        this.actions(
          this.c("openChat"),
          this.c("openForms"),
          "page",
          "new-ticket",
        );
    else if (page === "tickets") html = this.ticketPage();
    else if (page === "new-ticket") html = this.newTicketPage();
    this.$("#dummyContent").innerHTML =
      html + `<p id="pageError" role="alert"></p>`;
    const form = this.$("#newTicketForm");
    if (form)
      form.onsubmit = (e) => {
        e.preventDefault();
        this.submitTicket(form);
      };
    this.setOnline(this.online);
  }
  ticketPage() {
    const closed = this.tickets.filter((t) => t.status === "closed").length;
    return (
      this.hero("🎫", this.t("myTickets"), this.c("ticketDescription")) +
      `<div class="dummy-stats">${[
        [this.tickets.length, "total"],
        [this.tickets.length - closed, "active"],
        [closed, "resolved"],
      ]
        .map(
          ([value, label]) =>
            `<div class="dummy-stat"><strong>${value}</strong><span>${escape(this.c(label))}</span></div>`,
        )
        .join("")}</div>` +
      this.section(
        this.c("ticketInbox"),
        this.tickets.length
          ? this.tickets
              .map(
                (t) =>
                  `<button class="dummy-row tool-row" data-action="ticket" data-id="${escape(t.conversationId)}"><div class="dummy-row-top"><strong>${escape(t.title || t.conversationId)}</strong><span>›</span></div><p>${escape(t.conversationId)}</p><div class="dummy-pill-row"><span class="dummy-pill ${t.status === "closed" ? "green" : "blue"}">${escape(this.c(t.status === "closed" ? "closedLabel" : t.status === "assigned" ? "assigned" : "open"))}</span><span class="dummy-pill">${escape(new Date(t.updatedAt || Date.now()).toLocaleDateString(this.language))}</span></div></button>`,
              )
              .join("")
          : `<div class="dummy-row"><p>${escape(this.c("noTickets"))}</p></div>`,
      ) +
      this.actions(this.c("openChat"), this.c("continue"), "continue-ticket") +
      (this.chat
        ? `<button class="history-btn" data-action="transcript">${escape(this.c("download"))}</button>`
        : "")
    );
  }
  newTicketPage() {
    return (
      this.hero("📝", this.c("newTicket"), this.c("newDescription")) +
      `<form id="newTicketForm"><div class="dummy-section"><div class="dummy-section-title"><h3>${escape(this.c("forms"))}</h3></div><div class="ticket-form-preview"><div class="ticket-form-field"><label for="visitorName">${escape(this.c("facility"))}</label><input id="visitorName" name="visitorName" maxlength="100" autocomplete="name"></div><div class="ticket-form-field"><label for="category">${escape(this.c("category"))}</label><select id="category" name="category">${["orderGuidance", "gepg", "zonalContacts", "complaints", "feedback", "msdServices"].map((k) => `<option>${escape(this.t(k))}</option>`).join("")}</select></div><div class="ticket-form-field"><label for="reference">${escape(this.c("reference"))}</label><input id="reference" name="reference" maxlength="100"></div><div class="ticket-form-field"><label for="description">${escape(this.c("description"))}</label><textarea id="description" name="description" required maxlength="4500" rows="4"></textarea></div></div><p class="form-hint">${escape(this.c("identity"))}</p></div><div class="dummy-section"><div class="dummy-section-title"><h3>${escape(this.c("next"))}</h3></div><div class="dummy-timeline">${["submitted", "reviewed", "resume"].map((key, i) => `<div class="dummy-step"><div class="dummy-step-dot">${i + 1}</div><div class="dummy-step-body"><strong>${escape(this.c(key))}</strong><span>${escape(this.c(key + "Description"))}</span></div></div>`).join("")}</div></div><div class="dummy-actions"><button id="ticketSubmit" class="dummy-secondary" type="submit">${escape(this.c("submit"))}</button><button class="dummy-primary" type="button" data-action="open-chat">${escape(this.c("openChat"))}</button></div></form>`
    );
  }
  async submitTicket(form) {
    if (this.sending || !this.online) return;
    const data = new FormData(form),
      description = String(data.get("description") || "").trim();
    if (!description) {
      this.error(this.c("formError"));
      return;
    }
    this.sending = true;
    this.setOnline(this.online);
    this.error("");
    try {
      const text = `${data.get("category")}\n${data.get("reference") ? `${data.get("reference")}\n` : ""}${description}`;
      this.clearChat();
      const result = await this.createConversation(
        text,
        String(data.get("visitorName") || "").trim(),
      );
      if (!result.selected) return;
      await this.sync();
      const latest = new FormData(form);
      const formChanged = [...data].some(
        ([key, value]) => latest.get(key) !== value,
      );
      if (result.recovered || formChanged) this.error(this.c("recoveredDraft"));
      else this.openChat();
    } catch (error) {
      this.error(error.message);
    } finally {
      this.sending = false;
      this.setOnline(this.online);
    }
  }
  async refreshTickets() {
    await Promise.all(
      this.tickets.slice().map(async (capability) => {
        try {
          const conversation = await this.request(
            `/api/conversations/${capability.conversationId}`,
            "GET",
            undefined,
            capability,
          );
          this.remember(capability, conversation);
        } catch (error) {
          if ([401, 403, 404].includes(error.status)) {
            this.tickets = this.tickets.filter(
              (t) => t.conversationId !== capability.conversationId,
            );
            save(this.key + ":tickets", this.tickets);
          }
        }
      }),
    );
    this.tickets.sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
    this.updateCounts();
    if (this.page === "tickets") this.renderPage();
  }
  async selectTicket(id) {
    const capability = this.tickets.find((t) => t.conversationId === id);
    if (!capability) return;
    const selectionVersion = ++this.selectionVersion;
    this.error("");
    try {
      const conversation = await this.request(
        `/api/conversations/${id}`,
        "GET",
        undefined,
        capability,
      );
      if (this.selectionVersion !== selectionVersion) return;
      this.releaseBlobs();
      this.chat = {
        conversationId: capability.conversationId,
        visitorToken: capability.visitorToken,
      };
      save(this.key + ":chat", this.chat);
      this.closed = conversation.status === "closed";
      this.messages = conversation.messages;
      this.remember(this.chat, conversation);
      this.renderMessages(true);
      this.setOnline(this.online);
      this.openChat();
      this.connectSocket();
    } catch (error) {
      if (this.selectionVersion === selectionVersion) this.error(error.message);
    }
  }
  download(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    this.shadowRoot.append(a);
    a.click();
    a.remove();
  }
  downloadTranscript() {
    if (!this.chat) return;
    const text = [
      this.chat.conversationId,
      ...this.messages.map(
        (m) =>
          `${m.createdAt} ${m.sender}: ${m.text}${m.attachment ? ` [${m.attachment.name}]` : ""}`,
      ),
    ].join("\n\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    this.download(url, `${this.chat.conversationId}.txt`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
const extraCss = `
:host{display:block;min-height:0;overflow:visible;font-family:Arial,Helvetica,sans-serif;color:var(--text-main)}
:host([inline]){width:100%;height:100vh;background:transparent}.panel{display:none}.panel.open,:host([inline]) .panel{display:block;height:100%}
:host([inline]) .launcher{display:none}.launcher{position:fixed;right:24px;bottom:24px;z-index:10000;border:1px solid var(--msd-light-blue);background:var(--msd-blue);color:white;border-radius:28px;padding:15px 23px;font-weight:bold;box-shadow:0 12px 40px #0006}
:host(:not([inline])) .panel{position:fixed;right:24px;bottom:88px;z-index:10000;width:min(372px,calc(100vw - 32px));height:min(690px,calc(100dvh - 120px))}
:host(:not([inline])) .customer-screen{padding:0}:host(:not([inline])) .phone-shell{width:100%;height:100%;max-height:none}
:host(:not([inline])) .theme-toggle{display:none}:host(.expanded) .phone-shell{width:min(760px,100%)}
:host(:not([inline]).expanded) .panel{width:min(760px,calc(100vw - 32px))}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--msd-light-blue);outline-offset:3px}
button:disabled{opacity:.45;cursor:not-allowed}[hidden]{display:none!important}.status{font-size:11px;color:var(--msd-green);line-height:1.4;margin:0 0 10px}.status.offline{color:var(--msd-orange)}#error,#pageError{font-size:12px;color:var(--msd-orange);line-height:1.4}#error:not(:empty){padding:7px;background:var(--panel-bg);border-radius:10px}#pageError:not(:empty){margin-top:10px}.message-copy,.faq-answer{white-space:pre-wrap;overflow-wrap:anywhere}.message-time{display:block;opacity:.6;font-size:10px;margin-top:6px}.chat-title p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tool-row{width:100%;text-align:left;color:var(--text-main)}details summary{font-size:13.5px;font-weight:700;cursor:pointer}.faq-answer{margin-top:10px}.ticket-form-field input,.ticket-form-field select,.ticket-form-field textarea{width:100%;color:var(--text-main);background:var(--panel-bg);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:13px}.ticket-form-field textarea{resize:vertical}.form-hint{font-size:11px;color:var(--text-muted);margin-top:10px}.attachment{margin-top:8px;display:grid;gap:6px;font-size:11px}.attachment img,.attachment video{max-width:100%;max-height:240px;border-radius:8px}.attachment audio{max-width:100%;height:36px}.attachment-download{border:1px solid var(--border);background:var(--card-bg);color:var(--text-main);border-radius:8px;padding:7px}.chat-input{min-width:0}.chat-composer-wrap #new{margin:5px auto}.phone-shell{color:var(--text-main)}
`;
if (!customElements.get("chat-msd-widget"))
  customElements.define("chat-msd-widget", ChatMsdWidget);
