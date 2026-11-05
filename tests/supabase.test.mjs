/* Cliente do Supabase: o que sai do Worker e o que volta para a tela. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as supa from "../worker/banco-supabase.js";
import * as banco from "../worker/banco.js";
import { novoD1 } from "./d1.mjs";

const ENV = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
              SUPABASE_GATEWAY_SECRET: "s".repeat(64) };

function espiar(resposta = "null", status = 200) {
  const vistos = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, op) => { vistos.push({ url: String(url), op }); return new Response(resposta, { status }); };
  return { vistos, restaurar: () => { globalThis.fetch = real; } };
}

test("chama só funções do portão, com a chave pública e a senha no corpo", async () => {
  const e = espiar('{"data":{"company":{}},"version":3}');
  try { await supa.lerEstado(ENV); } finally { e.restaurar(); }
  const { url, op } = e.vistos[0];
  assert.equal(url, "https://abc.supabase.co/rest/v1/rpc/nailagenda_ler_estado");
  assert.equal(op.headers.apikey, "sb_publishable_x");
  assert.equal(op.headers.Authorization, undefined, "nenhum token de administrador");
  assert.equal(JSON.parse(op.body).p_segredo, ENV.SUPABASE_GATEWAY_SECRET);
});

test("gravação com versão velha volta null (conflito)", async () => {
  const e = espiar("null");
  try {
    const r = await supa.salvarEstado(ENV, { company: {}, clients: [], services: [], appts: [] }, 1);
    assert.equal(r, null);
  } finally { e.restaurar(); }
});

test("erro do banco não chega à tela com detalhes internos", async () => {
  const e = espiar('{"code":"42501","message":"nao autorizado"}', 401);
  try {
    await assert.rejects(() => supa.lerEstado(ENV), (err) => {
      assert.equal(err.status, 503);
      assert.equal(/42501|nao autorizado|supabase/i.test(err.message), false, err.message);
      return true;
    });
  } finally { e.restaurar(); }
});

test("documento incompleto nem sai do Worker", async () => {
  const e = espiar("1");
  try { await assert.rejects(() => supa.salvarEstado(ENV, { company: {} }, 0)); }
  finally { e.restaurar(); }
  assert.equal(e.vistos.length, 0);
});

test("URL de banco que não é do Supabase é recusada", async () => {
  await assert.rejects(() => supa.lerEstado({ ...ENV, SUPABASE_URL: "https://site-malicioso.com" }));
});

test("com Supabase configurado, o D1 é ignorado (nunca troca de banco em silêncio)", () => {
  const ambos = { ...ENV, DB: novoD1() };
  assert.equal(banco.provedor(ambos), "supabase");
  assert.equal(banco.provedor({ DB: novoD1() }), "d1");
  assert.equal(banco.provedor({ SUPABASE_URL: ENV.SUPABASE_URL, DB: novoD1() }), "d1",
    "Supabase pela metade não conta como configurado");
  assert.equal(banco.provedor({}), null);
});
