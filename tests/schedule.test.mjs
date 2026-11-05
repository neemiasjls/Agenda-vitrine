/* Regras de horário. Cada teste aqui nasceu de um problema real
   encontrado na revisão: almoço ignorado, fuso trocado, dia de folga
   aceito na remarcação, e o horário dela mesma bloqueando a remarcação. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { carregar, agendaVazia, proximoDia, iso, em } from "./harness.mjs";

test("expediente: recusa horário fora da janela do dia", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  const terca = iso(proximoDia(2));                       // 09–12 e 13–19

  assert.equal(Schedule.check({ date: terca, time: "09:00", durationMin: 60 }).ok, true);
  assert.equal(Schedule.check({ date: terca, time: "07:00", durationMin: 60 }).code, "hours");
  assert.equal(Schedule.check({ date: terca, time: "18:30", durationMin: 60 }).code, "hours",
    "não pode terminar depois do fechamento");
});

test("intervalo de almoço não é horário de atendimento", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  const terca = iso(proximoDia(2));

  assert.equal(Schedule.check({ date: terca, time: "12:00", durationMin: 30 }).code, "hours");
  assert.equal(Schedule.check({ date: terca, time: "11:30", durationMin: 60 }).code, "hours",
    "não pode invadir o almoço");
  assert.equal(Schedule.check({ date: terca, time: "13:00", durationMin: 60 }).ok, true);
});

test("domingo é folga: nenhum horário e nenhuma vaga", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  const domingo = iso(proximoDia(0));

  assert.equal(Schedule.openDay(domingo), false);
  // o array vem de outro realm (vm): comparar o tamanho, nao a referencia
  assert.equal(Schedule.slots({ date: domingo, durationMin: 60 }).length, 0);
});

test("fuso: horário gravado em UTC é lido como hora local", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  const terca = iso(proximoDia(2));
  const gravado = em(terca, "09:00");           // vira ...T12:00Z em UTC-3

  assert.equal(Schedule.time(gravado), "09:00",
    "fatiar a string ISO daria a hora de Greenwich");
  assert.equal(Schedule.day(gravado), terca);
});

test("choque de horário é detectado, inclusive parcial", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  const terca = iso(proximoDia(2));
  Store.db.appts.push({ id: "a1", clientId: Store.db.clients[0].id, proId: "pro_1",
    serviceId: Store.db.services[0].id, start: em(terca, "10:00"), durationMin: 60,
    price: 100, status: "CONFIRMED" });

  assert.equal(Schedule.check({ date: terca, time: "10:00", durationMin: 60 }).code, "clash");
  assert.equal(Schedule.check({ date: terca, time: "10:30", durationMin: 60 }).code, "clash",
    "encavalar meia hora ainda é choque");
  assert.equal(Schedule.check({ date: terca, time: "09:30", durationMin: 30 }).ok, true,
    "termina exatamente quando o outro começa");
  assert.equal(Schedule.check({ date: terca, time: "11:00", durationMin: 60 }).ok, true);
});

test("cancelado e falta liberam o horário", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  const terca = iso(proximoDia(2));
  const base = { id: "a1", clientId: Store.db.clients[0].id, proId: "pro_1",
    serviceId: Store.db.services[0].id, start: em(terca, "10:00"), durationMin: 60, price: 100 };

  Store.db.appts.push({ ...base, status: "CANCELED" });
  assert.equal(Schedule.check({ date: terca, time: "10:00", durationMin: 60 }).ok, true);

  Store.db.appts[0].status = "NO_SHOW";
  assert.equal(Schedule.check({ date: terca, time: "10:00", durationMin: 60 }).ok, true);

  Store.db.appts[0].status = "CONFIRMED";
  assert.equal(Schedule.check({ date: terca, time: "10:00", durationMin: 60 }).code, "clash");
});

test("ignoreId: remarcar não pode esbarrar no próprio horário", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  const terca = iso(proximoDia(2));
  Store.db.appts.push({ id: "a1", clientId: Store.db.clients[0].id, proId: "pro_1",
    serviceId: Store.db.services[0].id, start: em(terca, "10:00"), durationMin: 60,
    price: 100, status: "CONFIRMED" });

  assert.equal(Schedule.check({ date: terca, time: "10:00", durationMin: 60 }).code, "clash");
  assert.equal(Schedule.check({ date: terca, time: "10:00", durationMin: 60, ignoreId: "a1" }).ok, true);
});

test("bloqueio esconde o período de todo mundo", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  const terca = iso(proximoDia(2));
  Store.upsert("blocks", { date: terca, start: "14:00", end: "16:00", reason: "Médico" });

  const r = Schedule.check({ date: terca, time: "14:30", durationMin: 30 });
  assert.equal(r.code, "block");
  assert.match(r.msg, /Médico/);
  assert.equal(Schedule.slots({ date: terca, durationMin: 60 }).includes("14:00"), false);
  assert.equal(Schedule.slots({ date: terca, durationMin: 60 }).includes("16:00"), true);
});

test("antecedência mínima vale para a cliente, não para a profissional", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  Store.db.company.booking.noticeHours = 4;

  const terca = proximoDia(2);
  const hoje = new Date(terca); hoje.setHours(9, 0, 0, 0);
  const dia = iso(terca);

  const dela  = Schedule.slots({ date: dia, durationMin: 60, now: hoje });
  const dela2 = Schedule.slots({ date: dia, durationMin: 60, forClient: true, now: hoje });

  assert.equal(dela[0], "09:00", "ela encaixa a qualquer hora");
  assert.equal(dela2[0], "13:00", "a cliente só a partir de 4h depois (e pulando o almoço)");
});

test("limite de dias à frente corta o agendamento online", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  Store.db.company.booking.horizonDays = 7;

  const longe = new Date(); longe.setDate(longe.getDate() + 30);
  const dia = iso(longe);

  assert.equal(Schedule.slots({ date: dia, durationMin: 60, forClient: true }).length, 0);
  assert.ok(Schedule.slots({ date: dia, durationMin: 60 }).length > 0 || !Schedule.openDay(dia),
    "para ela, o limite não se aplica");
});

test("prazo de cancelamento online", () => {
  const { Store, Schedule } = carregar();
  Store.db.company.booking.cancelHours = 24;
  const daqui = (h) => ({ status: "CONFIRMED", start: new Date(Date.now() + h * 36e5).toISOString() });

  assert.equal(Schedule.clientCanChange(daqui(48)), true);
  assert.equal(Schedule.clientCanChange(daqui(2)), false);
  assert.equal(Schedule.clientCanChange({ ...daqui(48), status: "CANCELED" }), false);
  assert.equal(Schedule.clientCanChange({ ...daqui(48), status: "DONE" }), false);
});

test("slots respeitam a duração do serviço", () => {
  const { Store, Schedule } = carregar();
  agendaVazia(Store);
  const terca = iso(proximoDia(2));

  const curtos = Schedule.slots({ date: terca, durationMin: 30 });
  const longos = Schedule.slots({ date: terca, durationMin: 180 });

  assert.ok(curtos.length > longos.length);
  assert.equal(longos.includes("11:00"), false, "3h às 11h passaria do almoço");
  assert.equal(longos.includes("09:00"), true, "9h–12h cabe antes do almoço");
});

test("hoje é o dia local, não o dia em UTC (21h30 não é amanhã)", () => {
  const { Store, janela } = carregar();
  // 21h30 de 23/09 em São Paulo = 00h30 de 24/09 em UTC
  const instante = Date.parse("2026-09-24T00:30:00Z");
  const Real = Date;
  class Parado extends Real {
    constructor(...a) { super(...(a.length ? a : [instante])); }
    static now() { return instante; }
    getTimezoneOffset() { return 180; }            // fuso de São Paulo, fixo
  }
  janela.Date = Parado;                             // o Store resolve Date aqui
  assert.equal(Store.todayISO(), "2026-09-23");
});
