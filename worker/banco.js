/* Escolhe o banco. Em produção: Supabase (São Paulo). Nos testes locais,
   ou se um dia o Supabase for desligado: Cloudflare D1. Os dois arquivos
   têm exatamente as mesmas funções, com a mesma assinatura.

   Nunca os dois ao mesmo tempo: se o Supabase está configurado, o D1 é
   ignorado — senão uma falta de configuração trocaria de banco em
   silêncio e ela veria dados antigos. */
import * as supa from "./banco-supabase.js";
import * as d1 from "./banco-d1.js";

const qual = (env) => supa.configurado(env) ? supa : d1;

export const configurado = (env) => supa.configurado(env) || d1.configurado(env);
export const provedor = (env) => supa.configurado(env) ? "supabase" : d1.configurado(env) ? "d1" : null;

export const lerEstado             = (env, ...a) => qual(env).lerEstado(env, ...a);
export const salvarEstado          = (env, ...a) => qual(env).salvarEstado(env, ...a);
export const chaveDeSessao         = (env, ...a) => qual(env).chaveDeSessao(env, ...a);
export const limitar               = (env, ...a) => qual(env).limitar(env, ...a);
export const limparLimitesVencidos = (env, ...a) => qual(env).limparLimitesVencidos(env, ...a);
export const buscarProfissional    = (env, ...a) => qual(env).buscarProfissional(env, ...a);
export const atualizarProfissional = (env, ...a) => qual(env).atualizarProfissional(env, ...a);
export const buscarAcesso          = (env, ...a) => qual(env).buscarAcesso(env, ...a);
export const gravarAcesso          = (env, ...a) => qual(env).gravarAcesso(env, ...a);
export const atualizarAcesso       = (env, ...a) => qual(env).atualizarAcesso(env, ...a);

export const _esquecerChave = () => { supa._esquecerChave(); d1._esquecerChave(); };
