# 💬 Chat Global — GitHub Pages + Firebase

Chat **global em tempo real**, 100% estático (HTML + CSS + JS puro), feito para rodar no **GitHub Pages** usando o **Firebase Realtime Database** (gratuito) como backend.

## Como funciona?

O GitHub Pages só hospeda arquivos estáticos — sem servidor. Por isso, o chat usa o **Realtime Database** do Firebase (plano gratuito "Spark") para sincronizar as mensagens entre todos os visitantes em tempo real, além de mostrar quantos usuários estão online.

## 🎵 Música de fundo

O site traz o beat **"Minha Quebrada"** como música de fundo opcional. Como os navegadores bloqueiam som automático, ela só toca quando o visitante clica no botão **🎵/🔊** no topo do chat.

> Créditos: "[FREE] Beat Trap Instrumental – Minha Quebrada" – Prod. ExsBeats.

## 🖥️ Transmissão de tela ao vivo

Qualquer usuário pode transmitir a tela do PC: clique no botão **🖥️** no topo. Os outros veem um **banner vermelho pulsando** e clicam para assistir.

- A tela vai **direto do PC do transmissor para cada espectador** (WebRTC ponto a ponto) — o Firebase só troca os dados de conexão (poucos KB).
- Uma transmissão por vez; espectadores ilimitados.
- O navegador só permite captura de tela em **HTTPS** (GitHub Pages ✓). Abrindo o `index.html` direto do disco (file://) a captura fica bloqueada.
- Redes muito restritivas podem bloquear a conexão direta (exigiria servidor TURN, não incluído).

## 🚀 Passo a passo

### 1. Crie um projeto no Firebase
1. Acesse <https://console.firebase.google.com> e clique em **Adicionar projeto** (ex.: `chat-global`).
2. O Google Analytics é opcional — pode pular.

### 2. Ative o Realtime Database
1. Menu: **Build → Realtime Database → Criar banco de dados**.
2. Escolha a localização mais próxima (ex.: `southamerica-east1`).
3. Inicie no **modo de teste** (libera leitura/escrita por 30 dias). Para liberar de vez, use as regras da seção abaixo.

### 3. Cole suas credenciais no `app.js`
1. **Configurações do projeto (⚙️) → Seus apps → App da Web (ícone `</>`)** → registre o app.
2. Copie o objeto `firebaseConfig` que aparecer.
3. Abra o `app.js` e substitua o `firebaseConfig` de exemplo pelo seu. O campo essencial é o `databaseURL`.

### 4. Suba para o GitHub
```bash
git init
git add .
git commit -m "feat: chat global"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/chat-global.git
git push -u origin main
```
*(Ou simplesmente faça upload dos arquivos pela interface web do GitHub: "Add file → Upload files".)*

### 5. Ative o GitHub Pages
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
    "stream": { ".read": true, ".write": true }
  }
}
```

> ⚠️ Chat público = qualquer pessoa pode ler e escrever. Não compartilhe dados sensíveis nele.

## ⚠️ Nunca coloque chaves secretas de API no site!

Um site no GitHub Pages é **público**: qualquer visitante pode abrir o código-fonte e copiar as chaves. Chaves de APIs pagas (OpenAI, NVIDIA, etc.) **nunca** devem ficar no front-end — se precisar delas, use um backend como intermediário. A configuração do Firebase é a exceção de propósito: ela é pública por design, e a segurança real fica nas **regras** do banco.

## 📁 Estrutura

```
├── index.html   # interface
├── style.css    # visual (tema escuro)
├── app.js       # lógica + integração Firebase
├── musica.mp3   # música de fundo (créditos acima)
└── README.md
```
