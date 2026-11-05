/* Banco Supabase (projeto nailagenda, São Paulo).
   O Worker não tem a chave service_role. Ele chama só as funções
   public.nailagenda_* com a chave pública + a senha do portão
   (SUPABASE_GATEWAY_SECRET), cujo hash está no banco. As tabelas ficam
   num schema que a API REST nem expõe. Mesmas funções que o banco-d1.js,
   com a mesma assinatura. */
import { ErroApp, hex } from "./seguranca.js";

export const configurado = (env) =>
  Boolean(env && env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_GATEWAY_SECRET);

async function rpc(env, funcao, args = {}) {
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== "https:" || !base.hostname.endsWith(".supabase.co"))
    throw new ErroApp("Configuração do banco inválida.", 503);
  let r;
  try {
    r = await fetch(new URL("/rest/v1/rpc/" + funcao, base), {
      method: "POST",
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ p_segredo: env.SUPABASE_GATEWAY_SECRET, ...args }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ErroApp("O banco não respondeu. Tente de novo em instantes.", 503);
  }
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* corpo vazio em função void */ }
  if (!r.ok) {
    // o detalhe vai para o log do Worker, nunca para a tela de ninguém
    console.error("supabase", funcao, r.status, dados && dados.message);
    if (r.status === 401) throw new ErroApp("Servidor sem acesso ao banco. Avise o suporte.", 503);
    throw new ErroApp("Não foi possível acessar os dados. Tente de novo em instantes.", 503);
  }
  return dados;
}

/* ---------- Estado ---------- */

export const lerEstado = (env) => rpc(env, "nailagenda_ler_estado");

const LIMITE = 4_000_000;

export async function salvarEstado(env, data, versaoEsperada) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ErroApp("Dados inválidos.");
  for (const c of ["company", "clients", "services", "appts"])
    if (!(c in data)) throw new ErroApp(`Documento incompleto: falta ${c}.`);
  if (JSON.stringify(data).length > LIMITE)
    throw new ErroApp("Os dados passaram do limite de tamanho. Exporte um backup e fale com o suporte.", 413);
  const nova = await rpc(env, "nailagenda_salvar_estado", { p_versao: versaoEsperada, p_dados: data });
  return nova == null ? null : Number(nova);
}

/* ---------- Chave das sessões ---------- */

let chaveEmCache = null;
export async function chaveDeSessao(env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (chaveEmCache) return chaveEmCache;
  const candidata = hex(crypto.getRandomValues(new Uint8Array(32)));
  chaveEmCache = await rpc(env, "nailagenda_chave_sessao", { p_candidata: candidata });
  return chaveEmCache;
}
export const _esquecerChave = () => { chaveEmCache = null; };

/* ---------- Limite de tentativas ---------- */

const LIMITES = {
  login:     { max: 8,   janela: 300 },
  cadastro:  { max: 5,   janela: 3600 },
  agendar:   { max: 30,  janela: 60 },
  gravar:    { max: 240, janela: 60 },
  ler:       { max: 600, janela: 60 },
};

export async function limitar(env, tipo, identidade, request) {
  const regra = LIMITES[tipo] || LIMITES.ler;
  const bruto = tipo + ":" + (identidade || request.headers.get("CF-Connecting-IP") || "?");
  const chave = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bruto))));
  const ok = await rpc(env, "nailagenda_limitar", { p_chave: chave, p_max: regra.max, p_janela: regra.janela });
  if (!ok) throw new ErroApp("Muitas tentativas em pouco tempo. Espere um minuto.", 429);
}

export const limparLimitesVencidos = (env) => rpc(env, "nailagenda_limpar_limites");

/* ---------- Profissional ---------- */

export const buscarProfissional = (env, email) =>
  rpc(env, "nailagenda_buscar_profissional", { p_email: email });

export const atualizarProfissional = (env, email, c) =>
  rpc(env, "nailagenda_atualizar_profissional", {
    p_email: email, p_chave: c.chave ?? null, p_sal: c.sal ?? null, p_iteracoes: c.iteracoes ?? null,
    p_derrubar: Boolean(c.derrubarSessoes), p_erros: c.erros ?? 0, p_bloqueado_ate: c.bloqueado_ate ?? null });

/* ---------- Clientes ---------- */

export const buscarAcesso = (env, telefone) =>
  rpc(env, "nailagenda_buscar_cliente", { p_telefone: telefone });

export const gravarAcesso = (env, r) =>
  rpc(env, "nailagenda_gravar_cliente", { p_cliente_id: r.cliente_id, p_telefone: r.telefone,
    p_chave: r.chave, p_sal: r.sal, p_iteracoes: r.iteracoes });

export const atualizarAcesso = (env, clienteId, c) =>
  rpc(env, "nailagenda_atualizar_cliente", { p_cliente_id: clienteId,
    p_erros: c.erros ?? 0, p_bloqueado_ate: c.bloqueado_ate ?? null });
