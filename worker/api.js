/* Rotas da API. Quem decide o que cada um pode ver é este arquivo —
   não o navegador. */
/* O Worker roda em UTC; a agenda é de São Paulo. Tem de vir antes do
   núcleo ser usado. */
globalThis.AGENDA_FUSO_MIN = 180;
import "../assets/js/agenda-core.js";
import { ErroApp, responder, lerCorpo, cookie, lerCookie, b64url, hex } from "./seguranca.js";
import * as db from "./banco.js";
import { derivar, conferir, novoSalt, ITERACOES, validarSenha, validarTelefone } from "./senha.js";

const Core = globalThis.AgendaCore;
const SESSAO_CLIENTE = 60 * 60 * 24 * 30;   // 30 dias
const SESSAO_PRO     = 60 * 60 * 24 * 14;   // 14 dias; "sair" ou trocar a senha encerra antes
const BLOQUEIO_MIN   = 15;

/* ---------- Sessão assinada ----------
   O cookie guarda quem é e até quando vale, com uma assinatura HMAC. A chave
   da assinatura mora no banco e nunca sai do servidor: sem ela, ninguém
   fabrica um cookie válido. HttpOnly — o JavaScript da página não lê. */

const chaveHmac = async (env) => crypto.subtle.importKey(
  "raw", new TextEncoder().encode("nailagenda-sessao-v2:" + await db.chaveDeSessao(env)),
  { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function selar(env, dados, segundos) {
  const corpo = b64url.encode(new TextEncoder().encode(
    JSON.stringify({ ...dados, exp: Date.now() + segundos * 1000 })));
  const assinatura = await crypto.subtle.sign("HMAC", await chaveHmac(env), new TextEncoder().encode(corpo));
  return corpo + "." + b64url.encode(new Uint8Array(assinatura));
}

async function abrir(env, valor) {
  try {
    if (!valor || valor.length > 4000) return null;
    const [corpo, assinatura, sobra] = valor.split(".");
    if (!corpo || !assinatura || sobra) return null;
    const ok = await crypto.subtle.verify("HMAC", await chaveHmac(env),
      b64url.decode(assinatura), new TextEncoder().encode(corpo));
    if (!ok) return null;
    const dados = JSON.parse(new TextDecoder().decode(b64url.decode(corpo)));
    if (!Number.isFinite(dados.exp) || dados.exp < Date.now()) return null;
    return dados;
  } catch { return null; }
}

const sessaoPro = async (request, env, pro) =>
  cookie(request, "pro", await selar(env, { email: pro.email, v: pro.sessao_versao }, SESSAO_PRO), SESSAO_PRO);
const sessaoCliente = async (request, env, id) =>
  cookie(request, "cliente", await selar(env, { id }, SESSAO_CLIENTE), SESSAO_CLIENTE);
const apagar = (request, nome) => cookie(request, nome, "", 0);

/* ---------- Quem está falando ---------- */

/* As duas sessões podem conviver no mesmo navegador: a Marina logada no
   painel abre o portal para testar, ou uma cliente usa o celular dela.
   As rotas da cliente leem primeiro a sessão de cliente; o resto, a da
   profissional. Antes o painel sempre vencia: a cliente "entrava", mas
   /api/cliente/dados respondia 401 e o portal ficava parado no login. */
async function identificar(request, env, rotaDaCliente = false) {
  if (rotaDaCliente) {
    const cli = await abrir(env, lerCookie(request, "cliente"));
    if (cli && cli.id) return { papel: "cliente", id: cli.id };
  }
  const pro = await abrir(env, lerCookie(request, "pro"));
  if (pro && pro.email) {
    const conta = await db.buscarProfissional(env, pro.email);
    // senha trocada em outro aparelho: sessões antigas deixam de valer
    if (conta && conta.sessao_versao === pro.v)
      return { papel: "profissional", id: conta.email, email: conta.email };
  }
  const cli = await abrir(env, lerCookie(request, "cliente"));
  if (cli && cli.id) return { papel: "cliente", id: cli.id };
  return { papel: "visitante" };
}

/* Data de nascimento opcional: AAAA-MM-DD, no passado, idade plausível. */
function validarNascimento(v) {
  if (v == null || v === "") return "";
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T12:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  const anos = (Date.now() - d.getTime()) / (365.25 * 864e5);
  return anos >= 5 && anos <= 120 ? s : null;
}

/* ---------- Estado ---------- */

async function documento(env) {
  const linha = await db.lerEstado(env);
  if (!linha) throw new ErroApp(
    "O sistema ainda não foi iniciado. Entre pelo painel para enviar seus dados.", 409);
  return { estado: linha.data, versao: linha.version };
}

/* O que a cliente pode ver: os próprios horários e mais nada.
   Enviar o documento inteiro e esconder no navegador seria entregar
   a agenda de todo mundo para quem abrisse o inspetor. */
export function recorteDaCliente(estado, clientId) {
  const eu = (estado.clients || []).find((c) => c.id === clientId) || null;
  const servico = (id) => (estado.services || []).find((s) => s.id === id) || {};
  return {
    perfil: eu && { id: eu.id, name: eu.name, phone: eu.phone, birthdate: eu.birthdate || "", credit: eu.credit || 0 },
    agendamentos: (estado.appts || [])
      .filter((a) => a.clientId === clientId)
      .map((a) => ({
        id: a.id, start: a.start, durationMin: a.durationMin, price: a.price,
        status: a.status, polishId: a.polishId || null,
        serviceId: a.serviceId, serviceName: servico(a.serviceId).name || "Procedimento",
        podeAlterar: Core.clientePodeAlterar(estado, a),
      }))
      .sort((a, b) => b.start.localeCompare(a.start)),
  };
}

/* Catálogo público: o que a página de agendamento precisa para montar o
   calendário, e nada além disso.

   Os horários ocupados vão ANÔNIMOS — só quando começa e quanto dura.
   Sem nome, sem telefone, sem procedimento, sem preço. Uma página de
   agendamento revela os horários livres de qualquer jeito (é para isso
   que ela serve); o que não pode revelar é de quem é cada horário.

   Vai só a janela que a cliente pode marcar: do dia de hoje até o limite
   de dias configurado. O resto da agenda não sai do servidor. */
export function catalogo(estado) {
  const regras = estado.company?.booking || {};
  const hoje = Core.iso(new Date());
  const fim = new Date();
  fim.setDate(fim.getDate() + (regras.horizonDays == null ? 60 : regras.horizonDays));
  const ate = Core.iso(fim);
  const dentro = (d) => d >= hoje && d <= ate;

  return {
    ateliê: {
      name: estado.company?.name, handle: estado.company?.handle,
      tagline: estado.company?.tagline, phone: estado.company?.phone,
    },
    servicos: (estado.services || []).filter((s) => s.active !== false)
      .map(({ id, name, cat, price, duration, returnDays }) => ({ id, name, cat, price, duration, returnDays, active: true })),
    regras,
    expediente: estado.company?.hours || {},
    bloqueios: (estado.blocks || []).filter((b) => dentro(b.date))
      .map(({ date, start, end }) => ({ date, start, end })),   // sem o motivo
    ocupado: (estado.appts || [])
      .filter((a) => Core.ATIVO(a) && dentro(Core.dia(a.start)))
      .map((a) => ({ start: a.start, durationMin: a.durationMin })),
  };
}

/* Conta a tentativa errada e bloqueia por 15 min depois da oitava. */
async function errou(env, conta, atualizar) {
  const erros = (conta.erros || 0) + 1;
  await atualizar({ erros, bloqueado_ate: erros >= 8 ? new Date(Date.now() + BLOQUEIO_MIN * 6e4).toISOString() : null });
}
const bloqueada = (conta) => conta.bloqueado_ate && new Date(conta.bloqueado_ate) > new Date();

/* ---------- Roteador ---------- */

export async function rotearApi(request, env) {
  const url = new URL(request.url);
  const rota = url.pathname;
  let cookies = [];

  try {
    if (!db.configurado(env))
      throw new ErroApp("O servidor ainda não foi configurado. O app está funcionando só neste navegador.", 503);
    if (!["GET", "POST"].includes(request.method))
      throw new ErroApp("Método não permitido.", 405);

    const quem = await identificar(request, env, rota.startsWith("/api/cliente/"));

    /* ----- quem sou eu ----- */
    if (rota === "/api/session")
      return responder({ papel: quem.papel, email: quem.email || null, configurado: true, banco: db.provedor(env) });

    /* ----- a profissional entra ----- */
    if (rota === "/api/auth/login") {
      const corpo = await lerCorpo(request, 4096);
      const email = String(corpo.email || "").trim().toLowerCase();
      await db.limitar(env, "login", email || "?", request);
      // Mensagem única: não revela se o e-mail existe.
      const generica = new ErroApp("E-mail ou senha incorretos.", 401);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw generica;
      const conta = await db.buscarProfissional(env, email);
      if (!conta) { await derivar(String(corpo.password || ""), novoSalt()); throw generica; }   // mesmo tempo de resposta
      if (bloqueada(conta)) throw new ErroApp(`Acesso bloqueado por ${BLOQUEIO_MIN} minutos após várias tentativas.`, 429);
      if (!await conferir(String(corpo.password || ""), { salt: conta.sal, iterations: conta.iteracoes, password_key: conta.chave })) {
        await errou(env, conta, (c) => db.atualizarProfissional(env, email, c));
        throw generica;
      }
      await db.atualizarProfissional(env, email, { erros: 0, bloqueado_ate: null });
      return fechar(responder({ ok: true }), [await sessaoPro(request, env, conta), apagar(request, "cliente")]);
    }

    if (rota === "/api/auth/logout")
      return fechar(responder({ ok: true }), [apagar(request, "pro"), apagar(request, "cliente")]);

    /* ----- a profissional troca a senha ----- */
    if (rota === "/api/auth/senha") {
      if (quem.papel !== "profissional") throw new ErroApp("Entre para continuar.", 401);
      await db.limitar(env, "login", quem.email, request);
      const corpo = await lerCorpo(request, 4096);
      const conta = await db.buscarProfissional(env, quem.email);
      if (!await conferir(String(corpo.atual || ""), { salt: conta.sal, iterations: conta.iteracoes, password_key: conta.chave }))
        throw new ErroApp("Senha atual incorreta.", 401);
      const erro = validarSenha(corpo.nova);
      if (erro) throw new ErroApp(erro);
      const sal = novoSalt();
      await db.atualizarProfissional(env, quem.email, { chave: await derivar(corpo.nova, sal), sal,
        iteracoes: ITERACOES, derrubarSessoes: true, erros: 0, bloqueado_ate: null });
      // este aparelho continua logado; os outros saem
      const atualizada = await db.buscarProfissional(env, quem.email);
      return fechar(responder({ ok: true, message: "Senha alterada. Os outros aparelhos vão pedir a senha nova." }),
        [await sessaoPro(request, env, atualizada)]);
    }

    /* ----- painel da profissional ----- */
    if (rota === "/api/state") {
      if (quem.papel !== "profissional")
        throw new ErroApp("Esta área é só da profissional.", quem.papel === "visitante" ? 401 : 403);

      if (request.method === "GET") {
        await db.limitar(env, "ler", quem.id, request);
        const linha = await db.lerEstado(env);
        return responder(linha ? { data: linha.data, version: linha.version } : { data: null, version: 0 });
      }

      await db.limitar(env, "gravar", quem.id, request);
      const corpo = await lerCorpo(request);
      if (!corpo.data || typeof corpo.data !== "object") throw new ErroApp("Dados inválidos.");
      if (!Number.isInteger(corpo.version) || corpo.version < 0) throw new ErroApp("Versão ausente.");

      const nova = await db.salvarEstado(env, corpo.data, corpo.version);
      if (nova === null) {
        const agora = await db.lerEstado(env);
        return responder({ erro: "Seus dados mudaram em outro aparelho.", conflito: true,
          data: agora && agora.data, version: agora ? agora.version : 0 }, 409);
      }
      return responder({ version: nova });
    }

    /* ----- catálogo público ----- */
    if (rota === "/api/catalogo") {
      await db.limitar(env, "ler", null, request);
      return responder(catalogo((await documento(env)).estado));
    }

    /* ----- cliente: cadastro ----- */
    if (rota === "/api/cliente/cadastrar") {
      await db.limitar(env, "cadastro", null, request);
      const corpo = await lerCorpo(request, 4096);
      const telefone = validarTelefone(corpo.phone);
      if (!telefone) throw new ErroApp("Informe um telefone com DDD.");
      const erroSenha = validarSenha(corpo.password);
      if (erroSenha) throw new ErroApp(erroSenha);
      const nome = String(corpo.name || "").trim();
      if (nome.length < 2 || nome.length > 80) throw new ErroApp("Informe seu nome.");
      const nascimento = validarNascimento(corpo.birthdate);
      if (nascimento === null) throw new ErroApp("Data de nascimento inválida.");

      /* Um telefone já com acesso só pode cadastrar de novo em dois casos:
         a ficha dona do acesso foi excluída no painel (acesso órfão), ou a
         profissional liberou um novo cadastro na ficha (esqueceu a senha).
         O histórico fica: o acesso novo aponta para a mesma ficha. */
      const acesso = await db.buscarAcesso(env, telefone);
      const { estado, versao } = await documento(env);
      const clientes = estado.clients || [];
      const dona = acesso ? clientes.find((c) => c.id === acesso.cliente_id) : null;
      if (acesso && dona && !dona.portalLiberado)
        throw new ErroApp("Já existe um acesso para este telefone. Tente entrar ou peça para a Marina liberar um novo cadastro.", 409);

      // Se a profissional já tem essa cliente na ficha, aproveita o cadastro
      // em vez de criar uma segunda — senão o histórico fica partido.
      let cliente = dona || clientes.find((c) => validarTelefone(c.phone) === telefone);
      let mudou = false;
      if (!cliente) {
        cliente = { id: acesso ? acesso.cliente_id : "cli_" + crypto.randomUUID().slice(0, 8), name: nome, phone: telefone,
          email: "", birthdate: nascimento, cpf: "", notes: "", credit: 0, tags: [],
          createdAt: new Date().toISOString(), anamnese: null };
        estado.clients = [...clientes, cliente];
        mudou = true;
      }
      if (cliente.portalLiberado) { delete cliente.portalLiberado; mudou = true; }
      if (nascimento && !cliente.birthdate) { cliente.birthdate = nascimento; mudou = true; }
      if (mudou && await db.salvarEstado(env, estado, versao) === null) throw new ErroApp("Tente de novo em instantes.", 409);

      // Acesso órfão preso a outra ficha: aposenta com telefone e senha
      // aleatórios, para liberar o telefone sem precisar apagar a linha.
      if (acesso && acesso.cliente_id !== cliente.id) {
        const salVelho = novoSalt();
        await db.gravarAcesso(env, { cliente_id: acesso.cliente_id,
          telefone: "9" + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b % 10).join(""),
          chave: await derivar(hex(crypto.getRandomValues(new Uint8Array(32))), salVelho), sal: salVelho, iteracoes: ITERACOES });
      }
      const sal = novoSalt();
      await db.gravarAcesso(env, { cliente_id: cliente.id, telefone,
        chave: await derivar(corpo.password, sal), sal, iteracoes: ITERACOES });
      return fechar(responder({ ok: true, nome: cliente.name }), [await sessaoCliente(request, env, cliente.id)]);
    }

    /* ----- cliente: entrar ----- */
    if (rota === "/api/cliente/entrar") {
      const corpo = await lerCorpo(request, 4096);
      const telefone = validarTelefone(corpo.phone);
      await db.limitar(env, "login", telefone || "?", request);
      // Mensagem única: dizer "telefone não cadastrado" entrega quem é cliente.
      const generica = new ErroApp("Telefone ou senha incorretos.", 401);
      if (!telefone) throw generica;
      const acesso = await db.buscarAcesso(env, telefone);
      if (!acesso) { await derivar(String(corpo.password || ""), novoSalt()); throw generica; }
      if (bloqueada(acesso)) throw new ErroApp(`Acesso bloqueado por ${BLOQUEIO_MIN} minutos após várias tentativas.`, 429);
      if (!await conferir(String(corpo.password || ""), { salt: acesso.sal, iterations: acesso.iteracoes, password_key: acesso.chave })) {
        await errou(env, acesso, (c) => db.atualizarAcesso(env, acesso.cliente_id, c));
        throw generica;
      }
      await db.atualizarAcesso(env, acesso.cliente_id, { erros: 0, bloqueado_ate: null });
      const { estado } = await documento(env);
      const eu = (estado.clients || []).find((c) => c.id === acesso.cliente_id);
      if (!eu) throw new ErroApp("Seu cadastro foi removido. Toque em Criar meu cadastro para fazer de novo.", 404);
      return fechar(responder({ ok: true, nome: eu?.name || "" }), [await sessaoCliente(request, env, acesso.cliente_id)]);
    }

    if (rota === "/api/cliente/sair")
      return fechar(responder({ ok: true }), [apagar(request, "cliente")]);

    /* ----- cliente: os próprios dados ----- */
    if (rota === "/api/cliente/dados") {
      if (quem.papel !== "cliente") throw new ErroApp("Entre para continuar.", 401);
      await db.limitar(env, "ler", quem.id, request);
      return responder(recorteDaCliente((await documento(env)).estado, quem.id));
    }

    /* ----- cliente: nome e nascimento ----- 
       O telefone não muda por aqui: é o login dela. Troca de telefone
       passa pela Marina, que edita a ficha. */
    if (rota === "/api/cliente/perfil") {
      if (quem.papel !== "cliente") throw new ErroApp("Entre para continuar.", 401);
      await db.limitar(env, "agendar", quem.id, request);
      const corpo = await lerCorpo(request, 4096);
      const nome = String(corpo.name || "").trim();
      if (nome.length < 2 || nome.length > 80) throw new ErroApp("Informe seu nome.");
      const nascimento = validarNascimento(corpo.birthdate);
      if (nascimento === null) throw new ErroApp("Data de nascimento inválida.");
      const { estado, versao } = await documento(env);
      const eu = (estado.clients || []).find((c) => c.id === quem.id);
      if (!eu) throw new ErroApp("Cadastro não encontrado.", 404);
      eu.name = nome; eu.birthdate = nascimento;
      if (await db.salvarEstado(env, estado, versao) === null) throw new ErroApp("Tente de novo em instantes.", 409);
      return responder(recorteDaCliente(estado, quem.id));
    }

    if (rota === "/api/cliente/senha") {
      if (quem.papel !== "cliente") throw new ErroApp("Entre para continuar.", 401);
      await db.limitar(env, "login", "cliente-senha:" + quem.id, request);
      const corpo = await lerCorpo(request, 4096);
      const { estado } = await documento(env);
      const eu = (estado.clients || []).find((c) => c.id === quem.id);
      const telefone = eu && validarTelefone(eu.phone);
      const acesso = telefone && await db.buscarAcesso(env, telefone);
      if (!acesso || acesso.cliente_id !== quem.id)
        throw new ErroApp("Não foi possível conferir seu acesso. Fale com a Marina.", 409);
      if (!await conferir(String(corpo.atual || ""), { salt: acesso.sal, iterations: acesso.iteracoes, password_key: acesso.chave }))
        throw new ErroApp("Senha atual incorreta.", 401);
      const erro = validarSenha(corpo.nova);
      if (erro) throw new ErroApp(erro);
      const sal = novoSalt();
      await db.gravarAcesso(env, { cliente_id: quem.id, telefone: acesso.telefone,
        chave: await derivar(corpo.nova, sal), sal, iteracoes: ITERACOES });
      return responder({ ok: true });
    }

    /* ----- cliente: agendar, remarcar, cancelar ----- */
    if (rota === "/api/cliente/agendar" || rota === "/api/cliente/remarcar" || rota === "/api/cliente/cancelar") {
      if (quem.papel !== "cliente") throw new ErroApp("Entre para continuar.", 401);
      await db.limitar(env, "agendar", quem.id, request);
      const corpo = await lerCorpo(request, 8192);

      const { estado, versao } = await documento(env);
      const eu = (estado.clients || []).find((c) => c.id === quem.id);
      if (!eu) throw new ErroApp("Cadastro não encontrado.", 404);
      const meu = (id) => (estado.appts || []).find((a) => a.id === id && a.clientId === quem.id);

      if (rota === "/api/cliente/cancelar") {
        const a = meu(corpo.id);
        if (!a) throw new ErroApp("Agendamento não encontrado.", 404);
        if (!Core.clientePodeAlterar(estado, a))
          throw new ErroApp("O prazo para cancelar online já passou. Fale com a profissional.", 403);
        a.status = "CANCELED";
      } else {
        const anterior = rota === "/api/cliente/remarcar" ? meu(corpo.id) : null;
        if (rota === "/api/cliente/remarcar") {
          if (!anterior) throw new ErroApp("Agendamento não encontrado.", 404);
          if (!Core.clientePodeAlterar(estado, anterior))
            throw new ErroApp("O prazo para remarcar online já passou. Fale com a profissional.", 403);
        }
        const svc = (estado.services || []).find(
          (s) => s.id === (anterior?.serviceId || corpo.serviceId) && s.active !== false);
        if (!svc) throw new ErroApp("Procedimento não encontrado.", 404);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(corpo.date || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(corpo.time || ""))
          throw new ErroApp("Escolha uma data e um horário.");

        const duracao = anterior?.durationMin || svc.duration;
        /* O horário vem em hora de Brasília; a conta de "livre?" e a
           gravação usam o mesmo fuso explícito do núcleo. */
        const livre = Core.horarios(estado, {
          date: corpo.date, durationMin: duracao, ignoreId: anterior?.id, paraCliente: true });
        if (!livre.includes(corpo.time))
          throw new ErroApp("Esse horário não está mais disponível. Escolha outro.", 409);

        const quando = Core.instante(corpo.date, corpo.time);
        if (anterior) {
          anterior.start = quando.toISOString();
          anterior.status = estado.settings?.autoConfirm ? "CONFIRMED" : "SCHEDULED";
        } else {
          (estado.appts = estado.appts || []).push({
            id: "app_" + crypto.randomUUID().slice(0, 8),
            clientId: quem.id, proId: (estado.professionals?.[0] || {}).id, serviceId: svc.id,
            start: quando.toISOString(), durationMin: duracao, price: svc.price,
            status: estado.settings?.autoConfirm ? "CONFIRMED" : "SCHEDULED",
            notes: "Agendado pela cliente", source: "client",
            polishId: null, photos: [], paid: false, paymentMethod: null,
          });
        }
      }

      if (await db.salvarEstado(env, estado, versao) === null)
        throw new ErroApp("Alguém reservou agora mesmo. Recarregue e tente outro horário.", 409);
      return responder(recorteDaCliente(estado, quem.id));
    }

    throw new ErroApp("Rota não encontrada.", 404);
  } catch (e) {
    const status = e instanceof ErroApp ? e.status : 500;
    if (!(e instanceof ErroApp)) console.error("api:", e && e.stack || e);
    return fechar(responder({
      erro: e instanceof ErroApp ? e.message : "Não foi possível concluir. Tente de novo.",
    }, status), cookies);
  }
}

function fechar(resposta, cookies) {
  for (const c of cookies || []) resposta.headers.append("Set-Cookie", c);
  return resposta;
}

/* Chamada pelo cron: remove contadores de tentativa já vencidos. */
export async function limparLimites(env) {
  if (!db.configurado(env)) return;
  try { await db.limparLimitesVencidos(env); }
  catch (e) { console.error("faxina:", e.message); }
}
