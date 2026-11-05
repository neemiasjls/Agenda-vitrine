/* ============================================================
   nailagenda — Agenda (dia / semana / mês), CRUD de agendamentos
   ============================================================ */
window.Views = window.Views || {};

(function () {
  let state = { mode: "week", anchor: new Date(), proFilter: "all" };

  const startOfWeek = (d) => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - x.getDay()); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const iso = (d) => { const x=new Date(d); x.setMinutes(x.getMinutes()-x.getTimezoneOffset()); return x.toISOString().slice(0,10); };
  /* Ela trabalha sozinha: filtro e campo de profissional só confundem.
     Aparecem de volta no dia em que houver mais alguém na equipe. */
  const atendentes = () => Store.db.professionals.filter(p => p.role !== "SECRETARY" && p.active !== false);
  const soUmaProfissional = () => atendentes().length <= 1;

  Views.agenda = function () {
    const db = Store.db;
    const wrap = h(`<div class="col" style="gap:0"></div>`);

    /* ---- Header + toolbar ---- */
    const days =
      state.mode === "month" ? diasDoMes(state.anchor)
    : state.mode === "week"  ? Array.from({length:7},(_,i)=>addDays(startOfWeek(state.anchor), i))
    :                          [new Date(state.anchor)];

    const rangeLabel =
      state.mode === "month" ? state.anchor.toLocaleDateString("pt-BR",{month:"long",year:"numeric"})
    : state.mode === "week"  ? `${days[0].toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})} — ${days[6].toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}`
    :                          days[0].toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});

    const head = h(`<div style="margin-bottom:18px">
      <div class="row between wrap" style="gap:14px">
        <div>
          <h1 style="font-size:24px">Agenda</h1>
          <p class="page-sub">Seus agendamentos, confirmações e horários.</p>
        </div>
        <div class="row gap-8 agenda-actions">
          <button class="btn btn-ghost btn-icon" id="prev" aria-label="Período anterior">${icon('chevL')}</button>
          <button class="btn btn-ghost" id="today">Hoje</button>
          <button class="btn btn-ghost btn-icon" id="next" aria-label="Próximo período">${icon('chevR')}</button>
          <button class="btn btn-primary" id="new-appt">${icon('plus')} Novo agendamento</button>
        </div>
      </div>
      <div class="cal-toolbar" style="margin-top:16px">
        <div class="seg">
          <button data-mode="day" class="${state.mode==='day'?'active':''}">Dia</button>
          <button data-mode="week" class="${state.mode==='week'?'active':''}">Semana</button>
          <button data-mode="month" class="${state.mode==='month'?'active':''}">Mês</button>
        </div>
        <div class="cap-first" style="font-family:var(--display);font-weight:700;font-size:15px">${rangeLabel}</div>
        <div class="grow"></div>
        ${soUmaProfissional() ? "" : `<select class="select" id="pro-filter" style="width:auto;min-width:190px">
          <option value="all">Todos os profissionais</option>
          ${db.professionals.filter(p=>p.role!=="SECRETARY").map(p=>`<option value="${p.id}" ${state.proFilter===p.id?'selected':''}>${esc(p.name)}</option>`).join("")}
        </select>`}
      </div>
    </div>`);
    wrap.appendChild(head);

    const andar = (n) => {
      if (state.mode === "month") {
        const x = new Date(state.anchor); x.setDate(1); x.setMonth(x.getMonth() + n); state.anchor = x;
      } else state.anchor = addDays(state.anchor, state.mode === "week" ? n * 7 : n);
      rerender();
    };
    head.querySelector("#prev").onclick = () => andar(-1);
    head.querySelector("#next").onclick = () => andar(1);
    head.querySelector("#today").onclick = () => { state.anchor = new Date(); rerender(); };
    head.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { state.mode = b.dataset.mode; rerender(); });
    const filtro = head.querySelector("#pro-filter");
    if (filtro) filtro.onchange = (e) => { state.proFilter = e.target.value; rerender(); };
    head.querySelector("#new-appt").onclick = () => apptForm(null, iso(state.anchor));

    /* ---- Resumo do período ---- */
    const inRange = db.appts.filter(a => days.some(d => iso(d) === Schedule.day(a.start)))
      .filter(a => state.proFilter === "all" || a.proId === state.proFilter);
    const done = inRange.filter(a=>a.status==="DONE");
    const summary = h(`<div class="stat-grid" style="margin-bottom:18px">
      ${[
        {lbl:"Agendamentos", val:inRange.filter(a=>a.status!=="CANCELED").length, ic:"calendar", c:"var(--brand-500)"},
        {lbl:"Confirmados", val:inRange.filter(a=>a.status==="CONFIRMED").length, ic:"check", c:"var(--accent)"},
        {lbl:"Atendidos", val:done.length, ic:"star", c:"var(--gold)"},
        {lbl:"Receita prevista", val:fmt.money(inRange.filter(a=>a.status!=="CANCELED"&&a.status!=="NO_SHOW").reduce((s,a)=>s+(a.price||0),0)), ic:"dollar", c:"var(--accent)"},
      ].map(s=>`<div class="stat"><div class="stat-ic" style="background:color-mix(in srgb, ${s.c} 13%, transparent);color:${s.c}">${icon(s.ic)}</div>
        <div class="lbl">${s.lbl}</div><div class="val">${s.val}</div></div>`).join("")}
    </div>`);
    wrap.appendChild(summary);

    /* ---- Grade ---- */
    const isMobile = window.innerWidth < 760;
    if (state.mode === "month") wrap.appendChild(monthGrid(state.anchor, inRange));
    else if (isMobile || state.mode === "day") wrap.appendChild(dayList(days, inRange));
    else wrap.appendChild(weekGrid(days, inRange));

    return wrap;
  };

  /* Todos os dias do mês da data dada. */
  function diasDoMes(ref) {
    const ini = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const qtd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    return Array.from({ length: qtd }, (_, i) => new Date(ini.getFullYear(), ini.getMonth(), i + 1));
  }

  /* ---- Grade mensal ----
     Serve para enxergar o mês de longe: onde está cheio, onde sobra vaga
     e quando ela tirou folga. Não mostra horário a horário — para isso
     um toque no dia leva para a visão do dia. */
  function monthGrid(ref, appts) {
    const ano = ref.getFullYear(), mes = ref.getMonth();
    const primeiro = new Date(ano, mes, 1);
    const vazios = primeiro.getDay();
    const qtd = new Date(ano, mes + 1, 0).getDate();
    const hoje = Store.todayISO();

    const porDia = {};
    appts.forEach(a => { const k = Schedule.day(a.start); (porDia[k] = porDia[k] || []).push(a); });

    const el = h(`<div class="card" style="padding:14px">
      <div class="mes-dows">${["dom","seg","ter","qua","qui","sex","sáb"].map(d=>`<span>${d}</span>`).join("")}</div>
      <div class="mes-grid" id="mes-grid"></div>
      <div class="mes-legenda">
        <span><i style="background:var(--accent)"></i> confirmado</span>
        <span><i style="background:var(--brand-500)"></i> agendado</span>
        <span><i style="background:var(--muted)"></i> atendido</span>
        <span><i style="background:var(--line)"></i> fechado</span>
      </div>
    </div>`);

    const grade = el.querySelector("#mes-grid");
    for (let i = 0; i < vazios; i++) grade.appendChild(h(`<span class="mes-vazio"></span>`));

    for (let d = 1; d <= qtd; d++) {
      const data = new Date(ano, mes, d);
      const ds = iso(data);
      const doDia = (porDia[ds] || []).filter(a => a.status !== "CANCELED")
        .sort((a, b) => a.start.localeCompare(b.start));
      const aberto = Schedule.openDay(ds);
      const bloqueios = Schedule.blocksOn(ds).length;
      const receita = doDia.reduce((t, a) => t + (a.price || 0), 0);

      const cel = h(`<button class="mes-dia${aberto ? "" : " fechado"}${ds === hoje ? " hoje" : ""}"
        data-d="${ds}" aria-label="${data.toLocaleDateString("pt-BR",{day:"numeric",month:"long"})}, ${doDia.length} atendimento(s)">
        <span class="mes-num">${d}</span>
        ${bloqueios ? `<span class="mes-bloq" title="Tem bloqueio">•</span>` : ""}
        <span class="mes-pontos">${doDia.slice(0, 4).map(a =>
          `<i class="${a.status === "CONFIRMED" ? "c" : a.status === "DONE" ? "f" : "s"}"></i>`).join("")}
          ${doDia.length > 4 ? `<em>+${doDia.length - 4}</em>` : ""}</span>
        ${receita ? `<span class="mes-valor">${fmt.money0(receita)}</span>` : ""}
      </button>`);
      cel.onclick = () => { state.mode = "day"; state.anchor = data; rerender(); };
      grade.appendChild(cel);
    }
    return el;
  }

  /* ---- Grade semanal ----
     Estrutura: cabeçalho (uma linha) e corpo (hora × dia), um embaixo do
     outro. Os agendamentos e bloqueios são desenhados dentro da célula da
     hora em que começam, com altura proporcional à duração, e ficam por
     cima das células seguintes (z-index) para que o clique chegue neles
     e não na célula vazia de baixo. */
  function weekGrid(days, appts) {
    const datas = days.map(iso);
    const todayStr = Store.todayISO();

    /* Cancelado sai da grade: ocupava o espaço de um horário que já está
       livre e, quando alguém marcava no lugar, os dois ficavam um em cima
       do outro. Continua visível na lista do dia. */
    const visiveis = appts.filter(a => a.status !== "CANCELED");

    /* Faixa de horas: o expediente da semana, esticado para caber qualquer
       encaixe fora do horário. Antes o encaixe das 20h simplesmente sumia
       da semana — estava gravado, mas não aparecia. */
    let { de: open, ate: close } = Schedule.hourRange(datas);
    for (const a of visiveis) {
      const ini = new Date(a.start);
      const fim = new Date(ini.getTime() + a.durationMin * 6e4);
      open = Math.min(open, ini.getHours());
      close = Math.max(close, fim.getMinutes() ? fim.getHours() + 1 : fim.getHours());
    }
    for (const d of datas) for (const b of Schedule.blocksOn(d)) {
      open = Math.min(open, +b.start.slice(0, 2));
      close = Math.max(close, Math.ceil(Schedule.toMin(b.end) / 60));
    }
    close = Math.min(24, Math.max(close, open + 1));
    const hours = Array.from({ length: close - open }, (_, i) => open + i);

    const grid = h(`<div class="cal-grid"></div>`);
    grid.appendChild(h(`<div class="cal-week" style="--days:${days.length}">
      <div class="cal-head-cell cal-gutter"></div>
      ${days.map(d => `<div class="cal-head-cell${iso(d) === todayStr ? " today" : ""}${Schedule.openDay(iso(d)) ? "" : " fechado"}">
        <div class="dow">${d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</div>
        <div class="dnum">${d.getDate()}</div></div>`).join("")}
    </div>`));

    const body = h(`<div class="cal-body" style="--days:${days.length}"></div>`);
    const celula = {};                                   // "data|hora" → elemento
    hours.forEach(hr => {
      body.appendChild(h(`<div class="cal-hour-label">${String(hr).padStart(2, "0")}:00</div>`));
      datas.forEach(ds => {
        /* Hora sem expediente (almoço, domingo, depois do fechamento) fica
           sombreada. Continua clicável: encaixar é decisão dela. */
        const ini = hr * 60, fim = ini + 60;
        const trabalha = Schedule.intervals(ds).some(([a, b]) => ini < b && fim > a);
        const cell = h(`<div class="cal-cell${trabalha ? "" : " off"}" data-date="${ds}" data-hour="${hr}"></div>`);
        cell.onclick = (e) => { if (e.target === cell) apptForm(null, ds, hr); };
        body.appendChild(cell);
        celula[ds + "|" + hr] = cell;
      });
    });
    grid.appendChild(body);

    const ALTURA = 56;                                   // px por hora (igual ao CSS)

    /* Bloqueios: faixa listrada, atrás dos agendamentos. */
    for (const ds of datas) for (const b of Schedule.blocksOn(ds)) {
      const hr = +b.start.slice(0, 2);
      const cell = celula[ds + "|" + hr]; if (!cell) continue;
      const dur = Schedule.toMin(b.end) - Schedule.toMin(b.start);
      const el = h(`<div class="cal-block" title="${esc(b.reason || "Bloqueado")} · ${b.start}–${b.end}"
        style="top:${(+b.start.slice(3, 5) / 60) * 100}%;height:${Math.max(18, dur / 60 * ALTURA - 2)}px">
        <span class="truncate">${esc(b.reason || "Bloqueado")}</span></div>`);
      el.onclick = (e) => { e.stopPropagation(); toast(`${b.reason || "Bloqueado"} · ${b.start}–${b.end}`); };
      cell.appendChild(el);
    }

    /* Agendamentos. Dois no mesmo horário (encaixe, dado antigo) ficam lado
       a lado em vez de um cobrir o outro — e cada um continua clicável. */
    for (const ds of datas) {
      const doDia = visiveis.filter(a => Schedule.day(a.start) === ds)
        .map(a => { const i = new Date(a.start).getTime(); return { a, i, f: i + a.durationMin * 6e4 }; })
        .sort((x, y) => x.i - y.i || y.f - x.f);

      // agrupa quem se sobrepõe e distribui em pistas
      let grupo = [], fimGrupo = -Infinity;
      const fechar = () => {
        const pistas = [];
        for (const it of grupo) {
          let p = pistas.findIndex(fim => fim <= it.i);
          if (p < 0) { p = pistas.length; pistas.push(0); }
          pistas[p] = it.f; it.pista = p;
        }
        for (const it of grupo) it.total = pistas.length;
        grupo = []; fimGrupo = -Infinity;
      };
      for (const it of doDia) {
        if (it.i >= fimGrupo && grupo.length) fechar();
        grupo.push(it); fimGrupo = Math.max(fimGrupo, it.f);
      }
      if (grupo.length) fechar();

      for (const { a, pista, total } of doDia) {
        const ini = new Date(a.start);
        const cell = celula[ds + "|" + ini.getHours()]; if (!cell) continue;
        const v = Store.apptView(a);
        const larg = 100 / total;
        const cor = (a.polishId && Store.polish(a.polishId)) || Store.ultimaCorDa(a.clientId, a.id);
        const chip = h(`<div class="appt st-${a.status.toLowerCase()}" role="button" tabindex="0"
            style="top:${(ini.getMinutes() / 60) * 100}%;height:${Math.max(22, a.durationMin / 60 * ALTURA - 3)}px;
                   left:calc(${pista * larg}% + 2px);width:calc(${larg}% - 4px)"
            title="${esc(v.client.name)} · ${esc(v.service.name)} · ${fmt.time(a.start)}">
            ${cor ? `<span class="unha a-unha" style="--c:${esc(cor.hex)}" aria-hidden="true"></span>` : ""}
            <div class="a-cli truncate">${fmt.time(a.start)} ${esc(v.client.name.split(" ")[0])}</div>
            <div class="a-svc truncate">${esc(v.service.name)}</div></div>`);
        const abrir = (e) => { e.stopPropagation(); apptDetail(a.id); };
        chip.onclick = abrir;
        chip.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(e); } };
        cell.appendChild(chip);
      }
    }

    /* Linha do agora, só na coluna de hoje. */
    const agora = new Date();
    const cellAgora = celula[todayStr + "|" + agora.getHours()];
    if (cellAgora) cellAgora.appendChild(h(`<div class="cal-agora" style="top:${agora.getMinutes() / 60 * 100}%"></div>`));

    return grid;
  }

  /* ---- Lista por dia (mobile / modo dia) ---- */
  function dayList(days, appts) {
    const wrap = h(`<div class="col" style="gap:20px"></div>`);
    days.forEach(d => {
      const key = iso(d);
      /* Cancelados vão para o fim: continuam no registro do dia, mas não
         disputam atenção com quem vai de fato sentar na cadeira. */
      const list = appts.filter(a => Schedule.day(a.start) === key)
        .sort((a,b) => (a.status === "CANCELED") - (b.status === "CANCELED") || a.start.localeCompare(b.start));
      const bloqueiosDoDia = Schedule.blocksOn(key);
      const fechado = !Schedule.openDay(key);
      const card = h(`<div>
        <div class="row between" style="margin-bottom:10px">
          <div class="cap-first" style="font-family:var(--display);font-weight:700">
            ${d.toLocaleDateString("pt-BR",{weekday:"long", day:"2-digit", month:"short"})}
            ${key===Store.todayISO()?'<span class="badge b-violet" style="margin-left:8px">hoje</span>':''}</div>
          <button class="btn btn-sm btn-ghost" data-add>${icon('plus')}</button>
        </div>
        <div data-list></div></div>`);
      card.querySelector("[data-add]").onclick = () => apptForm(null, key);
      const l = card.querySelector("[data-list]");
      bloqueiosDoDia.forEach(b => l.appendChild(h(`<div class="day-appt day-block">
          <div class="time">${b.start}</div><div class="bar"></div>
          <div class="grow" style="min-width:0"><div class="bold truncate">${esc(b.reason || "Bloqueado")}</div>
          <div class="tiny muted">Bloqueado até ${b.end}</div></div></div>`)));
      if (!list.length && !bloqueiosDoDia.length)
        l.appendChild(h(`<div class="card card-pad center muted small">${fechado ? "Dia sem expediente." : "Nenhum agendamento."}</div>`));
      list.forEach(a => {
        const v = Store.apptView(a); const st = Store.APPT_STATUS[a.status];
        const cor = (a.polishId && Store.polish(a.polishId)) || Store.ultimaCorDa(a.clientId, a.id);
        const row = h(`<div class="day-appt clickable st-${a.status.toLowerCase()}">
          <div class="time">${fmt.time(a.start)}</div>
          <span class="unha${cor ? "" : " vazia"}"${cor ? ` style="--c:${esc(cor.hex)}"` : ""} title="${cor ? esc(cor.name) : "Sem cor registrada"}"></span>
          <div class="grow" style="min-width:0">
            <div class="bold truncate">${esc(v.client.name)}</div>
            <div class="tiny muted truncate">${esc(v.service.name)}, ${a.durationMin} min${soUmaProfissional() ? "" : ", " + esc(v.pro.name)}</div>
          </div>
          <div class="col" style="align-items:flex-end;gap:4px">
            <span class="badge ${st.cls}">${st.label}</span>
            <span class="tiny bold">${fmt.money(a.price)}</span>
          </div></div>`);
        row.onclick = () => apptDetail(a.id);
        l.appendChild(row);
      });
      wrap.appendChild(card);
    });
    return wrap;
  }

  /* ---- Detalhe do agendamento ---- */
  function apptDetail(id) {
    const a = Store.byId("appts", id); if (!a) return;
    const v = Store.apptView(a); const st = Store.APPT_STATUS[a.status];
    const comanda = Store.comandaDo(a.id);
    const cor = Store.polish(a.polishId);
    const statusOpts = Object.values(Store.APPT_STATUS);

    Modal.open({
      title: "Detalhes do agendamento",
      body: `<div class="col" style="gap:18px">
        <div class="row" style="gap:14px">
          ${avatar(v.client.name,'lg')}
          <div class="grow">
            <div style="font-family:var(--display);font-weight:700;font-size:17px">${esc(v.client.name)}</div>
            <div class="small muted">${fmt.phone(v.client.phone)}</div>
          </div>
          <span class="badge ${st.cls}">${st.label}</span>
        </div>
        <div class="divider" style="margin:0"></div>
        <div class="form-grid">
          <div><div class="tiny faint bold">SERVIÇO</div><div class="bold">${esc(v.service.name)}</div></div>
          ${soUmaProfissional() ? "" : `<div><div class="tiny faint bold">PROFISSIONAL</div><div class="bold">${esc(v.pro.name)}</div></div>`}
          <div><div class="tiny faint bold">DATA E HORA</div><div class="bold">${fmt.dateTime(a.start)}</div></div>
          <div><div class="tiny faint bold">DURAÇÃO</div><div class="bold">${a.durationMin} minutos</div></div>
          <div><div class="tiny faint bold">VALOR</div><div class="bold">${fmt.money(a.price)}</div></div>
          <div><div class="tiny faint bold">PAGAMENTO</div><div class="bold">${a.paid?Store.pmName(a.paymentMethod):'<span class="muted">Em aberto</span>'}</div></div>
          <div><div class="tiny faint bold">COR USADA</div><div class="bold row gap-6">${cor
            ? `<span class="swatch sm" style="background:${cor.hex}"></span>${esc(cor.name)}`
            : '<span class="muted">Não registrada</span>'}</div></div>
          ${a.notes?`<div class="full"><div class="tiny faint bold">OBSERVAÇÕES</div><div>${esc(a.notes)}</div></div>`:''}
        </div>
        <div class="field"><label>Alterar situação</label>
          <select class="select" id="st-sel">${statusOpts.map(s=>`<option value="${s.id}" ${a.status===s.id?'selected':''}>${s.label}</option>`).join("")}</select></div>
        <div class="row gap-8 wrap">
          <button class="btn btn-sm btn-accent" id="wa">${icon('whatsapp')} Enviar WhatsApp</button>
          <button class="btn btn-sm btn-ghost" id="edit">${icon('edit')} Editar</button>
          ${comanda
            ? `<button class="btn btn-sm btn-ghost" id="checkout">${icon('receipt')} Ver comanda · ${fmt.money(comanda.total)}</button>`
            : a.status === "CANCELED" || a.status === "NO_SHOW" ? ""
            : `<button class="btn btn-sm btn-primary" id="checkout">${icon('receipt')} Fechar atendimento</button>`}
          <button class="btn btn-sm btn-ghost" id="cor">${icon('swatch')} ${cor ? "Trocar cor" : "Registrar cor"}</button>
          <button class="btn btn-sm btn-danger" id="del">${icon('trash')} Excluir</button>
        </div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-close2>Fechar</button><button class="btn btn-primary" id="save-st">Salvar situação</button>`,
      onMount(m) {
        m.querySelector("[data-close2]").onclick = Modal.close;
        m.querySelector("#save-st").onclick = () => {
          const nova = m.querySelector("#st-sel").value;
          /* Cancelou a Ana das 10h, marcou a Bruna no lugar, depois reativou
             a Ana: sem esta checagem as duas ficavam no mesmo horário. */
          const estavaLivre = a.status === "CANCELED" || a.status === "NO_SHOW";
          const vaiOcupar = nova !== "CANCELED" && nova !== "NO_SHOW";
          if (estavaLivre && vaiOcupar) {
            const r = Schedule.check({ date: Schedule.day(a.start), time: Schedule.time(a.start),
              durationMin: a.durationMin, ignoreId: a.id });
            if (!r.ok && r.code === "clash") { toast(r.msg + " Remarque antes de reativar.", "err"); return; }
          }
          a.status = nova;
          Store.upsert("appts", a); Modal.close(); rerender(); toast("Situação atualizada.", "ok");
        };
        m.querySelector("#wa").onclick = () => {
          Modal.close(); Views.pickMessageFor(v);
        };
        m.querySelector("#edit").onclick = () => { Modal.close(); apptForm(a); };
        const btnCheckout = m.querySelector("#checkout");
        if (btnCheckout) btnCheckout.onclick = () => { Modal.close(); Views.checkoutFromAppt(a); };
        /* Registrar a cor sem precisar fechar comanda: às vezes ela lembra
           depois, ou a cliente pagou por fora. */
        m.querySelector("#cor").onclick = () => {
          Modal.open({ title: "Cor usada", body: `<div id="cor-host"></div>`,
            footer: `<button class="btn btn-ghost" data-c>Cancelar</button><button class="btn btn-primary" data-ok>Salvar</button>`,
            onMount(mm) {
              let escolha = a.polishId || null;
              Views.seletorDeCor(mm.querySelector("#cor-host"), escolha, c => { escolha = c; },
                { clienteId: a.clientId, ignorarId: a.id });
              mm.querySelector("[data-c]").onclick = () => apptDetail(a.id);
              mm.querySelector("[data-ok]").onclick = () => {
                a.polishId = escolha; Store.upsert("appts", a); toast("Cor registrada.", "ok"); rerender(); apptDetail(a.id);
              };
            } });
        };
        m.querySelector("#del").onclick = () => {
          if (comanda) { toast("Este atendimento tem comanda fechada. Exclua a comanda em Atendimentos antes.", "err"); return; }
          Modal.confirm({ title:"Excluir agendamento", message:"Tem certeza que deseja excluir? Se ela só desmarcou, prefira mudar a situação para Cancelado — assim fica no histórico.", danger:true, confirmText:"Excluir",
            onConfirm(){ Store.remove("appts", a.id); rerender(); toast("Agendamento excluído.","ok"); }});
        };
      }
    });
  }

  /* ---- Formulário de agendamento ---- */
  function apptForm(existing, dateStr, hour, preset) {
    const db = Store.db;
    preset = preset || {};
    if (!existing && !db.services.some(s => s.active)) {
      Modal.open({
        title: "Falta cadastrar um serviço", size: "sm",
        body: `<p class="small" style="line-height:1.6">Cada horário na agenda é de um procedimento — é ele
          que diz quanto tempo ocupa e quanto custa. Cadastre pelo menos um para começar a agendar.</p>`,
        footer: `<button class="btn btn-ghost" data-c>Agora não</button>
                 <button class="btn btn-primary" data-ir>Cadastrar serviço</button>`,
        onMount(m) {
          m.querySelector("[data-c]").onclick = Modal.close;
          m.querySelector("[data-ir]").onclick = () => { Modal.close(); go("servicos"); };
        }
      });
      return;
    }
    const a = existing || preset;
    const d = existing ? new Date(existing.start) : null;
    const dateVal = existing ? Schedule.day(existing.start) : (dateStr || Store.todayISO());
    const timeVal = existing ? `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
                             : (hour!=null ? `${String(hour).padStart(2,"0")}:00` : "09:00");

    Modal.open({
      title: existing ? "Editar agendamento" : "Novo agendamento",
      body: `<div class="col" style="gap:16px">
        <div class="field"><label>Cliente *</label>
          <select class="select" id="f-cli">
            <option value="">Selecione um cliente...</option>
            ${db.clients.slice().sort((x,y)=>x.name.localeCompare(y.name)).map(c=>`<option value="${c.id}" ${a.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join("")}
          </select>
          <span class="hint">Não encontrou? <a href="#" id="quick-cli" style="color:var(--brand-600);font-weight:600">Cadastrar novo cliente</a></span>
        </div>
        <div class="form-grid">
          <div class="field"><label>Serviço *</label>
            <select class="select" id="f-svc">${db.services.filter(s=>s.active || s.id===a.serviceId).map(s=>`<option value="${s.id}" ${a.serviceId===s.id?'selected':''}>${esc(s.name)} — ${fmt.money(s.price)}${s.active?"":" (inativo)"}</option>`).join("")}</select></div>
          <div class="field"${soUmaProfissional() ? ' hidden' : ''}><label>Profissional *</label>
            <select class="select" id="f-pro">${atendentes().map(p=>`<option value="${p.id}" ${a.proId===p.id?'selected':''}>${esc(p.name)}</option>`).join("")}</select></div>
          <div class="field"><label>Data *</label><input class="input" type="date" id="f-date" value="${dateVal}" /></div>
          <div class="field"><label>Horário *</label><input class="input" type="time" id="f-time" value="${timeVal}" step="300" /></div>
          <div class="field"><label>Duração (min)</label><input class="input" type="number" id="f-dur" value="${a.durationMin||60}" min="5" max="720" step="5" /></div>
          <div class="field"><label>Valor</label><input class="input" type="number" id="f-price" value="${a.price!=null?a.price:''}" step="0.01" /></div>
        </div>
        <div class="field"><label>Observações</label>
          <textarea class="textarea" id="f-notes" placeholder="Preferências, alergias, detalhes do atendimento...">${esc(a.notes||"")}</textarea></div>
        <div class="row" style="gap:10px;padding:12px;background:var(--surface-2);border-radius:12px;border:1px solid var(--line)">
          <span class="switch"><input type="checkbox" id="f-confirm" ${a.status==="CONFIRMED"?"checked":""} /><span class="track"></span><span class="thumb"></span></span>
          <div><div style="font-weight:600;font-size:13px">Marcar como confirmado</div>
          <div class="tiny muted">A cliente já confirmou presença.</div></div>
        </div>
        <div id="conflict"></div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancelar</button>
               <button class="btn btn-primary" data-save>${existing?"Salvar alterações":"Agendar"}</button>`,
      onMount(m) {
        const svcSel = m.querySelector("#f-svc");
        const sync = () => {
          const s = Store.byId("services", svcSel.value);
          if (s) { m.querySelector("#f-dur").value = s.duration; if (!existing) m.querySelector("#f-price").value = s.price; }
        };
        if (!existing) sync();
        if (!existing && preset.price != null) m.querySelector("#f-price").value = preset.price;
        svcSel.onchange = sync;

        /* Cadastrar a cliente no meio do agendamento: antes voltava para o
           formulário em branco, e ela tinha de achar o nome na lista. */
        /* Com uma cliente já escolhida (vindo da ficha), a lista de nomes
           não precisa ser o primeiro campo a pedir atenção. */
        if (preset.clientId) m.querySelector("#f-cli").value = preset.clientId;
        m.querySelector("#quick-cli").onclick = (e) => {
          e.preventDefault();
          const rascunho = {
            date: m.querySelector("#f-date").value, time: m.querySelector("#f-time").value,
            svc: m.querySelector("#f-svc").value, notes: m.querySelector("#f-notes").value,
          };
          const antes = new Set(Store.db.clients.map(c => c.id));
          Modal.close();
          Views.clientForm(null, () => {
            const nova = Store.db.clients.find(c => !antes.has(c.id));
            apptForm(existing, rascunho.date, null);
            const f = document.querySelector(".modal");
            if (!f) return;
            if (nova) f.querySelector("#f-cli").value = nova.id;
            if (rascunho.time) f.querySelector("#f-time").value = rascunho.time;
            if (rascunho.svc) { f.querySelector("#f-svc").value = rascunho.svc; f.querySelector("#f-svc").dispatchEvent(new Event("change")); }
            if (rascunho.notes) f.querySelector("#f-notes").value = rascunho.notes;
          });
        };
        m.querySelector("[data-cancel]").onclick = Modal.close;

        /* Validação do horário. Antes isto só desenhava um aviso e o botão
           Salvar gravava mesmo assim — dava para marcar duas clientes no
           mesmo horário sem perceber. Agora choque de horário barra de vez;
           fora do expediente e bloqueio pedem confirmação, porque a agenda
           é dela e encaixar alguém fora do horário é decisão legítima. */
        const avaliar = () => Schedule.check({
          date: m.querySelector("#f-date").value,
          time: m.querySelector("#f-time").value,
          durationMin: +m.querySelector("#f-dur").value || 60,
          ignoreId: existing && existing.id,
        });
        const pintarAviso = () => {
          const box = m.querySelector("#conflict");
          const d = m.querySelector("#f-date").value, t = m.querySelector("#f-time").value;
          if (!d || !t) { box.innerHTML = ""; return; }
          const r = avaliar();
          if (r.ok) { box.innerHTML = ""; return; }
          const bloqueia = r.code === "clash";
          box.innerHTML = `<div class="row" style="gap:10px;padding:12px;border-radius:12px;
            background:var(--${bloqueia ? "danger" : "warn"}-soft);color:var(--${bloqueia ? "danger" : "warn"})">
            ${icon("alert")}<div class="small"><b>${bloqueia ? "Conflito de horário" : "Fora do previsto"}</b><br>${esc(r.msg)}${
              bloqueia ? "" : "<br>Dá para salvar assim mesmo — vamos confirmar."}</div></div>`;
        };
        const resetarBotao = () => {
          const b = m.querySelector("[data-save]");
          if (b && b.dataset.confirmar === "1") {
            delete b.dataset.confirmar;
            b.textContent = existing ? "Salvar alterações" : "Agendar";
            b.classList.remove("btn-warn");
          }
        };
        ["#f-date","#f-time","#f-dur","#f-svc"].forEach(sel => {
          const el = m.querySelector(sel);
          if (el) ["change","input"].forEach(ev => el.addEventListener(ev, () => { pintarAviso(); resetarBotao(); }));
        });
        pintarAviso();

        m.querySelector("[data-save]").onclick = () => {
          const clientId = m.querySelector("#f-cli").value;
          if (!clientId) { toast("Selecione um cliente para continuar.", "err"); return; }
          const date = m.querySelector("#f-date").value, time = m.querySelector("#f-time").value;
          if (!date || !time) { toast("Informe data e horário.", "err"); return; }
          const dur = +m.querySelector("#f-dur").value;
          if (!(dur >= 5 && dur <= 720)) { toast("Duração entre 5 minutos e 12 horas.", "err"); return; }
          const preco = +m.querySelector("#f-price").value;
          if (preco < 0) { toast("O valor não pode ser negativo.", "err"); return; }
          const obj = {
            id: existing ? existing.id : undefined,
            clientId,
            serviceId: m.querySelector("#f-svc").value,
            proId: m.querySelector("#f-pro").value,
            start: new Date(`${date}T${time}`).toISOString(),
            durationMin: dur,
            price: preco || 0,
            notes: m.querySelector("#f-notes").value.trim(),
            /* Desmarcar "confirmado" num horário confirmado volta para
               agendado. Antes o status ficava preso em confirmado. */
            status: m.querySelector("#f-confirm").checked ? "CONFIRMED"
                  : (existing && existing.status !== "CONFIRMED" ? existing.status : "SCHEDULED"),
            paid: existing ? existing.paid : false,
            paymentMethod: existing ? existing.paymentMethod : null,
          };
          const r = avaliar();
          if (!r.ok && r.code === "clash") { toast(r.msg, "err"); return; }

          /* Fora do expediente ou em cima de um bloqueio, o próprio botão
             vira a confirmação. Abrir outro modal por cima apagaria o
             formulário — só existe um modal no DOM — e ela perderia o que
             digitou se desistisse. */
          const btn = m.querySelector("[data-save]");
          if (!r.ok && btn.dataset.confirmar !== "1") {
            btn.dataset.confirmar = "1";
            btn.textContent = "Marcar mesmo assim";
            btn.classList.add("btn-warn");
            toast(r.msg + " Toque de novo para marcar assim mesmo.", "warn");
            return;
          }
          Store.upsert("appts", obj);
          Modal.close(); rerender();
          toast(existing ? "Agendamento atualizado." : "Agendamento criado com sucesso.", "ok");
        };
      }
    });
  }

  /* A escolha entre grade e lista é feita na hora de desenhar. Sem isto,
     girar o celular ou redimensionar a janela deixava o formato errado
     até ela trocar de tela. */
  let eraMobile = window.innerWidth < 760, timerResize = null;
  window.addEventListener("resize", () => {
    clearTimeout(timerResize);
    timerResize = setTimeout(() => {
      const agoraMobile = window.innerWidth < 760;
      if (agoraMobile !== eraMobile && document.querySelector(".cal-grid, .day-appt, .mes-grid")) {
        eraMobile = agoraMobile;
        if (window.rerender && !document.querySelector(".modal")) rerender();
      }
      eraMobile = agoraMobile;
    }, 180);
  });

  Views.apptForm = apptForm;
  Views.apptDetail = apptDetail;
})();
