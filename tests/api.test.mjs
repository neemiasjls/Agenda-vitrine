/* A API de ponta a ponta: pedido HTTP entra, banco SQLite de verdade
   responde. É o caminho que o site publicado percorre. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { novoD1 } from "./d1.mjs";
import { rotearApi } from "../worker/api.js";
import { _esquecerChave } from "../worker/banco.js";

const BASE = "https://nailagenda.teste";
const SENHA_INICIAL = "demoagenda2026";     // a que você escolheu; no banco só há o hash

function servidor() {
  _esquecerChave();
  const env = { DB: novoD1() };
  let cookies = {};                            // um "navegador" por servidor
  const pedir = async (rota, { method = "GET", body, jar = cookies, headers = {} } = {}) => {
    const h = { ...headers };
    const lista = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (lista) h.Cookie = lista;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const r = await rotearApi(new Request(BASE + rota, { method, headers: h,
      body: body === undefined ? undefined : JSON.stringify(body) }), env);
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(";"); const i = par.indexOf("=");
      const nome = par.slice(0, i), valor = par.slice(i + 1);
      if (/Max-Age=0/.test(c)) delete jar[nome]; else jar[nome] = valor;
    }
    return { status: r.status, dados: await r.json(), cookies: r.headers.getSetCookie() };
  };
  return { env, pedir, cookies, outroNavegador: () => ({}) };
}

const estadoMinimo = (extra = {}) => ({
  company: { name: "Marina Lopes",
    hours: { 0: [], 1: [["09:00", "19:00"]], 2: [["09:00", "19:00"]], 3: [["09:00", "19:00"]],
             4: [["09:00", "19:00"]], 5: [["09:00", "19:00"]], 6: [["09:00", "14:00"]] },
    booking: { slotMinutes: 30, noticeHours: 0, horizonDays: 60, cancelHours: 24 } },
  settings: { autoConfirm: false },
  professionals: [{ id: "pro_1", name: "Marina" }],
  services: [{ id: "svc_1", name: "Manutenção", price: 120, duration: 60, returnDays: 21, active: true }],
  clients: [], appts: [], orders: [], expenses: [], charges: [], messages: [], blocks: [],
  ...extra,
});

/* próximo dia útil (terça) daqui a uma semana, em data local */
const terca = () => { const d = new Date(Date.now() + 7 * 864e5); while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

async function logada(s) {
  const r = await s.pedir("/api/auth/login", { method: "POST", body: { email: "admin@example.com", password: SENHA_INICIAL } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return r;
}

/* ---------------- Login da profissional ---------------- */

test("login: senha certa entra; cookie é HttpOnly, Secure e __Host-", async () => {
  const s = servidor();
  const r = await logada(s);
  const c = r.cookies.find(x => x.startsWith("__Host-nailagenda-pro="));
  assert.ok(c, "cookie de sessão da profissional");
  assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /SameSite=Lax/);
  const eu = await s.pedir("/api/session");
  assert.equal(eu.dados.papel, "profissional");
});

test("login: senha errada e e-mail inexistente dão a MESMA resposta", async () => {
  const s = servidor();
  const a = await s.pedir("/api/auth/login", { method: "POST", body: { email: "admin@example.com", password: "errada123" } });
  const b = await s.pedir("/api/auth/login", { method: "POST", body: { email: "ninguem@example.com", password: "errada123" } });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.equal(a.dados.erro, b.dados.erro, "não pode revelar se o e-mail existe");
});

test("login: 8 erros bloqueiam a conta por 15 minutos, mesmo com a senha certa", async () => {
  const s = servidor();
  // o limite de tentativas por minuto também existe; aqui testamos o bloqueio da conta
  for (let i = 0; i < 8; i++)
    await s.pedir("/api/auth/login", { method: "POST", body: { email: "admin@example.com", password: "errada" + i },
      headers: { "CF-Connecting-IP": "10.0.0." + i } });
  const r = await s.pedir("/api/auth/login", { method: "POST", body: { email: "admin@example.com", password: SENHA_INICIAL } });
  assert.equal(r.status, 429);
});

test("cookie adulterado não entra", async () => {
  const s = servidor();
  await logada(s);
  const [corpo, assin] = s.cookies["__Host-nailagenda-pro"].split(".");
  const falso = Buffer.from(JSON.stringify({ email: "admin@example.com", v: 1, exp: Date.now() + 1e9 })).toString("base64url");
  s.cookies["__Host-nailagenda-pro"] = falso + "." + assin;
  assert.equal((await s.pedir("/api/session")).dados.papel, "visitante");
  assert.equal((await s.pedir("/api/state")).status, 401);
});

test("trocar a senha derruba as sessões dos outros aparelhos", async () => {
  const s = servidor();
  await logada(s);
  const celular = { ...s.cookies };                      // mesma sessão copiada = outro aparelho
  const r = await s.pedir("/api/auth/senha", { method: "POST", body: { atual: SENHA_INICIAL, nova: "unhasnovas2026" } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal((await s.pedir("/api/session")).dados.papel, "profissional", "este aparelho segue logado");
  assert.equal((await s.pedir("/api/session", { jar: celular })).dados.papel, "visitante", "o outro sai");
  const velha = await s.pedir("/api/auth/login", { method: "POST", jar: {}, body: { email: "admin@example.com", password: SENHA_INICIAL } });
  assert.equal(velha.status, 401, "a senha antiga parou de valer");
});

/* ---------------- Estado: gravar, ler, conflito ---------------- */

test("sem login, o estado do ateliê não sai", async () => {
  const s = servidor();
  assert.equal((await s.pedir("/api/state")).status, 401);
  assert.equal((await s.pedir("/api/state", { method: "POST", body: { data: estadoMinimo(), version: 0 } })).status, 401);
});

test("primeira gravação, leitura e versão", async () => {
  const s = servidor();
  await logada(s);
  assert.equal((await s.pedir("/api/state")).dados.data, null, "banco começa vazio");
  const g = await s.pedir("/api/state", { method: "POST", body: { data: estadoMinimo(), version: 0 } });
  assert.equal(g.status, 200, JSON.stringify(g.dados)); assert.equal(g.dados.version, 1);
  const l = await s.pedir("/api/state");
  assert.equal(l.dados.version, 1);
  assert.equal(l.dados.data.company.name, "Marina Lopes");
  assert.equal(l.dados.data.services[0].name, "Manutenção");
});

test("dois aparelhos: quem grava com versão velha recebe conflito e os dados atuais", async () => {
  const s = servidor();
  await logada(s);
  await s.pedir("/api/state", { method: "POST", body: { data: estadoMinimo(), version: 0 } });           // v1
  await s.pedir("/api/state", { method: "POST", body: { data: estadoMinimo({ clients: [{ id: "c1", name: "Ana", phone: "11911111111" }] }), version: 1 } }); // v2 (computador)
  const celular = await s.pedir("/api/state", { method: "POST", body: { data: estadoMinimo(), version: 1 } });            // celular ainda na v1
  assert.equal(celular.status, 409);
  assert.equal(celular.dados.conflito, true);
  assert.equal(celular.dados.data.clients[0].name, "Ana", "devolve o que está no servidor");
  const agora = await s.pedir("/api/state");
  assert.equal(agora.dados.data.clients.length, 1, "a gravação do celular NÃO apagou a Ana");
});

test("cada coleção fica numa linha própria (limite de 2 MB por linha do D1)", async () => {
  const s = servidor();
  await logada(s);
  await s.pedir("/api/state", { method: "POST", body: { data: estadoMinimo(), version: 0 } });
  const linhas = s.env.DB._sqlite.prepare("SELECT nome FROM estado_partes ORDER BY nome").all().map(r => r.nome);
  for (const c of ["appts", "clients", "services", "_resto"]) assert.ok(linhas.includes(c), c);
});

/* ---------------- Portal da cliente ---------------- */

async function ateliePronto(s, extra) {
  await logada(s);
  await s.pedir("/api/state", { method: "POST", body: { data: estadoMinimo(extra), version: 0 } });
  await s.pedir("/api/auth/logout", { method: "POST" });
}

test("cliente: cadastro por telefone, entra, e só vê o que é dela", async () => {
  const s = servidor();
  await ateliePronto(s, { clients: [{ id: "c_ana", name: "Ana", phone: "11911111111" }],
    appts: [{ id: "a_ana", clientId: "c_ana", serviceId: "svc_1", start: new Date(Date.now() + 3 * 864e5).toISOString(), durationMin: 60, price: 120, status: "CONFIRMED", notes: "segredo da Marina" }] });

  const cad = await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Bruna", phone: "(11) 92222-2222", password: "bruna2026" } });
  assert.equal(cad.status, 200, JSON.stringify(cad.dados));
  const dados = await s.pedir("/api/cliente/dados");
  assert.equal(dados.dados.perfil.name, "Bruna");
  assert.equal(dados.dados.agendamentos.length, 0);
  assert.equal(JSON.stringify(dados.dados).includes("Ana"), false);
  assert.equal((await s.pedir("/api/state")).status, 403, "cliente não abre o painel");
});

test("cliente e profissional no mesmo navegador: cada uma vê o que é seu", async () => {
  const s = servidor();
  await ateliePronto(s);
  await logada(s);                               // o painel continua aberto neste navegador
  const cad = await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Carla", phone: "(11) 93333-3333", password: "carla2026" } });
  assert.equal(cad.status, 200, JSON.stringify(cad.dados));
  const dados = await s.pedir("/api/cliente/dados");
  assert.equal(dados.status, 200, "o portal da cliente abre mesmo com o painel logado");
  assert.equal(dados.dados.perfil.name, "Carla");
  assert.equal((await s.pedir("/api/state")).status, 200, "e o painel continua funcionando");
});

/* ---------------- Cadastro de novo, perfil e senha da cliente ---------------- */

async function salvarComoPainel(s, mudar) {
  await logada(s);
  const atual = (await s.pedir("/api/state")).dados;
  const doc = atual.data; mudar(doc);
  const r = await s.pedir("/api/state", { method: "POST", body: { data: doc, version: atual.version } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  await s.pedir("/api/auth/logout", { method: "POST" });
}

test("cliente: telefone com acesso não cadastra de novo sem liberação", async () => {
  const s = servidor();
  await ateliePronto(s);
  const corpo = { name: "Dora", phone: "(11) 91234-5678", password: "dora2026x" };
  assert.equal((await s.pedir("/api/cliente/cadastrar", { method: "POST", body: corpo })).status, 200);
  await s.pedir("/api/cliente/sair", { method: "POST" });
  const de = await s.pedir("/api/cliente/cadastrar", { method: "POST", body: corpo });
  assert.equal(de.status, 409);
});

test("cliente: ficha excluída no painel libera o telefone para cadastrar de novo", async () => {
  const s = servidor();
  await ateliePronto(s);
  await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Dora", phone: "11912345678", password: "dora2026x" } });
  await s.pedir("/api/cliente/sair", { method: "POST" });
  await salvarComoPainel(s, (doc) => { doc.clients = []; });      // "Começar do zero" ou excluir a ficha

  const velho = await s.pedir("/api/cliente/entrar", { method: "POST", body: { phone: "11912345678", password: "dora2026x" } });
  assert.equal(velho.status, 404, "login antigo explica que o cadastro foi removido");
  assert.match(velho.dados.erro, /Criar meu cadastro/);

  const novo = await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Dora Nova", phone: "(11) 91234-5678", password: "outra2026" } });
  assert.equal(novo.status, 200, JSON.stringify(novo.dados));
  const eu = await s.pedir("/api/cliente/dados");
  assert.equal(eu.dados.perfil.name, "Dora Nova");
  await s.pedir("/api/cliente/sair", { method: "POST" });
  assert.equal((await s.pedir("/api/cliente/entrar", { method: "POST", body: { phone: "11912345678", password: "outra2026" } })).status, 200);
  assert.equal((await s.pedir("/api/cliente/entrar", { method: "POST", body: { phone: "11912345678", password: "dora2026x" } })).status, 401);
});

test("cliente: ficha refeita pela profissional com o mesmo telefone também libera", async () => {
  const s = servidor();
  await ateliePronto(s);
  await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Dora", phone: "11912345678", password: "dora2026x" } });
  await s.pedir("/api/cliente/sair", { method: "POST" });
  await salvarComoPainel(s, (doc) => { doc.clients = [{ id: "c_nova", name: "Dora Souza", phone: "(11) 91234-5678" }]; });
  const r = await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Dora", phone: "11912345678", password: "nova2026x" } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal((await s.pedir("/api/cliente/dados")).dados.perfil.id, "c_nova", "usa a ficha da profissional, sem duplicar");
});

test("cliente: esqueceu a senha, a profissional libera e o histórico continua", async () => {
  const s = servidor();
  await ateliePronto(s, { clients: [{ id: "c_ana", name: "Ana", phone: "11911111111" }],
    appts: [{ id: "a1", clientId: "c_ana", serviceId: "svc_1", start: new Date(Date.now() - 20 * 864e5).toISOString(), durationMin: 60, price: 120, status: "DONE" }] });
  await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Ana", phone: "11911111111", password: "ana2026xx" } });
  await s.pedir("/api/cliente/sair", { method: "POST" });
  await salvarComoPainel(s, (doc) => { doc.clients[0].portalLiberado = true; });
  const r = await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Ana", phone: "11911111111", password: "anaNova2026" } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const eu = await s.pedir("/api/cliente/dados");
  assert.equal(eu.dados.perfil.id, "c_ana");
  assert.equal(eu.dados.agendamentos.length, 1, "histórico mantido");
  await s.pedir("/api/cliente/sair", { method: "POST" });
  assert.equal((await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Ana", phone: "11911111111", password: "outra2026x" } })).status, 409,
    "a liberação vale uma vez só");
});

test("cliente: cadastro grava a data de nascimento; data impossível é recusada", async () => {
  const s = servidor();
  await ateliePronto(s);
  const ruim = await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Eva", phone: "11955555555", password: "eva2026xx", birthdate: "1990-02-31" } });
  assert.equal(ruim.status, 400);
  const ok = await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Eva", phone: "11955555555", password: "eva2026xx", birthdate: "1990-02-14" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.dados));
  assert.equal((await s.pedir("/api/cliente/dados")).dados.perfil.birthdate, "1990-02-14");
});

test("cliente: edita nome e nascimento, e troca a senha pelo servidor", async () => {
  const s = servidor();
  await ateliePronto(s);
  await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Fê", phone: "11966666666", password: "fe2026xxx" } });
  const p = await s.pedir("/api/cliente/perfil", { method: "POST", body: { name: "Fernanda Lima", birthdate: "1995-07-10" } });
  assert.equal(p.status, 200, JSON.stringify(p.dados));
  assert.equal(p.dados.perfil.name, "Fernanda Lima");
  assert.equal((await s.pedir("/api/cliente/dados")).dados.perfil.birthdate, "1995-07-10");

  assert.equal((await s.pedir("/api/cliente/senha", { method: "POST", body: { atual: "errada123", nova: "nova2026x" } })).status, 401);
  assert.equal((await s.pedir("/api/cliente/senha", { method: "POST", body: { atual: "fe2026xxx", nova: "12345678" } })).status, 400);
  assert.equal((await s.pedir("/api/cliente/senha", { method: "POST", body: { atual: "fe2026xxx", nova: "nova2026x" } })).status, 200);
  await s.pedir("/api/cliente/sair", { method: "POST" });
  assert.equal((await s.pedir("/api/cliente/entrar", { method: "POST", body: { phone: "11966666666", password: "nova2026x" } })).status, 200);
});

test("cliente: agendar grava no fuso de São Paulo e bloqueia o horário para as outras", async () => {
  const s = servidor();
  await ateliePronto(s);
  const dia = terca();
  await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Bruna", phone: "11922222222", password: "bruna2026" } });
  const r = await s.pedir("/api/cliente/agendar", { method: "POST", body: { serviceId: "svc_1", date: dia, time: "09:00" } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  // 09:00 em São Paulo = 12:00 UTC
  assert.equal(r.dados.agendamentos[0].start, `${dia}T12:00:00.000Z`, "o Worker roda em UTC; o horário tem de sair certo");

  // outra cliente, mesmo horário
  const outra = s.outroNavegador();
  await s.pedir("/api/cliente/cadastrar", { method: "POST", jar: outra, body: { name: "Carla", phone: "11933333333", password: "carla2026" } });
  const choque = await s.pedir("/api/cliente/agendar", { method: "POST", jar: outra, body: { serviceId: "svc_1", date: dia, time: "09:00" } });
  assert.equal(choque.status, 409, "o servidor barra o horário ocupado");
  const cat = await s.pedir("/api/catalogo", { jar: outra });
  assert.equal(cat.dados.ocupado.length, 1);
  assert.deepEqual(Object.keys(cat.dados.ocupado[0]).sort(), ["durationMin", "start"], "ocupado vai sem nome");
});

test("cliente: horário fora do expediente é recusado pelo servidor", async () => {
  const s = servidor();
  await ateliePronto(s);
  await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Bruna", phone: "11922222222", password: "bruna2026" } });
  const r = await s.pedir("/api/cliente/agendar", { method: "POST", body: { serviceId: "svc_1", date: terca(), time: "20:00" } });
  assert.equal(r.status, 409);
});

test("cliente: telefone não cadastrado e senha errada dão a mesma resposta", async () => {
  const s = servidor();
  await ateliePronto(s);
  await s.pedir("/api/cliente/cadastrar", { method: "POST", jar: {}, body: { name: "Bruna", phone: "11922222222", password: "bruna2026" } });
  const a = await s.pedir("/api/cliente/entrar", { method: "POST", jar: {}, body: { phone: "11922222222", password: "errada99" } });
  const b = await s.pedir("/api/cliente/entrar", { method: "POST", jar: {}, body: { phone: "11900000000", password: "errada99" } });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.equal(a.dados.erro, b.dados.erro);
});

test("senha da cliente não fica em texto no banco", async () => {
  const s = servidor();
  await ateliePronto(s);
  await s.pedir("/api/cliente/cadastrar", { method: "POST", body: { name: "Bruna", phone: "11922222222", password: "minhasenhasecreta" } });
  const tudo = JSON.stringify(s.env.DB._sqlite.prepare("SELECT * FROM acesso_cliente").all());
  assert.equal(tudo.includes("minhasenhasecreta"), false);
});

/* ---------------- Limites ---------------- */

test("limite de tentativas devolve 429", async () => {
  const s = servidor();
  let ultimo;
  for (let i = 0; i < 9; i++)
    ultimo = await s.pedir("/api/auth/login", { method: "POST", body: { email: "x@example.com", password: "qualquer1" } });
  assert.equal(ultimo.status, 429);
});

test("pedido de outro site é recusado", async () => {
  const s = servidor();
  const r = await s.pedir("/api/auth/login", { method: "POST", body: { email: "admin@example.com", password: SENHA_INICIAL },
    headers: { Origin: "https://site-malicioso.com" } });
  assert.equal(r.status, 403);
});
