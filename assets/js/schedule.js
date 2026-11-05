/* ============================================================
   nailagenda — Disponibilidade (adaptador do navegador)
   ------------------------------------------------------------
   As regras moram em agenda-core.js, que o servidor também usa.
   Aqui só ligamos o núcleo ao Store, para as telas continuarem
   chamando Schedule.slots(...) sem passar o estado a cada vez.
   ============================================================ */
(function () {
  const C = globalThis.AgendaCore;
  const estado = () => Store.db;

  window.Schedule = {
    intervals:  (data) => C.intervalos(estado(), data),
    blocksOn:   (data) => C.bloqueiosDo(estado(), data),
    openDay:    (data) => C.abre(estado(), data),
    check:      (args) => C.conferir(estado(), args),
    slots:      ({ date, durationMin, ignoreId, forClient = false, now = new Date() }) =>
                  C.horarios(estado(), { date, durationMin, ignoreId, paraCliente: forClient, agora: now }),
    clientCanChange: (appt, now = new Date()) => C.clientePodeAlterar(estado(), appt, now),

    day: C.dia, time: C.hora, iso: C.iso, toMin: C.toMin, toTime: C.toTime,

    /* Faixa de horas que cobre o expediente dos dias pedidos.
       Antes as telas liam company.openHour/closeHour, que sumiram quando
       o horário passou a ser por dia da semana: a grade ficava vazia. */
    hourRange(datas) {
      let ini = 24 * 60, fim = 0;
      for (const d of datas)
        for (const [a, b] of C.intervalos(estado(), d)) { ini = Math.min(ini, a); fim = Math.max(fim, b); }
      if (fim <= ini) return { de: 9, ate: 19 };            // semana toda fechada
      return { de: Math.floor(ini / 60), ate: Math.ceil(fim / 60) };
    },
  };
})();
