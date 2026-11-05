/* ============================================================
   SERENA — Solicitações de horário
   ------------------------------------------------------------
   O que a cliente marca sozinha entra como SCHEDULED e caía no meio da
   agenda sem nenhum destaque: a Marina só descobria abrindo o dia.
   Aqui elas ficam juntas, em ordem de urgência, com confirmar/recusar
   num toque e o WhatsApp já preenchido.
   ============================================================ */
(function () {
  const PENDENTE = (a) => a.status === "SCHEDULED" && a.source === "client";

  /* Fila de pendências. Separa o que ainda dá tempo de confirmar do que já
     passou — um pedido de ontem não se confirma, se resolve. */
  function fila() {
    const agora = new Date();
    const todas = Store.db.appts.filter(PENDENTE)
      .sort((a, b) => a.start.localeCompare(b.start));
    return {
      proximas: todas.filter((a) => new Date(a.start) >= agora),
      passadas: todas.filter((a) => new Date(a.start) < agora),
    };
  }

  function horasAte(iso) {
    const h = (new Date(iso) - new Date()) / 36e5;
    if (h < 0) return { txt: "já passou", urgente: true };
    if (h < 1) return { txt: "em menos de 1h", urgente: true };
    if (h < 24) return { txt: `em ${Math.round(h)}h`, urgente: h < 12 };
    return { txt: `em ${Math.round(h / 24)} dia${h >= 48 ? "s" : ""}`, urgente: false };
  }

  function cartao(a, passada) {
    const v = Store.apptView(a);
    const cli = v.client || {};
    const quando = horasAte(a.start);
    const conflito = Schedule.check({
      date: Schedule.day(a.start),
      time: Schedule.time(a.start),
      durationMin: a.durationMin,
      ignoreId: a.id,
    });

    const card = h(`<div class="card card-pad sol-card${quando.urgente && !passada ? " urgente" : ""}">
      <div class="row between gap-8" style="align-items:flex-start">
        <div class="row gap-8" style="min-width:0">
          ${avatar(cli.name || "?", "md")}
          <div style="min-width:0">
            <div class="bold clamp-2" style="font-size:14px">${esc(cli.name || "Cliente")}</div>
            <div class="tiny muted clamp-2">${esc((v.service || {}).name || "Serviço")} · ${a.durationMin} min · ${fmt.money(a.price)}</div>
          </div>
        </div>
        <span class="badge ${passada ? "b-gray" : quando.urgente ? "b-amber" : "b-violet"}">${quando.txt}</span>
      </div>

      <div class="sol-quando">${icon("calendar")} <b>${fmt.dateTime(a.start)}</b></div>

      ${conflito.ok ? "" : `<div class="sol-alerta">${icon("alert")} ${esc(conflito.msg)}</div>`}

      <div class="row gap-8 sol-acoes">
        ${passada
          ? `<button class="btn btn-sm btn-ghost grow" data-done>${icon("check")} Foi atendida</button>
             <button class="btn btn-sm btn-ghost grow" data-noshow>${icon("x")} Não veio</button>`
          : `<button class="btn btn-sm btn-primary grow" data-ok ${conflito.ok ? "" : "disabled"}>${icon("check")} Confirmar</button>
             <button class="btn btn-sm btn-ghost grow" data-no>${icon("x")} Recusar</button>`}
        <button class="btn btn-icon btn-sm btn-ghost" data-zap aria-label="Falar no WhatsApp">${icon("whatsapp")}</button>
      </div>
    </div>`);

    const mudar = (status, msg) => {
      a.status = status;
      Store.upsert("appts", a);
      rerender();
      toast(msg, "ok");
    };

    const q = (sel) => card.querySelector(sel);
    if (q("[data-ok]")) q("[data-ok]").onclick = () => {
      // revalida no clique: a agenda pode ter mudado desde que a tela abriu
      const r = Schedule.check({ date: Schedule.day(a.start), time: Schedule.time(a.start),
        durationMin: a.durationMin, ignoreId: a.id });
      if (!r.ok) { toast(r.msg + " Recuse ou remarque este pedido.", "err"); rerender(); return; }
      mudar("CONFIRMED", `Horário de ${(cli.name || "").split(" ")[0]} confirmado.`);
    };
    if (q("[data-no]")) q("[data-no]").onclick = () => Modal.confirm({
      title: "Recusar pedido", danger: true, confirmText: "Recusar",
      message: `Recusar o horário de <b>${esc(cli.name || "")}</b> em ${fmt.dateTime(a.start)}? Avise ela pelo WhatsApp depois.`,
      onConfirm: () => mudar("CANCELED", "Pedido recusado."),
    });
    if (q("[data-done]")) q("[data-done]").onclick = () => mudar("DONE", "Marcado como atendida.");
    if (q("[data-noshow]")) q("[data-noshow]").onclick = () => mudar("NO_SHOW", "Marcado como falta.");

    q("[data-zap]").onclick = () => {
      const nome = (cli.name || "").split(" ")[0];
      const txt = passada
        ? `Oi ${nome}! Vi seu pedido de horário para ${fmt.dateTime(a.start)}, mas não consegui confirmar a tempo. Quer que eu veja outro dia pra você?`
        : `Oi ${nome}! Recebi seu pedido de ${(v.service || {}).name} para ${fmt.dateTime(a.start)}. Está confirmado! 💛`;
      window.open(waLink(cli.phone, txt), "_blank");
    };
    return card;
  }

  function solicitacoes() {
    const { proximas, passadas } = fila();
    const el = h(`<div class="col" style="gap:18px"></div>`);

    if (!proximas.length && !passadas.length) {
      el.appendChild(h(`<div class="empty" style="padding:44px 20px">
        <div class="em-ic">${icon("check")}</div>
        <div class="bold" style="margin-top:10px">Nenhum pedido esperando</div>
        <p class="small muted" style="margin-top:6px;max-width:340px">
          Quando uma cliente marcar pelo portal, o pedido aparece aqui para você confirmar.
          ${Store.db.settings.autoConfirm
            ? "<br><br>Hoje a confirmação automática está <b>ligada</b> — os horários já entram confirmados na agenda."
            : ""}</p>
        <button class="btn btn-ghost btn-sm" style="margin-top:16px" onclick="go('agenda')">Ver a agenda</button>
      </div>`));
      return el;
    }

    if (proximas.length) {
      el.appendChild(h(`<div class="row between" style="align-items:baseline">
        <h3 style="font-size:15px">Esperando sua confirmação</h3>
        <span class="tiny faint">${proximas.length} pedido${proximas.length > 1 ? "s" : ""}</span>
      </div>`));
      const g = h(`<div class="sol-grid"></div>`);
      proximas.forEach((a) => g.appendChild(cartao(a, false)));
      el.appendChild(g);
    }

    if (passadas.length) {
      el.appendChild(h(`<div class="row between" style="align-items:baseline;margin-top:6px">
        <h3 style="font-size:15px">Já passaram da hora</h3>
        <span class="tiny faint">${passadas.length}</span>
      </div>`));
      el.appendChild(h(`<p class="small muted" style="margin-top:-8px">
        Não dá mais para confirmar. Registre o que aconteceu para o histórico não ficar torto.</p>`));
      const g = h(`<div class="sol-grid"></div>`);
      passadas.forEach((a) => g.appendChild(cartao(a, true)));
      el.appendChild(g);
    }
    return el;
  }

  window.Views = window.Views || {};
  Views.solicitacoes = solicitacoes;
  Views.pendentes = () => fila().proximas.length + fila().passadas.length;
})();
