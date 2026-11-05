/* ============================================================
   nailagenda — Financeiro

   Antes eram três telas (Resumo Financeiro, Melhores Clientes e
   Performance). Para quem trabalha sozinha isso é excesso: metade
   dos gráficos comparava a Marina com ela mesma.

   Agora é uma tela só, com filtro de período que vale para tudo:
   cartões, gráfico, tabelas e rankings usam o MESMO recorte.
   ============================================================ */
window.Views = window.Views || {};

(function () {
  // Período selecionado. null = ainda não escolhido (assume o mês corrente).
  let period = null;

  const iso = (d) => {
    const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
    return x.toISOString().slice(0, 10);
  };

  const PRESETS = {
    mes:      { label: "Este mês" },
    anterior: { label: "Mês passado" },
    tri:      { label: "Últimos 3 meses" },
    ano:      { label: "Este ano" },
    tudo:     { label: "Todo o período" },
    custom:   { label: "Personalizado" },
  };

  /* Converte o preset em um intervalo concreto [from, to]. */
  function resolve(p) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const y = hoje.getFullYear(), m = hoje.getMonth();
    switch (p.preset) {
      case "anterior": return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
      case "tri":      return { from: iso(new Date(y, m - 2, 1)), to: iso(new Date(y, m + 1, 0)) };
      case "ano":      return { from: iso(new Date(y, 0, 1)),     to: iso(new Date(y, 11, 31)) };
      case "tudo":     return { from: "0000-01-01",               to: "9999-12-31" };
      case "custom":   return { from: p.from, to: p.to };
      default:         return { from: iso(new Date(y, m, 1)),     to: iso(new Date(y, m + 1, 0)) };
    }
  }

  function rotulo(p, r) {
    if (p.preset === "custom") return `${fmt.date(r.from)} — ${fmt.date(r.to)}`;
    if (p.preset === "tudo") return "Todo o período";
    return PRESETS[p.preset].label;
  }

  /* Mesmo intervalo, deslocado para trás — base da comparação. */
  function anterior(r) {
    const a = new Date(r.from), b = new Date(r.to);
    const dias = Math.max(1, Math.round((b - a) / 864e5) + 1);
    const fim = new Date(a); fim.setDate(fim.getDate() - 1);
    const ini = new Date(fim); ini.setDate(ini.getDate() - dias + 1);
    return { from: iso(ini), to: iso(fim) };
  }

  Views.relatorios = function () {
    const db = Store.db;
    if (!period) period = { preset: "mes" };
    const r = resolve(period);
    // dia LOCAL: fatiar a string UTC jogava a comanda das 21h30 do dia 30 no mês seguinte
    const dentro = (s, rr = r) => { const d = Store.diaLocal(s); return d >= rr.from && d <= rr.to; };

    const wrap = h(`<div class="col" style="gap:20px"></div>`);

    /* ---------- Dados do período ---------- */
    const orders   = db.orders.filter(o => dentro(o.date));
    const expenses = db.expenses.filter(e => dentro(e.date));
    const appts    = db.appts.filter(a => dentro(a.start));

    const receita = orders.reduce((s, o) => s + o.total, 0);
    const despesa = expenses.reduce((s, e) => s + e.amount, 0);
    const lucro = receita - despesa;
    const margem = receita ? Math.round(lucro / receita * 100) : 0;

    const rAnt = anterior(r);
    const receitaAnt = db.orders.filter(o => dentro(o.date, rAnt)).reduce((s, o) => s + o.total, 0);
    const variacao = receitaAnt ? Math.round((receita - receitaAnt) / receitaAnt * 100) : null;

    /* ---------- Filtro ---------- */
    const bar = h(`<div class="filterbar">
      <select class="select" id="p-preset" style="width:auto;min-width:180px">
        ${Object.entries(PRESETS).map(([k, v]) =>
          `<option value="${k}" ${period.preset === k ? "selected" : ""}>${v.label}</option>`).join("")}
      </select>
      <div class="row gap-6 ${period.preset === "custom" ? "" : "hide"}" id="p-range">
        <input class="input" type="date" id="p-from" value="${r.from}" style="width:auto" aria-label="Data inicial" />
        <span class="muted small">até</span>
        <input class="input" type="date" id="p-to" value="${r.to}" style="width:auto" aria-label="Data final" />
      </div>
      <span class="chip">${orders.length} atendimento(s) pago(s)</span>
      <div class="grow"></div>
      <button class="btn btn-sm btn-ghost" id="p-csv">${icon('download')} Exportar CSV</button>
    </div>`);
    wrap.appendChild(bar);

    bar.querySelector("#p-preset").onchange = (e) => {
      const v = e.target.value;
      period = v === "custom" ? { preset: "custom", from: r.from, to: r.to } : { preset: v };
      rerender();
    };
    const aplicaCustom = () => {
      const f = bar.querySelector("#p-from").value, t = bar.querySelector("#p-to").value;
      if (!f || !t) return;
      if (f > t) { toast("A data inicial não pode ser depois da final.", "err"); return; }
      period = { preset: "custom", from: f, to: t }; rerender();
    };
    bar.querySelector("#p-from").onchange = aplicaCustom;
    bar.querySelector("#p-to").onchange = aplicaCustom;
    bar.querySelector("#p-csv").onclick = () => exportar(orders, expenses, r);

    /* ---------- Cartões ---------- */
    wrap.appendChild(h(`<div class="stat-grid">
      ${[
        { l: `Receita · ${rotulo(period, r)}`, v: fmt.money(receita), ic: "trending", c: "var(--accent)",
          d: variacao === null ? null : `${variacao >= 0 ? "+" : ""}${variacao}% vs. período anterior`, up: variacao >= 0 },
        { l: "Despesas", v: fmt.money(despesa), ic: "wallet", c: "var(--danger)" },
        { l: "Lucro", v: fmt.money(lucro), ic: "dollar", c: "var(--brand-500)" },
        { l: "Margem", v: margem + "%", ic: "percent", c: "var(--gold)" },
      ].map(s => `<div class="stat"><div class="stat-ic" style="background:color-mix(in srgb, ${s.c} 13%, transparent);color:${s.c}">${icon(s.ic)}</div>
        <div class="lbl">${s.l}</div><div class="val">${s.v}</div>
        ${s.d ? `<div class="delta ${s.up ? "up" : "down"}">${icon(s.up ? "arrowUp" : "arrowDown")} ${s.d}</div>` : ""}
      </div>`).join("")}</div>`));

    /* ---------- Receita × Despesa ----------
       Períodos longos agrupam por mês; curtos, por dia. Um gráfico com
       120 barras diárias não se lê. */
    const spanDias = Math.round((new Date(r.to) - new Date(r.from)) / 864e5) + 1;
    const porMes = spanDias > 62 || period.preset === "tudo";
    const buckets = new Map();
    const chave = (s) => porMes ? Store.mesLocal(s) : Store.diaLocal(s);
    const add = (mapKey, campo, valor) => {
      if (!buckets.has(mapKey)) buckets.set(mapKey, { rev: 0, exp: 0 });
      buckets.get(mapKey)[campo] += valor;
    };
    orders.forEach(o => add(chave(o.date), "rev", o.total));
    expenses.forEach(e => add(chave(e.date), "exp", e.amount));
    const serie = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ k, ...v, profit: v.rev - v.exp }));

    if (serie.length) {
      const maxV = Math.max(...serie.map(s => Math.max(s.rev, s.exp)), 1);
      const rot = (k) => porMes
        ? new Date(k + "-01").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
        : k.slice(8) + "/" + k.slice(5, 7);
      wrap.appendChild(h(`<div class="card card-pad">
        <div class="row between wrap" style="margin-bottom:16px;gap:10px">
          <h3 style="font-size:15px">Receita × Despesa ${porMes ? "por mês" : "por dia"}</h3>
          <div class="row gap-16">
            <span class="row gap-6 small"><span class="lg-dot" style="background:var(--accent)"></span>Receita</span>
            <span class="row gap-6 small"><span class="lg-dot" style="background:var(--danger)"></span>Despesa</span></div></div>
        <div class="rd-chart">
          ${serie.map(s => `<div class="rd-col">
            <div class="rd-bars">
              <div class="rd-rev" style="height:${Math.max(2, s.rev / maxV * 100)}%" title="Receita ${fmt.money(s.rev)}"></div>
              <div class="rd-exp" style="height:${Math.max(2, s.exp / maxV * 100)}%" title="Despesa ${fmt.money(s.exp)}"></div>
            </div>
            <span class="rd-cap cap-first">${rot(s.k)}</span></div>`).join("")}
        </div></div>`));
    }

    const g1 = h(`<div class="dash-grid" style="gap:20px"></div>`);

    /* ---------- Formas de pagamento ---------- */
    const byPm = {};
    orders.forEach(o => { byPm[o.paymentMethod] = (byPm[o.paymentMethod] || 0) + o.total; });
    const totalPm = Object.values(byPm).reduce((s, v) => s + v, 0) || 1;
    g1.appendChild(h(`<div class="card"><div class="card-head"><h3>Como você recebeu</h3></div>
      <div class="card-pad col" style="gap:14px">
      ${Object.keys(byPm).length ? Object.entries(byPm).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
        <div><div class="row between" style="margin-bottom:5px">
          <span class="bold">${Store.pmName(k)}</span>
          <span class="muted small">${fmt.money(v)} · ${Math.round(v / totalPm * 100)}%</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(v / totalPm * 100).toFixed(0)}%;background:var(--accent)"></div></div></div>`).join("")
        : `<div class="empty">Nenhum recebimento no período.</div>`}</div></div>`));

    /* ---------- Fechamento ---------- */
    g1.appendChild(h(`<div class="card"><div class="card-head"><h3>Fechamento</h3>
        <span class="chip">${serie.length} ${porMes ? "mês(es)" : "dia(s)"}</span></div>
      <div class="table-wrap"><table class="tbl">
      <thead><tr><th>${porMes ? "Mês" : "Dia"}</th><th class="num">Receita</th><th class="num">Despesa</th><th class="num">Lucro</th></tr></thead>
      <tbody>${serie.length ? serie.slice().reverse().map(s => `<tr>
        <td class="bold cap-first">${porMes
          ? new Date(s.k + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
          : fmt.date(s.k)}</td>
        <td class="num" style="color:var(--accent)">${fmt.money(s.rev)}</td>
        <td class="num" style="color:var(--danger)">${fmt.money(s.exp)}</td>
        <td class="num bold" style="color:${s.profit < 0 ? "var(--danger)" : "inherit"}">${fmt.money(s.profit)}</td></tr>`).join("")
        : `<tr><td colspan="4"><div class="empty">Sem movimento no período.</div></td></tr>`}</tbody></table></div></div>`));
    wrap.appendChild(g1);

    /* ---------- Atendimentos: o que aconteceu na agenda ---------- */
    const feitos = appts.filter(a => a.status === "DONE");
    const faltas = appts.filter(a => a.status === "NO_SHOW");
    const cancel = appts.filter(a => a.status === "CANCELED");
    const baseAg = appts.length || 1;
    const perdido = faltas.reduce((s, a) => s + a.price, 0);

    wrap.appendChild(h(`<div class="card card-pad">
      <div class="row between wrap" style="gap:10px;margin-bottom:14px">
        <h3 style="font-size:15px">Atendimentos no período</h3>
        ${perdido > 0 ? `<span class="badge b-amber">${fmt.money(perdido)} perdidos em faltas</span>` : ""}
      </div>
      <div class="mini-stats">
        ${[
          { l: "Atendidos", v: feitos.length, c: "var(--accent)" },
          { l: "Faltas", v: `${faltas.length} · ${Math.round(faltas.length / baseAg * 100)}%`, c: "var(--warn)" },
          { l: "Cancelados", v: cancel.length, c: "var(--danger)" },
          { l: "Ticket médio", v: fmt.money(orders.length ? receita / orders.length : 0), c: "var(--brand-500)" },
        ].map(s => `<div><div class="tiny faint bold">${s.l.toUpperCase()}</div>
          <div style="font-family:var(--display);font-weight:800;font-size:19px;color:${s.c}">${s.v}</div></div>`).join("")}
      </div></div>`));

    const g2 = h(`<div class="dash-grid" style="gap:20px"></div>`);

    /* ---------- Serviços mais feitos ---------- */
    const svcCount = {};
    feitos.forEach(a => { svcCount[a.serviceId] = (svcCount[a.serviceId] || 0) + 1; });
    const topSvc = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxSvc = topSvc.length ? topSvc[0][1] : 1;
    g2.appendChild(h(`<div class="card"><div class="card-head"><h3>Serviços mais feitos</h3></div>
      <div class="card-pad col" style="gap:14px">
      ${topSvc.length ? topSvc.map(([id, n]) => { const s = Store.byId("services", id);
        return `<div><div class="row between" style="margin-bottom:5px">
          <span class="bold">${esc(s ? s.name : "—")}</span><span class="muted small">${n}×</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${(n / maxSvc * 100).toFixed(0)}%"></div></div></div>`; }).join("")
        : `<div class="empty">Sem atendimentos no período.</div>`}</div></div>`));

    /* ---------- Horários de pico ---------- */
    const hourCount = {};
    appts.filter(a => a.status !== "CANCELED").forEach(a => {
      const hh = new Date(a.start).getHours(); hourCount[hh] = (hourCount[hh] || 0) + 1;
    });
    // Mesma faixa da agenda: expediente real, e não um abre/fecha fixo.
    const faixa = Schedule.hourRange([Store.todayISO()]);
    const hours = Array.from({ length: Math.max(1, faixa.ate - faixa.de) }, (_, i) => faixa.de + i);
    const maxH = Math.max(...hours.map(hh => hourCount[hh] || 0), 1);
    g2.appendChild(h(`<div class="card card-pad">
      <h3 style="font-size:15px;margin-bottom:6px">Horários de maior movimento</h3>
      <p class="small muted" style="margin-bottom:12px">Onde sua agenda enche — útil para escolher onde abrir vaga.</p>
      <div class="barchart">${hours.map(hh => `<div class="bar" style="height:${Math.max(5, (hourCount[hh] || 0) / maxH * 100)}%">
        <span class="val">${hourCount[hh] || 0}</span><span class="cap">${String(hh).padStart(2, "0")}h</span></div>`).join("")}</div>
      <div style="height:24px"></div></div>`));
    wrap.appendChild(g2);

    /* ---------- Melhores clientes ----------
       Enxuto: quem gera receita e quando veio pela última vez.
       O pódio com medalhas e a barra de participação saíram — para uma
       carteira desse tamanho, era enfeite ocupando a tela. */
    const rank = db.clients.map(c => {
      const os = orders.filter(o => o.clientId === c.id);
      const gasto = os.reduce((s, o) => s + o.total, 0);
      const visitas = feitos.filter(a => a.clientId === c.id).length;
      const ult = db.appts.filter(a => a.clientId === c.id && a.status === "DONE")
        .sort((a, b) => b.start.localeCompare(a.start))[0];
      return { c, gasto, visitas, ticket: os.length ? gasto / os.length : 0, ult: ult ? ult.start : null };
    }).filter(x => x.gasto > 0).sort((a, b) => b.gasto - a.gasto);

    const card = h(`<div class="card"><div class="card-head">
        <h3>Melhores clientes</h3><span class="chip">${rank.length} no período</span></div>
      <div class="table-wrap"><table class="tbl">
      <thead><tr><th>#</th><th data-titulo>Cliente</th><th class="num">Gasto</th><th class="num">Visitas</th>
        <th class="num">Ticket</th><th>Última</th><th></th></tr></thead><tbody></tbody></table></div></div>`);
    const tb = card.querySelector("tbody");
    if (!rank.length) {
      tb.appendChild(h(`<tr><td colspan="7"><div class="empty"><div class="em-ic">${icon('star')}</div>
        Nenhum faturamento no período.</div></td></tr>`));
    }
    rank.slice(0, 12).forEach((x, i) => {
      const tr = h(`<tr class="clickable">
        <td class="muted bold">${i + 1}</td>
        <td><div class="row gap-8">${avatar(x.c.name, 'sm')}<div style="min-width:0">
          <div class="bold truncate">${esc(x.c.name)}</div>
          <div class="tiny muted">${fmt.phone(x.c.phone)}</div></div></div></td>
        <td class="num bold">${fmt.money(x.gasto)}</td>
        <td class="num">${x.visitas}</td>
        <td class="num">${fmt.money(x.ticket)}</td>
        <td class="small">${x.ult ? fmt.date(x.ult) : "—"}</td>
        <td class="right"><button class="btn btn-icon btn-sm btn-ghost" data-wa aria-label="Enviar mensagem">${icon('whatsapp')}</button></td></tr>`);
      tr.onclick = (e) => { if (e.target.closest("button")) return; Views.clientDetail(x.c.id); };
      tr.querySelector("[data-wa]").onclick = () => Views.pickMessageFor({ client: x.c });
      tb.appendChild(tr);
    });
    if (rank.length > 12)
      card.appendChild(h(`<div class="card-pad center small muted" style="border-top:1px solid var(--line)">
        Mostrando as 12 primeiras de ${rank.length}.</div>`));
    wrap.appendChild(card);

    return wrap;
  };

  /* Exporta o recorte atual. Copiar em vez de baixar: link de download
     é bloqueado em visualizadores embarcados e falharia em silêncio. */
  function exportar(orders, expenses, r) {
    const linhas = [["tipo", "data", "descricao", "valor"]];
    orders.forEach(o => {
      const c = Store.byId("clients", o.clientId);
      linhas.push(["receita", Store.diaLocal(o.date), (c ? c.name : "—") + " — " + o.items.map(i => i.name).join(" / "), o.total.toFixed(2)]);
    });
    expenses.forEach(e => linhas.push(["despesa", Store.diaLocal(e.date), e.desc, (-e.amount).toFixed(2)]));
    const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");

    Modal.open({
      title: "Exportar período",
      body: `<p class="small muted" style="margin-bottom:12px">
          ${fmt.date(r.from)} a ${fmt.date(r.to)} · ${linhas.length - 1} lançamento(s).
          Formato CSV, separado por ponto e vírgula — abre direto no Excel.</p>
        <textarea class="textarea mono" id="ex-csv" readonly style="min-height:200px;font-size:11.5px;white-space:pre">${esc(csv)}</textarea>`,
      footer: `<button class="btn btn-ghost" data-c>Fechar</button>
               <button class="btn btn-primary" data-copy>${icon('copy')} Copiar</button>`,
      onMount(m) {
        m.querySelector("[data-c]").onclick = Modal.close;
        m.querySelector("[data-copy]").onclick = async () => {
          try { await navigator.clipboard.writeText(csv); toast("CSV copiado.", "ok"); }
          catch { const t = m.querySelector("#ex-csv"); t.focus(); t.select(); toast("Selecionado — use Ctrl+C.");
          }
        };
      }
    });
  }
})();
