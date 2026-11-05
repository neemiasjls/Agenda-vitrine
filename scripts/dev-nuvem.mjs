/* O sistema inteiro rodando no computador, igual ao publicado:
   site + API do Worker + banco (SQLite em memória, com o mesmo SQL do D1).
   Serve para testar login, portal da cliente e sincronização sem tocar
   no site no ar. Os dados somem ao parar o servidor.

   npm run dev:nuvem  ->  http://localhost:4175
   Login do painel: o mesmo das contas de teste (admin@example.com / demoagenda2026, ver README). */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { novoD1 } from "../tests/d1.mjs";
import { rotearApi } from "../worker/api.js";

const PORT = Number(process.env.PORT) || 4175;
const ROOT = process.cwd();
const env = { DB: novoD1() };

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

const lerCorpo = (req) => new Promise((ok) => {
  const partes = []; req.on("data", (c) => partes.push(c)); req.on("end", () => ok(Buffer.concat(partes)));
});

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    const corpo = req.method === "GET" || req.method === "HEAD" ? undefined : await lerCorpo(req);
    const r = await rotearApi(new Request(url, { method: req.method, headers: req.headers, body: corpo }), env);
    const cabecalhos = {};
    r.headers.forEach((v, k) => { if (k !== "set-cookie") cabecalhos[k] = v; });
    const cookies = r.headers.getSetCookie();
    if (cookies.length) cabecalhos["set-cookie"] = cookies;
    res.writeHead(r.status, cabecalhos);
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  const seguro = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let arquivo = join(ROOT, seguro === "/" || seguro === "\\" ? "index.html" : seguro);
  let corpo;
  try { corpo = await readFile(arquivo); }
  catch { arquivo = join(ROOT, "index.html"); corpo = await readFile(arquivo); }
  res.writeHead(200, { "Content-Type": TYPES[extname(arquivo)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(corpo);
}).listen(PORT, () => console.log(`\n  nailagenda completo (site + API + banco de teste) em http://localhost:${PORT}\n`));
