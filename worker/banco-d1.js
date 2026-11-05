/* Banco Cloudflare D1 (usado nos testes locais e como alternativa).
   O banco é um binding do Worker: não tem endereço público nem chave que
   possa vazar. Só este arquivo lê e grava nele. */
import { ErroApp, hex } from "./seguranca.js";

export const configurado = (env) => Boolean(env && env.DB);

/* Coleções que moram cada uma na sua linha. Qualquer outra chave do
   documento (company, settings, marcadores como _comecouEm) vai junto na
   parte "_resto". */
const COLECOES = ["clients", "appts", "orders", "expenses", "charges", "services", "packages",
  "products", "suppliers", "messages", "blocks", "clientPackages", "polishColors",
  "professionals", "categories"];

/* ---------- Estado do ateliê ---------- */

/* Devolve { data, version } ou null quando o banco ainda está vazio. */
export async function lerEstado(env) {
  const v = await env.DB.prepare("SELECT versao FROM estado_versao WHERE id = 1").first();
  const versao = v ? v.versao : 0;
  if (!versao) return null;
  const { results } = await env.DB.prepare("SELECT nome, dados FROM estado_partes").all();
  const data = {};
  for (const r of results) {
    const valor = JSON.parse(r.dados);
    if (r.nome === "_resto") Object.assign(data, valor);
    else data[r.nome] = valor;
  }
  return { data, version: versao };
}

function partir(data) {
  const partes = {}, resto = {};
  for (const [k, v] of Object.entries(data)) {
    if (COLECOES.includes(k)) partes[k] = JSON.stringify(v);
    else resto[k] = v;
  }
  partes._resto = JSON.stringify(resto);
  return partes;
}

const LIMITE_PARTE = 1_900_000;   // o D1 recusa linha acima de 2 MB

/* Grava se a versão ainda for a esperada. Devolve a nova versão, ou null
   quando alguém gravou antes. Tudo num lote só: o D1 executa o lote como
   uma transação, então ou entram todas as partes e a versão sobe, ou nada
   muda. */
export async function salvarEstado(env, data, versaoEsperada) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new ErroApp("Dados inválidos.");
  for (const c of ["company", "clients", "services", "appts"])
    if (!(c in data)) throw new ErroApp(`Documento incompleto: falta ${c}.`);

  const partes = partir(data);
  for (const [nome, json] of Object.entries(partes))
    if (json.length > LIMITE_PARTE)
      throw new ErroApp(`A parte "${nome}" passou do limite de tamanho. Exporte um backup e fale com o suporte.`, 413);

  // só reescreve o que mudou
  const { results } = await env.DB.prepare("SELECT nome, dados FROM estado_partes").all();
  const atual = Object.fromEntries(results.map(r => [r.nome, r.dados]));

  const lote = [];
  for (const [nome, json] of Object.entries(partes)) {
    if (atual[nome] === json) continue;
    lote.push(env.DB.prepare(
      `INSERT INTO estado_partes (nome, dados)
         SELECT ?1, ?2 WHERE (SELECT versao FROM estado_versao WHERE id = 1) = ?3
       ON CONFLICT (nome) DO UPDATE SET dados = excluded.dados`).bind(nome, json, versaoEsperada));
  }
  // parte que deixou de existir no documento
  for (const nome of Object.keys(atual)) if (!(nome in partes))
    lote.push(env.DB.prepare(
      `DELETE FROM estado_partes WHERE nome = ?1
         AND (SELECT versao FROM estado_versao WHERE id = 1) = ?2`).bind(nome, versaoEsperada));

  lote.push(env.DB.prepare(
    `UPDATE estado_versao SET versao = versao + 1, atualizado = datetime('now')
      WHERE id = 1 AND versao = ?1`).bind(versaoEsperada));

  const r = await env.DB.batch(lote);
  const ultimo = r[r.length - 1];
  return ultimo.meta && ultimo.meta.changes ? versaoEsperada + 1 : null;
}

/* ---------- Chave que assina as sessões ---------- */

let chaveEmCache = null;
export async function chaveDeSessao(env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (chaveEmCache) return chaveEmCache;
  const nova = hex(crypto.getRandomValues(new Uint8Array(32)));
  // INSERT OR IGNORE: se dois pedidos chegarem juntos no primeiro acesso,
  // os dois leem a mesma chave depois
  await env.DB.prepare("INSERT OR IGNORE INTO config (nome, valor) VALUES ('chave_sessao', ?1)").bind(nova).run();
  const r = await env.DB.prepare("SELECT valor FROM config WHERE nome = 'chave_sessao'").first();
  chaveEmCache = r.valor;
  return chaveEmCache;
}
export const _esquecerChave = () => { chaveEmCache = null; };   // para os testes

/* ---------- Limite de tentativas ---------- */

const LIMITES = {
  login:     { max: 8,   janela: 300 },   // 8 tentativas por 5 min
  cadastro:  { max: 5,   janela: 3600 },
  agendar:   { max: 30,  janela: 60 },
  gravar:    { max: 240, janela: 60 },
  ler:       { max: 600, janela: 60 },
};

export async function limitar(env, tipo, identidade, request) {
  const regra = LIMITES[tipo] || LIMITES.ler;
  const bruto = tipo + ":" + (identidade || request.headers.get("CF-Connecting-IP") || "?");
  // Só o hash vai para o banco: o telefone de ninguém fica registrado aqui.
  const chave = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bruto))));
  const agora = Date.now(), expira = agora + regra.janela * 1000;
  const r = await env.DB.prepare(
    `INSERT INTO limites (chave, hits, expira) VALUES (?1, 1, ?2)
     ON CONFLICT (chave) DO UPDATE SET
       hits   = CASE WHEN limites.expira <= ?3 THEN 1 ELSE limites.hits + 1 END,
       expira = CASE WHEN limites.expira <= ?3 THEN excluded.expira ELSE limites.expira END
     WHERE limites.expira <= ?3 OR limites.hits < ?4
     RETURNING hits`).bind(chave, expira, agora, regra.max).first();
  if (!r) throw new ErroApp("Muitas tentativas em pouco tempo. Espere um minuto.", 429);
}

export const limparLimitesVencidos = (env) =>
  env.DB.prepare("DELETE FROM limites WHERE expira < ?1").bind(Date.now() - 864e5).run();

/* ---------- Acesso da profissional ---------- */

export const buscarProfissional = (env, email) =>
  env.DB.prepare("SELECT * FROM acesso_profissional WHERE email = ?1").bind(email).first();

export const atualizarProfissional = (env, email, c) =>
  env.DB.prepare(
    `UPDATE acesso_profissional SET
       chave = COALESCE(?2, chave), sal = COALESCE(?3, sal), iteracoes = COALESCE(?4, iteracoes),
       sessao_versao = sessao_versao + ?5, erros = ?6, bloqueado_ate = ?7, atualizado = datetime('now')
     WHERE email = ?1`).bind(email, c.chave ?? null, c.sal ?? null, c.iteracoes ?? null,
       c.derrubarSessoes ? 1 : 0, c.erros ?? 0, c.bloqueado_ate ?? null).run();

/* ---------- Acesso das clientes ---------- */

export const buscarAcesso = (env, telefone) =>
  env.DB.prepare("SELECT * FROM acesso_cliente WHERE telefone = ?1").bind(telefone).first();

export const gravarAcesso = (env, r) =>
  env.DB.prepare(
    `INSERT INTO acesso_cliente (cliente_id, telefone, chave, sal, iteracoes) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (cliente_id) DO UPDATE SET telefone = excluded.telefone, chave = excluded.chave,
       sal = excluded.sal, iteracoes = excluded.iteracoes, erros = 0, bloqueado_ate = NULL,
       atualizado = datetime('now')`).bind(r.cliente_id, r.telefone, r.chave, r.sal, r.iteracoes).run();

export const atualizarAcesso = (env, clienteId, c) =>
  env.DB.prepare(
    `UPDATE acesso_cliente SET erros = ?2, bloqueado_ate = ?3, atualizado = datetime('now')
      WHERE cliente_id = ?1`).bind(clienteId, c.erros ?? 0, c.bloqueado_ate ?? null).run();
