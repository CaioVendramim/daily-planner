// ===== Helpers =====
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const pad = (value) => String(value).padStart(2, "0");

const DB_KEY = "dailyPlannerDbV1";
const SESSION_KEY = "dailyPlannerSessionV1";
const GUEST_KEY = "dailyPlannerGuestDataV1";
const NOTIFICATION_SETTINGS_KEY = "dailyPlannerNotificationSettingsV1";
const WHEEL_ITEM_HEIGHT = 40;
const YEAR_START = 1900;
const YEAR_END = 2500;
const ORIGINAL_TITLE = document.title;
let titleAlertInterval = null;

const MUSIC_CONFIG = {
  spotify: {
    clientId: "42062fe7d8404242a0496b793d9b3957",
    scopes: ["playlist-read-private", "playlist-read-collaborative", "user-library-read", "user-read-private"],
  },
  apple: {
    developerToken: "",
  },
  youtube: {
    clientId: "1004772828278-st44da5dqlfdcig62soabruhvn40o2ui.apps.googleusercontent.com",
    scopes: "https://www.googleapis.com/auth/youtube.readonly",
  },
};
const MUSIC_OAUTH_KEY = "dailyPlannerMusicOAuthV1";
const MUSIC_TOKENS_KEY = "dailyPlannerMusicTokensV1";

let selectedMusicProvider = "spotify";
let youtubeTokenClient = null;

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const monthShortNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const state = {
  currentDate: new Date(),
  currentUserEmail: null,
  todos: [],
  tasksByDate: {},
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month || parsed.getDate() !== day) return null;
  return parsed;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return typeof fallback === "function" ? fallback() : clone(fallback);
    return JSON.parse(raw);
  } catch {
    return typeof fallback === "function" ? fallback() : clone(fallback);
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can fail in private browsing or when the quota is full.
  }
}

function removeJson(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Keep the UI responsive even if localStorage is unavailable.
  }
}

// ===== Local account database =====
function defaultTodos() {
  return [
    { text: "texto", done: false },
    { text: "texto", done: false },
    { text: "texto", done: false },
    { text: "texto", done: false },
    { text: "texto", done: false },
  ];
}

function defaultTasks() {
  return [
    { id: 1, time: "14:30", text: "texto", color: "#000000", bg: "transparent", desc: "", done: false },
    { id: 2, time: "14:30", text: "texto", color: "#000000", bg: "transparent", desc: "", done: false },
    { id: 3, time: "16:46", text: "texto", color: "#000000", bg: "transparent", desc: "", done: false },
    { id: 4, time: "20:00", text: "texto", color: "#000000", bg: "transparent", desc: "", done: false },
  ];
}

function defaultPlannerData() {
  return {
    currentDate: dateKey(new Date()),
    todos: defaultTodos(),
    tasksByDate: {},
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function readDb() {
  const db = readJson(DB_KEY, { users: [] });
  return db && Array.isArray(db.users) ? db : { users: [] };
}

function writeDb(db) {
  writeJson(DB_KEY, db);
}

function getCurrentUser(db = readDb()) {
  if (!state.currentUserEmail) return null;
  return db.users.find((user) => user.email === state.currentUserEmail) || null;
}

function syncSession() {
  const email = normalizeEmail(readJson(SESSION_KEY, ""));
  const db = readDb();
  const user = db.users.find((item) => item.email === email);
  state.currentUserEmail = user ? user.email : null;
  if (!user) removeJson(SESSION_KEY);
}

function setSession(email) {
  state.currentUserEmail = email ? normalizeEmail(email) : null;
  if (state.currentUserEmail) {
    writeJson(SESSION_KEY, state.currentUserEmail);
  } else {
    removeJson(SESSION_KEY);
  }
}

function normalizeTask(task, index) {
  return {
    id: Number.isFinite(Number(task?.id)) ? Number(task.id) : Date.now() + index,
    time: typeof task?.time === "string" ? task.time : "14:30",
    text: typeof task?.text === "string" ? task.text : "texto",
    color: typeof task?.color === "string" ? task.color : "#000000",
    bg: typeof task?.bg === "string" ? task.bg : "transparent",
    desc: typeof task?.desc === "string" ? task.desc : "",
    done: Boolean(task?.done),
  };
}

function normalizePlannerData(data) {
  const fallback = defaultPlannerData();
  if (!data || typeof data !== "object") return fallback;

  const parsedDate = parseDateKey(data.currentDate);
  const tasksByDate = {};

  if (data.tasksByDate && typeof data.tasksByDate === "object") {
    Object.entries(data.tasksByDate).forEach(([key, tasks]) => {
      if (parseDateKey(key) && Array.isArray(tasks)) {
        tasksByDate[key] = tasks.map(normalizeTask);
      }
    });
  }

  return {
    currentDate: parsedDate ? dateKey(parsedDate) : fallback.currentDate,
    todos: Array.isArray(data.todos)
      ? data.todos.map((todo) => ({
          text: typeof todo?.text === "string" ? todo.text : "",
          done: Boolean(todo?.done),
        }))
      : fallback.todos,
    tasksByDate,
  };
}

function snapshotPlannerData() {
  return {
    currentDate: dateKey(state.currentDate),
    todos: clone(state.todos),
    tasksByDate: clone(state.tasksByDate),
  };
}

function loadPlannerData() {
  const db = readDb();
  const user = getCurrentUser(db);
  const stored = user ? user.planner : readJson(GUEST_KEY, null);
  const data = normalizePlannerData(stored);
  state.currentDate = parseDateKey(data.currentDate) || new Date();
  state.todos = data.todos;
  state.tasksByDate = data.tasksByDate;
}

function persistPlannerData() {
  const data = snapshotPlannerData();

  if (state.currentUserEmail) {
    const db = readDb();
    const user = getCurrentUser(db);
    if (user) {
      user.planner = data;
      writeDb(db);
      return;
    }
  }

  writeJson(GUEST_KEY, data);
}

async function hashPassword(password) {
  if (window.crypto?.subtle && window.TextEncoder) {
    const bytes = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `sha256:${hash}`;
  }
  return `plain:${password}`;
}

async function passwordMatches(storedHash, password) {
  const hash = await hashPassword(password);
  return storedHash === hash || storedHash === `plain:${password}`;
}

function getInitials(user) {
  const source = user?.name || user?.email || "";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function createUserId() {
  return window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function updateCurrentUser(mutator) {
  const db = readDb();
  const user = getCurrentUser(db);
  if (!user) return null;
  mutator(user, db);
  writeDb(db);
  return user;
}

// ===== Account UI =====
function renderAccountButton(user) {
  const button = $("#userButton");
  if (!button) return;

  button.innerHTML = "";
  button.classList.toggle("has-user", Boolean(user));

  const icon = document.createElement("span");
  if (user?.avatar) {
    const photo = document.createElement("img");
    photo.className = "user-photo";
    photo.src = user.avatar;
    photo.alt = "";
    button.appendChild(photo);
    return;
  }

  if (user) {
    icon.className = "user-initials";
    icon.textContent = getInitials(user);
  } else {
    icon.className = "user-icon";
    icon.setAttribute("aria-hidden", "true");
  }
  button.appendChild(icon);
}

function closeAccountDropdown() {
  const dropdown = $("#accountDropdown");
  const button = $("#userButton");
  if (!dropdown || !button) return;
  dropdown.hidden = true;
  button.setAttribute("aria-expanded", "false");
}

function addDropdownButton(parent, label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `dropdown-item ${className || ""}`.trim();
  button.textContent = label;
  button.addEventListener("click", handler);
  parent.appendChild(button);
}

function addDropdownSeparator(parent) {
  const separator = document.createElement("div");
  separator.className = "dropdown-separator";
  parent.appendChild(separator);
}

function renderAccountDropdown() {
  const dropdown = $("#accountDropdown");
  if (!dropdown) return;

  const user = getCurrentUser();
  renderAccountButton(user);
  dropdown.innerHTML = "";

  if (user) {
    addDropdownButton(dropdown, "My profile", "active", () => {
      closeAccountDropdown();
      window.location.href = "profile.html";
    });
    addDropdownButton(dropdown, "Notifications", "", openNotificationsModal);
    addDropdownSeparator(dropdown);
    addDropdownButton(dropdown, "Logout", "", () => {
      persistPlannerData();
      setSession(null);
      loadPlannerData();
      refreshPlanner();
      closeAccountDropdown();
      renderAccountDropdown();
      renderProfilePage();
      if ($(".profile-page")) window.location.href = "index.html";
    });
  } else {
    addDropdownButton(dropdown, "Log In", "", () => openAuthModal("loginModal"));
    addDropdownButton(dropdown, "Create Account", "", () => openAuthModal("signupModal"));
  }
}

function toggleAccountDropdown(event) {
  event.stopPropagation();
  const dropdown = $("#accountDropdown");
  const button = $("#userButton");
  if (!dropdown || !button) return;

  const shouldOpen = dropdown.hidden;
  renderAccountDropdown();
  dropdown.hidden = !shouldOpen;
  button.setAttribute("aria-expanded", String(shouldOpen));
}

function openAuthModal(id) {
  closeAccountDropdown();
  closeModals();
  const modal = $(`#${id}`);
  if (!modal) return;

  const form = $("form", modal);
  if (form) form.reset();
  $$(".form-message", modal).forEach((message) => {
    message.textContent = "";
    message.classList.remove("success");
  });

  modal.hidden = false;
  $("input", modal)?.focus();
}

function setFormMessage(selector, text, success = false) {
  const message = $(selector);
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("success", success);
}

function stopTitleAlert() {
  if (titleAlertInterval) clearInterval(titleAlertInterval);
  titleAlertInterval = null;
  document.title = ORIGINAL_TITLE;
}

function startTitleAlert(text) {
  if (!document.hidden) return;
  stopTitleAlert();

  let visible = true;
  document.title = `(${text}) ${ORIGINAL_TITLE}`;
  titleAlertInterval = setInterval(() => {
    document.title = visible ? ORIGINAL_TITLE : `(${text}) ${ORIGINAL_TITLE}`;
    visible = !visible;
  }, 900);
}

function getNotificationSettings() {
  const user = getCurrentUser();
  if (user) return { browser: Boolean(user.notifications?.browser) };
  return readJson(NOTIFICATION_SETTINGS_KEY, { browser: false });
}

function saveNotificationSettings(settings) {
  const normalized = { browser: Boolean(settings?.browser) };
  const db = readDb();
  const user = getCurrentUser(db);

  if (user) {
    user.notifications = { ...(user.notifications || {}), ...normalized };
    writeDb(db);
  } else {
    writeJson(NOTIFICATION_SETTINGS_KEY, normalized);
  }
}

async function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) {
    return { ok: false, message: "Este navegador não suporta notificações." };
  }

  if (!window.isSecureContext) {
    return { ok: false, message: "Notificações precisam rodar em localhost ou HTTPS." };
  }

  if (Notification.permission === "granted") {
    return { ok: true, message: "Notificações ativadas.", success: true };
  }

  if (Notification.permission === "denied") {
    return { ok: false, message: "As notificações estão bloqueadas no navegador." };
  }

  const permission = await Notification.requestPermission();
  return permission === "granted"
    ? { ok: true, message: "Notificações ativadas.", success: true }
    : { ok: false, message: "Permissão de notificação não ativada." };
}

function openNotificationsModal() {
  closeAccountDropdown();
  closeModals();

  const modal = $("#notificationsModal");
  const input = $("#browserNotificationsInput");
  if (!modal || !input) return;

  const settings = getNotificationSettings();
  input.checked = Boolean(settings.browser && "Notification" in window && Notification.permission === "granted");

  if (!("Notification" in window)) {
    setFormMessage("#notificationsMessage", "Este navegador não suporta notificações.");
  } else if (!window.isSecureContext) {
    setFormMessage("#notificationsMessage", "Notificações precisam rodar em localhost ou HTTPS.");
  } else if (Notification.permission === "denied") {
    setFormMessage("#notificationsMessage", "As notificações estão bloqueadas no navegador.");
  } else {
    setFormMessage("#notificationsMessage", "");
  }

  modal.hidden = false;
  input.focus();
}

function showBrowserNotification(title, body) {
  const settings = getNotificationSettings();
  if (!settings.browser) return;

  if ("Notification" in window && window.isSecureContext && Notification.permission === "granted") {
    try {
      const notification = new Notification(title, {
        body,
        icon: "images/04.png",
        requireInteraction: true,
        tag: "daily-planner-pomodoro",
      });
      notification.onclick = () => {
        window.focus();
        stopTitleAlert();
        notification.close();
      };
    } catch {
      // The title alert below still gives feedback when the browser blocks native notifications.
    }
  }

  startTitleAlert(title);
}

function refreshAfterAccountChange() {
  loadPlannerData();
  refreshPlanner();
  renderAccountDropdown();
  renderProfilePage();
}

// ===== Music integrations =====
const musicProviderNames = {
  spotify: "Spotify",
  apple: "Apple Music",
  youtube: "YouTube Music",
};

function getMusicRedirectUri() {
  if (location.origin === "null") return "";
  return `${location.origin}${location.pathname}`;
}

function readMusicTokens() {
  return readJson(MUSIC_TOKENS_KEY, {});
}

function saveMusicToken(provider, token) {
  const tokens = readMusicTokens();
  const previous = tokens[provider] || {};
  tokens[provider] = {
    ...previous,
    ...token,
    refresh_token: token.refresh_token || previous.refresh_token || "",
    expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : token.expiresAt,
  };
  writeJson(MUSIC_TOKENS_KEY, tokens);
}

function getStoredMusicToken(provider) {
  return readMusicTokens()[provider] || null;
}

function getMusicAccessToken(provider) {
  const token = getStoredMusicToken(provider);
  if (!token?.access_token) return "";
  if (token.expiresAt && token.expiresAt < Date.now() + 60000) return "";
  return token.access_token;
}

async function refreshSpotifyAccessToken() {
  const token = getStoredMusicToken("spotify");
  if (!token?.refresh_token || !MUSIC_CONFIG.spotify.clientId) return "";

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MUSIC_CONFIG.spotify.clientId,
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
      }),
    });

    if (!response.ok) throw new Error("Spotify refresh failed");
    const refreshed = await response.json();
    saveMusicToken("spotify", refreshed);
    return refreshed.access_token || "";
  } catch {
    return "";
  }
}

async function getValidSpotifyAccessToken() {
  return getMusicAccessToken("spotify") || await refreshSpotifyAccessToken();
}

function setMusicMessage(text, success = false) {
  setFormMessage("#musicProviderMessage", text, success);
}

function loadExternalScript(src, id) {
  return new Promise((resolve, reject) => {
    if (id && document.getElementById(id)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    if (id) script.id = id;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function randomToken(length = 48) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => chars[byte % chars.length]).join("");
}

function base64Url(buffer) {
  let binary = "";
  new Uint8Array(buffer).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createSpotifyChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64Url(digest);
}

function providerConfigMessage(provider) {
  if (provider === "spotify") return "Para login real, preencha MUSIC_CONFIG.spotify.clientId no script.js e cadastre esta URL como Redirect URI no painel do Spotify.";
  if (provider === "youtube") return "Para login real, preencha MUSIC_CONFIG.youtube.clientId no script.js e habilite a YouTube Data API no Google Cloud.";
  return "Para login real, preencha MUSIC_CONFIG.apple.developerToken no script.js. O token da Apple precisa ser gerado no backend com sua chave privada.";
}

function renderMusicLibrary(items) {
  const library = $("#musicLibrary");
  if (!library) return;
  library.innerHTML = "";

  if (!items.length) {
    library.textContent = "Nenhuma playlist ou musica encontrada.";
    return;
  }

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "music-library-item";

    const image = document.createElement("img");
    image.alt = "";
    if (item.image) image.src = item.image;

    const copy = document.createElement("span");
    const title = document.createElement("span");
    title.className = "music-library-title";
    title.textContent = item.title;
    const meta = document.createElement("span");
    meta.className = "music-library-meta";
    meta.textContent = item.meta || musicProviderNames[item.provider];
    copy.append(title, meta);

    button.append(image, copy);
    button.addEventListener("click", () => playMusicEmbed(item.provider, item));
    library.appendChild(button);
  });
}

function parseMusicUrl(provider, value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);

    if (provider === "spotify") {
      const match = url.pathname.match(/\/(?:intl-[^/]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/);
      if (match) return { provider, type: match[1], id: match[2], title: "Spotify" };
    }

    if (provider === "youtube") {
      const list = url.searchParams.get("list");
      const video = url.searchParams.get("v") || (url.hostname.includes("youtu.be") ? url.pathname.slice(1) : "");
      if (list) return { provider, type: "playlist", id: list, title: "YouTube Music" };
      if (video) return { provider, type: "video", id: video, title: "YouTube Music" };
    }

    if (provider === "apple" && url.hostname.includes("music.apple.com")) {
      return { provider, type: "url", embedUrl: raw.replace("https://music.apple.com", "https://embed.music.apple.com"), title: "Apple Music" };
    }
  } catch {
    return null;
  }

  return null;
}

function playMusicEmbed(provider, item) {
  const embed = $("#musicEmbed");
  const status = $("#musicStatus");
  if (!embed) return;

  let src = item.embedUrl || "";
  let height = 180;

  if (provider === "spotify") {
    src = `https://open.spotify.com/embed/${item.type}/${item.id}?utm_source=generator`;
    height = item.type === "track" ? 152 : 352;
  } else if (provider === "youtube") {
    src = item.type === "playlist"
      ? `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(item.id)}`
      : `https://www.youtube.com/embed/${encodeURIComponent(item.id)}`;
    height = 180;
  } else if (provider === "apple") {
    height = 175;
  }

  if (!src) {
    setMusicMessage("Nao consegui montar o player desse link.");
    return;
  }

  embed.hidden = false;
  embed.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.height = String(height);
  iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
  iframe.loading = "lazy";
  embed.appendChild(iframe);

  if (status) status.textContent = `Tocando via ${musicProviderNames[provider]}.`;
  closeModals();
}

function renderMusicPanel(provider) {
  selectedMusicProvider = provider;
  const panel = $("#musicPanel");
  if (!panel) return;

  panel.innerHTML = "";

  const message = document.createElement("p");
  message.className = "form-message";
  message.id = "musicProviderMessage";

  const actions = document.createElement("div");
  actions.className = "music-actions";

  const login = document.createElement("button");
  login.type = "button";
  login.className = "primary";
  login.textContent = `Entrar com ${musicProviderNames[provider]}`;
  login.addEventListener("click", () => connectMusicProvider(provider));

  const load = document.createElement("button");
  load.type = "button";
  load.className = "ghost";
  load.textContent = "Carregar biblioteca";
  load.addEventListener("click", () => loadMusicLibrary(provider));

  actions.append(login, load);

  const urlRow = document.createElement("div");
  urlRow.className = "music-url-row";

  const input = document.createElement("input");
  input.type = "url";
  input.id = "musicUrlInput";
  input.placeholder = `Cole um link do ${musicProviderNames[provider]}`;

  const play = document.createElement("button");
  play.type = "button";
  play.className = "primary";
  play.textContent = "Tocar";
  play.addEventListener("click", () => {
    const parsed = parseMusicUrl(provider, input.value);
    if (!parsed) {
      setMusicMessage("Cole um link valido desse player.");
      return;
    }
    playMusicEmbed(provider, parsed);
  });

  urlRow.append(input, play);

  const note = document.createElement("p");
  note.className = "music-config-note";
  note.textContent = providerConfigMessage(provider);

  const library = document.createElement("div");
  library.className = "music-library";
  library.id = "musicLibrary";

  panel.append(message, actions, urlRow, note, library);
}

function openMusicModal() {
  closeModals();
  const modal = $("#musicModal");
  if (!modal) return;

  $$(".music-provider").forEach((button) => {
    button.classList.toggle("active", button.dataset.musicProvider === selectedMusicProvider);
  });
  renderMusicPanel(selectedMusicProvider);
  modal.hidden = false;
}

async function startSpotifyLogin() {
  if (!MUSIC_CONFIG.spotify.clientId) {
    setMusicMessage(providerConfigMessage("spotify"));
    return;
  }

  if (!window.isSecureContext || !crypto?.subtle) {
    setMusicMessage("O login do Spotify precisa rodar em localhost ou HTTPS.");
    return;
  }

  const redirectUri = getMusicRedirectUri();
  if (!redirectUri) {
    setMusicMessage("Abra o site via localhost para usar login real.");
    return;
  }

  const verifier = randomToken();
  const challenge = await createSpotifyChallenge(verifier);
  const state = randomToken(24);
  writeJson(MUSIC_OAUTH_KEY, { provider: "spotify", state, verifier, redirectUri });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: MUSIC_CONFIG.spotify.clientId,
    scope: MUSIC_CONFIG.spotify.scopes.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    redirect_uri: redirectUri,
    state,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function handleSpotifyAuthRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  const stored = readJson(MUSIC_OAUTH_KEY, null);
  if (!code || !state || stored?.provider !== "spotify") return;

  history.replaceState(null, "", location.pathname);

  if (state !== stored.state) {
    removeJson(MUSIC_OAUTH_KEY);
    openMusicModal();
    setMusicMessage("Nao consegui validar o login do Spotify.");
    return;
  }

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MUSIC_CONFIG.spotify.clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: stored.redirectUri,
        code_verifier: stored.verifier,
      }),
    });

    if (!response.ok) throw new Error("Spotify token failed");
    const token = await response.json();
    saveMusicToken("spotify", token);
    removeJson(MUSIC_OAUTH_KEY);
    selectedMusicProvider = "spotify";
    openMusicModal();
    setMusicMessage("Spotify conectado. Vou manter seu login salvo neste navegador.", true);
    await loadSpotifyLibrary(token.access_token);
  } catch {
    openMusicModal();
    setMusicMessage("Nao consegui finalizar o login do Spotify.");
  }
}

async function loadSpotifyLibrary(accessToken = null) {
  accessToken ||= await getValidSpotifyAccessToken();

  if (!accessToken) {
    setMusicMessage("Entre com Spotify uma vez para salvar o acesso, ou cole um link.");
    return;
  }

  try {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [playlistsResponse, tracksResponse] = await Promise.all([
      fetch("https://api.spotify.com/v1/me/playlists?limit=20", { headers }),
      fetch("https://api.spotify.com/v1/me/tracks?limit=20", { headers }),
    ]);
    if (!playlistsResponse.ok || !tracksResponse.ok) throw new Error("Spotify library failed");

    const playlists = await playlistsResponse.json();
    const tracks = await tracksResponse.json();
    const items = [
      ...(playlists.items || []).map((playlist) => ({
        provider: "spotify",
        type: "playlist",
        id: playlist.id,
        title: playlist.name,
        meta: "Playlist",
        image: playlist.images?.[0]?.url || "",
      })),
      ...(tracks.items || []).map(({ track }) => ({
        provider: "spotify",
        type: "track",
        id: track.id,
        title: track.name,
        meta: track.artists?.map((artist) => artist.name).join(", ") || "Musica",
        image: track.album?.images?.[0]?.url || "",
      })),
    ];

    renderMusicLibrary(items);
    setMusicMessage("Escolha uma playlist ou musica.", true);
  } catch {
    setMusicMessage("Nao consegui carregar sua biblioteca do Spotify.");
  }
}

async function connectYouTubeMusic() {
  if (!MUSIC_CONFIG.youtube.clientId) {
    setMusicMessage(providerConfigMessage("youtube"));
    return;
  }

  try {
    await loadExternalScript("https://accounts.google.com/gsi/client", "googleIdentityServices");
    youtubeTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: MUSIC_CONFIG.youtube.clientId,
      scope: MUSIC_CONFIG.youtube.scopes,
      callback: async (response) => {
        if (response.error || !response.access_token) {
          setMusicMessage("Nao consegui entrar no YouTube Music.");
          return;
        }
        saveMusicToken("youtube", response);
        await loadYouTubeLibrary(response.access_token);
      },
    });
    youtubeTokenClient.requestAccessToken({ prompt: "consent" });
  } catch {
    setMusicMessage("Nao consegui abrir o login do YouTube Music.");
  }
}

async function loadYouTubeLibrary(accessToken = getMusicAccessToken("youtube")) {
  if (!accessToken) {
    setMusicMessage("Entre com YouTube Music primeiro ou cole um link.");
    return;
  }

  try {
    const response = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=25", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("YouTube library failed");

    const data = await response.json();
    const items = (data.items || []).map((playlist) => ({
      provider: "youtube",
      type: "playlist",
      id: playlist.id,
      title: playlist.snippet?.title || "Playlist",
      meta: `${playlist.contentDetails?.itemCount || 0} videos`,
      image: playlist.snippet?.thumbnails?.default?.url || "",
    }));

    renderMusicLibrary(items);
    setMusicMessage("Escolha uma playlist.", true);
  } catch {
    setMusicMessage("Nao consegui carregar playlists do YouTube.");
  }
}

async function connectAppleMusic() {
  if (!MUSIC_CONFIG.apple.developerToken) {
    setMusicMessage(providerConfigMessage("apple"));
    return;
  }

  try {
    await loadExternalScript("https://js-cdn.music.apple.com/musickit/v3/musickit.js", "musicKitJs");
    await new Promise((resolve) => {
      if (window.MusicKit) resolve();
      document.addEventListener("musickitloaded", resolve, { once: true });
    });

    const music = MusicKit.getInstance?.() || MusicKit.configure({
      developerToken: MUSIC_CONFIG.apple.developerToken,
      app: { name: "Daily Planner", build: "1.0.0" },
    });

    await music.authorize();
    const response = await music.api.music("/v1/me/library/playlists", { limit: 25 });
    const playlists = response?.data?.data || response?.data || [];
    const items = playlists.map((playlist) => ({
      provider: "apple",
      type: "url",
      title: playlist.attributes?.name || "Playlist",
      meta: "Apple Music",
      image: playlist.attributes?.artwork?.url?.replace("{w}x{h}", "100x100") || "",
      embedUrl: playlist.attributes?.url?.replace("https://music.apple.com", "https://embed.music.apple.com") || "",
    })).filter((item) => item.embedUrl);

    renderMusicLibrary(items);
    setMusicMessage("Escolha uma playlist.", true);
  } catch {
    setMusicMessage("Nao consegui entrar no Apple Music.");
  }
}

function connectMusicProvider(provider) {
  if (provider === "spotify") startSpotifyLogin();
  if (provider === "youtube") connectYouTubeMusic();
  if (provider === "apple") connectAppleMusic();
}

function loadMusicLibrary(provider) {
  if (provider === "spotify") loadSpotifyLibrary();
  if (provider === "youtube") loadYouTubeLibrary();
  if (provider === "apple") connectAppleMusic();
}

function initMusic() {
  $("#musicConnectBtn")?.addEventListener("click", openMusicModal);
  $$(".music-provider").forEach((button) => {
    button.addEventListener("click", () => {
      selectedMusicProvider = button.dataset.musicProvider;
      $$(".music-provider").forEach((item) => item.classList.toggle("active", item === button));
      renderMusicPanel(selectedMusicProvider);
    });
  });
  handleSpotifyAuthRedirect();
}

function initAccount() {
  $("#userButton")?.addEventListener("click", toggleAccountDropdown);
  document.addEventListener("click", (event) => {
    const widget = $("#accountWidget");
    if (widget && !widget.contains(event.target)) closeAccountDropdown();
  });

  $("#browserNotificationsInput")?.addEventListener("change", async (event) => {
    const input = event.target;

    if (!input.checked) {
      saveNotificationSettings({ browser: false });
      setFormMessage("#notificationsMessage", "Notificações desativadas.");
      return;
    }

    const result = await requestBrowserNotificationPermission();
    saveNotificationSettings({ browser: result.ok });
    input.checked = result.ok;
    if (result.ok) {
      showBrowserNotification("Notificações ativadas", "Você receberá um aviso quando o foco virar break.");
      setFormMessage("#notificationsMessage", "Notificações ativadas. Enviei uma notificação de teste.", true);
    } else {
      setFormMessage("#notificationsMessage", result.message);
    }
  });

  $("#loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = normalizeEmail($("#loginEmail")?.value);
    const password = $("#loginPassword")?.value || "";
    const db = readDb();
    const user = db.users.find((item) => item.email === email);

    if (!user) {
      setFormMessage("#loginMessage", "Conta não encontrada.");
      return;
    }

    if (!(await passwordMatches(user.passwordHash, password))) {
      setFormMessage("#loginMessage", "Email ou senha incorretos.");
      return;
    }

    persistPlannerData();
    setSession(user.email);
    closeModals();
    refreshAfterAccountChange();
  });

  $("#signupForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = ($("#signupName")?.value || "").trim();
    const email = normalizeEmail($("#signupEmail")?.value);
    const password = $("#signupPassword")?.value || "";
    const db = readDb();

    if (!name || !email || !password) {
      setFormMessage("#signupMessage", "Preencha todos os campos.");
      return;
    }

    if (db.users.some((user) => user.email === email)) {
      setFormMessage("#signupMessage", "Esse email já tem uma conta.");
      return;
    }

    const user = {
      id: createUserId(),
      name,
      email,
      passwordHash: await hashPassword(password),
      emailConfirmed: false,
      notifications: { browser: false },
      createdAt: new Date().toISOString(),
      planner: snapshotPlannerData(),
    };

    db.users.push(user);
    writeDb(db);
    setSession(email);
    closeModals();
    refreshAfterAccountChange();
  });

  renderAccountDropdown();
}

// ===== Planner =====
let activeTaskMenuTarget = null;
let dayCarouselAnimating = false;

function hideTodoContextMenu() {
  const menu = $("#todoContextMenu");
  if (!menu) return;
  menu.hidden = true;
  activeTaskMenuTarget = null;
}

function showTaskContextMenu(target, event) {
  const menu = $("#todoContextMenu");
  if (!menu) return;

  activeTaskMenuTarget = target;
  menu.hidden = false;

  const edgePadding = 8;
  const rect = menu.getBoundingClientRect();
  const maxLeft = Math.max(edgePadding, window.innerWidth - rect.width - edgePadding);
  const maxTop = Math.max(edgePadding, window.innerHeight - rect.height - edgePadding);
  const left = clamp(event.clientX, edgePadding, maxLeft);
  const top = clamp(event.clientY, edgePadding, maxTop);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function showTodoContextMenu(index, event) {
  showTaskContextMenu({ type: "todo", index }, event);
}

function showTimelineContextMenu(id, event) {
  showTaskContextMenu({ type: "timeline", id }, event);
}

function deleteActiveTaskMenuTarget() {
  if (!activeTaskMenuTarget) {
    hideTodoContextMenu();
    return;
  }

  if (activeTaskMenuTarget.type === "todo") {
    const { index } = activeTaskMenuTarget;
    if (state.todos[index]) {
      state.todos.splice(index, 1);
      persistPlannerData();
      renderTodos();
    }
  }

  if (activeTaskMenuTarget.type === "timeline") {
    const tasks = getTasks();
    const index = tasks.findIndex((task) => task.id === activeTaskMenuTarget.id);
    if (index >= 0) {
      tasks.splice(index, 1);
      persistPlannerData();
      renderTimeline();
    }
  }

  hideTodoContextMenu();
}

function renderDays() {
  const monthLabel = $("#carouselMonthYear");
  if (monthLabel) {
    monthLabel.textContent = `${monthNames[state.currentDate.getMonth()]} ${state.currentDate.getFullYear()}`;
  }

  $$(".day").forEach((button) => {
    const offset = parseInt(button.dataset.offset, 10);
    const date = new Date(state.currentDate);
    date.setDate(date.getDate() + offset);
    button.textContent = pad(date.getDate());
  });
}

function changeCurrentDate(date) {
  state.currentDate = date;
  persistPlannerData();
  renderDays();
  renderTimeline();
}

function animateDayChange(date, direction) {
  const carousel = $(".days-carousel");
  const track = $(".days-track");

  if (!carousel || !track || !Element.prototype.animate) {
    changeCurrentDate(date);
    return;
  }

  if (dayCarouselAnimating) return;

  dayCarouselAnimating = true;
  const step = direction > 0 ? 1 : -1;
  const buttons = $$(".day", track);
  const trackRect = track.getBoundingClientRect();
  const rectsByOffset = new Map();
  const animations = [];

  buttons.forEach((button) => {
    rectsByOffset.set(Number(button.dataset.offset), button.getBoundingClientRect());
    button.disabled = true;
  });

  const toLocalRect = (rect) => ({
    left: rect.left - trackRect.left,
    top: rect.top - trackRect.top,
    width: rect.width,
    height: rect.height,
  });

  const offRect = (offset) => {
    const outer = rectsByOffset.get(offset > 0 ? 2 : -2);
    const inner = rectsByOffset.get(offset > 0 ? 1 : -1);
    const deltaX = outer.left - inner.left;
    const deltaY = outer.top - inner.top;

    return {
      left: outer.left + deltaX - trackRect.left,
      top: outer.top + deltaY - 12 - trackRect.top,
      width: outer.width * 0.72,
      height: outer.height * 0.72,
    };
  };

  const slotRect = (offset) => {
    const rect = rectsByOffset.get(offset);
    return rect ? toLocalRect(rect) : offRect(offset);
  };

  const slotStyle = (offset) => ({
    opacity: Math.abs(offset) > 2 ? 0 : (Math.abs(offset) === 2 ? 0.45 : Math.abs(offset) === 1 ? 0.8 : 1),
    backgroundColor: offset === 0 ? "#f4a3a3" : "rgba(255,255,255,0)",
    boxShadow: offset === 0 ? "0 6px 14px rgba(244,163,163,.45)" : "0 0 0 rgba(244,163,163,0)",
    fontWeight: offset === 0 ? "700" : "400",
  });

  const createClone = (text, sourceButton, startOffset, targetOffset) => {
    const cloneButton = sourceButton.cloneNode(true);
    const start = slotRect(startOffset);
    const end = slotRect(targetOffset);
    const startStyle = slotStyle(startOffset);
    const endStyle = slotStyle(targetOffset);

    cloneButton.classList.add("day-anim-clone");
    cloneButton.textContent = text;
    cloneButton.style.left = `${start.left}px`;
    cloneButton.style.top = `${start.top}px`;
    cloneButton.style.width = `${start.width}px`;
    cloneButton.style.height = `${start.height}px`;
    cloneButton.style.opacity = startStyle.opacity;
    cloneButton.style.backgroundColor = startStyle.backgroundColor;
    cloneButton.style.boxShadow = startStyle.boxShadow;
    cloneButton.style.fontWeight = startStyle.fontWeight;
    track.appendChild(cloneButton);

    const animation = cloneButton.animate(
      [
        {
          left: `${start.left}px`,
          top: `${start.top}px`,
          width: `${start.width}px`,
          height: `${start.height}px`,
          opacity: startStyle.opacity,
          backgroundColor: startStyle.backgroundColor,
          boxShadow: startStyle.boxShadow,
          fontWeight: startStyle.fontWeight,
          transform: `rotate(0deg)`,
        },
        {
          left: `${(start.left + end.left) / 2}px`,
          top: `${(start.top + end.top) / 2}px`,
          width: `${(start.width + end.width) / 2}px`,
          height: `${(start.height + end.height) / 2}px`,
          opacity: Math.max(startStyle.opacity, endStyle.opacity) * 0.88,
          backgroundColor: endStyle.backgroundColor,
          boxShadow: endStyle.boxShadow,
          fontWeight: endStyle.fontWeight,
          transform: `rotate(${step * 150}deg)`,
        },
        {
          left: `${end.left}px`,
          top: `${end.top}px`,
          width: `${end.width}px`,
          height: `${end.height}px`,
          opacity: endStyle.opacity,
          backgroundColor: endStyle.backgroundColor,
          boxShadow: endStyle.boxShadow,
          fontWeight: endStyle.fontWeight,
          transform: `rotate(${step * 360}deg)`,
        },
      ],
      {
        duration: 300,
        easing: "cubic-bezier(.42,0,.2,1)",
        fill: "forwards",
      }
    );

    animations.push(animation.finished.finally(() => cloneButton.remove()));
  };

  carousel.classList.add("is-animating");

  buttons.forEach((button) => {
    const offset = Number(button.dataset.offset);
    createClone(button.textContent, button, offset, offset - step);
  });

  const incomingOffset = step > 0 ? 3 : -3;
  const incomingTarget = step > 0 ? 2 : -2;
  const incomingDate = new Date(state.currentDate);
  incomingDate.setDate(incomingDate.getDate() + incomingOffset);
  createClone(pad(incomingDate.getDate()), buttons[step > 0 ? buttons.length - 1 : 0], incomingOffset, incomingTarget);

  Promise.all(animations).finally(() => {
    changeCurrentDate(date);
    carousel.classList.remove("is-animating");
    $$(".day", track).forEach((button) => {
      button.disabled = false;
    });
    dayCarouselAnimating = false;
  });
}

function renderTodos() {
  const list = $("#todoList");
  if (!list) return;

  list.innerHTML = "";
  state.todos.forEach((todo, index) => {
    const item = document.createElement("li");
    item.dataset.index = index;

    const bullet = document.createElement("span");
    bullet.className = `bullet ${todo.done ? "done" : ""}`.trim();
    bullet.dataset.index = index;
    bullet.setAttribute("role", "button");
    bullet.setAttribute("tabindex", "0");

    const input = document.createElement("input");
    input.className = "todo-text";
    input.value = todo.text;
    input.dataset.index = index;

    item.append(bullet, input);
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showTodoContextMenu(index, event);
    });
    list.appendChild(item);
  });

  $$(".bullet", list).forEach((bullet) => {
    const toggle = () => {
      const index = Number(bullet.dataset.index);
      state.todos[index].done = !state.todos[index].done;
      persistPlannerData();
      renderTodos();
    };
    bullet.addEventListener("click", toggle);
    bullet.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  });

  $$(".todo-text", list).forEach((input) => {
    input.addEventListener("input", (event) => {
      state.todos[Number(event.target.dataset.index)].text = event.target.value;
      persistPlannerData();
    });
  });
}

function getTasks() {
  const key = dateKey(state.currentDate);
  if (!Array.isArray(state.tasksByDate[key])) {
    state.tasksByDate[key] = defaultTasks();
    persistPlannerData();
  }
  return state.tasksByDate[key];
}

function renderTimeline() {
  const timeline = $("#timeline");
  if (!timeline) return;

  timeline.innerHTML = "";
  const grouped = {};
  getTasks().forEach((task) => {
    (grouped[task.time] ||= []).push(task);
  });

  Object.keys(grouped).sort().forEach((time) => {
    const slot = document.createElement("div");
    slot.className = "slot";

    const timeLabel = document.createElement("div");
    timeLabel.className = "slot-time";
    timeLabel.textContent = time;

    const taskList = document.createElement("div");
    taskList.className = "slot-tasks";

    grouped[time].forEach((task) => {
      const row = document.createElement("div");
      row.className = "slot-task";
      row.style.background = task.bg;

      const bullet = document.createElement("span");
      bullet.className = `bullet ${task.done ? "done" : ""}`.trim();
      bullet.dataset.id = task.id;

      const taskCopy = document.createElement("span");
      taskCopy.className = "task-copy";

      const text = document.createElement("span");
      text.className = "text";
      text.style.color = task.color;
      text.textContent = task.text;

      taskCopy.appendChild(text);

      if (task.desc.trim()) {
        const desc = document.createElement("span");
        desc.className = "task-desc";
        desc.textContent = task.desc.trim();
        taskCopy.appendChild(desc);
      }

      const editButton = document.createElement("button");
      editButton.className = "edit-btn";
      editButton.type = "button";
      editButton.dataset.id = task.id;
      editButton.setAttribute("aria-label", "Editar tarefa");
      editButton.textContent = "✎";

      row.append(bullet, taskCopy, editButton);
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showTimelineContextMenu(task.id, event);
      });
      taskList.appendChild(row);
    });

    slot.append(timeLabel, taskList);
    timeline.appendChild(slot);
  });

  $$(".edit-btn", timeline).forEach((button) => {
    button.addEventListener("click", (event) => openEditModal(Number(event.currentTarget.dataset.id)));
  });

  $$(".slot-task .bullet", timeline).forEach((bullet) => {
    bullet.addEventListener("click", (event) => {
      const task = getTasks().find((item) => item.id === Number(event.currentTarget.dataset.id));
      if (!task) return;
      task.done = !task.done;
      persistPlannerData();
      renderTimeline();
    });
  });
}

function openCalendar() {
  const modal = $("#calendarModal");
  if (!modal) return;

  modal.hidden = false;
  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  const selectedDay = state.currentDate.getDate();

  $("#monthYearBtn").textContent = `${monthShortNames[month]} ${year}`;
  $("#calTitle").textContent = `${monthNames[month]} ${year}`;

  const grid = $("#daysGrid");
  grid.innerHTML = "";

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const offset = (first.getDay() + 6) % 7;

  for (let index = 0; index < offset; index++) {
    grid.insertAdjacentHTML("beforeend", '<span class="cal-day empty"></span>');
  }

  for (let day = 1; day <= last.getDate(); day++) {
    const button = document.createElement("button");
    button.className = day === selectedDay ? "cal-day today" : "cal-day";
    button.type = "button";
    button.dataset.day = day;
    button.textContent = day;
    grid.appendChild(button);
  }

  $$(".cal-day:not(.empty)", grid).forEach((button) => {
    button.addEventListener("click", (event) => {
      closeModals();
      changeCurrentDate(new Date(year, month, Number(event.currentTarget.dataset.day)));
    });
  });
}

function changeCalendarMonth(direction) {
  const currentYear = state.currentDate.getFullYear();
  const currentMonth = state.currentDate.getMonth();
  const targetYearMonth = new Date(currentYear, currentMonth + direction, 1);
  const targetYear = targetYearMonth.getFullYear();
  const targetMonth = targetYearMonth.getMonth();
  const targetDay = Math.min(state.currentDate.getDate(), daysInMonth(targetYear, targetMonth));

  state.currentDate = new Date(targetYear, targetMonth, targetDay);
  openCalendar();
}

function updateWheelActive(wheel) {
  const items = $$("div", wheel);
  if (!items.length) return;
  const activeIndex = clamp(Math.round(wheel.scrollTop / WHEEL_ITEM_HEIGHT), 0, items.length - 1);
  items.forEach((item, index) => item.classList.toggle("active", index === activeIndex));
}

function fillWheel(wheel, items, selected, displayValue = (value) => value, dataValue = (value) => value) {
  if (!wheel) return;

  wheel.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("div");
    option.textContent = displayValue(item);
    option.dataset.value = dataValue(item);
    wheel.appendChild(option);
  });

  const selectedIndex = Math.max(0, items.findIndex((item) => String(dataValue(item)) === String(selected)));
  wheel.onscroll = () => updateWheelActive(wheel);
  requestAnimationFrame(() => {
    wheel.scrollTop = selectedIndex * WHEEL_ITEM_HEIGHT;
    updateWheelActive(wheel);
  });
}

function activeWheelValue(selector) {
  const wheel = $(selector);
  if (!wheel) return null;
  updateWheelActive(wheel);
  return $("div.active", wheel)?.dataset.value || $("div", wheel)?.dataset.value || null;
}

function openWheel() {
  $("#calendarModal").hidden = true;
  $("#wheelModal").hidden = false;

  fillWheel($("#dayWheel"), Array.from({ length: 31 }, (_, index) => index + 1), state.currentDate.getDate(), pad);
  fillWheel(
    $("#monthWheel"),
    Array.from({ length: 12 }, (_, index) => index),
    state.currentDate.getMonth(),
    (month) => monthShortNames[month]
  );
  fillWheel(
    $("#yearWheel"),
    Array.from({ length: YEAR_END - YEAR_START + 1 }, (_, index) => YEAR_START + index),
    state.currentDate.getFullYear()
  );
}

let editingId = null;

function resetEditModalTabs() {
  $$(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === "editar");
  });
  $$(".tab-content").forEach((content) => {
    content.hidden = content.dataset.content !== "editar";
  });
}

function openEditModal(id) {
  editingId = id;
  const task = getTasks().find((item) => item.id === id);
  if (!task) return;

  resetEditModalTabs();
  $("#editTitle").value = task.text;
  $("#editDesc").value = task.desc || "";
  $("#editTime").value = task.time;
  $("#editColor").value = task.color === "transparent" ? "#000000" : task.color;
  $("#editBg").value = task.bg === "transparent" ? "#ffffff" : task.bg;
  $("#editModal").hidden = false;
}

function openAddTimelineTaskModal() {
  editingId = null;
  resetEditModalTabs();
  $("#editTitle").value = "";
  $("#editDesc").value = "";
  $("#editTime").value = "14:30";
  $("#editColor").value = "#000000";
  $("#editBg").value = "#ffffff";
  $("#editModal").hidden = false;
  $("#editTitle")?.focus();
}

function createTaskId(tasks) {
  const highestId = tasks.reduce((highest, task) => Math.max(highest, Number(task.id) || 0), 0);
  return Math.max(Date.now(), highestId + 1);
}

function closeModals() {
  $$(".modal").forEach((modal) => {
    modal.hidden = true;
  });
}

function initPlanner() {
  if (!$("#timeline")) return;

  $("#todoDeleteBtn")?.addEventListener("click", deleteActiveTaskMenuTarget);

  $$(".day").forEach((button) => {
    button.addEventListener("click", () => {
      const offset = parseInt(button.dataset.offset, 10);
      if (offset === 0) {
        openCalendar();
        return;
      }

      const date = new Date(state.currentDate);
      date.setDate(date.getDate() + offset);
      animateDayChange(date, offset);
    });
  });

  $("#addTaskBtn")?.addEventListener("click", () => {
    state.todos.push({ text: "", done: false });
    persistPlannerData();
    renderTodos();
  });

  $("#addTimelineTaskBtn")?.addEventListener("click", openAddTimelineTaskModal);

  $("#monthYearBtn")?.addEventListener("click", openWheel);
  $("#calPrevMonth")?.addEventListener("click", () => changeCalendarMonth(-1));
  $("#calNextMonth")?.addEventListener("click", () => changeCalendarMonth(1));

  $("#wheelConfirm")?.addEventListener("click", () => {
    const day = Number(activeWheelValue("#dayWheel"));
    const month = Number(activeWheelValue("#monthWheel"));
    const year = Number(activeWheelValue("#yearWheel"));

    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      const safeDay = Math.min(day, daysInMonth(year, month));
      closeModals();
      changeCurrentDate(new Date(year, month, safeDay));
    }
  });

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((item) => item.classList.toggle("active", item === tab));
      $$(".tab-content").forEach((content) => {
        content.hidden = content.dataset.content !== tab.dataset.tab;
      });
    });
  });

  $("#editSave")?.addEventListener("click", () => {
    const tasks = getTasks();
    let task = tasks.find((item) => item.id === editingId);
    if (!task && editingId === null) {
      task = {
        id: createTaskId(tasks),
        time: "14:30",
        text: "",
        color: "#000000",
        bg: "#ffffff",
        desc: "",
        done: false,
      };
      tasks.push(task);
    }

    if (task) {
      task.text = $("#editTitle").value;
      task.desc = $("#editDesc").value;
      task.time = $("#editTime").value || task.time;
      task.color = $("#editColor").value;
      task.bg = $("#editBg").value;
      persistPlannerData();
    }
    closeModals();
    renderTimeline();
  });

  initPomodoro();
  refreshPlanner();
}

function refreshPlanner() {
  renderDays();
  renderTodos();
  renderTimeline();
}

// ===== Pomodoro =====
let pomoInterval = null;
let pomoEndsAt = null;
let pomoMode = "focus";
let pomoFocusTotal = 25 * 60;
let pomoBreakTotal = 5 * 60;
let pomoRemaining = pomoFocusTotal;

function parsePomoTime(value, fallback) {
  const clean = String(value || "").replace(/[^\d:]/g, "");
  const [rawMinutes = "", rawSeconds = ""] = clean.split(":");
  const minutes = clamp(Number(rawMinutes || 0), 0, 1440);
  const seconds = clamp(Number(rawSeconds || 0), 0, 60);
  const total = minutes * 60 + seconds;
  return total > 0 ? total : fallback;
}

function formatPomoTime(totalSeconds) {
  const total = Math.max(0, Math.round(totalSeconds));
  if (total === 1440 * 60 + 60) return "1440:60";
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const minuteText = minutes < 100 ? pad(minutes) : String(minutes);
  return `${minuteText}:${pad(seconds)}`;
}

function getPomoTotal() {
  return pomoMode === "break" ? pomoBreakTotal : pomoFocusTotal;
}

function getPomoProgress() {
  const total = getPomoTotal();
  return total > 0 ? clamp((total - pomoRemaining) / total, 0, 1) : 1;
}

function updatePomoProgress() {
  const box = $("#pomoProgressBox");
  const path = $("#pomoProgressPath");
  const guide = $("#pomoGuide");
  const progress = getPomoProgress();
  if (!box || !path || !guide) return;

  const color = pomoMode === "break" ? "#68b875" : "#dc5f62";
  box.style.setProperty("--pomo-color", color);
  path.style.strokeDashoffset = String(100 - progress * 100);

  const length = path.getTotalLength();
  const point = path.getPointAtLength(length * progress);
  guide.setAttribute("cx", point.x);
  guide.setAttribute("cy", point.y);
}

function updatePomoArt() {
  const art = $("#pomoArt");
  const mode = $("#pomoMode");
  if (!art || !mode) return;

  const progress = getPomoProgress();
  art.classList.remove("phase-mid", "phase-end", "phase-break");

  if (pomoMode === "break") {
    art.classList.add("phase-break");
    mode.textContent = "Short Break";
    return;
  }

  mode.textContent = "Focus Time";
  if (progress >= 0.78) {
    art.classList.add("phase-end");
  } else if (pomoInterval || progress > 0) {
    art.classList.add("phase-mid");
  }
}

function updatePomoDisplay() {
  const display = $("#pomoDisplay");
  if (display) display.value = formatPomoTime(pomoRemaining);
  updatePomoProgress();
  updatePomoArt();
}

function setPomoButtons() {
  const running = Boolean(pomoInterval);
  const toggle = $("#pomoToggle");
  const icon = $("#pomoToggleIcon");
  if (!toggle || !icon) return;

  icon.src = running ? "images/pause.png" : "images/play.png";
  toggle.setAttribute("aria-label", running ? "Pausar" : "Iniciar");
  toggle.title = running ? "Pausar" : "Iniciar";
}

function resetPomodoro(mode = "focus") {
  if (pomoInterval) clearInterval(pomoInterval);
  pomoInterval = null;
  pomoEndsAt = null;
  pomoMode = mode;
  pomoRemaining = getPomoTotal();
  updatePomoDisplay();
  setPomoButtons();
}

function moveToBreakPomodoro() {
  pomoMode = "break";
  pomoRemaining = pomoBreakTotal;
  if (pomoInterval) pomoEndsAt = Date.now() + pomoRemaining * 1000;
  updatePomoDisplay();
  showBrowserNotification("Hora do break", "Seu tempo de estudo terminou. Pode descansar um pouco.");
}

function finishBreakPomodoro() {
  resetPomodoro("focus");
}

function tickPomodoro() {
  if (pomoEndsAt) {
    pomoRemaining = Math.max(0, Math.ceil((pomoEndsAt - Date.now()) / 1000));
  } else {
    pomoRemaining = Math.max(0, pomoRemaining - 1);
  }

  if (pomoRemaining <= 0) {
    if (pomoMode === "focus") {
      moveToBreakPomodoro();
    } else {
      finishBreakPomodoro();
    }
    return;
  }

  updatePomoDisplay();
}

function startPomodoro() {
  if (pomoInterval) return;
  pomoEndsAt = Date.now() + pomoRemaining * 1000;
  pomoInterval = setInterval(tickPomodoro, 1000);
  setPomoButtons();
  updatePomoArt();
}

function pausePomodoro() {
  if (!pomoInterval) return;
  tickPomodoro();
  clearInterval(pomoInterval);
  pomoInterval = null;
  pomoEndsAt = null;
  setPomoButtons();
}

function togglePomodoro() {
  if (pomoInterval) {
    pausePomodoro();
  } else {
    startPomodoro();
  }
}

function initPomodoro() {
  const sanitizeField = (input) => {
    input.value = input.value.replace(/[^\d:]/g, "");
  };

  const applyTimeField = (input, target) => {
    if (!input) return;
    const fallback = target === "break" ? pomoBreakTotal : pomoFocusTotal;
    const total = parsePomoTime(input.value, fallback);

    if (target === "break") {
      pomoBreakTotal = total;
      input.value = formatPomoTime(pomoBreakTotal);
      if (!pomoInterval && pomoMode === "break") pomoRemaining = pomoBreakTotal;
    } else {
      pomoFocusTotal = total;
      input.value = formatPomoTime(pomoFocusTotal);
      if (!pomoInterval && pomoMode === "focus") pomoRemaining = pomoFocusTotal;
    }

    updatePomoDisplay();
  };

  $("#pomoDisplay")?.addEventListener("input", (event) => sanitizeField(event.target));
  $("#pomoDisplay")?.addEventListener("blur", (event) => {
    applyTimeField(event.target, pomoMode);
  });

  $("#pomoToggle")?.addEventListener("click", togglePomodoro);
  $("#pomoStop")?.addEventListener("click", () => resetPomodoro("focus"));

  updatePomoDisplay();
  setPomoButtons();
}

// ===== Profile page =====
let profileEditing = false;
let pendingProfileAvatar = null;
let emailEditStage = "email";
let pendingNewEmail = "";
let pendingEmailEditCode = "";
let passwordEditStage = "email";
let pendingPasswordCode = "";
const avatarCropState = {
  src: "",
  image: null,
  naturalWidth: 0,
  naturalHeight: 0,
  scale: 1,
  x: 0,
  y: 0,
  dragging: false,
  startX: 0,
  startY: 0,
  baseX: 0,
  baseY: 0,
};

function renderProfilePage() {
  const profilePage = $(".profile-page");
  if (!profilePage) return;

  const user = getCurrentUser();
  const title = $("#profileTitle");
  const avatarImage = $("#profileAvatarImage");
  const avatarInitials = $("#profileAvatarInitials");
  const nameInput = $("#profileNameInput");
  const emailInput = $("#profileEmailInput");
  const passwordInput = $("#profilePasswordInput");
  const emailWarning = $("#emailWarningBtn");
  const emailEdit = $("#emailEditBtn");
  const passwordEdit = $("#passwordEditBtn");
  const avatarButton = $("#profileAvatarButton");
  const mainAction = $("#profileMainActionBtn");
  const resetButton = $("#profileResetBtn");
  const form = $("#profileSettingsForm");

  if (!user) {
    profileEditing = false;
    pendingProfileAvatar = null;
    if (title) title.textContent = "Account Settings";
    if (avatarImage) {
      avatarImage.hidden = true;
      avatarImage.removeAttribute("src");
    }
    if (avatarInitials) {
      avatarInitials.hidden = false;
      avatarInitials.textContent = "?";
    }
    if (nameInput) nameInput.value = "";
    if (emailInput) emailInput.value = "";
    if (passwordInput) passwordInput.value = "********";
    if (emailWarning) emailWarning.hidden = true;
    if (emailEdit) emailEdit.disabled = true;
    if (passwordEdit) passwordEdit.disabled = true;
    if (avatarButton) avatarButton.disabled = true;
    if (mainAction) mainAction.textContent = "Editar";
    if (resetButton) resetButton.disabled = true;
    form?.classList.remove("is-editing");
    $$("input, button[type='submit']", form).forEach((control) => {
      control.disabled = true;
    });
    setFormMessage("#profileMessage", "Faça login para editar seu perfil.");
    return;
  }

  if (title) title.textContent = "My Profile";
  form?.classList.toggle("is-editing", profileEditing);
  if (avatarImage && avatarInitials) {
    const avatar = pendingProfileAvatar || user.avatar;
    if (avatar) {
      avatarImage.src = avatar;
      avatarImage.hidden = false;
      avatarInitials.hidden = true;
    } else {
      avatarImage.hidden = true;
      avatarImage.removeAttribute("src");
      avatarInitials.hidden = false;
      avatarInitials.textContent = getInitials(user);
    }
  }
  if (nameInput) nameInput.value = user.name || "";
  if (emailInput) emailInput.value = user.email || "";
  if (passwordInput) passwordInput.value = "********";
  if (emailWarning) emailWarning.hidden = user.emailConfirmed === true;
  if (nameInput) {
    nameInput.disabled = false;
    nameInput.readOnly = !profileEditing;
  }
  if (emailInput) {
    emailInput.disabled = false;
    emailInput.readOnly = true;
  }
  if (passwordInput) {
    passwordInput.disabled = false;
    passwordInput.readOnly = true;
  }
  if (emailEdit) emailEdit.disabled = !profileEditing;
  if (passwordEdit) passwordEdit.disabled = !profileEditing;
  if (avatarButton) avatarButton.disabled = !profileEditing;
  if (mainAction) {
    mainAction.disabled = false;
    mainAction.textContent = profileEditing ? "Salvar alterações" : "Editar";
  }
  if (resetButton) resetButton.disabled = !profileEditing;
  setFormMessage("#profileMessage", "");
}

function generateEmailCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function openEmailConfirmModal() {
  const user = getCurrentUser();
  if (!user) {
    openAuthModal("loginModal");
    return;
  }

  closeModals();
  const modal = $("#emailConfirmModal");
  if (!modal) return;

  $("#emailConfirmInput").value = user.email || "";
  setFormMessage("#emailConfirmMessage", "");
  modal.hidden = false;
  $("#emailConfirmInput")?.focus();
}

function resetEmailEditModal() {
  emailEditStage = "email";
  pendingNewEmail = "";
  pendingEmailEditCode = "";
  $("#newEmailInput").value = "";
  $("#newEmailInput").readOnly = false;
  $("#newEmailCodeInput").value = "";
  $("#newEmailCodeInput").hidden = true;
  $("#newEmailCodeLabel").hidden = true;
  $("#emailEditSubmitBtn").textContent = "confirmar";
  setFormMessage("#emailEditMessage", "");
}

function openEmailEditModal() {
  if (!profileEditing) return;
  const user = getCurrentUser();
  if (!user) {
    openAuthModal("loginModal");
    return;
  }

  closeModals();
  resetEmailEditModal();
  $("#newEmailInput").value = user.email || "";
  $("#emailEditModal").hidden = false;
  $("#newEmailInput")?.focus();
}

function resetPasswordEditModal() {
  passwordEditStage = "email";
  pendingPasswordCode = "";
  $("#passwordEmailInput").value = getCurrentUser()?.email || "";
  $("#passwordCodeInput").value = "";
  $("#newPasswordInput").value = "";
  $("#confirmPasswordInput").value = "";
  $("#passwordEmailStep").hidden = false;
  $("#passwordCodeStep").hidden = true;
  $("#passwordNewStep").hidden = true;
  $("#passwordEditSubmitBtn").textContent = "Enviar código";
  setFormMessage("#passwordEditMessage", "");
}

function openPasswordEditModal() {
  if (!profileEditing) return;
  const user = getCurrentUser();
  if (!user) {
    openAuthModal("loginModal");
    return;
  }

  closeModals();
  resetPasswordEditModal();
  $("#passwordEditModal").hidden = false;
  $("#passwordEmailInput")?.focus();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getAvatarCropSize() {
  return $("#avatarCropFrame")?.clientWidth || 320;
}

function clampAvatarCrop() {
  const size = getAvatarCropSize();
  const displayWidth = avatarCropState.naturalWidth * avatarCropState.scale;
  const displayHeight = avatarCropState.naturalHeight * avatarCropState.scale;
  const maxX = Math.max(0, (displayWidth - size) / 2);
  const maxY = Math.max(0, (displayHeight - size) / 2);
  avatarCropState.x = clamp(avatarCropState.x, -maxX, maxX);
  avatarCropState.y = clamp(avatarCropState.y, -maxY, maxY);
}

function renderAvatarCrop() {
  const image = $("#avatarCropImage");
  if (!image || !avatarCropState.image) return;

  clampAvatarCrop();
  image.style.width = `${avatarCropState.naturalWidth * avatarCropState.scale}px`;
  image.style.height = `${avatarCropState.naturalHeight * avatarCropState.scale}px`;
  image.style.transform = `translate(calc(-50% + ${avatarCropState.x}px), calc(-50% + ${avatarCropState.y}px))`;
}

function openAvatarCropModal(src) {
  closeModals();
  const modal = $("#avatarCropModal");
  const image = $("#avatarCropImage");
  if (!modal || !image) return;

  avatarCropState.src = src;
  avatarCropState.image = null;
  avatarCropState.x = 0;
  avatarCropState.y = 0;
  image.removeAttribute("src");
  modal.hidden = false;

  const loader = new Image();
  loader.onload = () => {
    const size = getAvatarCropSize();
    avatarCropState.image = loader;
    avatarCropState.naturalWidth = loader.naturalWidth;
    avatarCropState.naturalHeight = loader.naturalHeight;
    avatarCropState.scale = Math.max(size / loader.naturalWidth, size / loader.naturalHeight);
    image.src = src;
    renderAvatarCrop();
  };
  loader.onerror = () => {
    closeModals();
    setFormMessage("#profileMessage", "Não consegui carregar essa imagem.");
  };
  loader.src = src;
}

function confirmAvatarCrop() {
  if (!avatarCropState.image) return;

  const size = getAvatarCropSize();
  const outputSize = 512;
  const ratio = outputSize / size;
  const displayWidth = avatarCropState.naturalWidth * avatarCropState.scale;
  const displayHeight = avatarCropState.naturalHeight * avatarCropState.scale;
  const drawX = (size / 2 + avatarCropState.x - displayWidth / 2) * ratio;
  const drawY = (size / 2 + avatarCropState.y - displayHeight / 2) * ratio;

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, outputSize, outputSize);
  ctx.save();
  ctx.beginPath();
  ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatarCropState.image, drawX, drawY, displayWidth * ratio, displayHeight * ratio);
  ctx.restore();

  pendingProfileAvatar = canvas.toDataURL("image/png");
  closeModals();
  renderProfilePage();
  setFormMessage("#profileMessage", "Imagem pronta para salvar.", true);
}

function initAvatarCropDrag() {
  const frame = $("#avatarCropFrame");
  if (!frame) return;

  frame.addEventListener("pointerdown", (event) => {
    if (!avatarCropState.image) return;
    avatarCropState.dragging = true;
    avatarCropState.startX = event.clientX;
    avatarCropState.startY = event.clientY;
    avatarCropState.baseX = avatarCropState.x;
    avatarCropState.baseY = avatarCropState.y;
    frame.classList.add("is-dragging");
    frame.setPointerCapture(event.pointerId);
  });

  frame.addEventListener("pointermove", (event) => {
    if (!avatarCropState.dragging) return;
    avatarCropState.x = avatarCropState.baseX + event.clientX - avatarCropState.startX;
    avatarCropState.y = avatarCropState.baseY + event.clientY - avatarCropState.startY;
    renderAvatarCrop();
  });

  const stopDragging = (event) => {
    if (!avatarCropState.dragging) return;
    avatarCropState.dragging = false;
    frame.classList.remove("is-dragging");
    if (event.pointerId != null && frame.hasPointerCapture(event.pointerId)) {
      frame.releasePointerCapture(event.pointerId);
    }
  };

  frame.addEventListener("pointerup", stopDragging);
  frame.addEventListener("pointercancel", stopDragging);
  $("#avatarCropConfirm")?.addEventListener("click", confirmAvatarCrop);
  window.addEventListener("resize", renderAvatarCrop);
}

function initProfileSettings() {
  const form = $("#profileSettingsForm");
  if (!form) return;

  initAvatarCropDrag();

  $("#profileAvatarButton")?.addEventListener("click", () => {
    if (!getCurrentUser()) {
      openAuthModal("loginModal");
      return;
    }
    if (!profileEditing) {
      setFormMessage("#profileMessage", "Clique em Editar para mudar a imagem.");
      return;
    }
    $("#profileAvatarInput")?.click();
  });

  $("#profileAvatarInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFormMessage("#profileMessage", "Escolha um arquivo de imagem.");
      return;
    }

    openAvatarCropModal(await readFileAsDataUrl(file));
    event.target.value = "";
  });

  $("#emailWarningBtn")?.addEventListener("click", openEmailConfirmModal);
  $("#emailEditBtn")?.addEventListener("click", openEmailEditModal);
  $("#passwordEditBtn")?.addEventListener("click", openPasswordEditModal);

  $("#emailConfirmForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user) {
      setFormMessage("#emailConfirmMessage", "Faça login para confirmar o email.");
      return;
    }

    const typedEmail = normalizeEmail($("#emailConfirmInput")?.value);
    if (typedEmail !== user.email) {
      setFormMessage("#emailConfirmMessage", "Digite o mesmo email da sua conta.");
      return;
    }

    const code = generateEmailCode();
    updateCurrentUser((item) => {
      item.emailConfirmed = true;
      item.emailConfirmationCode = code;
      item.emailConfirmedAt = new Date().toISOString();
    });

    renderProfilePage();
    setFormMessage("#emailConfirmMessage", "Código enviado para o email informado.", true);
    setTimeout(() => {
      closeModals();
    }, 900);
  });

  $("#emailEditForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user) {
      setFormMessage("#emailEditMessage", "Faça login para editar o email.");
      return;
    }

    if (emailEditStage === "email") {
      const newEmail = normalizeEmail($("#newEmailInput")?.value);
      const db = readDb();
      if (!newEmail) {
        setFormMessage("#emailEditMessage", "Digite o novo email.");
        return;
      }
      if (db.users.some((item) => item.email === newEmail && item.email !== user.email)) {
        setFormMessage("#emailEditMessage", "Esse email já está em uso.");
        return;
      }

      pendingNewEmail = newEmail;
      pendingEmailEditCode = generateEmailCode();
      emailEditStage = "code";
      $("#newEmailCodeInput").hidden = false;
      $("#newEmailCodeLabel").hidden = false;
      $("#newEmailInput").readOnly = true;
      $("#emailEditSubmitBtn").textContent = "confirmar código";
      setFormMessage("#emailEditMessage", `Código enviado para o novo email. Código de teste: ${pendingEmailEditCode}`, true);
      $("#newEmailCodeInput")?.focus();
      return;
    }

    const typedCode = ($("#newEmailCodeInput")?.value || "").trim();
    if (typedCode !== pendingEmailEditCode) {
      setFormMessage("#emailEditMessage", "Código incorreto.");
      return;
    }

    updateCurrentUser((item) => {
      item.email = pendingNewEmail;
      item.emailConfirmed = true;
      item.emailConfirmationCode = pendingEmailEditCode;
      item.emailConfirmedAt = new Date().toISOString();
    });
    setSession(pendingNewEmail);
    closeModals();
    renderProfilePage();
    renderAccountDropdown();
    setFormMessage("#profileMessage", "Email atualizado.", true);
  });

  $("#passwordEditForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user) {
      setFormMessage("#passwordEditMessage", "Faça login para editar a senha.");
      return;
    }

    if (passwordEditStage === "email") {
      const typedEmail = normalizeEmail($("#passwordEmailInput")?.value);
      if (typedEmail !== user.email) {
        setFormMessage("#passwordEditMessage", "Digite o mesmo email da sua conta.");
        return;
      }

      pendingPasswordCode = generateEmailCode();
      passwordEditStage = "code";
      $("#passwordEmailStep").hidden = true;
      $("#passwordCodeStep").hidden = false;
      $("#passwordEditSubmitBtn").textContent = "Verificar código";
      setFormMessage("#passwordEditMessage", `Código enviado para o email. Código de teste: ${pendingPasswordCode}`, true);
      $("#passwordCodeInput")?.focus();
      return;
    }

    if (passwordEditStage === "code") {
      const typedCode = ($("#passwordCodeInput")?.value || "").trim();
      if (typedCode !== pendingPasswordCode) {
        setFormMessage("#passwordEditMessage", "Código incorreto.");
        return;
      }

      passwordEditStage = "new";
      $("#passwordCodeStep").hidden = true;
      $("#passwordNewStep").hidden = false;
      $("#passwordEditSubmitBtn").textContent = "Salvar";
      setFormMessage("#passwordEditMessage", "");
      $("#newPasswordInput")?.focus();
      return;
    }

    const newPassword = $("#newPasswordInput")?.value || "";
    const confirmPassword = $("#confirmPasswordInput")?.value || "";
    if (!newPassword || !confirmPassword) {
      setFormMessage("#passwordEditMessage", "Preencha as duas senhas.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormMessage("#passwordEditMessage", "As senhas não conferem.");
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    updateCurrentUser((item) => {
      item.passwordHash = passwordHash;
      item.passwordUpdatedAt = new Date().toISOString();
    });
    closeModals();
    setFormMessage("#profileMessage", "Senha atualizada.", true);
  });

  $("#profileResetBtn")?.addEventListener("click", () => {
    profileEditing = false;
    pendingProfileAvatar = null;
    renderProfilePage();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const db = readDb();
    const user = getCurrentUser(db);
    if (!user) {
      setFormMessage("#profileMessage", "Faça login para salvar alterações.");
      return;
    }

    if (!profileEditing) {
      profileEditing = true;
      renderProfilePage();
      setFormMessage("#profileMessage", "Agora você pode editar o nome e a imagem.");
      return;
    }

    const name = ($("#profileNameInput")?.value || "").trim();

    if (!name) {
      setFormMessage("#profileMessage", "Nome é obrigatório.");
      return;
    }

    user.name = name;
    if (pendingProfileAvatar) user.avatar = pendingProfileAvatar;
    writeDb(db);
    profileEditing = false;
    pendingProfileAvatar = null;
    renderProfilePage();
    renderAccountDropdown();
    setFormMessage("#profileMessage", "Alterações salvas.", true);
  });
}

function initModals() {
  $$("[data-close]").forEach((button) => button.addEventListener("click", closeModals));
  $$(".modal").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModals();
    });
  });
  document.addEventListener("click", (event) => {
    const menu = $("#todoContextMenu");
    if (menu && !menu.hidden && !menu.contains(event.target)) hideTodoContextMenu();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      stopTitleAlert();
      if (pomoInterval) tickPomodoro();
    }
  });
  window.addEventListener("focus", stopTitleAlert);
  window.addEventListener("resize", hideTodoContextMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAccountDropdown();
      closeModals();
      hideTodoContextMenu();
    }
  });
}

// ===== Inicializar =====
syncSession();
loadPlannerData();
initModals();
initAccount();
initMusic();
initPlanner();
initProfileSettings();
renderProfilePage();
