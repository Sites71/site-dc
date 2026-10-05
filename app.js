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
  get,
  ref,
  push,
  set,
  remove,
  onValue,
  onChildAdded,
  onChildRemoved,
  onDisconnect,
  query,
  limitToLast,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
const passInput = $("pass-input");
const registerForm = $("register-form");
const regNameInput = $("reg-name-input");
const regPassInput = $("reg-pass-input");
const showRegister = $("show-register");
const showLogin = $("show-login");
const authError = $("auth-error");
const clearChatBtn = $("clear-chat");
const streamKillBtn = $("stream-kill");
const logoutBtn = $("logout-btn");

// ------------------------------------------------------------
// Estado
// ------------------------------------------------------------
let db = null;
let auth = null;
let myName = "";
let myHue = 0;
let myUid = ""; // id da conta (Firebase Auth) — definido no login
let isAdmin = false;
let pendingName = "";
let myPhoto = null;           // foto de perfil (dataURL 96×96)
let activeChannel = "global"; // "global" | uid do amigo aberto no painel direito

// SHA-256 da senha da conta admin (LIMON) — controla o registro do nome reservado.
// O hash não revela a senha; só quem conhece a senha consegue registrar LIMON.
const ADMIN_HASH = "365c02757c51e89bb1f1c163679d87a1b8480567522541cb88a602ffacbd6aac";

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

// Nome de usuário -> texto simples (para gerar o e-mail interno da conta)
function slug(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const emailFor = (name) => `${slug(name)}@chat.limon`;

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Cria o avatar: foto de perfil (se tiver) ou inicial colorida
function makeAvatarEl(info, extraClass) {
  if (info && info.photo) {
    const img = document.createElement("img");
    img.className = "avatar" + (extraClass ? " " + extraClass : "");
    img.src = info.photo;
    img.alt = info.name || "?";
    return img;
  }
  const el = document.createElement("span");
  el.className = "avatar" + (extraClass ? " " + extraClass : "");
  el.style.background = `hsl(${info?.hue ?? 220} 70% 45%)`;
  el.textContent = (info?.name || "?").slice(0, 1).toUpperCase();
  return el;
}

function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "system";
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ------------------------------------------------------------
// 🔐 Registro e login (Firebase Authentication)
// ------------------------------------------------------------
if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);

  // Sessão: entra automaticamente se já estiver logado
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      myUid = user.uid;

      // Carrega (ou cria) o perfil do usuário
      const profRef = ref(db, `users/${user.uid}`);
      const snap = await get(profRef).catch(() => null);
      let prof = snap && snap.exists() ? snap.val() : null;
      if (!prof) {
        prof = {
          name: pendingName || "Usuario",
          hue: hueFromString(pendingName || user.uid),
          admin: slug(pendingName || "") === "limon",
          at: serverTimestamp(),
        };
        await set(profRef, prof).catch(() => {});
      }
      enterChat(prof);
    } else {
      myUid = "";
      chatEl.classList.add("hidden");
      loginOverlay.classList.remove("hidden");
    }
  });
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove("hidden");
}

function authErrorMessage(err) {
  const code = err?.code || "";
  if (code === "auth/email-already-in-use") return "Esse nome já está em uso por outra conta.";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code))
    return "Nome ou senha incorretos.";
  if (code === "auth/too-many-requests") return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (code === "auth/weak-password") return "Senha muito curta (mínimo de 6 caracteres).";
  if (code === "auth/operation-not-allowed")
    return "Ative 'Email/Password' no Firebase → Authentication (veja o README!).";
  if (code === "auth/invalid-email") return "Nome inválido — use letras e números.";
  return "Erro ao entrar: " + (err?.message || code);
}

async function login(name, pass) {
  pendingName = name;
  await signInWithEmailAndPassword(auth, emailFor(name), pass);
}

async function register(name, pass) {
  const s = slug(name);
  if (!s) {
    showAuthError("Nome inválido — use letras e números.");
    return;
  }
  // O nome do dono é reservado: só registra com a senha correta
  if (s === "limon" && (await sha256(pass)) !== ADMIN_HASH) {
    showAuthError("👑 Esse nome pertence ao dono do site!");
    return;
  }
  pendingName = name;
  await createUserWithEmailAndPassword(auth, `${s}@chat.limon`, pass);
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.classList.add("hidden");
  try {
    await login(nameInput.value.trim(), passInput.value);
  } catch (err) {
    showAuthError(authErrorMessage(err));
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.classList.add("hidden");
  try {
    await register(regNameInput.value.trim(), regPassInput.value);
  } catch (err) {
    showAuthError(authErrorMessage(err));
  }
});

showRegister.addEventListener("click", () => {
  loginForm.classList.add("hidden");
  registerForm.classList.remove("hidden");
  showRegister.classList.add("hidden");
  showLogin.classList.remove("hidden");
  authError.classList.add("hidden");
});

showLogin.addEventListener("click", () => {
  registerForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  showLogin.classList.add("hidden");
  showRegister.classList.remove("hidden");
  authError.classList.add("hidden");
});

// ---------- Botões do administrador ----------
clearChatBtn.addEventListener("click", () => {
  if (!confirm("Apagar TODAS as mensagens do chat global?")) return;
  remove(ref(db, "messages")).catch(() => {});
  addSystemMessage("🧹 Chat limpo pelo administrador.");
});

streamKillBtn.addEventListener("click", () => {
  if (!confirm("Encerrar a transmissão de tela atual?")) return;
  remove(ref(db, "stream/state")).catch(() => {});
  remove(ref(db, "stream/viewers")).catch(() => {});
  addSystemMessage("🛑 Transmissão encerrada pelo administrador.");
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth).catch(() => {});
  window.location.reload();
});

function enterChat(prof) {
  myName = prof.name || "Usuario";
  myHue = prof.hue ?? hueFromString(myName);
  myPhoto = prof.photo || null;
  isAdmin = !!prof.admin || slug(myName) === "limon";
  activeChannel = "global";
  updateMyProfileRow();

  loginOverlay.classList.add("hidden");
  chatEl.classList.remove("hidden");
  msgInput.focus();

  if (!isConfigured) {
    addSystemMessage("⚠️ Firebase não configurado — veja o app.js e o README.");
    return;
  }

  if (isAdmin) {
    clearChatBtn.classList.remove("hidden");
    addSystemMessage(
      "👑 Modo administrador: você pode apagar mensagens, limpar o chat, transmitir a tela globalmente e encerrar transmissões."
    );
  } else {
    // Transmissão de tela global é exclusiva do administrador
    streamBtn.classList.add("hidden");
  }

  listenToMessages();
  setupPresence();
  setupStreaming();
  setupCalls();
  setupFriends();
  addSystemMessage(`Bem-vindo, ${myName}! 👋`);
}

// ------------------------------------------------------------
// Receber mensagens (tempo real)
// ------------------------------------------------------------
function listenToMessages() {
  const q = query(ref(db, "messages"), limitToLast(100));
  onChildAdded(
    q,
    (snap) => renderMessage(snap.val(), snap.key),
    () =>
      addSystemMessage(
        "⚠️ Sem permissão para ler o banco. Verifique as regras do Realtime Database (veja o README)."
      )
  );
  // Mensagens apagadas (pelo adm) somem para todos
  onChildRemoved(q, (snap) => {
    const el = messagesEl.querySelector(`[data-key="${snap.key}"]`);
    if (el) el.remove();
  });
}

function renderMessage(data, key) {
  if (!data || !data.text) return;
  const mine = data.uid === myUid;

  const wrap = document.createElement("div");
  wrap.className = "msg" + (mine ? " mine" : "");
  if (key) wrap.dataset.key = key;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  // Cabeçalho: avatar + nome + hora
  const head = document.createElement("div");
  head.className = "msg-head";

  const pinfo = data.uid ? onlineUsers.get(data.uid) : null;
  const avatar = makeAvatarEl(pinfo || data);

  const nm = document.createElement("span");
  nm.className = "name";
  nm.style.color = `hsl(${data.hue ?? 220} 80% 70%)`;
  nm.textContent = (data.admin ? "👑 " : "") + (data.name || "Anônimo");

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

  // Admin pode apagar qualquer mensagem
  if (isAdmin && key) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del-btn";
    del.title = "Apagar mensagem (adm)";
    del.textContent = "🗑️";
    del.addEventListener("click", () => {
      remove(ref(db, `messages/${key}`)).catch(() => {});
    });
    bubble.appendChild(del);
  }

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
    admin: isAdmin,
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

  const markPresence = () =>
    set(myPresence, {
      name: myName,
      hue: myHue,
      photo: myPhoto || null,
      at: serverTimestamp(),
    }).catch(() => {});

  // Marca presença e re-marca sempre que a conexão voltar
  onValue(ref(db, ".info/connected"), (snap) => {
    if (snap.val() === true) markPresence();
  });

  // Heartbeat: renova a cada 60s para manter a lista de online precisa
  setInterval(markPresence, 60000);

  // Contador de online + lista de usuários (usada nas chamadas e amigos)
  onValue(
    ref(db, "presence"),
    (snap) => {
      const val = snap.val() || {};
      const now = Date.now();
      onlineUsers = new Map();
      for (const [uid, info] of Object.entries(val)) {
        if (!info || typeof info !== "object") continue;
        // Ignora entradas "fantasmas" (sem renovação há mais de 3 minutos)
        const age = info.at ? now - info.at : Infinity;
        if (age < 3 * 60 * 1000 || uid === myUid) onlineUsers.set(uid, info);
      }
      const n = onlineUsers.size;
      onlineEl.textContent = `🟢 ${n} online${n === 1 ? "" : "s"}`;
      renderFriendsPanel();
      updateDmStatus();
    },
    () => (onlineEl.textContent = "🟢 —")
  );
}

// ------------------------------------------------------------
// 🖥️ Transmissão de tela (WebRTC ponto a ponto)
// O vídeo vai direto do PC do transmissor para o espectador.
// O Firebase só troca os dados de conexão (oferta/resposta/candidatos).
// ------------------------------------------------------------
const streamBtn = $("stream-btn");
const liveBanner = $("live-banner");
const watchBtn = $("watch-btn");
const watchOverlay = $("watch-overlay");
const watchVideo = $("watch-video");
const watchClose = $("watch-close");

const ICE_SERVERS = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

let localStream = null;   // captura de tela do transmissor
let iAmLive = false;      // estou transmitindo?
let viewerPCs = new Map(); // espectador -> RTCPeerConnection
let viewersUnsub = null;
let watchPC = null;       // minha conexão quando assisto
let watchingId = null;
let watchUnsubs = [];
let liveName = "";

const stateRef = () => ref(db, "stream/state");
const myViewerRef = () => ref(db, `stream/viewers/${myUid}`);

function setupStreaming() {
  onValue(stateRef(), (snap) => {
    const st = snap.val();
    if (st && st.active) {
      liveName = st.name || "Alguém";
      if (st.uid === myUid) {
        iAmLive = true;
        streamBtn.classList.add("on");
        watchBtn.textContent = "🟥 Você está ao vivo — clique para encerrar";
      } else {
        watchBtn.textContent = `🔴 ${liveName} está transmitindo a tela — clique para assistir`;
        if (isAdmin) streamKillBtn.classList.remove("hidden");
      }
      liveBanner.classList.remove("hidden");
    } else {
      liveName = "";
      liveBanner.classList.add("hidden");
      streamBtn.classList.remove("on");
      streamKillBtn.classList.add("hidden");
      if (iAmLive) {
        iAmLive = false;
        if (localStream) {
          localStream.getTracks().forEach((t) => t.stop());
          localStream = null;
        }
        viewerPCs.forEach((pc) => pc.close());
        viewerPCs.clear();
        if (viewersUnsub) { viewersUnsub(); viewersUnsub = null; }
        remove(ref(db, "stream/viewers")).catch(() => {});
        addSystemMessage("🛑 Sua transmissão foi encerrada.");
      }
      if (watchingId) {
        stopWatching();
        addSystemMessage("🛑 A transmissão que você assistia foi encerrada.");
      }
    }
  });
}

async function startBroadcast() {
  if (!db) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    addSystemMessage("⚠️ Este navegador não suporta transmissão de tela. Use Chrome ou Edge no PC.");
    return;
  }
  const snap = await get(stateRef());
  if (snap.exists()) {
    addSystemMessage("⚠️ Já existe uma transmissão ao vivo — ela precisa encerrar antes de outra começar.");
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (err) {
    console.warn(err);
    if (err && (err.name === "NotAllowedError" || err.name === "AbortError")) return; // usuário cancelou
    addSystemMessage(
      "⚠️ A captura de tela falhou (" +
        (err?.name || "erro") +
        "). O navegador só permite transmitir em HTTPS — abra o site publicado (github.io) ou um servidor local. Veja o README."
    );
    return;
  }
  await set(stateRef(), { active: true, uid: myUid, name: myName, hue: myHue, at: serverTimestamp() });
  onDisconnect(stateRef()).remove();
  localStream.getVideoTracks()[0].addEventListener("ended", stopBroadcast);
  viewersUnsub = onChildAdded(ref(db, "stream/viewers"), handleNewViewer);
  addSystemMessage("🔴 Você começou a transmitir! Os outros verão um banner vermelho para assistir.");
}

function stopBroadcast() {
  if (db) remove(stateRef()).catch(() => {});
  // a limpeza completa acontece no listener do estado (onValue)
}

async function handleNewViewer(snap) {
  if (!iAmLive || !localStream) return;
  const viewerId = snap.key;
  const data = snap.val();
  if (!data || !data.offer || viewerId === myUid) return;

  try {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    viewerPCs.set(viewerId, pc);
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    pc.onicecandidate = (e) => {
      if (e.candidate) push(ref(db, `stream/viewers/${viewerId}/candsB`), e.candidate.toJSON());
    };

    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await set(ref(db, `stream/viewers/${viewerId}/answer`), { type: answer.type, sdp: answer.sdp });

    onChildAdded(ref(db, `stream/viewers/${viewerId}/candsV`), (c) => {
      pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {});
    });
  } catch (err) {
    console.warn("Falha ao aceitar espectador:", err);
  }
}

async function startWatching() {
  if (!db || watchPC) return;
  const snap = await get(stateRef());
  const st = snap.val();
  if (!st || !st.active || st.uid === myUid) return;

  watchingId = st.uid;
  watchPC = new RTCPeerConnection(ICE_SERVERS);
  watchPC.addTransceiver("video", { direction: "recvonly" });
  watchPC.addTransceiver("audio", { direction: "recvonly" });

  watchPC.ontrack = (e) => {
    watchVideo.srcObject = e.streams[0];
    watchOverlay.classList.remove("hidden");
    watchVideo.play().catch(() => {});
    watchBtn.textContent = "⏹️ Sair da transmissão";
  };

  watchPC.onicecandidate = (e) => {
    if (e.candidate) push(ref(db, `stream/viewers/${myUid}/candsV`), e.candidate.toJSON());
  };

  onDisconnect(myViewerRef()).remove();

  const offer = await watchPC.createOffer();
  await watchPC.setLocalDescription(offer);
  await set(myViewerRef(), { name: myName, offer: { type: offer.type, sdp: offer.sdp } });

  let remoteReady = false;
  let candsBuf = [];

  watchUnsubs.push(
    onValue(ref(db, `stream/viewers/${myUid}/answer`), async (s) => {
      if (!s.exists() || !watchPC || watchPC.currentRemoteDescription) return;
      try {
        await watchPC.setRemoteDescription(new RTCSessionDescription(s.val()));
        remoteReady = true;
        candsBuf.forEach((cand) => watchPC && watchPC.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {}));
        candsBuf = [];
      } catch (err) { console.warn(err); }
    })
  );

  watchUnsubs.push(
    onChildAdded(ref(db, `stream/viewers/${myUid}/candsB`), (c) => {
      if (!watchPC) return;
      if (remoteReady) watchPC.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {});
      else candsBuf.push(c.val());
    })
  );
}

function stopWatching() {
  watchUnsubs.forEach((u) => u());
  watchUnsubs = [];
  if (watchPC) { watchPC.close(); watchPC = null; }
  watchVideo.srcObject = null;
  watchOverlay.classList.add("hidden");
  if (db && watchingId) remove(myViewerRef()).catch(() => {});
  watchingId = null;
  if (liveName) {
    watchBtn.textContent = `🔴 ${liveName} está transmitindo a tela — clique para assistir`;
  }
}

streamBtn.addEventListener("click", () => {
  if (!db) { addSystemMessage("⚠️ Firebase não configurado — transmissão indisponível."); return; }
  if (!isAdmin) { addSystemMessage("🔒 A transmissão global de tela é exclusiva do administrador 👑."); return; }
  if (iAmLive) stopBroadcast();
  else startBroadcast();
});

watchBtn.addEventListener("click", () => {
  if (!db) return;
  if (iAmLive) { stopBroadcast(); return; }
  if (watchingId) { stopWatching(); return; }
  startWatching();
});

watchClose.addEventListener("click", () => {
  if (watchingId) stopWatching();
});

// ------------------------------------------------------------
// 📞 Chamadas de voz em grupo (WebRTC mesh + Firebase)
// O áudio vai direto entre os PCs. O Firebase só organiza
// convites e a troca de dados de conexão entre os pares.
// ------------------------------------------------------------
const callBtn = $("call-btn");
const callPanel = $("call-panel");
const callPanelClose = $("call-panel-close");
const callUserList = $("call-user-list");
const callOnlineHint = $("call-online-hint");
const startCallBtn = $("start-call-btn");
const ringOverlay = $("ring-overlay");
const ringTitle = $("ring-title");
const ringSub = $("ring-sub");
const ringAccept = $("ring-accept");
const ringDecline = $("ring-decline");
const callOverlay = $("call-overlay");
const callRoomLabel = $("call-room-label");
const callMembersEl = $("call-members");
const callLeave = $("call-leave");
const callMute = $("call-mute");
const callInviteMore = $("call-invite-more");
const callShareBtn = $("call-share");
const callScreenOverlay = $("call-screen-overlay");
const callScreenLabel = $("call-screen-label");
const callScreenVideo = $("call-screen-video");
const callAudioContainer = $("call-audio-container");

let onlineUsers = new Map(); // uid -> { name, hue, at }
let currentMembers = {};      // membros da minha sala atual
let callPeers = new Map();    // uid -> { pc, name, hue, audioEls, remoteReady, candsBuf, screenVideoSender, screenAudioSender }
let callUnsubs = [];
let localMic = null;
let micOn = true;
let callRoomId = null;
let pendingInvite = null;
let callPanelMode = "start";
let selectedToCall = new Set();
let sharingUid = null;       // quem está compartilhando a tela nesta chamada
let callScreenStream = null; // minha captura de tela na chamada

function setupCalls() {
  // Detecta convites dirigidos a mim
  onValue(ref(db, `invites/${myUid}`), (snap) => {
    const inv = snap.val();
    if (inv && inv.roomId && !callRoomId) {
      pendingInvite = inv;
      ringTitle.textContent = `📞 ${inv.hostName || "Alguém"} está te chamando!`;
      ringSub.textContent = "Chamada de voz em grupo";
      ringOverlay.classList.remove("hidden");
    } else if (!inv) {
      pendingInvite = null;
      ringOverlay.classList.add("hidden");
    }
  });
}

// ---------- Painel de seleção ----------
function openCallPanel(mode) {
  if (!db) {
    addSystemMessage("⚠️ Firebase não configurado — chamadas indisponíveis.");
    return;
  }
  callPanelMode = mode;
  selectedToCall.clear();
  startCallBtn.textContent = mode === "invite-more" ? "Convidar para a chamada ➜" : "Iniciar chamada ➜";
  callOnlineHint.textContent =
    mode === "invite-more" ? "Quem mais você quer chamar?" : "Selecione quem você quer chamar:";
  renderCallUserList();
  callPanel.classList.remove("hidden");
}

function renderCallUserList() {
  callUserList.innerHTML = "";
  let any = false;
  for (const [uid, info] of onlineUsers) {
    if (uid === myUid) continue;
    if (callRoomId && currentMembers[uid]) continue; // já está na sala
    any = true;
    const row = document.createElement("div");
    row.className = "call-user";

    const av = document.createElement("span");
    av.className = "avatar";
    av.style.background = `hsl(${info.hue ?? 220} 70% 45%)`;
    av.textContent = (info.name || "?").slice(0, 1).toUpperCase();

    const nm = document.createElement("span");
    nm.textContent = info.name || "Anônimo";

    const mark = document.createElement("span");
    mark.textContent = "☐";
    mark.style.marginLeft = "auto";

    row.append(av, nm, mark);
    row.addEventListener("click", () => {
      if (selectedToCall.has(uid)) {
        selectedToCall.delete(uid);
        row.classList.remove("selected");
        mark.textContent = "☐";
      } else {
        selectedToCall.add(uid);
        row.classList.add("selected");
        mark.textContent = "☑";
      }
    });
    callUserList.appendChild(row);
  }
  if (!any) {
    const p = document.createElement("p");
    p.className = "call-empty";
    p.textContent = "Ninguém online além de você agora 😴";
    callUserList.appendChild(p);
  }
}

// ---------- Criar chamada ----------
async function startCall() {
  if (!selectedToCall.size) {
    addSystemMessage("⚠️ Selecione pelo menos uma pessoa para chamar.");
    return;
  }
  const roomId = myUid + "-" + Date.now();
  const members = {};
  members[myUid] = { name: myName, hue: myHue, status: "joined" };
  for (const uid of selectedToCall) {
    const info = onlineUsers.get(uid);
    members[uid] = { name: info?.name || "Alguém", hue: info?.hue ?? 220, status: "invited" };
  }

  await set(ref(db, `calls/${roomId}`), {
    meta: { host: myUid, hostName: myName, at: serverTimestamp() },
    members,
  });
  for (const uid of selectedToCall) {
    await set(ref(db, `invites/${uid}`), {
      roomId,
      host: myUid,
      hostName: myName,
      at: serverTimestamp(),
    });
  }

  callPanel.classList.add("hidden");
  const n = selectedToCall.size;
  selectedToCall.clear();

  const ok = await enterCallRoom(roomId, true);
  if (!ok) {
    await remove(ref(db, `calls/${roomId}`)).catch(() => {});
    for (const uid of Object.keys(members)) {
      await remove(ref(db, `invites/${uid}`)).catch(() => {});
    }
  } else {
    addSystemMessage(`📞 Você chamou ${n} pessoa(s) para a chamada.`);
  }
}

async function inviteMoreToCall() {
  if (!callRoomId || !selectedToCall.size) {
    callPanel.classList.add("hidden");
    return;
  }
  for (const uid of selectedToCall) {
    const info = onlineUsers.get(uid);
    await set(ref(db, `calls/${callRoomId}/members/${uid}`), {
      name: info?.name || "Alguém",
      hue: info?.hue ?? 220,
      status: "invited",
    }).catch(() => {});
    await set(ref(db, `invites/${uid}`), {
      roomId: callRoomId,
      host: myUid,
      hostName: myName,
      at: serverTimestamp(),
    }).catch(() => {});
  }
  callPanel.classList.add("hidden");
  addSystemMessage(`📞 Você convidou ${selectedToCall.size} pessoa(s).`);
  selectedToCall.clear();
}

// ---------- Entrar / sair da sala ----------
async function enterCallRoom(roomId, asHost, hostName) {
  try {
    localMic = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn(err);
    addSystemMessage(
      "⚠️ Sem acesso ao microfone — verifique a permissão do navegador. Dica: em HTTPS funciona de boa; abrindo o arquivo direto do disco (file://) alguns navegadores bloqueiam."
    );
    return false;
  }

  callRoomId = roomId;
  micOn = true;
  callMute.textContent = "🎙️";
  callMute.classList.remove("off");
  sharingUid = null;
  callScreenStream = null;
  callScreenVideo.srcObject = null;
  callScreenOverlay.classList.add("hidden");
  callShareBtn.textContent = "🖥️";
  callShareBtn.classList.remove("on");
  callRoomLabel.textContent = asHost ? "🔊 Sua chamada" : `🔊 Chamada de ${hostName || "alguém"}`;
  callOverlay.classList.remove("hidden");
  callBtn.classList.add("on");

  const myMemberRef = ref(db, `calls/${roomId}/members/${myUid}`);
  await set(myMemberRef, { name: myName, hue: myHue, status: "joined" }).catch(() => {});
  onDisconnect(myMemberRef).set({ name: myName, hue: myHue, status: "left" });

  callUnsubs.push(
    onValue(ref(db, `calls/${roomId}/members`), (snap) => {
      currentMembers = snap.val() || {};
      reconcileMesh();
      renderCallMembers();
    })
  );
  callUnsubs.push(onValue(ref(db, `calls/${roomId}/offers/${myUid}`), handleIncomingOffer));
  callUnsubs.push(onValue(ref(db, `calls/${roomId}/answers/${myUid}`), handleIncomingAnswer));
  callUnsubs.push(onChildAdded(ref(db, `calls/${roomId}/cands/${myUid}`), handleIncomingCandidate));
  renderCallMembers();
  return true;
}

async function leaveCall() {
  if (!callRoomId) return;
  const roomId = callRoomId;

  callUnsubs.forEach((u) => u());
  callUnsubs = [];
  stopCallScreenShare();
  callPeers.forEach((entry, uid) => destroyPeerPC(uid));
  if (localMic) {
    localMic.getTracks().forEach((t) => t.stop());
    localMic = null;
  }
  callOverlay.classList.add("hidden");
  callBtn.classList.remove("on");
  callRoomId = null;
  currentMembers = {};

  await set(ref(db, `calls/${roomId}/members/${myUid}`), {
    name: myName,
    hue: myHue,
    status: "left",
  }).catch(() => {});

  // Se não sobrou ninguém na chamada, apaga a sala e os convites pendentes
  const snap = await get(ref(db, `calls/${roomId}/members`)).catch(() => null);
  if (snap && snap.exists()) {
    const members = snap.val();
    const anyJoined = Object.values(members).some((m) => m && m.status === "joined");
    if (!anyJoined) {
      await remove(ref(db, `calls/${roomId}`)).catch(() => {});
      const inv = await get(ref(db, "invites")).catch(() => null);
      if (inv && inv.exists()) {
        for (const [uid, info] of Object.entries(inv.val())) {
          if (info && info.roomId === roomId) remove(ref(db, `invites/${uid}`)).catch(() => {});
        }
      }
    }
  }
  addSystemMessage("🚪 Você saiu da chamada.");

  // Se chegou outro convite enquanto você estava ocupado, mostra agora
  const myInv = await get(ref(db, `invites/${myUid}`)).catch(() => null);
  if (myInv && myInv.exists() && myInv.val() && myInv.val().roomId) {
    pendingInvite = myInv.val();
    ringTitle.textContent = `📞 ${pendingInvite.hostName || "Alguém"} está te chamando!`;
    ringSub.textContent = "Chamada de voz em grupo";
    ringOverlay.classList.remove("hidden");
  }
}

// ---------- Malha WebRTC ----------
function reconcileMesh() {
  if (!callRoomId) return;
  for (const [uid] of callPeers) {
    const m = currentMembers[uid];
    if (!m || m.status !== "joined") destroyPeerPC(uid);
  }
  for (const [uid, m] of Object.entries(currentMembers)) {
    if (uid === myUid || m.status !== "joined") continue;
    if (!callPeers.has(uid)) createPeerPC(uid, m);
  }
}

function createPeerPC(uid, m) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  const entry = { pc, name: m.name, hue: m.hue, remoteReady: false, candsBuf: [], audioEls: [] };
  callPeers.set(uid, entry);

  if (localMic) localMic.getTracks().forEach((t) => pc.addTrack(t, localMic));

  // Transceivers extras para compartilhar tela na chamada (sem renegociar conexão)
  const svT = pc.addTransceiver("video", { direction: "sendrecv" });
  const saT = pc.addTransceiver("audio", { direction: "sendrecv" });
  entry.screenVideoSender = svT.sender;
  entry.screenAudioSender = saT.sender;

  // Se eu já estava compartilhando, aplica pra quem acabou de entrar na chamada
  if (sharingUid === myUid && callScreenStream) {
    entry.screenVideoSender.replaceTrack(callScreenStream.getVideoTracks()[0]).catch(() => {});
    const aTrack = callScreenStream.getAudioTracks()[0] || null;
    entry.screenAudioSender.replaceTrack(aTrack).catch(() => {});
  }

  pc.onicecandidate = (e) => {
    if (e.candidate && callRoomId) {
      push(ref(db, `calls/${callRoomId}/cands/${uid}`), {
        from: myUid,
        cand: e.candidate.toJSON(),
      });
    }
  };

  pc.ontrack = (e) => {
    const ms = e.streams[0] || new MediaStream([e.track]);

    if (e.track.kind === "video") {
      // Tela compartilhada pelo outro lado
      callScreenVideo.srcObject = ms;
      e.track.onunmute = () => {
        if (sharingUid !== myUid) {
          sharingUid = uid;
          updateCallShareUI();
        }
        callScreenVideo.play().catch(() => {});
      };
      e.track.onmute = () => {
        if (sharingUid === uid) {
          sharingUid = null;
          updateCallShareUI();
        }
      };
    } else {
      // Áudio (microfone ou áudio da tela compartilhada)
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.srcObject = ms;
      audio.play().catch(() => {});
      entry.audioEls.push(audio);
      callAudioContainer.appendChild(audio);
    }
  };

  // O menor uid faz a oferta (evita os dois lados falarem ao mesmo tempo)
  if (myUid < uid) {
    pc.createOffer()
      .then(async (offer) => {
        await pc.setLocalDescription(offer);
        await set(ref(db, `calls/${callRoomId}/offers/${uid}`), {
          from: myUid,
          sdp: { type: offer.type, sdp: offer.sdp },
        });
      })
      .catch((err) => console.warn(err));
  }
}

function destroyPeerPC(uid) {
  const entry = callPeers.get(uid);
  if (!entry) return;
  try { entry.pc.close(); } catch {}
  (entry.audioEls || []).forEach((a) => a.remove());
  if (sharingUid === uid) {
    sharingUid = null;
    updateCallShareUI();
  }
  callPeers.delete(uid);
}

async function handleIncomingOffer(snap) {
  const data = snap.val();
  if (!data || !callRoomId || !data.from) return;
  let entry = callPeers.get(data.from);
  if (!entry) {
    const m = currentMembers[data.from] || { name: "Alguém", hue: 220 };
    createPeerPC(data.from, m);
    entry = callPeers.get(data.from);
  }
  if (!entry || entry.pc.currentRemoteDescription || entry.pc.signalingState !== "stable") return;
  try {
    await entry.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await entry.pc.createAnswer();
    await entry.pc.setLocalDescription(answer);
    await set(ref(db, `calls/${callRoomId}/answers/${data.from}`), {
      from: myUid,
      sdp: { type: answer.type, sdp: answer.sdp },
    });
  } catch (err) {
    console.warn(err);
  }
}

async function handleIncomingAnswer(snap) {
  const data = snap.val();
  if (!data || !data.from) return;
  const entry = callPeers.get(data.from);
  if (!entry || entry.pc.currentRemoteDescription) return;
  try {
    await entry.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    entry.remoteReady = true;
    entry.candsBuf.forEach((c) =>
      entry.pc.addIceCandidate(new RTCIceCandidate(c.cand)).catch(() => {})
    );
    entry.candsBuf = [];
  } catch (err) {
    console.warn(err);
  }
}

function handleIncomingCandidate(snap) {
  const data = snap.val();
  if (!data || !data.from) return;
  const entry = callPeers.get(data.from);
  if (!entry) return;
  if (entry.pc.currentRemoteDescription) {
    entry.pc.addIceCandidate(new RTCIceCandidate(data.cand)).catch(() => {});
  } else {
    entry.candsBuf.push(data);
  }
}

// ---------- Visual ----------
function renderCallMembers() {
  callMembersEl.innerHTML = "";
  for (const [uid, m] of Object.entries(currentMembers)) {
    const chip = document.createElement("div");
    chip.className = "member-chip";

    const av = document.createElement("span");
    av.className = "avatar";
    av.style.background = `hsl(${m.hue ?? 220} 70% 45%)`;
    av.textContent = (m.name || "?").slice(0, 1).toUpperCase();

    const nm = document.createElement("span");
    nm.textContent = m.name || "Anônimo";

    const st = document.createElement("span");
    if (m.status === "joined") {
      st.textContent = uid === myUid ? (micOn ? "🎙️" : "🔇") : "🔊";
    } else if (m.status === "invited") {
      st.textContent = "⏳ chamando...";
    } else if (m.status === "declined") {
      st.textContent = "🚫 recusou";
    } else {
      st.textContent = "↩️ saiu";
    }

    chip.append(av, nm, st);
    callMembersEl.appendChild(chip);
  }
}

// ---------- Botões ----------
callBtn.addEventListener("click", () => {
  if (!db) {
    addSystemMessage("⚠️ Firebase não configurado.");
    return;
  }
  openCallPanel(callRoomId ? "invite-more" : "start");
});

callPanelClose.addEventListener("click", () => {
  callPanel.classList.add("hidden");
  selectedToCall.clear();
});

startCallBtn.addEventListener("click", () => {
  if (callPanelMode === "invite-more") inviteMoreToCall();
  else startCall();
});

ringAccept.addEventListener("click", async () => {
  const inv = pendingInvite;
  if (!inv || !inv.roomId) return;
  ringOverlay.classList.add("hidden");
  pendingInvite = null;
  remove(ref(db, `invites/${myUid}`)).catch(() => {});
  const ok = await enterCallRoom(inv.roomId, false, inv.hostName);
  if (ok) {
    addSystemMessage(`✅ Você entrou na chamada de ${inv.hostName || "alguém"}.`);
  } else {
    set(ref(db, `calls/${inv.roomId}/members/${myUid}`), {
      name: myName,
      hue: myHue,
      status: "left",
    }).catch(() => {});
  }
});

ringDecline.addEventListener("click", () => {
  const inv = pendingInvite;
  ringOverlay.classList.add("hidden");
  pendingInvite = null;
  if (!inv) return;
  remove(ref(db, `invites/${myUid}`)).catch(() => {});
  if (inv.roomId) {
    set(ref(db, `calls/${inv.roomId}/members/${myUid}`), {
      name: myName,
      hue: myHue,
      status: "declined",
    }).catch(() => {});
  }
  addSystemMessage("🚫 Você recusou a chamada.");
});

callLeave.addEventListener("click", leaveCall);

callMute.addEventListener("click", () => {
  if (!localMic) return;
  micOn = !micOn;
  localMic.getAudioTracks().forEach((t) => (t.enabled = micOn));
  callMute.textContent = micOn ? "🎙️" : "🔇";
  callMute.classList.toggle("off", !micOn);
  renderCallMembers();
});

callInviteMore.addEventListener("click", () => openCallPanel("invite-more"));

// ---------- 🖥️ Compartilhar tela DENTRO da chamada ----------
async function startCallScreenShare() {
  if (!callRoomId) return;
  if (sharingUid && sharingUid !== myUid) {
    addSystemMessage(
      "⚠️ " + (callPeers.get(sharingUid)?.name || "Alguém") + " já está compartilhando a tela nesta chamada."
    );
    return;
  }
  try {
    callScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (err) {
    console.warn(err);
    if (err && (err.name === "NotAllowedError" || err.name === "AbortError")) return;
    addSystemMessage(
      "⚠️ A captura de tela falhou (" + (err?.name || "erro") + "). Teste em HTTPS (site publicado ou localhost)."
    );
    return;
  }
  sharingUid = myUid;
  const vTrack = callScreenStream.getVideoTracks()[0];
  const aTrack = callScreenStream.getAudioTracks()[0] || null;
  for (const [, entry] of callPeers) {
    entry.screenVideoSender?.replaceTrack(vTrack).catch(() => {});
    entry.screenAudioSender?.replaceTrack(aTrack).catch(() => {});
  }
  vTrack.addEventListener("ended", stopCallScreenShare);
  callScreenVideo.srcObject = callScreenStream;
  updateCallShareUI();
  addSystemMessage("🖥️ Você está compartilhando sua tela na chamada!");
}

function stopCallScreenShare() {
  if (callScreenStream) {
    callScreenStream.getTracks().forEach((t) => t.stop());
    callScreenStream = null;
  }
  for (const [, entry] of callPeers) {
    entry.screenVideoSender?.replaceTrack(null).catch(() => {});
    entry.screenAudioSender?.replaceTrack(null).catch(() => {});
  }
  if (sharingUid === myUid) {
    sharingUid = null;
    updateCallShareUI();
  }
}

function updateCallShareUI() {
  callShareBtn.classList.toggle("on", sharingUid === myUid);
  callShareBtn.textContent = sharingUid === myUid ? "🛑" : sharingUid ? "📺" : "🖥️";
  callShareBtn.title =
    sharingUid === myUid
      ? "Parar de compartilhar a tela"
      : sharingUid
        ? "Ver a tela compartilhada"
        : "Compartilhar sua tela";

  if (sharingUid === myUid) {
    callScreenLabel.textContent = "🛑 Você está compartilhando sua tela";
    callScreenOverlay.classList.remove("hidden");
  } else if (sharingUid) {
    const info = callPeers.get(sharingUid);
    callScreenLabel.textContent = `🖥️ ${info?.name || "Alguém"} está compartilhando a tela`;
    callScreenOverlay.classList.remove("hidden");
  } else {
    callScreenOverlay.classList.add("hidden");
    callScreenVideo.srcObject = null;
  }
}

callShareBtn.addEventListener("click", () => {
  if (!callRoomId) return;
  if (sharingUid === myUid) {
    stopCallScreenShare();
    return;
  }
  if (sharingUid) {
    // espectador: mostra/esconde a visualização
    callScreenOverlay.classList.toggle("hidden");
    return;
  }
  startCallScreenShare();
});

// ------------------------------------------------------------
// 👥 Amigos + conversas privadas (DM)
// ------------------------------------------------------------
const friendsBtn = $("friends-btn");
const friendsBadge = $("friends-badge");
const sidebarEl = $("sidebar");
const navGlobal = $("nav-global");
const sidebarRequests = $("sidebar-requests");
const sidebarFriends = $("sidebar-friends");
const openAddFriend = $("open-add-friend");
const addFriendPanel = $("add-friend-panel");
const addFriendClose = $("add-friend-close");
const addFriendList = $("add-friend-list");
const myProfile = $("my-profile");
const myAvatar = $("my-avatar");
const myNameEl = $("my-name");
const myCrown = $("my-crown");
const profilePanel = $("profile-panel");
const profileClose = $("profile-close");
const profileAvatarBig = $("profile-avatar-big");
const pickPhoto = $("pick-photo");
const removePhotoBtn = $("remove-photo");
const photoInput = $("photo-input");
const dmTitle = $("dm-title");
const dmStatusEl = $("dm-status");
const dmRemove = $("dm-remove");
const dmMessagesEl = $("dm-messages");
const dmForm = $("dm-form");
const dmInput = $("dm-input");

let friendsMap = new Map();     // uid -> { name, hue, since }
let pendingRequests = new Map(); // uid -> { name, hue, at }
let sentRequests = new Set();   // pedidos que EU enviei (nesta sessão)
let dmRooms = new Map();       // friendUid -> { unsubs, unread, msgs }
let prevFriendsCount = 0;
let prevRequestsCount = 0;

// Chave da sala privada entre dois usuários (sempre igual pros dois lados)
const roomKeyFor = (a, b) => [a, b].sort().join("__");

function setupFriends() {
  onValue(ref(db, `friends/${myUid}`), (snap) => {
    const val = snap.val() || {};
    const before = new Set(friendsMap.keys());
    friendsMap = new Map(Object.entries(val));
    // Avisa quando uma amizade nova aparece (aceitaram seu pedido)
    for (const [uid, info] of friendsMap) {
      if (!before.has(uid) && prevFriendsCount > 0) {
        addSystemMessage(`🎉 Você e ${info.name || "alguém"} agora são amigos!`);
      }
    }
    prevFriendsCount = friendsMap.size;
    reconcileDmListeners();
    renderFriendsPanel();
    updateFriendsBadge();
  });

  onValue(ref(db, `friendRequests/${myUid}`), (snap) => {
    const val = snap.val() || {};
    const before = new Set(pendingRequests.keys());
    pendingRequests = new Map(Object.entries(val));
    for (const [uid, info] of pendingRequests) {
      if (!before.has(uid) && prevRequestsCount > 0) {
        addSystemMessage(`👥 ${info.name || "Alguém"} quer ser seu amigo! Abra o painel 👥 para aceitar.`);
      }
    }
    prevRequestsCount = pendingRequests.size;
    renderFriendsPanel();
    updateFriendsBadge();
  });
}

// ---------- Ações ----------
async function sendFriendRequest(targetUid) {
  if (friendsMap.has(targetUid)) return;
  // Se a pessoa já me chamou, aceita direto
  if (pendingRequests.has(targetUid)) {
    acceptRequest(targetUid);
    return;
  }
  const info = onlineUsers.get(targetUid);
  sentRequests.add(targetUid);
  await set(ref(db, `friendRequests/${targetUid}/${myUid}`), {
    name: myName,
    hue: myHue,
    at: serverTimestamp(),
  }).catch(() => {});
  addSystemMessage(`📨 Pedido de amizade enviado para ${info?.name || "alguém"}.`);
  renderFriendsPanel();
}

async function acceptRequest(fromUid) {
  const info = pendingRequests.get(fromUid);
  if (!info) return;
  await set(ref(db, `friends/${myUid}/${fromUid}`), {
    name: info.name || "Alguém",
    hue: info.hue ?? 220,
    since: serverTimestamp(),
  }).catch(() => {});
  await set(ref(db, `friends/${fromUid}/${myUid}`), {
    name: myName,
    hue: myHue,
    since: serverTimestamp(),
  }).catch(() => {});
  await remove(ref(db, `friendRequests/${myUid}/${fromUid}`)).catch(() => {});
  sentRequests.delete(fromUid);
}

async function declineRequest(fromUid) {
  await remove(ref(db, `friendRequests/${myUid}/${fromUid}`)).catch(() => {});
  addSystemMessage("Pedido de amizade recusado.");
}

async function removeFriend(uid) {
  if (!friendsMap.has(uid)) return;
  if (!confirm("Remover este amigo?")) return;
  const room = dmRooms.get(uid);
  if (room) {
    room.unsubs.forEach((u) => u());
    dmRooms.delete(uid);
  }
  if (activeChannel === uid) switchChannel(null);
  await remove(ref(db, `friends/${myUid}/${uid}`)).catch(() => {});
  await remove(ref(db, `friends/${uid}/${myUid}`)).catch(() => {});
  addSystemMessage("💔 Amizade removida.");
  renderFriendsPanel();
  updateFriendsBadge();
}

// ---------- Listeners das salas privadas ----------
function reconcileDmListeners() {
  // remove salas de quem deixou de ser amigo
  for (const [uid, room] of dmRooms) {
    if (!friendsMap.has(uid)) {
      room.unsubs.forEach((u) => u());
      dmRooms.delete(uid);
    }
  }
  // cria salas dos amigos
  for (const uid of friendsMap.keys()) {
    if (dmRooms.has(uid)) continue;
    const key = roomKeyFor(myUid, uid);
    const room = { unsubs: [], unread: 0, msgs: [] };
    dmRooms.set(uid, room);
    room.unsubs.push(
      onChildAdded(
        query(ref(db, `dm/${key}/messages`), limitToLast(100)),
        (snap) => {
          const data = snap.val();
          if (!data) return;
          room.msgs.push(data);
          if (activeChannel === uid) {
            renderDmMessages(uid);
          } else if (data.uid !== myUid) {
            const first = room.unread === 0;
            room.unread++;
            updateFriendsBadge();
            renderFriendsPanel();
            if (first) {
              addSystemMessage(`💬 ${data.name || "Alguém"} te mandou uma mensagem privada (veja na barra lateral 👈).`);
            }
          }
        },
        () => {}
      )
    );
  }
}

// ---------- Canais (estilo Discord) ----------
function switchChannel(uid) {
  // uid = null -> chat global | uid de amigo -> conversa privada
  activeChannel = uid || "global";
  const isDm = activeChannel !== "global";
  $("channel-global").classList.toggle("hidden", isDm);
  $("channel-dm").classList.toggle("hidden", !isDm);
  navGlobal.classList.toggle("active", !isDm);
  if (isDm) {
    const room = dmRooms.get(uid);
    if (room) room.unread = 0;
    const info = friendsMap.get(uid);
    const live = onlineUsers.get(uid);
    dmTitle.textContent = "@ " + (live?.name || info?.name || "Amigo");
    updateDmStatus();
    renderDmMessages(uid);
    renderFriendsPanel();
    updateFriendsBadge();
    dmInput.focus();
  } else {
    renderFriendsPanel();
    msgInput.focus();
  }
}

function updateDmStatus() {
  if (activeChannel === "global") return;
  dmStatusEl.textContent = onlineUsers.has(activeChannel) ? "🟢 online" : "⚫ offline";
}

// ---------- Perfil e foto ----------
function updateMyProfileRow() {
  myAvatar.innerHTML = "";
  myAvatar.appendChild(makeAvatarEl({ name: myName, hue: myHue, photo: myPhoto }));
  myNameEl.textContent = myName;
  myCrown.classList.toggle("hidden", !isAdmin);
}

function showProfilePanel() {
  profileAvatarBig.innerHTML = "";
  profileAvatarBig.appendChild(makeAvatarEl({ name: myName, hue: myHue, photo: myPhoto }));
  profilePanel.classList.remove("hidden");
}

pickPhoto.addEventListener("click", () => photoInput.click());

photoInput.addEventListener("change", () => {
  const file = photoInput.files && photoInput.files[0];
  photoInput.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = async () => {
      // Corte central quadrado + redimensiona para 96×96
      const size = 96;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const min = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
      myPhoto = canvas.toDataURL("image/jpeg", 0.75);
      await set(ref(db, `users/${myUid}/photo`), myPhoto).catch(() => {});
      set(ref(db, `presence/${myUid}`), {
        name: myName,
        hue: myHue,
        photo: myPhoto,
        at: serverTimestamp(),
      }).catch(() => {});
      showProfilePanel();
      updateMyProfileRow();
      addSystemMessage("📷 Foto de perfil atualizada!");
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

removePhotoBtn.addEventListener("click", async () => {
  myPhoto = null;
  await remove(ref(db, `users/${myUid}/photo`)).catch(() => {});
  set(ref(db, `presence/${myUid}`), {
    name: myName,
    hue: myHue,
    photo: null,
    at: serverTimestamp(),
  }).catch(() => {});
  showProfilePanel();
  updateMyProfileRow();
  addSystemMessage("📷 Foto de perfil removida.");
});

myProfile.addEventListener("click", showProfilePanel);
profileClose.addEventListener("click", () => profilePanel.classList.add("hidden"));

// ---------- Adicionar amigo ----------
function renderAddFriendList() {
  addFriendList.innerHTML = "";
  let any = false;
  for (const [uid, info] of onlineUsers) {
    if (uid === myUid || friendsMap.has(uid) || pendingRequests.has(uid)) continue;
    if (sentRequests.has(uid)) continue;
    any = true;
    addFriendList.appendChild(
      makeUserRow(uid, info, [mkBtn("➕", "Adicionar amigo", () => sendFriendRequest(uid))])
    );
  }
  if (!any) emptyNote(addFriendList, "Ninguém novo online agora 😴");
}

openAddFriend.addEventListener("click", () => {
  renderAddFriendList();
  addFriendPanel.classList.remove("hidden");
});

addFriendClose.addEventListener("click", () => addFriendPanel.classList.add("hidden"));

function renderDmMessages(uid) {
  const room = dmRooms.get(uid);
  if (!room) return;
  dmMessagesEl.innerHTML = "";
  for (const m of room.msgs) appendDmBubble(m);
  dmMessagesEl.scrollTop = dmMessagesEl.scrollHeight;
}

function appendDmBubble(m) {
  const wrap = document.createElement("div");
  wrap.className = "msg" + (m.uid === myUid ? " mine" : "");

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const head = document.createElement("div");
  head.className = "msg-head";
  const davatar = makeAvatarEl({ name: m.name, hue: m.hue, photo: onlineUsers.get(m.uid)?.photo });
  const nm = document.createElement("span");
  nm.className = "name";
  nm.style.color = `hsl(${m.hue ?? 220} 80% 70%)`;
  nm.textContent = m.name || "Anônimo";
  const tm = document.createElement("span");
  tm.className = "time";
  tm.textContent = m.at
    ? new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
  head.append(davatar, nm, tm);

  const txt = document.createElement("div");
  txt.className = "text";
  txt.textContent = m.text || "";

  bubble.append(head, txt);
  wrap.appendChild(bubble);
  dmMessagesEl.appendChild(wrap);
}

// ---------- Barra lateral de amigos ----------
function renderFriendsPanel() {
  // Solicitações recebidas (topo da lista)
  sidebarRequests.innerHTML = "";
  for (const [uid, info] of pendingRequests) {
    sidebarRequests.appendChild(
      makeUserRow(uid, info, [
        mkBtn("✅", "Aceitar", () => acceptRequest(uid)),
        mkBtn("✖", "Recusar", () => declineRequest(uid)),
      ])
    );
  }

  // Lista de amigos
  sidebarFriends.innerHTML = "";
  if (!friendsMap.size) {
    const p = document.createElement("p");
    p.className = "side-empty";
    p.textContent = "Nenhum amigo ainda — use o ➕ acima!";
    sidebarFriends.appendChild(p);
  } else {
    const sorted = [...friendsMap.entries()].sort((a, b) => {
      const onA = onlineUsers.has(a[0]) ? 1 : 0;
      const onB = onlineUsers.has(b[0]) ? 1 : 0;
      if (onA !== onB) return onB - onA;
      return (dmRooms.get(b[0])?.unread || 0) - (dmRooms.get(a[0])?.unread || 0);
    });
    for (const [uid, info] of sorted) {
      const row = makeUserRow(uid, info, []);
      if (activeChannel === uid) row.classList.add("active");
      const dot = document.createElement("span");
      dot.textContent = onlineUsers.has(uid) ? "🟢" : "⚫";
      dot.title = onlineUsers.has(uid) ? "Online" : "Offline";
      row.appendChild(dot);
      const room = dmRooms.get(uid);
      if (room && room.unread > 0) {
        const b = document.createElement("span");
        b.className = "unread-badge";
        b.textContent = room.unread > 99 ? "99+" : room.unread;
        row.appendChild(b);
      }
      row.addEventListener("click", () => switchChannel(uid));
      sidebarFriends.appendChild(row);
    }
  }

  // Se o modal de adicionar amigo estiver aberto, atualiza
  if (!addFriendPanel.classList.contains("hidden")) renderAddFriendList();

  updateMyProfileRow();
}

function makeUserRow(uid, info, buttons) {
  const row = document.createElement("div");
  row.className = "friend-row";
  const av = makeAvatarEl(info);
  const nm = document.createElement("span");
  nm.className = "friend-name";
  nm.textContent = info.name || "Anônimo";
  row.append(av, nm);
  const spacer = document.createElement("span");
  spacer.style.flex = "1";
  row.appendChild(spacer);
  for (const b of buttons) row.appendChild(b);
  return row;
}

function mkBtn(label, title, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn-mini";
  b.title = title;
  b.textContent = label;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function emptyNote(container, text) {
  const p = document.createElement("p");
  p.className = "call-empty";
  p.textContent = text;
  container.appendChild(p);
}

function updateFriendsBadge() {
  const unread = [...dmRooms.values()].reduce((s, r) => s + (r.unread || 0), 0);
  const n = unread + pendingRequests.size;
  if (n > 0) {
    friendsBadge.textContent = n > 99 ? "99+" : String(n);
    friendsBadge.classList.remove("hidden");
  } else {
    friendsBadge.classList.add("hidden");
  }
}

// ---------- Botões ----------
friendsBtn.addEventListener("click", () => {
  // Mostra/esconde a barra lateral (útil no celular)
  sidebarEl.classList.toggle("hidden");
});

navGlobal.addEventListener("click", () => switchChannel(null));

dmRemove.addEventListener("click", () => {
  if (activeChannel !== "global") removeFriend(activeChannel);
});

dmForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = dmInput.value.trim().slice(0, 500);
  const target = activeChannel !== "global" ? activeChannel : null;
  if (!text || !target) return;
  const key = roomKeyFor(myUid, target);
  await push(ref(db, `dm/${key}/messages`), {
    uid: myUid,
    name: myName,
    hue: myHue,
    text,
    at: serverTimestamp(),
  });
  set(ref(db, `dm/${key}/meta/lastAt`), serverTimestamp()).catch(() => {});
  dmInput.value = "";
  dmInput.focus();
});

// Sinaliza que o app carregou (usado pelo diagnóstico da página)
window.__chatOk = true;
