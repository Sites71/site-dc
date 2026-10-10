# 🖥️ Limon — App Desktop (Tauri)

Gera o app nativo do Limon: **Windows** (`.exe` + `.msi`), **macOS** (`.dmg`) e **Linux** (`.AppImage`/`.deb`) — o site inteiro vai embutido no app (funciona até offline, em janela nativa com o ícone 🍋).

## Como gerar (só na primeira vez demora, o Rust baixa as dependências)

1. Instale o Rust (uma vez só): **https://rustup.rs** — baixa e instala, next-next-finish
2. Abra o terminal AQUI e rode:

```bash
npm install
npm run build
```

3. Os instaladores aparecem em: `src-tauri/target/release/bundle/`
   - Windows → `nsis/Limon_1.0.0_x64-setup.exe` (instalador) e `msi/Limon_1.0.0_x64_en-US.msi`

## Desenvolver/testar sem instalar

```bash
npm run dev
```

> O script `copy-site.js` copia o site pra dentro do pacote automaticamente antes de cada build.
