/* Servidor estático de desenvolvimento.
   `npm run dev` -> http://localhost:4173
   Envia no-cache, então editar CSS/JS e dar F5 já mostra a mudança. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT) || 4173;
const ROOT = process.cwd();

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  // Impede escapar da pasta do projeto via ../
  const safe = normalize(url).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, safe === "/" ? "index.html" : safe);

  try {
    let body;
    try {
      body = await readFile(file);
    } catch {
      // Rota desconhecida: devolve o index (o app roteia em memória).
      file = join(ROOT, "index.html");
      body = await readFile(file);
    }
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Não encontrado");
  }
}).listen(PORT, () => {
  console.log(`\n  nailagenda rodando em  http://localhost:${PORT}\n`);
});
