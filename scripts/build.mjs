/* Build: copia os arquivos servíveis para dist/ e injeta a versão dos assets.
   Sem dependências — roda com o Node puro. */
import { cp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const OUT = "dist";
const VERSION = Date.now().toString(36);

// Limpa apenas o que ESTE build gera. Apagar dist/ inteiro destruiria o
// bundle de arquivo único que o scripts/bundle-artifact.mjs escreve aqui.
const OWNED = ["index.html", "assets", "_headers"];
for (const entry of OWNED) await rm(`${OUT}/${entry}`, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// Só o que o navegador precisa. README, worker/, migrations/ e scripts/ ficam de fora.
for (const entry of OWNED) {
  const src = entry === "_headers" ? "public/_headers" : entry;
  if (!existsSync(src)) throw new Error(`Faltando: ${src}`);
  await cp(src, `${OUT}/${entry}`, { recursive: true });
}

// Troca o ?v=N fixo por um valor novo a cada build, para o navegador
// nunca servir CSS ou JS velho depois de um deploy.
const htmlPath = `${OUT}/index.html`;
const html = await readFile(htmlPath, "utf8");
const stamped = html.replace(/\?v=[\w.]+/g, `?v=${VERSION}`);
await writeFile(htmlPath, stamped);

const changed = (html.match(/\?v=[\w.]+/g) || []).length;
console.log(`dist/ pronto — ${changed} assets versionados como ?v=${VERSION}`);
