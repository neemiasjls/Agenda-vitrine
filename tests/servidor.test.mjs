/* O que o servidor deixa sair e o que ele aceita entrar.
   Aqui está a parte que, se estiver errada, entrega dados de uma cliente
   para outra — então é a que mais precisa de teste. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo, recorteDaCliente } from "../worker/api.js";
import { derivar, conferir, novoSalt, iguais, validarSenha, validarTelefone, ITERACOES } from "../worker/senha.js";
import { cookie, b64url, ErroApp } from "../worker/seguranca.js";

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const daqui = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return iso(d); };
const em = (dia, hora) => new Date(`${dia}T${hora}`).toISOString();

const estadoDeTeste = () => ({
  company: {
    name: "Marina Lopes", handle: "@marina.exemplo", tagline: "t", phone: "11912345678",
    hours: { 0: [], 1: [["09:00", "19:00"]], 2: [["09:00", "19:00"]], 3: [["09:00", "19:00"]],
             4: [["09:00", "19:00"]], 5: [["09:00", "19:00"]], 6: [["09:00", "14:00"]] },
    booking: { slotMinutes: 30, noticeHours: 2, horizonDays: 30, cancelHours: 24 },
  },
  settings: { autoConfirm: false },
  professionals: [{ id: "pro_1", name: "Marina", email: "admin@example.com", commission: 50 }],
  services: [
    { id: "svc_1", name: "Alongamento", cat: "c1", price: 180, cost: 40, duration: 120, returnDays: 21, active: true },
    { id: "svc_2", name: "Descontinuado", cat: "c1", price: 90, cost: 20, duration: 60, returnDays: 0, active: false },
  ],
  clients: [
    { id: "cli_a", name: "Ana", phone: "11911111111", email: "ana@example.com", cpf: "12345678900",
      birthdate: "1990-01-01", notes: "alérgica a acetona", credit: 50, tags: ["vip"] },
    { id: "cli_b", name: "Bruna", phone: "11922222222", email: "bruna@example.com", cpf: "52998224725",
      birthdate: "1995-05-05", notes: "prefere nude", credit: 0, tags: [] },
  ],
  appts: [
    { id: "ap_1", clientId: "cli_a", serviceId: "svc_1", proId: "pro_1",
      start: em(daqui(3), "10:00"), durationMin: 120, price: 180, status: "CONFIRMED",
      notes: "anotação interna da Marina", paid: true, paymentMethod: "CASH" },
    { id: "ap_2", clientId: "cli_b", serviceId: "svc_1", proId: "pro_1",
      start: em(daqui(4), "14:00"), durationMin: 120, price: 180, status: "SCHEDULED",
      notes: "outra anotação", paid: false, paymentMethod: null },
    { id: "ap_3", clientId: "cli_b", serviceId: "svc_1", proId: "pro_1",
      start: em(daqui(200), "09:00"), durationMin: 120, price: 180, status: "CONFIRMED", notes: "" },
  ],
  blocks: [{ id: "b1", date: daqui(3), start: "15:00", end: "16:00", reason: "consulta médica" }],
  orders: [{ id: "o1", clientId: "cli_a", total: 180 }],
  expenses: [{ id: "e1", desc: "material", amount: 300 }],
  charges: [{ id: "c1", clientId: "cli_b", amount: 100 }],
  messages: [{ id: "m1", title: "modelo", body: "texto" }],
});

/* ---------------- Catálogo público ---------------- */

test("catálogo não entrega cliente, financeiro nem anotação", () => {
  const c = catalogo(estadoDeTeste());
  const texto = JSON.stringify(c);

  for (const vazamento of ["Ana", "Bruna", "cli_a", "cli_b", "11911111111", "12345678900",
                           "alérgica", "anotação interna", "material", "admin@example.com"])
    assert.equal(texto.includes(vazamento), false, `vazou: ${vazamento}`);

  assert.equal(c.servicos.length, 1, "só procedimento ativo aparece");
  assert.equal(c.servicos[0].name, "Alongamento");
  assert.equal("cost" in c.servicos[0], false, "o custo dela não é da conta da cliente");
});

test("catálogo entrega ocupação sem dono e só na janela de agendamento", () => {
  const c = catalogo(estadoDeTeste());

  assert.equal(c.ocupado.length, 2, "o horário daqui a 200 dias está fora do limite de 30");
  for (const o of c.ocupado) {
    assert.deepEqual(Object.keys(o).sort(), ["durationMin", "start"],
      "o horário ocupado só pode dizer quando começa e quanto dura");
  }
  assert.equal(c.bloqueios[0].reason, undefined, "o motivo do bloqueio é particular");
  assert.equal(c.bloqueios[0].start, "15:00");
});

test("catálogo esconde horário cancelado (a vaga volta a existir)", () => {
  const e = estadoDeTeste();
  e.appts[0].status = "CANCELED";
  e.appts[1].status = "NO_SHOW";
  assert.equal(catalogo(e).ocupado.length, 0);
});

/* ---------------- Recorte da cliente ---------------- */

test("a cliente recebe os próprios horários e nada de ninguém", () => {
  const e = estadoDeTeste();
  const r = recorteDaCliente(e, "cli_b");
  const texto = JSON.stringify(r);

  assert.equal(r.perfil.name, "Bruna");
  assert.equal(r.agendamentos.length, 2, "os dois dela");
  assert.equal(r.agendamentos.every((a) => ["ap_2", "ap_3"].includes(a.id)), true);

  assert.equal(texto.includes("Ana"), false);
  assert.equal(texto.includes("ap_1"), false);
  assert.equal(texto.includes("anotação interna"), false, "a anotação da Marina não vai junto");
  assert.equal(texto.includes("52998224725"), false, "o CPF não precisa voltar para a tela");
});

test("recorte de quem não existe volta vazio, não volta tudo", () => {
  const r = recorteDaCliente(estadoDeTeste(), "cli_inexistente");
  assert.equal(r.perfil, null);
  assert.equal(r.agendamentos.length, 0);
});

test("recorte diz se ainda dá para mexer no horário", () => {
  const e = estadoDeTeste();
  e.appts.push({ id: "ap_hoje", clientId: "cli_b", serviceId: "svc_1", proId: "pro_1",
    start: new Date(Date.now() + 2 * 36e5).toISOString(), durationMin: 60, price: 90, status: "CONFIRMED" });
  const r = recorteDaCliente(e, "cli_b");

  assert.equal(r.agendamentos.find((a) => a.id === "ap_hoje").podeAlterar, false,
    "faltam 2h e o prazo é 24h");
  assert.equal(r.agendamentos.find((a) => a.id === "ap_2").podeAlterar, true);
});

/* ---------------- Senhas ---------------- */

test("PBKDF2: mesma senha com sais diferentes dá chaves diferentes", async () => {
  const s1 = novoSalt(), s2 = novoSalt();
  assert.notEqual(s1, s2);
  const k1 = await derivar("minhasenha123", s1);
  const k2 = await derivar("minhasenha123", s2);
  assert.notEqual(k1, k2, "sal por pessoa impede tabela pronta");
  assert.equal(k1, await derivar("minhasenha123", s1), "é determinístico");
});

test("conferir aceita a senha certa e recusa a errada", async () => {
  const salt = novoSalt();
  const registro = { salt, iterations: ITERACOES, password_key: await derivar("unhas2026!", salt) };
  assert.equal(await conferir("unhas2026!", registro), true);
  assert.equal(await conferir("unhas2026", registro), false);
  assert.equal(await conferir("", registro), false);
});

test("comparação é em tempo constante e não vaza tamanho", () => {
  assert.equal(iguais("abc", "abc"), true);
  assert.equal(iguais("abc", "abd"), false);
  assert.equal(iguais("abc", "abcd"), false);
  assert.equal(iguais("abc", null), false);
  assert.equal(iguais(undefined, undefined), false);
});

test("regras de senha recusam o que é fácil de adivinhar", () => {
  assert.ok(validarSenha("1234567"), "curta demais");
  assert.ok(validarSenha("12345678"), "só números");
  assert.ok(validarSenha("senha123"), "senha óbvia");
  assert.ok(validarSenha(null), "não é texto");
  assert.ok(validarSenha("a".repeat(129)), "longa demais");
  assert.equal(validarSenha("unhasdaisa26"), null, "senha razoável passa");
});

test("telefone: aceita com DDD, recusa incompleto", () => {
  assert.equal(validarTelefone("(11) 99999-8888"), "11999998888");
  assert.equal(validarTelefone("11 9999-8888"), "1199998888");
  assert.equal(validarTelefone("99998888"), null, "sem DDD");
  assert.equal(validarTelefone(""), null);
  assert.equal(validarTelefone("1".repeat(20)), null);
});

/* ---------------- Cookies e erros ---------------- */

test("cookie de sessão é HttpOnly e, em HTTPS, __Host- e Secure", () => {
  const https = new Request("https://nailagenda.exemplo/x");
  const http  = new Request("http://localhost:8787/x");

  const seguro = cookie(https, "cliente", "abc", 3600);
  assert.match(seguro, /^__Host-nailagenda-cliente=abc/);
  assert.match(seguro, /HttpOnly/);
  assert.match(seguro, /Secure/);
  assert.match(seguro, /SameSite=Lax/);
  assert.match(seguro, /Path=\//);

  const local = cookie(http, "cliente", "abc", 3600);
  assert.match(local, /^nailagenda-cliente=abc/, "sem __Host- fora de HTTPS, senão o navegador descarta");
  assert.equal(/Secure/.test(local), false);
  assert.match(local, /HttpOnly/, "HttpOnly vale sempre");
});

test("b64url ida e volta preserva os bytes", () => {
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
  const txt = b64url.encode(bytes);
  assert.equal(/[+/=]/.test(txt), false, "seguro para cookie e URL");
  assert.deepEqual([...b64url.decode(txt)], [...bytes]);
});

test("ErroApp carrega o status que vai para a resposta", () => {
  assert.equal(new ErroApp("x").status, 400);
  assert.equal(new ErroApp("x", 429).status, 429);
  assert.ok(new ErroApp("x") instanceof Error);
});

/* ---------------- Leitura do corpo ---------------- */

import { lerCorpo } from "../worker/seguranca.js";

const pedido = (corpo, { tipo = "application/json", origem, alvo = "https://nailagenda.exemplo/api/x", sfs } = {}) => {
  const h = {};
  if (tipo) h["Content-Type"] = tipo;
  if (origem) h["Origin"] = origem;
  if (sfs) h["Sec-Fetch-Site"] = sfs;
  return new Request(alvo, { method: "POST", headers: h, body: corpo });
};

const recusa = async (req, status, limite) => {
  try { await lerCorpo(req, limite); return "aceitou (deveria recusar)"; }
  catch (e) { assert.equal(e.status, status, e.message); return e.message; }
};

test("corpo: aceita JSON de objeto e recusa o resto", async () => {
  assert.deepEqual(await lerCorpo(pedido('{"a":1}')), { a: 1 });

  await recusa(pedido("[1,2,3]"), 400);        // array não é envelope
  await recusa(pedido("null"), 400);           // null viraria 500 se não checasse
  await recusa(pedido('"texto"'), 400);
  await recusa(pedido("{quebrado"), 400);
});

test("corpo: exige Content-Type JSON", async () => {
  await recusa(pedido('{"a":1}', { tipo: "text/plain" }), 415);
  await recusa(pedido('{"a":1}', { tipo: null }), 415);
  // charset junto continua valendo
  assert.deepEqual(await lerCorpo(pedido('{"a":1}', { tipo: "application/json; charset=utf-8" })), { a: 1 });
});

test("corpo: para de ler ao passar do limite, não engole tudo", async () => {
  const grande = JSON.stringify({ x: "a".repeat(20000) });
  const msg = await recusa(pedido(grande), 413, 1000);
  assert.match(msg, /muito grande/i);
  // e o que cabe, passa
  assert.ok(await lerCorpo(pedido(JSON.stringify({ x: "a".repeat(100) })), 1000));
});

test("corpo: recusa requisição vinda de outro site", async () => {
  await recusa(pedido('{"a":1}', { origem: "https://site-malicioso.com" }), 403);
  await recusa(pedido('{"a":1}', { sfs: "cross-site" }), 403);
  // a própria origem passa
  assert.deepEqual(
    await lerCorpo(pedido('{"a":1}', { origem: "https://nailagenda.exemplo" })), { a: 1 });
});

test("PBKDF2 respeita o teto do Cloudflare Workers (100 mil iterações)", () => {
  // Acima disso o Workers lança NotSupportedError e o login cai com erro 500.
  // O Node não tem o limite: sem este teste, o erro só aparece em produção.
  assert.ok(ITERACOES <= 100000, `ITERACOES=${ITERACOES} quebra no Workers`);
});
