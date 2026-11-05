/* ============================================================
   nailagenda — Núcleo das regras de horário
   ------------------------------------------------------------
   Um arquivo só, usado pelos dois lados:
     • navegador  → <script src="assets/js/agenda-core.js">
     • servidor   → import "../assets/js/agenda-core.js"
   Os dois leem globalThis.AgendaCore.

   Foi extraído depois de a regra existir em duas cópias que
   divergiram (uma respeitava dia de folga, a outra não). Aqui não
   há estado global: toda função recebe o `estado` do ateliê.
   ============================================================ */
(function (raiz) {
  const toMin  = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const toTime = (v) => `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
  /* Fuso do ateliê. No navegador vale o do aparelho dela. No servidor (que
     roda em UTC) o Worker define globalThis.AGENDA_FUSO_MIN = 180 — São
     Paulo, sem horário de verão desde 2019. Sem isto, o servidor lia um
     horário das 09h como 12h e deixava marcar duas clientes às 09h. */
  const fuso = (ms) => typeof raiz.AGENDA_FUSO_MIN === "number"
    ? raiz.AGENDA_FUSO_MIN : new Date(ms).getTimezoneOffset();
  const local = (ms) => new Date(ms - fuso(ms) * 6e4);   // "relógio de parede" em UTC

  const iso  = (d) => local(d.getTime()).toISOString().slice(0, 10);

  /* `start` é gravado em UTC. Fatiar a string daria a hora de Greenwich —
     09:00 vira 12:00 aqui. Toda leitura de horário passa por estas duas. */
  const dia  = (isoStr) => iso(new Date(isoStr));
  const hora = (isoStr) => local(new Date(isoStr).getTime()).toISOString().slice(11, 16);

  /* Data + hora de parede → instante. Inverso de dia()/hora(). */
  function instante(data, horaTxt) {
    const [a, m, d] = data.split("-").map(Number);
    const bruto = Date.UTC(a, m - 1, d, +horaTxt.slice(0, 2), +horaTxt.slice(3, 5));
    return new Date(bruto + fuso(bruto) * 6e4);
  }
  /* Dia da semana de uma data (0 = domingo), sem depender de fuso. */
  const diaDaSemana = (data) => { const [a, m, d] = data.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };

  const ATIVO = (a) => a.status !== "CANCELED" && a.status !== "NO_SHOW";

  /* Janelas de trabalho do dia. Dois períodos descrevem o almoço. */
  function intervalos(estado, data) {
    const dow = diaDaSemana(data);
    const dias = (estado.company && estado.company.hours) || {};
    const lista = dias[dow] || dias[String(dow)];
    if (!lista) return [];
    return lista.map(([a, b]) => [toMin(a), toMin(b)]).filter(([a, b]) => b > a);
  }

  const abre = (estado, data) => intervalos(estado, data).length > 0;

  const bloqueiosDo = (estado, data) =>
    (estado.blocks || []).filter((b) => b.date === data);

  /* Cabe no expediente, fora de bloqueio e sem colidir? */
  function conferir(estado, { date, time, durationMin, ignoreId }) {
    if (!date || !time || !durationMin)
      return { ok: false, code: "dados", msg: "Informe data, horário e duração." };

    const ini = toMin(time), fim = ini + durationMin;

    if (!intervalos(estado, date).some(([a, b]) => ini >= a && fim <= b))
      return { ok: false, code: "hours", msg: "Fora do seu horário de trabalho desse dia." };

    const blq = bloqueiosDo(estado, date).find((b) => ini < toMin(b.end) && fim > toMin(b.start));
    if (blq)
      return { ok: false, code: "block",
        msg: `Período bloqueado: ${blq.reason || "sem motivo"} (${blq.start}–${blq.end}).` };

    const choque = (estado.appts || []).find((a) => {
      if (a.id === ignoreId || !ATIVO(a) || dia(a.start) !== date) return false;
      const s = toMin(hora(a.start));
      return ini < s + a.durationMin && fim > s;
    });
    if (choque) {
      const quem = (estado.clients || []).find((c) => c.id === choque.clientId);
      return { ok: false, code: "clash",
        msg: `Choca com ${(quem && quem.name) || "outra cliente"} às ${hora(choque.start)}.` };
    }
    return { ok: true };
  }

  /* Horários livres do dia. paraCliente aplica também as regras do
     agendamento online: antecedência mínima e limite de dias à frente. */
  function horarios(estado, { date, durationMin, ignoreId, paraCliente = false, agora = new Date() }) {
    const regras = (estado.company && estado.company.booking) || {};
    const passo = regras.slotMinutes || 30;
    const hoje = iso(agora);

    if (paraCliente) {
      if (date < hoje) return [];
      const limite = new Date(agora.getTime() + (regras.horizonDays == null ? 60 : regras.horizonDays) * 864e5);
      if (date > iso(limite)) return [];
    }
    const minimo = agora.getTime() +
      (paraCliente ? (regras.noticeHours == null ? 2 : regras.noticeHours) : 0) * 36e5;

    const livres = [];
    for (const [ini, fim] of intervalos(estado, date)) {
      for (let m = Math.ceil(ini / passo) * passo; m + durationMin <= fim; m += passo) {
        const quando = instante(date, toTime(m));
        if (quando.getTime() < minimo) continue;
        if (conferir(estado, { date, time: toTime(m), durationMin, ignoreId }).ok) livres.push(toTime(m));
      }
    }
    return livres;
  }

  /* A cliente ainda pode mexer neste horário sozinha? */
  function clientePodeAlterar(estado, appt, agora = new Date()) {
    if (!appt || !ATIVO(appt) || appt.status === "DONE") return false;
    const regras = (estado.company && estado.company.booking) || {};
    const prazo = regras.cancelHours == null ? 24 : regras.cancelHours;
    return new Date(appt.start).getTime() - agora.getTime() >= prazo * 36e5;
  }

  raiz.AgendaCore = {
    conferir, horarios, clientePodeAlterar,
    intervalos, bloqueiosDo, abre,
    dia, hora, iso, toMin, toTime, ATIVO, instante, diaDaSemana,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
