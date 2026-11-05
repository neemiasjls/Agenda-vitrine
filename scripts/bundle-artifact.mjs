/* Empacota o app multi-arquivo em um único HTML publicável.
   O Artifact envolve o arquivo em <!doctype html><head></head><body>,
   então aqui saem só <title>, <style>, a marcação e os <script>. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const OUT = "dist/nailagenda-artifact.html";

// mesma ordem de carga do index.html
const JS = [
  "assets/js/store.js",
  "assets/js/nuvem.js",
  "assets/js/portal-nuvem.js",
  "assets/js/agenda-core.js",
  "assets/js/schedule.js",
  "assets/js/ui.js",
  "assets/js/views/auth.js",
  "assets/js/views/agenda.js",
  "assets/js/views/clientes.js",
  "assets/js/views/servicos.js",
  "assets/js/views/comercial.js",
  "assets/js/views/mensagens.js",
  "assets/js/views/relatorios.js",
  "assets/js/views/config.js",
  "assets/js/views/cliente-area.js",
  "assets/js/views/retornos.js",
  "assets/js/views/solicitacoes.js",
  "assets/js/app.js",
];

const css = await readFile("assets/css/app.css", "utf8");

let js = "";
for (const f of JS) {
  if (!existsSync(f)) throw new Error(`Faltando: ${f}`);
  js += `\n/* ===== ${f} ===== */\n` + (await readFile(f, "utf8")) + "\n";
}

// `</script>` dentro de uma string JS encerraria a tag no parser do HTML
js = js.replace(/<\/script>/gi, "<\\/script>");

const html = `<title>nailagenda</title>

<!-- @import precisa ser a primeira regra da folha de estilo -->
<style>
@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap");

${css}
</style>

<div id="app"></div>
<div id="toast-root" aria-live="polite"></div>
<div id="modal-root"></div>

<script>
${js}
</script>
`;

await mkdir("dist", { recursive: true });
await writeFile(OUT, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`${OUT} — ${kb} KB, ${JS.length} módulos JS embutidos`);
