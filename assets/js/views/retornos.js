/* ============================================================
   nailagenda — Retornos (ciclo de manutenção)

   O motor de receita recorrente. Unha não gera faturamento por
   cliente nova: gera por cliente que volta a cada 15–21 dias.
   Esta tela existe para que ninguém passe do ponto em silêncio.
   ============================================================ */
window.Views = window.Views || {};

(function () {
  let filter = "all";   // all | atrasadas | semana

  Views.retornos = function () {
    const wrap = h(`<div class="col" style="gap:0"></div>`);

    // graceDays -7 traz também quem vence nos próximos 7 dias
    const all = Store.dueForMaintenance(-7);
    const atrasadas = all.filter(r => r.daysOverdue > 0);
    const chegando = all.filter(r => r.daysOverdue <= 0);
    const potencial = atrasadas.reduce((s, r) => s + (r.service.price || 0), 0);

    /* ---- Resumo ---- */
    wrap.appendChild(h(`<div class="stat-grid" style="margin-bottom:18px">
      ${[
        { lbl: "Passaram do ponto", val: atrasadas.length, ic: "alert", c: "var(--danger)" },
        { lbl: "Vencem em 7 dias", val: chegando.length, ic: "clock", c: "var(--warn)" },
        { lbl: "Receita a recuperar", val: fmt.money(potencial), ic: "dollar", c: "var(--accent)" },
      ].map(s => `<div class="stat">
        <div class="stat-ic" style="background:color-mix(in srgb, ${s.c} 13%, transparent);color:${s.c}">${icon(s.ic)}</div>
        <div class="lbl">${s.lbl}</div><div class="val">${s.val}</div></div>`).join("")}
    </div>`));

    if (!all.length) {
      wrap.appendChild(h(`<div class="card"><div class="empty">
        <div class="em-ic">${icon('check')}</div>
        <div class="bold">Ninguém em atraso</div>
        <p class="small muted" style="max-width:380px">Todas as clientes com ciclo de manutenção
        já têm horário marcado ou ainda estão dentro do prazo.</p></div></div>`));
      return wrap;
    }

    /* ---- Filtro ---- */
    const bar = h(`<div class="filterbar">
      <div class="seg">
        <button data-f="all" class="${filter==='all'?'active':''}">Todas (${all.length})</button>
        <button data-f="atrasadas" class="${filter==='atrasadas'?'active':''}">Atrasadas (${atrasadas.length})</button>
        <button data-f="semana" class="${filter==='semana'?'active':''}">Vencendo (${chegando.length})</button>
      </div>
      <div class="grow"></div>
      <button class="btn btn-sm btn-subtle" id="r-all">${icon('whatsapp')} Chamar todas as atrasadas</button>
    </div>`);
    bar.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { filter = b.dataset.f; rerender(); });
    bar.querySelector("#r-all").onclick = () => bulk(atrasadas);
    wrap.appendChild(bar);

    /* ---- Lista ---- */
    const list = filter === "atrasadas" ? atrasadas : filter === "semana" ? chegando : all;
    const card = h(`<div class="card"></div>`);

    list.forEach(r => {
      const pol = Store.polish(r.appt.polishId);
      const late = r.daysOverdue > 0;
      const badge = late
        ? `<span class="badge b-red">${r.daysOverdue}d de atraso</span>`
        : `<span class="badge b-amber">vence em ${Math.abs(r.daysOverdue)}d</span>`;

      const row = h(`<div class="lrow">
        <div class="work-thumb" title="${pol ? esc(pol.name) : 'Sem cor registrada'}">
          ${r.appt.photos && r.appt.photos.length
            ? `<img src="${esc(r.appt.photos[0])}" alt="Trabalho anterior de ${esc(r.client.name)}" />`
            : pol
              ? `<span class="unha" style="--c:${esc(pol.hex)}"></span>`
              : `<span class="faint">${icon('camera')}</span>`}
        </div>
        <div class="grow" style="min-width:0">
          <div class="row gap-8" style="gap:8px">
            <span class="bold truncate">${esc(r.client.name)}</span>
            <span class="hide-sm">${badge}</span>
          </div>
          <div class="tiny muted truncate" style="margin-top:2px">
            ${esc(r.service.name)} há ${Math.round((Date.now() - new Date(r.appt.start)) / 864e5)} dias${pol ? `, cor ${esc(pol.name)}` : ""}
          </div>
          <div class="mobile-only" style="margin-top:6px">${badge}</div>
        </div>
        <div class="row gap-6 nowrap">
          <button class="btn btn-sm btn-subtle" data-book title="Agendar retorno">${icon('calendar')}</button>
          <button class="btn btn-sm btn-accent" data-wa>${icon('whatsapp')}<span class="hide-sm">Chamar</span></button>
        </div>
      </div>`);

      row.querySelector("[data-wa]").onclick = () => single(r);
      row.querySelector("[data-book]").onclick = () => {
        go("agenda");
        toast(`Agende o retorno de ${r.client.name.split(" ")[0]}.`);
      };
      card.appendChild(row);
    });

    wrap.appendChild(card);
    return wrap;
  };

  /* ---- Monta a mensagem a partir do modelo "Hora da manutenção" ---- */
  function buildText(r) {
    const tpl = Store.db.messages.find(m => m.title === "Hora da manutenção" && m.active)
             || Store.db.messages.find(m => m.category === "Retorno" && m.active);
    const base = tpl ? tpl.body
      : "Oi #{cliente}! Já faz um tempinho desde o seu último #{servico}. Quer marcar sua manutenção?";
    return base
      .replace(/#\{cliente_completo\}/g, r.client.name)
      .replace(/#\{cliente\}/g, r.client.name.split(" ")[0])
      .replace(/#\{servico\}/g, r.service.name)
      .replace(/#\{valorTotal\}/g, fmt.money(r.service.price))
      .replace(/#\{profissional\}/g, Store.db.company.name)
      .replace(/#\{data_formato1\}/g, fmt.date(r.dueDate))
      .replace(/#\{[a-z_]+\}/g, "");
  }

  function single(r) {
    const text = buildText(r);
    Modal.open({
      title: "Chamar para manutenção",
      body: `<div class="row" style="gap:12px;margin-bottom:14px">
          ${avatar(r.client.name, "md")}
          <div><div class="bold">${esc(r.client.name)}</div>
          <div class="tiny muted">${fmt.phone(r.client.phone)}</div></div></div>
        <div class="field"><label>Mensagem</label>
          <textarea class="textarea" id="rt-msg" style="min-height:120px">${esc(text)}</textarea>
          <span class="hint">Você pode ajustar antes de enviar.</span></div>`,
      footer: `<button class="btn btn-ghost" data-c>Cancelar</button>
               <button class="btn btn-accent" data-go>${icon('whatsapp')} Abrir WhatsApp</button>`,
      onMount(m) {
        m.querySelector("[data-c]").onclick = Modal.close;
        m.querySelector("[data-go]").onclick = () => {
          const t = m.querySelector("#rt-msg").value;
          window.open(waLink(r.client.phone, t), "_blank");
          Modal.close();
        };
      }
    });
  }

  /* Abrir muitas abas de uma vez seria bloqueado pelo navegador e é
     desagradável. Aqui a lista vira uma fila: uma cliente por vez. */
  function bulk(list) {
    if (!list.length) { toast("Nenhuma cliente atrasada.", "err"); return; }
    let i = 0;
    const render = (m) => {
      const r = list[i];
      m.querySelector("#bk-body").innerHTML = `
        <div class="row between" style="margin-bottom:10px">
          <span class="chip">${i + 1} de ${list.length}</span>
          <span class="badge b-red">${r.daysOverdue}d de atraso</span></div>
        <div class="row" style="gap:12px;margin-bottom:12px">
          ${avatar(r.client.name, "md")}
          <div><div class="bold">${esc(r.client.name)}</div>
          <div class="tiny muted">${esc(r.service.name)} · ${fmt.phone(r.client.phone)}</div></div></div>
        <div class="field"><label>Mensagem</label>
          <textarea class="textarea" id="bk-msg" style="min-height:110px">${esc(buildText(r))}</textarea></div>`;
    };
    Modal.open({
      title: "Fila de retornos",
      body: `<div id="bk-body"></div>`,
      footer: `<button class="btn btn-ghost" data-skip>Pular</button>
               <button class="btn btn-accent" data-send>${icon('whatsapp')} Enviar e seguir</button>`,
      onMount(m) {
        render(m);
        const next = () => {
          i++;
          if (i >= list.length) { Modal.close(); toast("Fila concluída.", "ok"); return; }
          render(m);
        };
        m.querySelector("[data-skip]").onclick = next;
        m.querySelector("[data-send]").onclick = () => {
          window.open(waLink(list[i].client.phone, m.querySelector("#bk-msg").value), "_blank");
          next();
        };
      }
    });
  }
})();
