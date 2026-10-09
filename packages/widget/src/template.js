// Customer structure and language copy preserved from the approved template.
export const customerMarkup = `<section class="screen customer-screen active" id="customerScreen">
      <div class="phone-shell">
        <div class="customer-home active" id="customerHome">
          <div class="home-top">
            <div class="msd-diamond">
              <span>msd</span>
            </div>

            <div class="home-greeting">
              <h1 id="homeTitle">Hi MSD Customer</h1>
              <p id="homeSubtitle">Get quick support for orders, delivery, zonal contacts, GePG guidance, and complaints.</p>
            </div>
          </div>

          <div class="home-content">
            <div class="section-row">
              <h2 id="quickAccessTitle">Quick Access</h2>
              <button id="moreToolsBtn">More tools ›</button>
            </div>

            <div class="language-box">
              <div class="language-box-top">
                <strong id="languageTitle">Language</strong>
                <span id="languageHint">Choose how you want support</span>
              </div>

              <div class="language-pills">
                <button id="lang-en" class="active">English</button>
                <button id="lang-sw">Kiswahili</button>
                <button id="lang-fr">Français</button>
              </div>
            </div>

            <div class="quick-grid">
              <button class="quick-card">
                <div>
                  <div class="icon">📦</div>
                  <h3 id="orderStatusCard">Order Status</h3>
                </div>

                <div>
                  <div class="progress">
                    <span id="orderConnection">—</span>
                    <span></span>
                  </div>
                  <div class="review-text" id="reviewText">Review</div>
                </div>
              </button>

              <div>
                <button class="quick-card small">
                  <div class="icon">☎</div>
                  <h3 id="zonalContactsCard">Zonal Contacts</h3>
                </button>

                <button class="quick-card small" style="margin-top:12px;">
                  <h3><span id="myTicketsCard">My Tickets</span> <span id="ticketCount" style="color:var(--msd-light-blue); float:right;">0 ›</span></h3>
                </button>
              </div>
            </div>

            <div class="home-action-grid">
              <button class="home-action-card ticket-card-shape">
                <div class="home-action-icon">＋</div>
                <div class="home-action-text">
                  <strong>Open New Ticket</strong>
                  <span>Start a fresh support request for a different issue.</span>
                </div>
                <div class="home-action-arrow">›</div>
              </button>

              <button class="home-action-card ai-card">
                <div class="home-action-icon ai">AI</div>
                <div class="home-action-text">
                  <strong>Speak with MediAssist AI</strong>
                  <span>AI assistant that will help answer MSD service questions instantly.</span>
                  <em class="phase-pill">Coming in Phase Two</em>
                </div>
                <div class="home-action-arrow">›</div>
              </button>
            </div>

            <div class="section-row">
              <h2 id="topicsTitle">Topics</h2>
              <button id="viewAllBtn">View all ›</button>
            </div>

            <div class="topics-grid">
              <button class="topic-card">
                <div class="topic-icon">🏥</div>
                <span id="servicesTopic">MSD Services</span>
              </button>

              <button class="topic-card">
                <div class="topic-icon">🧾</div>
                <span id="orderGuidanceTopic">Order Guidance</span>
              </button>

              <button class="topic-card">
                <div class="topic-icon">📍</div>
                <span id="zonalTopic">Zonal Contacts</span>
              </button>

              <button class="topic-card">
                <div class="topic-icon">💳</div>
                <span id="gepgTopic">GePG</span>
              </button>

              <button class="topic-card">
                <div class="topic-icon">⚠</div>
                <span id="complaintsTopic">Complaints</span>
              </button>

              <button class="topic-card">
                <div class="topic-icon">⭐</div>
                <span id="feedbackTopic">Feedback</span>
              </button>
            </div>
          </div>

          <button class="floating-chat-btn" aria-label="Open chat">
            <span class="flat-chat-icon"></span>
          </button>
        </div>

        <div class="customer-chat" id="customerChat">
          <div class="chat-header">
            <button data-action="home" aria-label="Back to home">‹</button>

            <div class="chat-logo" id="chatLogo">msd</div>

            <div class="chat-title">
              <h2 id="chatSupportTitle">MSD Support</h2>
              <p id="chatSupportSubtitle">Support request</p>
            </div>

            <button id="endSession" aria-label="Leave chat" title="Leave chat">⏻</button>
            <button id="expandChat" aria-label="Expand chat" title="Expand chat">↗</button>
          </div>

          <div class="chat-body body" id="customerChatBody"><div class="status" role="status"></div>
            <button class="history-btn" id="historyBtn">↑ View Chat History</button>

            <div class="message bot">
              <div class="bubble" id="welcomeBubble">👋 Thanks for contacting MSD Support. How can we help you?</div>
            </div>

            <div class="answer-card" id="initialFaqCard">
              <strong id="faqTitle">Frequently asked questions on MSD Customer Service</strong>
              <button id="seeOriginalBtn">See Original</button>
            </div>

            <div id="messages"></div><div class="typing" id="customerTyping">MSD Support is typing...</div>
          </div>

          <div class="chat-composer-wrap"><div id="error" role="alert"></div><button id="new" class="history-btn" hidden>Start a new conversation</button>
            <div class="suggestion-panel" id="suggestionPanel">
              <div class="suggestion-header">
                <span id="suggestedTopicsLabel">Suggested topics</span>
                <button data-action="close-suggestions" aria-label="Close suggestions">×</button>
              </div>
              <div class="suggestion-list" id="suggestionList"></div>
            </div>

            <div class="chat-composer" role="form">
              <button class="plus-btn" id="customerPlusBtn" aria-label="More chat tools" aria-expanded="false">+</button>

              <input
                class="chat-input"
                id="customerInput" name="text" maxlength="5000" aria-label="Message"
                type="text"
                placeholder="Enter question here"
              />

              <button class="send-btn" aria-label="Send message">➤</button>
            </div>

            <div class="tool-drawer" id="customerToolDrawer">
              <button class="drawer-tool">
                <div class="drawer-icon">?</div>
                <span id="drawerFaqs">FAQs</span>
              </button>

              <button class="drawer-tool">
                <div class="drawer-icon">🤝</div>
                <span id="drawerSelfService">Self Service</span>
              </button>

              <button class="drawer-tool">
                <div class="drawer-icon">▤</div>
                <span id="drawerOrders">Orders</span>
              </button>

              <button class="drawer-tool">
                <div class="drawer-icon">☎</div>
                <span id="drawerContacts">Contacts</span>
              </button>

              <button class="drawer-tool">
                <div class="drawer-icon">▣</div>
                <span id="drawerFiles">Files</span>
              </button>

              <button class="drawer-tool">
                <div class="drawer-icon">⚠</div>
                <span id="drawerEscalate">Escalate</span>
              </button>

              <button class="drawer-tool">
                <div class="drawer-icon">★</div>
                <span id="drawerFeedback">Feedback</span>
              </button>
            </div>
          </div>
        </div>

        <div class="dummy-page" id="dummyPage">
          <div class="dummy-header">
            <button data-action="back" aria-label="Go back">‹</button>
            <div>
              <h2 id="dummyTitle">MSD Service</h2>
              <p id="dummySubtitle">MSD Support</p>
            </div>
          </div>

          <div class="dummy-content" id="dummyContent"></div>
        </div>
      </div>
    </section>`;

export const translations = {
  en: {
    homeTitle: "Hi MSD Customer",
    homeSubtitle:
      "Get quick support for orders, delivery, zonal contacts, GePG guidance, and complaints.",
    quickAccess: "Quick Access",
    moreTools: "More tools",
    language: "Language",
    languageHint: "Choose how you want support",
    orderStatus: "Order Status",
    zonalContacts: "Zonal Contacts",
    myTickets: "My Tickets",
    review: "Review",
    topics: "Topics",
    allTopics: "All Topics",
    viewAll: "View all",
    msdServices: "MSD Services",
    orderGuidance: "Order Guidance",
    gepg: "GePG",
    complaints: "Complaints",
    feedback: "Feedback",
    welcome: "👋 Thanks for contacting MSD Support. How can we help you?",
    faq: "Frequently asked questions on MSD Customer Service",
    seeOriginal: "See Original",
    chatPlaceholder: "Enter question here",
    history: "↑ View Chat History",
    suggested: "Suggested topics",
    typing: "MSD Support is typing...",
    escalate: "Escalate",
    faqs: "FAQs",
    selfService: "Self Service",
    orders: "Orders",
    contacts: "Contacts",
    files: "Files",
  },

  sw: {
    homeTitle: "Habari Mteja wa MSD",
    homeSubtitle:
      "Pata msaada wa haraka kuhusu oda, usafirishaji, ofisi za kanda, GePG, na malalamiko.",
    quickAccess: "Huduma za Haraka",
    moreTools: "Zana zaidi",
    language: "Lugha",
    languageHint: "Chagua lugha ya huduma",
    orderStatus: "Hali ya Oda",
    zonalContacts: "Mawasiliano ya Kanda",
    myTickets: "Tiketi Zangu",
    review: "Hakiki",
    topics: "Mada",
    allTopics: "Mada zote",
    viewAll: "Tazama zote",
    msdServices: "Huduma za MSD",
    orderGuidance: "Mwongozo wa Oda",
    gepg: "GePG",
    complaints: "Malalamiko",
    feedback: "Maoni",
    welcome: "👋 Asante kwa kuwasiliana na MSD Support. Tunawezaje kukusaidia?",
    faq: "Maswali yanayoulizwa mara kwa mara kuhusu Huduma kwa Wateja MSD",
    seeOriginal: "Tazama Chanzo",
    chatPlaceholder: "Andika swali hapa",
    history: "↑ Tazama Historia ya Chat",
    suggested: "Mada zilizopendekezwa",
    typing: "MSD Support inaandika...",
    escalate: "Pandisha kwa Afisa",
    faqs: "Maswali",
    selfService: "Huduma Binafsi",
    orders: "Oda",
    contacts: "Mawasiliano",
    files: "Faili",
  },

  fr: {
    homeTitle: "Bonjour Client MSD",
    homeSubtitle:
      "Obtenez une assistance rapide pour les commandes, la livraison, les contacts zonaux, GePG et les plaintes.",
    quickAccess: "Accès Rapide",
    moreTools: "Plus d’outils",
    language: "Langue",
    languageHint: "Choisissez votre langue d’assistance",
    orderStatus: "Statut de Commande",
    zonalContacts: "Contacts Zonaux",
    myTickets: "Mes Tickets",
    review: "Vérifier",
    topics: "Sujets",
    allTopics: "Tous les sujets",
    viewAll: "Voir tout",
    msdServices: "Services MSD",
    orderGuidance: "Guide de Commande",
    gepg: "GePG",
    complaints: "Plaintes",
    feedback: "Retour",
    welcome:
      "👋 Merci d’avoir contacté MSD Support. Comment pouvons-nous vous aider ?",
    faq: "Questions fréquentes sur le service client MSD",
    seeOriginal: "Voir l’original",
    chatPlaceholder: "Entrez votre question ici",
    history: "↑ Voir l’historique",
    suggested: "Sujets suggérés",
    typing: "MSD Support écrit...",
    escalate: "Escalader",
    faqs: "FAQ",
    selfService: "Libre-service",
    orders: "Commandes",
    contacts: "Contacts",
    files: "Fichiers",
  },
};
