// Copia o site do Limon pra dentro do pacote do app desktop
const fs = require("fs");

fs.mkdirSync("site", { recursive: true });
const files = ["index.html", "style.css", "app.js", "logo.svg", "manifest.json", "sw.js"];
for (const f of files) {
  fs.copyFileSync("../" + f, "site/" + f);
  console.log("✓ " + f);
}
console.log("Site copiado para desktop/site/");
