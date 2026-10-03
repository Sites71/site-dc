// ============================================================
//  💬 CHAT GLOBAL — Firebase Realtime Database
//
//  1) Crie um projeto grátis em: https://console.firebase.google.com
//  2) Ative o "Realtime Database" em MODO DE TESTE
//  3) Cole as credenciais do seu projeto no firebaseConfig abaixo
//  4) Suba tudo pro GitHub e ative o GitHub Pages (veja o README)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  onChildAdded,
  onDisconnect,
  query,
  limitToLast,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ✅ Projeto Firebase configurado: site-limon
// (Essa configuração é pública por design — a segurança fica nas regras do banco)
const firebaseConfig = {
  apiKey: "AIzaSyA7Q0Pq8DqIZ1LH7Up7z8Wf0vvyGXECbGw",
  authDomain: "site-limon.firebaseapp.com",
  databaseURL: "https://site-limon-default-rtdb.firebaseio.com",
  projectId: "site-limon",
  storageBucket: "site-limon.firebasestorage.app",
  messagingSenderId: "82597293506",
  appId: "1:82597293506:web:a639e9dcff7328b5a13a5b",
  measurementId: "G-N0GV2Q6MCX"
};

// ------------------------------------------------------------
// Elementos da página
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const loginOverlay = $("login-overlay");
const loginForm = $("login-form");
const nameInput = $("name-input");
const chatEl = $("chat");
const messagesEl = $("messages");
const msgForm = $("message-form");
const msgInput = $("message-input");
const onlineEl = $("online-count");
const musicBtn = $("music-btn");
const musicEl = $("bg-music");

// ------------------------------------------------------------
// Estado
// ------------------------------------------------------------
let db = null;
let myName = "";
let myHue = 0;
const myUid =
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// Verifica se o usuário já preencheu as credenciais do Firebase
const isConfigured = Object.values(firebaseConfig).every(
  (v) => v && !v.includes("COLE_AQUI")
);

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function hueFromString(str) {
  let hash = 0;
  for (const c of str) hash = (hash * 31 + c.charCodeAt(0)) % 360;
  return hash;
}

function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "system";
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ------------------------------------------------------------
// Login (nome de usuário)
// ------------------------------------------------------------
const savedName = localStorage.getItem("chat-global-name");
if (savedName) enterChat(savedName);

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  localStorage.setItem("chat-global-name", name);
  enterChat(name);
});

function enterChat(name) {
  myName = name;
  myHue = hueFromString(name);

  loginOverlay.classList.add("hidden");
  chatEl.classList.remove("hidden");
  msgInput.focus();

  if (isConfigured) {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    listenToMessages();
    setupPresence();
    addSystemMessage(`Bem-vindo, ${myName}! 👋`);
  } else {
    addSystemMessage(
      "⚠️ Firebase ainda não configurado. Abra o app.js, cole as credenciais do seu projeto e siga o README."
    );
  }
}

// ------------------------------------------------------------
// Receber mensagens (tempo real)
// ------------------------------------------------------------
function listenToMessages() {
  const q = query(ref(db, "messages"), limitToLast(100));
  onChildAdded(
    q,
    (snap) => renderMessage(snap.val()),
    () =>
      addSystemMessage(
        "⚠️ Sem permissão para ler o banco. Verifique as regras do Realtime Database (veja o README)."
      )
  );
}

function renderMessage(data) {
  if (!data || !data.text) return;
  const mine = data.uid === myUid;

  const wrap = document.createElement("div");
  wrap.className = "msg" + (mine ? " mine" : "");

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  // Cabeçalho: avatar + nome + hora
  const head = document.createElement("div");
  head.className = "msg-head";

  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.style.background = `hsl(${data.hue ?? 220} 70% 45%)`;
  avatar.textContent = (data.name || "?").slice(0, 1).toUpperCase();

  const nm = document.createElement("span");
  nm.className = "name";
  nm.style.color = `hsl(${data.hue ?? 220} 80% 70%)`;
  nm.textContent = data.name || "Anônimo";

  const tm = document.createElement("span");
  tm.className = "time";
  tm.textContent = data.at
    ? new Date(data.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";

  head.append(avatar, nm, tm);

  // Corpo da mensagem — textContent impede injeção de HTML (XSS)
  const txt = document.createElement("div");
  txt.className = "text";
  txt.textContent = data.text;

  bubble.append(head, txt);
  wrap.appendChild(bubble);

  // Só rola para o fim se o usuário já estava perto do fim (ou é msg dele)
  const nearBottom =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 150;
  messagesEl.appendChild(wrap);
  if (nearBottom || mine) messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ------------------------------------------------------------
// Enviar mensagens
// ------------------------------------------------------------
msgForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = msgInput.value.trim().slice(0, 500);
  if (!text || !db) return;

  push(ref(db, "messages"), {
    name: myName,
    text,
    hue: myHue,
    uid: myUid,
    at: serverTimestamp(),
  });

  msgInput.value = "";
  msgInput.focus();
});

// ------------------------------------------------------------
// Presença (usuários online)
// ------------------------------------------------------------
function setupPresence() {
  const myPresence = ref(db, `presence/${myUid}`);

  // Ao desconectar, remove automaticamente
  onDisconnect(myPresence).remove();

  // Marca presença e re-marca sempre que a conexão voltar
  onValue(ref(db, ".info/connected"), (snap) => {
    if (snap.val() === true) {
      set(myPresence, { name: myName, hue: myHue, at: serverTimestamp() });
    }
  });

  // Contador de online
  onValue(
    ref(db, "presence"),
    (snap) => {
      const n = snap.exists() ? Object.keys(snap.val()).length : 0;
      onlineEl.textContent = `🟢 ${n} online${n === 1 ? "" : "s"}`;
    },
    () => (onlineEl.textContent = "🟢 —")
  );
}

// ------------------------------------------------------------
// 🎵 Música de fundo
// ------------------------------------------------------------
musicEl.volume = 0.35;

musicBtn.addEventListener("click", async () => {
  if (musicEl.paused) {
    try {
      await musicEl.play();
      musicBtn.textContent = "🔊";
      musicBtn.classList.add("playing");
      musicBtn.title = "Pausar música";
    } catch (err) {
      console.warn("Não foi possível tocar a música:", err);
    }
  } else {
    musicEl.pause();
    musicBtn.textContent = "🎵";
    musicBtn.classList.remove("playing");
    musicBtn.title = "Tocar música";
  }
});
