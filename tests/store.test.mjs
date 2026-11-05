/* Integridade dos dados: o que pode ser gravado, o que pode ser apagado,
   o que acontece quando o navegador recusa gravar e se um backup antigo
   ainda abre depois das mudanças de schema. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { carregar, agendaVazia, proximoDia, iso, em } from "./harness.mjs";

test("allowlist: campo que não é do schema não entra", () => {
  const { Store } = carregar();
  const c = Store.upsert("clients", {
    name: "Teste", phone: "11999999999",
    credit: 5000,                 // existe no schema
    role: "ADMIN",                // NÃO existe: privilégio
    isAdmin: true,                // NÃO existe
    __proto__polui: 1,            // NÃO existe
  });
  assert.equal(c.name, "Teste");
  assert.equal(c.credit, 5000, "campo legítimo passa");
  assert.equal("role" in c, false);
  assert.equal("isAdmin" in c, false);
  assert.equal("__proto__polui" in c, false);
});

test("allowlist: update não consegue injetar campo novo", () => {
  const { Store } = carregar();
  const a = Store.db.appts[0];
  const antes = a.price;
  Store.upsert("appts", { id: a.id, status: "DONE", desconto: 999, paid: true });
  const depois = Store.byId("appts", a.id);

  assert.equal(depois.status, "DONE");
  assert.equal(depois.paid, true);
  assert.equal(depois.price, antes, "preço não foi tocado");
  assert.equal("desconto" in depois, false);
});

test("upsert devolve o id de quem acabou de criar", () => {
  const { Store } = carregar();
  const obj = { name: "Nova", phone: "11912345678" };
  const salvo = Store.upsert("clients", obj);
  assert.ok(salvo.id, "o registro salvo tem id");
  assert.equal(obj.id, salvo.id, "o id volta para o objeto de quem chamou");
  assert.ok(Store.byId("clients", salvo.id));
});

test("integridade: cliente com histórico não pode ser apagada", () => {
  const { Store, janela } = carregar();
  const comHistorico = Store.db.appts[0].clientId;
  const antes = Store.db.clients.length;

  assert.equal(Store.remove("clients", comHistorico), false);
  assert.equal(Store.db.clients.length, antes, "nada foi apagado");
  assert.ok(Store.linkedTo("clients", comHistorico));
  assert.match(janela.__avisos.at(-1), /atendimento/, "explica o motivo para ela");
});

test("integridade: cadastro sem vínculo pode ser apagado", () => {
  const { Store } = carregar();
  const nova = Store.upsert("clients", { name: "Sem histórico", phone: "11900000000" });

  assert.equal(Store.linkedTo("clients", nova.id), null);
  assert.equal(Store.remove("clients", nova.id), true);
  assert.equal(Store.byId("clients", nova.id), undefined);
});

test("integridade: serviço usado em atendimento fica protegido", () => {
  const { Store } = carregar();
  const usado = Store.db.appts[0].serviceId;
  assert.equal(Store.remove("services", usado), false);
  assert.ok(Store.byId("services", usado), "continua no catálogo");
});

test("migração: base antiga (openHour/workdays) vira expediente por dia", () => {
  const { Store, janela, memoria } = carregar();
  const antiga = JSON.parse(JSON.stringify(Store.db));
  delete antiga.company.hours;
  delete antiga.company.booking;
  delete antiga.blocks;
  antiga.company.openHour = 8;
  antiga.company.closeHour = 18;
  antiga.company.workdays = [1, 3, 5];
  antiga.company.slotMinutes = 45;

  memoria.set("nailagenda.db.v2", JSON.stringify(antiga));
  Store.load();

  const c = Store.db.company;
  assert.equal(JSON.stringify(c.hours[1]), '[["08:00","18:00"]]', "segunda virou período");
  assert.equal(c.hours[2].length, 0, "terça não era dia de trabalho");
  assert.equal(c.hours[5].length, 1);
  assert.equal(c.booking.slotMinutes, 45, "o intervalo antigo foi preservado");
  assert.equal("openHour" in c, false, "campos antigos removidos");
  assert.ok(Array.isArray(Store.db.blocks));
});

test("migração não apaga os dados já cadastrados", () => {
  const { Store, memoria } = carregar();
  const antiga = JSON.parse(JSON.stringify(Store.db));
  const quantos = antiga.clients.length;
  delete antiga.company.hours;
  antiga.company.openHour = 9; antiga.company.closeHour = 19; antiga.company.workdays = [1,2,3,4,5];

  memoria.set("nailagenda.db.v2", JSON.stringify(antiga));
  Store.load();
  assert.equal(Store.db.clients.length, quantos);
});

test("backup: exporta, restaura e confere o conteúdo", () => {
  const { Store } = carregar();
  const copia = JSON.parse(JSON.stringify(Store.db));
  const quantos = copia.clients.length;

  Store.db.clients.splice(1);                 // simula perda de dados
  assert.equal(Store.db.clients.length, 1);

  const r = Store.importAll(copia);
  assert.equal(r.ok, true);
  assert.equal(r.resumo.clientes, quantos);
  assert.equal(Store.db.clients.length, quantos);
});

test("backup inválido não encosta na base atual", () => {
  const { Store } = carregar();
  const quantos = Store.db.clients.length;

  for (const lixo of [null, "texto", [], {}, { company: {} }, { clients: [] }]) {
    const r = Store.importAll(lixo);
    assert.equal(r.ok, false, `deveria recusar: ${JSON.stringify(lixo)}`);
    assert.ok(r.erro.length > 0, "e explicar o motivo");
  }
  assert.equal(Store.db.clients.length, quantos, "base intacta");
});

test("save avisa quando o navegador recusa gravar", () => {
  const { Store, janela } = carregar();
  const avisos = [];
  janela.toast = (msg) => avisos.push(msg);
  janela.localStorage.setItem = () => { const e = new Error("quota exceeded"); e.name = "QuotaExceededError"; throw e; };

  assert.equal(Store.save(), false, "save informa a falha a quem chamou");
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Sem espaço|NÃO foi salvo/);
});

test("ciclo de manutenção: quem tem horário marcado sai da lista", () => {
  const { Store } = carregar();
  const vencidas = Store.dueForMaintenance();
  assert.ok(vencidas.length > 0, "o seed precisa ter clientes em atraso");

  const alvo = vencidas[0];
  assert.ok(alvo.daysOverdue >= 0);
  assert.ok(alvo.service.returnDays > 0, "só entra serviço com ciclo de retorno");

  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
  Store.upsert("appts", { clientId: alvo.client.id, proId: "pro_1",
    serviceId: alvo.service.id, start: em(iso(amanha), "10:00"),
    durationMin: 60, price: 100, status: "CONFIRMED" });

  const depois = Store.dueForMaintenance();
  assert.equal(depois.some((r) => r.client.id === alvo.client.id), false,
    "com horário futuro marcado, não é mais um retorno pendente");
});

test("senha da cliente: hash com sal próprio, nunca em texto puro", async () => {
  const { Store } = carregar();
  const c = Store.db.clients[0];
  await Store.setPassword(c, "segredo123");

  assert.ok(c.salt && c.salt.length >= 16);
  assert.ok(c.passwordHash && c.passwordHash.length === 64);
  assert.equal(JSON.stringify(c).includes("segredo123"), false, "a senha não fica gravada");
  assert.equal(await Store.checkPassword(c, "segredo123"), true);
  assert.equal(await Store.checkPassword(c, "segredo124"), false);

  const outra = Store.db.clients[1];
  await Store.setPassword(outra, "segredo123");
  assert.notEqual(c.passwordHash, outra.passwordHash, "senhas iguais geram hashes diferentes");
});

/* ---------------- Comanda, pacote, crédito ---------------- */

test("excluir comanda devolve pagamento, estoque, crédito e sessão", () => {
  const { Store } = carregar();
  const a = Store.db.appts.find(x => x.status !== "CANCELED");
  a.paid = true; a.paymentMethod = "CASH"; a.status = "DONE";
  const prod = Store.db.products[0]; const estoque = prod.stock;
  const cli = Store.byId("clients", a.clientId); cli.credit = 0;
  const cp = Store.upsert("clientPackages", { clientId: a.clientId, packageId: "pkg_1", name: "Pacote",
    services: [a.serviceId], total: 4, remaining: 2, expiresAt: null, createdAt: new Date().toISOString() });
  prod.stock -= 1;
  const o = Store.upsert("orders", { clientId: a.clientId, proId: a.proId, apptId: a.id, creditUsed: 30,
    total: 30, discount: 0, paymentMethod: "CREDIT", date: a.start, status: "CLOSED",
    items: [{ type: "product", refId: prod.id, name: prod.name, qty: 1, price: 30 },
            { type: "service", refId: a.serviceId, name: "s", qty: 1, price: 0, usarPacote: true, pacoteCliente: cp.id }] });

  assert.equal(Store.excluirComanda(o.id), true);
  assert.equal(Store.byId("orders", o.id), undefined);
  assert.equal(a.paid, false, "o atendimento volta a ficar em aberto");
  assert.equal(prod.stock, estoque, "o produto volta ao estoque");
  assert.equal(cli.credit, 30, "o crédito usado volta para ela");
  assert.equal(Store.byId("clientPackages", cp.id).remaining, 3, "a sessão volta para o pacote");
});

test("comanda fica ligada ao atendimento (não dá para fechar duas vezes)", () => {
  const { Store } = carregar();
  const a = Store.db.appts[0];
  assert.equal(Store.comandaDo(a.id), null);
  Store.upsert("orders", { clientId: a.clientId, proId: a.proId, apptId: a.id, items: [], total: 10,
    discount: 0, paymentMethod: "CASH", date: a.start, status: "CLOSED" });
  assert.ok(Store.comandaDo(a.id), "o apptId sobrevive à allowlist de campos");
});

test("pacote: só vale para os serviços incluídos, com saldo e dentro da validade", () => {
  const { Store } = carregar();
  const cli = Store.db.clients[0].id;
  const base = { clientId: cli, packageId: "p", name: "P", services: ["svc_A"], total: 4, createdAt: "x" };
  Store.upsert("clientPackages", { ...base, remaining: 2, expiresAt: null });
  Store.upsert("clientPackages", { ...base, remaining: 0, expiresAt: null });              // esgotado
  Store.upsert("clientPackages", { ...base, remaining: 3, expiresAt: "2000-01-01" });      // vencido

  assert.equal(Store.pacotesAtivos(cli, "svc_A").length, 1);
  assert.equal(Store.pacotesAtivos(cli, "svc_OUTRO").length, 0, "serviço fora do pacote");
});

test("começar do zero tira o exemplo e mantém a configuração", () => {
  const { Store } = carregar();
  const servicos = Store.db.services.length, mensagens = Store.db.messages.length;
  assert.equal(Store.ehDemonstracao(), true);

  const backup = Store.comecarDoZero();
  assert.ok(backup && backup.clients.length > 0, "devolve a base anterior como backup");
  for (const c of ["clients", "appts", "orders", "expenses", "charges", "clientPackages"])
    assert.equal(Store.db[c].length, 0, `${c} deveria ficar vazio`);
  assert.equal(Store.db.services.length, servicos, "serviços ficam");
  assert.equal(Store.db.messages.length, mensagens, "mensagens ficam");
  assert.ok(Store.db.company.hours, "horários ficam");
  assert.equal(Store.ehDemonstracao(), false, "não é mais demonstração");
});

test("começar do zero pode levar os serviços de exemplo junto", () => {
  const { Store } = carregar();
  Store.comecarDoZero({ manterServicos: false });
  assert.equal(Store.db.services.length, 0);
  assert.equal(Store.db.packages.length, 0);
});

test("atendimento com cadastro sumido não derruba a tela", () => {
  const { Store } = carregar();
  const v = Store.apptView({ id: "x", clientId: "nao_existe", serviceId: "nem_este", proId: "nem", start: new Date().toISOString(), durationMin: 60, price: 0 });
  assert.equal(typeof v.client.name, "string");
  assert.equal(typeof v.service.name, "string");
  assert.ok(v.pro, "profissional também tem um valor");
});

test("paleta de cores mora na base e aceita cor nova", () => {
  const { Store } = carregar();
  const antes = Store.cores.length;
  assert.ok(antes >= 12, "começa com a paleta padrão");
  const nova = Store.upsert("polishColors", { name: "Nude Rosé", hex: "#e8c1b8" });
  assert.equal(Store.cores.length, antes + 1);
  assert.equal(Store.polish(nova.id).name, "Nude Rosé");
});

test("dia local de uma data UTC: comanda das 21h30 é do mesmo dia", () => {
  const { Store, janela } = carregar();
  const Real = Date;
  janela.Date = class extends Real { getTimezoneOffset() { return 180; } };   // São Paulo
  // 21h30 de 30/09 em SP = 00h30 de 01/10 em UTC
  assert.equal(Store.diaLocal("2026-10-01T00:30:00.000Z"), "2026-09-30");
  assert.equal(Store.mesLocal("2026-10-01T00:30:00.000Z"), "2026-09", "e do mesmo mês");
});

test("cobrança vence sozinha quando passa da data", () => {
  const { Store } = carregar();
  const ontem = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const amanha = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  assert.equal(Store.situacaoCobranca({ status: "PENDING", dueDate: ontem }), "OVERDUE");
  assert.equal(Store.situacaoCobranca({ status: "PENDING", dueDate: amanha }), "PENDING");
  assert.equal(Store.situacaoCobranca({ status: "PAID", dueDate: ontem }), "PAID", "pago não vence");
});
