# 💬 Chat Global — GitHub Pages + Firebase

Chat **global em tempo real**, 100% estático (HTML + CSS + JS puro), feito para rodar no **GitHub Pages** usando o **Firebase Realtime Database** (gratuito) como backend.

## Como funciona?

O GitHub Pages só hospeda arquivos estáticos — sem servidor. Por isso, o chat usa o **Realtime Database** do Firebase (plano gratuito "Spark") para sincronizar as mensagens entre todos os visitantes em tempo real, além de mostrar quantos usuários estão online.

## 🎵 Música de fundo

O site traz o beat **"Minha Quebrada"** como música de fundo opcional. Como os navegadores bloqueiam som automático, ela só toca quando o visitante clica no botão **🎵/🔊** no topo do chat.

> Créditos: "[FREE] Beat Trap Instrumental – Minha Quebrada" – Prod. ExsBeats.

## 👥 Amigos + conversas privadas (DM)

- Botão **👥** abre o painel de amigos: **adicionar** quem estiver online (➕), **aceitar/recusar solicitações** (✅/✖) e ver seus amigos com status 🟢/⚫.
- Quando alguém aceita, vocês viram amigos automaticamente nos dois lados.
- Clique num amigo → **conversa privada** (só vocês dois leem — cada par tem sua própria sala no banco).
- O botão 👥 mostra um **contador vermelho** com solicitações e mensagens não lidas.
- 🗑️ dentro da conversa remove a amizade (as mensagens antigas deixam de ficar acessíveis pra quem foi removido).

## 📞 Chamadas de voz em grupo

Clique em **📞** no topo, marque quem está online e clique em **Iniciar chamada**. Os convidados recebem um "toque" na tela com as opções **Atender** ou **Recusar** — só quem é convidado vê a chamada (privada).

- O áudio vai **direto entre os PCs** (WebRTC em malha) — o Firebase só organiza convites e conexões.
- Durante a chamada: **mute o microfone** (🔇), **convide mais pessoas** (➕) ou saia (🚪).
- Quem recusa/sai aparece com 🚫/↩️ na lista de membros.
- Ideal para grupos pequenos (3–8 pessoas): em malha, cada pessoa conecta com todas as outras.
- Requer **HTTPS** (GitHub Pages ✓) e permissão de microfone.

## 🖥️ Transmissão de tela ao vivo

Qualquer usuário pode transmitir a tela do PC: clique no botão **🖥️** no topo. Os outros veem um **banner vermelho pulsando** e clicam para assistir.

- A tela vai **direto do PC do transmissor para cada espectador** (WebRTC ponto a ponto) — o Firebase só troca os dados de conexão (poucos KB).
- Uma transmissão por vez; espectadores ilimitados.
- O navegador só permite captura de tela em **HTTPS** (GitHub Pages ✓). Abrindo o `index.html` direto do disco (file://) a captura fica bloqueada.
- Redes muito restritivas podem bloquear a conexão direta (exigiria servidor TURN, não incluído).

## 🖥️ Layout estilo Discord + foto de perfil

- **Barra lateral esquerda:** "🌐 Chat Global" no topo e seus amigos abaixo (com 🟢/⚫ e badge de não lidas). Clique num amigo para abrir a conversa privada no painel direito; clique em "🌐 Chat Global" para voltar.
- **Foto de perfil:** clique no seu nome (rodapé da barra lateral) → "Escolher foto". A imagem é cortada em círculo e reduzida para 96×96 automaticamente, e aparece no chat, na lista de amigos e nas presenças.

## 🔐 Registro, login e conta admin

- Todo mundo cria conta com **nome de usuário + senha** (o e-mail interno é gerado sozinho — ninguém precisa digitar email).
- A sessão fica salva: reabrir o site entra sozinho. Botão **👋** para sair da conta.
- As senhas ficam guardadas no **Firebase Authentication** (seguras — ninguém consegue ler).
- A identidade agora é **permanente**: amigos, conversas e histórico ficam ligados à conta.

### 👑 Conta de administrador (LIMON)

O nome **LIMON** é reservado: o registro só é aceito com a senha do dono (o controle é um hash SHA-256 salvo no `app.js`). Ao entrar como LIMON você ganha:

- 👑 Coroa no seu nome no chat
- 🗑️ Botão de apagar em cada mensagem (aparece ao passar o mouse, só para você)
- 🧹 Botão de limpar o chat inteiro
- 🛑 Botão de encerrar a transmissão de tela de qualquer pessoa

**Trocar a senha do admin:** Firebase Console → Authentication → Users → `limon@chat.limon` → ⋮ → Atualizar senha. Depois atualize o `ADMIN_HASH` no `app.js` com o SHA-256 da nova senha.

## 🚀 Passo a passo

### 1. Crie um projeto no Firebase
1. Acesse <https://console.firebase.google.com> e clique em **Adicionar projeto** (ex.: `chat-global`).
2. O Google Analytics é opcional — pode pular.

### 2. Ative o Realtime Database
1. Menu: **Build → Realtime Database → Criar banco de dados**.
2. Escolha a localização mais próxima (ex.: `southamerica-east1`).
3. Inicie no **modo de teste** (libera leitura/escrita por 30 dias). Para liberar de vez, use as regras da seção abaixo.

### 3. Ative o login (Authentication) — OBRIGATÓRIO

1. Menu: **Build → Authentication → Começar agora**.
2. Aba **Sign-in method** → clique em **Email/Password** → **Ativar** → **Salvar**.

> Sem isso, registro e login retornam o erro `auth/operation-not-allowed`.

### 4. Cole suas credenciais no `app.js`
1. **Configurações do projeto (⚙️) → Seus apps → App da Web (ícone `</>`)** → registre o app.
2. Copie o objeto `firebaseConfig` que aparecer.
3. Abra o `app.js` e substitua o `firebaseConfig` de exemplo pelo seu. O campo essencial é o `databaseURL`.

### 5. Suba para o GitHub
```bash
git init
git add .
git commit -m "feat: chat global"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/chat-global.git
git push -u origin main
```
*(Ou simplesmente faça upload dos arquivos pela interface web do GitHub: "Add file → Upload files".)*

### 6. Ative o GitHub Pages
1. No repositório: **Settings → Pages**.
2. **Source: Deploy from a branch** → Branch: `main` → pasta `/ (root)` → **Save**.
3. Em ~1 minuto o site estará no ar em:
   `https://SEU-USUARIO.github.io/chat-global/`

## 🔐 Regras sugeridas (Realtime Database → Regras)

```json
{
  "rules": {
    "messages": { ".read": true, ".write": true },
    "presence": { ".read": true, ".write": true },
    "stream": { ".read": true, ".write": true },
    "calls": { ".read": true, ".write": true },
    "invites": { ".read": true, ".write": true },
    "friends": { ".read": true, ".write": true },
    "friendRequests": { ".read": true, ".write": true },
    "dm": { ".read": true, ".write": true }
  }
}
```

> ⚠️ Chat público = qualquer pessoa pode ler e escrever. Não compartilhe dados sensíveis nele.

## ⚠️ Nunca coloque chaves secretas de API no site!

Um site no GitHub Pages é **público**: qualquer visitante pode abrir o código-fonte e copiar as chaves. Chaves de APIs pagas (OpenAI, NVIDIA, etc.) **nunca** devem ficar no front-end — se precisar delas, use um backend como intermediário. A configuração do Firebase é a exceção de propósito: ela é pública por design, e a segurança real fica nas **regras** do banco.

## 📁 Estrutura

```
├── index.html     # interface
├── style.css      # visual (tema escuro + GIF de fundo)
├── app.js         # lógica + integração Firebase
├── musica.mp3     # música de fundo (créditos acima)
├── background.gif # imagem/GIF animado de fundo do site
└── README.md
```
