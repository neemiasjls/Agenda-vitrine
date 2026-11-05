/* Redefine a senha do painel, sem e-mail.
   Uso:  npm run senha
   Pergunta o e-mail e a senha nova, calcula o hash aqui (PBKDF2, igual ao
   servidor) e imprime um comando SQL. Cole no Supabase › SQL Editor do
   projeto "nailagenda" e rode. Só o hash vai para o banco: a senha em texto
   não sai deste computador e não fica em arquivo nenhum.
   Serve também para criar a conta com outro e-mail. */
import { createInterface } from "node:readline/promises";
import { webcrypto as crypto } from "node:crypto";

const ITER = 100000;   // máximo aceito pelo Cloudflare Workers
// lê linha a linha: funciona digitando e também com entrada por pipe
const rl = createInterface({ input: process.stdin, terminal: false });
const linhas = rl[Symbol.asyncIterator]();
const perguntar = async (t) => { process.stdout.write(t); const { value } = await linhas.next(); return value ?? ""; };
/* Colar com Ctrl+V em alguns terminais do Windows entra como o caractere
   ^V (invisível) mais espaços. Isso ia parar dentro da senha gravada e
   ela nunca mais conferia. Tira caracteres de controle e espaços das pontas. */
const limpar = (t) => t.replace(/[\u0000-\u001f\u007f]/g, "").trim();
const email = limpar(await perguntar("E-mail da conta: ")).toLowerCase();
const senha = limpar(await perguntar("Senha nova (mín. 8, não só números): "));
rl.close();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("E-mail inválido."); process.exit(1); }
if (senha.length < 8 || /^\d+$/.test(senha)) { console.error("Senha fraca: use 8+ caracteres e misture letras."); process.exit(1); }

const sal = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
const mat = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256",
  salt: Buffer.from(sal, "hex"), iterations: ITER }, mat, 256);
const chave = Buffer.from(bits).toString("base64url");
const q = (t) => "'" + t.replace(/'/g, "''") + "'";

// sessao_versao + 1 derruba as sessões abertas em outros aparelhos
console.log(`
Cole no Supabase › SQL Editor (projeto nailagenda) e clique em Run:

insert into nailagenda.acesso_profissional (email, chave, sal, iteracoes)
values (${q(email)}, ${q(chave)}, ${q(sal)}, ${ITER})
on conflict (email) do update set chave = excluded.chave, sal = excluded.sal,
  iteracoes = excluded.iteracoes, sessao_versao = nailagenda.acesso_profissional.sessao_versao + 1,
  erros = 0, bloqueado_ate = null, atualizado = now();
`);
