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
    setupStreaming();
    setupCalls();
    setupFriends();
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

  // Contador de online + lista de usuários (usada nas chamadas e amigos)
  onValue(
    ref(db, "presence"),
    (snap) => {
      const val = snap.val() || {};
      onlineUsers = new Map(Object.entries(val));
      const n = onlineUsers.size;
      onlineEl.textContent = `🟢 ${n} online${n === 1 ? "" : "s"}`;
      renderFriendsPanel();
      updateDmStatus();
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
      }
      liveBanner.classList.remove("hidden");
    } else {
      liveName = "";
      liveBanner.classList.add("hidden");
      streamBtn.classList.remove("on");
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
  } catch {
    return; // usuário cancelou a janela de escolha
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
const callAudioContainer = $("call-audio-container");

let onlineUsers = new Map(); // uid -> { name, hue, at }
let currentMembers = {};      // membros da minha sala atual
let callPeers = new Map();    // uid -> { pc, name, hue, audioEl, remoteReady, candsBuf }
let callUnsubs = [];
let localMic = null;
let micOn = true;
let callRoomId = null;
let pendingInvite = null;
let callPanelMode = "start";
let selectedToCall = new Set();

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
  } catch {
    addSystemMessage("⚠️ Não consegui acessar seu microfone — verifique a permissão do navegador.");
    return false;
  }

  callRoomId = roomId;
  micOn = true;
  callMute.textContent = "🎙️";
  callMute.classList.remove("off");
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
  const entry = { pc, name: m.name, hue: m.hue, remoteReady: false, candsBuf: [] };
  callPeers.set(uid, entry);

  if (localMic) localMic.getTracks().forEach((t) => pc.addTrack(t, localMic));

  pc.onicecandidate = (e) => {
    if (e.candidate && callRoomId) {
      push(ref(db, `calls/${callRoomId}/cands/${uid}`), {
        from: myUid,
        cand: e.candidate.toJSON(),
      });
    }
  };

  pc.ontrack = (e) => {
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.srcObject = e.streams[0];
    audio.play().catch(() => {});
    entry.audioEl = audio;
    callAudioContainer.appendChild(audio);
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
  if (entry.audioEl) entry.audioEl.remove();
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

// ------------------------------------------------------------
// 👥 Amigos + conversas privadas (DM)
// ------------------------------------------------------------
const friendsBtn = $("friends-btn");
const friendsBadge = $("friends-badge");
const friendsPanel = $("friends-panel");
const friendsClose = $("friends-close");
const addFriendList = $("add-friend-list");
const requestsList = $("requests-list");
const friendsList = $("friends-list");
const requestsTitle = $("requests-title");
const friendsTitle = $("friends-title");
const dmOverlay = $("dm-overlay");
const dmFriendName = $("dm-friend-name");
const dmFriendStatus = $("dm-friend-status");
const dmRemove = $("dm-remove");
const dmClose = $("dm-close");
const dmBack = $("dm-back");
const dmMessagesEl = $("dm-messages");
const dmForm = $("dm-form");
const dmInput = $("dm-input");

let friendsMap = new Map();     // uid -> { name, hue, since }
let pendingRequests = new Map(); // uid -> { name, hue, at }
let sentRequests = new Set();   // pedidos que EU enviei (nesta sessão)
let dmRooms = new Map();       // friendUid -> { unsubs, unread, msgs }
let openDmUid = null;
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
  if (openDmUid === uid) closeDm();
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
          if (openDmUid === uid) {
            renderDmMessages(uid);
          } else if (data.uid !== myUid) {
            const first = room.unread === 0;
            room.unread++;
            updateFriendsBadge();
            if (!friendsPanel.classList.contains("hidden")) renderFriendsPanel();
            if (first) {
              addSystemMessage(`💬 ${data.name || "Alguém"} te mandou uma mensagem privada (abra 👥).`);
            }
          }
        },
        () => {}
      )
    );
  }
}

// ---------- Conversa privada ----------
function openDm(uid) {
  const info = friendsMap.get(uid);
  if (!info) return;
  openDmUid = uid;
  const room = dmRooms.get(uid);
  if (room) room.unread = 0;
  const live = onlineUsers.get(uid);
  dmFriendName.textContent = live?.name || info.name || "Amigo";
  updateDmStatus();
  renderDmMessages(uid);
  updateFriendsBadge();
  friendsPanel.classList.add("hidden");
  dmOverlay.classList.remove("hidden");
  dmInput.focus();
}

function closeDm() {
  openDmUid = null;
  dmOverlay.classList.add("hidden");
}

function updateDmStatus() {
  if (!openDmUid) return;
  dmFriendStatus.textContent = onlineUsers.has(openDmUid) ? "🟢 online" : "⚫ offline";
}

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
  const nm = document.createElement("span");
  nm.className = "name";
  nm.style.color = `hsl(${m.hue ?? 220} 80% 70%)`;
  nm.textContent = m.name || "Anônimo";
  const tm = document.createElement("span");
  tm.className = "time";
  tm.textContent = m.at
    ? new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
  head.append(nm, tm);

  const txt = document.createElement("div");
  txt.className = "text";
  txt.textContent = m.text || "";

  bubble.append(head, txt);
  wrap.appendChild(bubble);
  dmMessagesEl.appendChild(wrap);
}

// ---------- Painel de amigos ----------
function renderFriendsPanel() {
  // Adicionar amigos (online, não amigos, sem pedido pendente)
  addFriendList.innerHTML = "";
  let anyAdd = false;
  for (const [uid, info] of onlineUsers) {
    if (uid === myUid || friendsMap.has(uid) || pendingRequests.has(uid)) continue;
    if (sentRequests.has(uid)) continue;
    anyAdd = true;
    addFriendList.appendChild(
      makeUserRow(uid, info, [mkBtn("➕", "Adicionar amigo", () => sendFriendRequest(uid))])
    );
  }
  if (!anyAdd) emptyNote(addFriendList, "Ninguém novo online agora 😴");

  // Solicitações recebidas
  requestsTitle.textContent = `Solicitações (${pendingRequests.size})`;
  requestsList.innerHTML = "";
  if (!pendingRequests.size) {
    emptyNote(requestsList, "Nenhuma solicitação pendente.");
  } else {
    for (const [uid, info] of pendingRequests) {
      requestsList.appendChild(
        makeUserRow(uid, info, [
          mkBtn("✅", "Aceitar", () => acceptRequest(uid)),
          mkBtn("✖", "Recusar", () => declineRequest(uid)),
        ])
      );
    }
  }

  // Lista de amigos
  friendsTitle.textContent = `Meus amigos (${friendsMap.size})`;
  friendsList.innerHTML = "";
  if (!friendsMap.size) {
    emptyNote(friendsList, "Você ainda não tem amigos. Adicione alguém acima! 💚");
  } else {
    const sorted = [...friendsMap.entries()].sort((a, b) => {
      const onA = onlineUsers.has(a[0]) ? 1 : 0;
      const onB = onlineUsers.has(b[0]) ? 1 : 0;
      if (onA !== onB) return onB - onA;
      return (dmRooms.get(b[0])?.unread || 0) - (dmRooms.get(a[0])?.unread || 0);
    });
    for (const [uid, info] of sorted) {
      const row = makeUserRow(uid, info, []);
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
      row.addEventListener("click", () => openDm(uid));
      friendsList.appendChild(row);
    }
  }
}

function makeUserRow(uid, info, buttons) {
  const row = document.createElement("div");
  row.className = "friend-row";
  const av = document.createElement("span");
  av.className = "avatar";
  av.style.background = `hsl(${info.hue ?? 220} 70% 45%)`;
  av.textContent = (info.name || "?").slice(0, 1).toUpperCase();
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
  if (!db) {
    addSystemMessage("⚠️ Firebase não configurado.");
    return;
  }
  renderFriendsPanel();
  friendsPanel.classList.toggle("hidden");
});

friendsClose.addEventListener("click", () => friendsPanel.classList.add("hidden"));

dmClose.addEventListener("click", closeDm);
dmBack.addEventListener("click", () => {
  closeDm();
  friendsPanel.classList.remove("hidden");
});

dmRemove.addEventListener("click", () => {
  if (openDmUid) removeFriend(openDmUid);
});

dmForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = dmInput.value.trim().slice(0, 500);
  if (!text || !openDmUid) return;
  const key = roomKeyFor(myUid, openDmUid);
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
