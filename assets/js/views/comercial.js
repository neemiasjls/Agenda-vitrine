/* ============================================================
   nailagenda — Comandas, Cobranças, Despesas, Materiais, Profissionais
   ============================================================ */
window.Views = window.Views || {};

(function () {

  const soUmaPro = () => Store.db.professionals.filter(p => p.active !== false).length <= 1;

  // Mês selecionado na tela de Despesas. null = ainda não escolhido
  // (assume o mês corrente). "all" = sem recorte.
  let expMonth = null;

  // Recorte de datas da tela de Atendimentos. null = assume o mês corrente.
  let ordFrom = null, ordTo = null;

  /* =========================================================
     COMANDAS (checkout / vendas)
     ========================================================= */
  Views.comandas = function () {
    const db = Store.db;
    const wrap = h(`<div class="col" style="gap:16px"></div>`);

    // Primeiro e último dia do mês corrente como padrão
    const hoje = new Date();
    const pad = (d) => { const x=new Date(d); x.setMinutes(x.getMinutes()-x.getTimezoneOffset()); return x.toISOString().slice(0,10); };
    if (!ordFrom) ordFrom = pad(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    if (!ordTo)   ordTo   = pad(new Date(hoje.getFullYear(), hoje.getMonth()+1, 0));

    const statsHost = h(`<div class="stat-grid"></div>`);
    wrap.appendChild(statsHost);

    const bar = h(`<div class="filterbar">
      <div class="input-group" style="max-width:260px;flex:1"><span class="ic-left">${icon('search')}</span>
        <input class="input" id="o-q" placeholder="Buscar por cliente..." /></div>
      <div class="row gap-6">
        <input class="input" type="date" id="o-from" value="${ordFrom}" style="width:auto" aria-label="Data inicial" />
        <span class="muted small">até</span>
        <input class="input" type="date" id="o-to" value="${ordTo}" style="width:auto" aria-label="Data final" />
      </div>
      <select class="select" id="o-pm" style="width:auto"><option value="">Todas as formas</option>
        ${Store.PAYMENT_METHODS.map(p=>`<option value="${p.id}">${p.name}</option>`).join("")}</select>
      <button class="btn btn-sm btn-ghost" id="o-clear">Limpar</button>
      <div class="grow"></div>
      <button class="btn btn-primary" id="o-new">${icon('plus')} Nova comanda</button></div>`);
    bar.querySelector("#o-new").onclick = () => orderForm();
    wrap.appendChild(bar);

    const card = h(`<div class="card"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Data</th><th data-titulo>Cliente</th><th>Itens</th>${soUmaPro()?"":"<th>Profissional</th>"}<th>Pagamento</th><th class="num">Total</th><th></th></tr></thead>
      <tbody id="o-rows"></tbody></table></div></div>`);
    wrap.appendChild(card);

    function paint() {
      const q = (bar.querySelector("#o-q").value||"").toLowerCase();
      const pm = bar.querySelector("#o-pm").value;
      ordFrom = bar.querySelector("#o-from").value;
      ordTo   = bar.querySelector("#o-to").value;

      let list = db.orders.slice().sort((a,b)=>b.date.localeCompare(a.date));
      // O recorte de data vale para os cartões E para a tabela: antes os
      // cartões mostravam o mês enquanto a lista trazia tudo.
      if (ordFrom) list = list.filter(o=>Store.diaLocal(o.date) >= ordFrom);
      if (ordTo)   list = list.filter(o=>Store.diaLocal(o.date) <= ordTo);
      if (pm) list = list.filter(o=>o.paymentMethod===pm);
      if (q) list = list.filter(o=>{const c=Store.byId("clients",o.clientId); return c&&c.name.toLowerCase().includes(q);});

      const fat = list.reduce((s,o)=>s+o.total,0);
      statsHost.innerHTML = [
        {l:"Atendimentos", v:list.length, ic:"receipt", c:"var(--brand-500)"},
        {l:"Faturamento", v:fmt.money(fat), ic:"dollar", c:"var(--accent)"},
        {l:"Ticket médio", v:fmt.money(list.length?fat/list.length:0), ic:"trending", c:"var(--gold)"},
        {l:"Descontos", v:fmt.money(list.reduce((s,o)=>s+(o.discount||0),0)), ic:"percent", c:"#e64980"},
      ].map(s=>`<div class="stat"><div class="stat-ic" style="background:color-mix(in srgb, ${s.c} 13%, transparent);color:${s.c}">${icon(s.ic)}</div>
        <div class="lbl">${s.l}</div><div class="val">${s.v}</div></div>`).join("");

      const tb = card.querySelector("#o-rows"); tb.innerHTML="";
      if(!list.length){tb.appendChild(h(`<tr><td colspan="7"><div class="empty"><div class="em-ic">${icon('receipt')}</div>Nenhuma comanda encontrada.</div></td></tr>`));return;}
      const LIMITE = 100;
      if (list.length > LIMITE) tb.appendChild(h(`<tr><td colspan="7" class="tiny muted center" style="padding:10px">
        Mostrando as ${LIMITE} mais recentes de ${list.length}. Use as datas para ver o resto — os totais acima já contam todas.</td></tr>`));
      list.slice(0,LIMITE).forEach(o=>{
        const c=Store.byId("clients",o.clientId), p=Store.byId("professionals",o.proId);
        const tr = h(`<tr>
          <td class="small">${fmt.date(o.date)}<div class="tiny muted">${fmt.time(o.date)}</div></td>
          <td><div class="row gap-8">${avatar(c?c.name:"?", 'sm')}<span class="bold">${esc(c?c.name:"—")}</span></div></td>
          <td class="small">${o.items.map(i=>esc(i.name)).join(", ")}</td>
          ${soUmaPro()?"":`<td class="small">${esc(p?p.name:"—")}</td>`}
          <td><span class="chip">${Store.pmName(o.paymentMethod)}</span>${o.apptId?"":'<div class="tiny muted">avulsa</div>'}</td>
          <td class="num bold">${fmt.money(o.total)}</td>
          <td class="right"><button class="btn btn-icon btn-sm btn-ghost" data-menu>${icon('list')}</button></td></tr>`);
        tr.querySelector("[data-menu]").onclick=(e)=>rowMenu(e,[
          {t:"Ver recibo",ic:"receipt",fn:()=>receipt(o)},
          {t:"Enviar por WhatsApp",ic:"whatsapp",fn:()=>{ if(c) window.open(waLink(c.phone, `Olá ${c.name.split(" ")[0]}! Segue o resumo do seu atendimento: ${o.items.map(i=>i.name).join(", ")} — Total ${fmt.money(o.total)}. Obrigada pela preferência! 💜`),"_blank"); }},
          {t:"Excluir",ic:"trash",danger:true,fn:()=>Modal.confirm({title:"Excluir comanda",danger:true,confirmText:"Excluir",message:"O atendimento volta a ficar em aberto, e estoque, crédito e sessão de pacote são devolvidos.",onConfirm(){ if(Store.excluirComanda(o.id)) toast("Comanda excluída.","ok"); rerender(); }})},
        ]);
        tb.appendChild(tr);
      });
    }
    bar.querySelector("#o-q").addEventListener("input",paint);
    bar.querySelector("#o-pm").addEventListener("change",paint);
    bar.querySelector("#o-from").addEventListener("change",paint);
    bar.querySelector("#o-to").addEventListener("change",paint);
    bar.querySelector("#o-clear").onclick = () => {
      bar.querySelector("#o-q").value = "";
      bar.querySelector("#o-pm").value = "";
      bar.querySelector("#o-from").value = "";
      bar.querySelector("#o-to").value = "";
      paint();
    };
    paint();
    return wrap;
  };

  function receipt(o) {
    const c=Store.byId("clients",o.clientId), p=Store.byId("professionals",o.proId);
    Modal.open({ title:"Recibo de atendimento", size:"sm",
      body:`<div style="text-align:center;padding-bottom:14px;border-bottom:1px dashed var(--line-strong)">
          <div style="font-family:var(--display);font-weight:800;font-size:18px">${esc(Store.db.company.name)}</div>
          <div class="tiny muted">${fmt.date(o.date)} às ${fmt.time(o.date)}</div></div>
        <div style="padding:14px 0"><div class="row between small"><span class="muted">Cliente</span><span class="bold">${esc(c?c.name:"—")}</span></div>
          ${soUmaPro()?"":`<div class="row between small" style="margin-top:6px"><span class="muted">Profissional</span><span class="bold">${esc(p?p.name:"—")}</span></div>`}</div>
        <div style="border-top:1px dashed var(--line-strong);padding:14px 0">
          ${o.items.map(i=>`<div class="row between small" style="margin-bottom:8px"><span>${esc(i.name)} ${i.qty>1?`×${i.qty}`:''}</span><span class="bold">${fmt.money(i.price*i.qty)}</span></div>`).join("")}
          ${o.discount?`<div class="row between small" style="color:var(--danger)"><span>${o.paymentMethod==="COURTESY"?"Cortesia":"Desconto"}</span><span>-${fmt.money(o.discount)}</span></div>`:''}
          ${o.creditUsed?`<div class="row between small muted"><span>Pago com crédito</span><span>${fmt.money(o.creditUsed)}</span></div>`:''}</div>
        <div style="border-top:2px solid var(--ink);padding-top:12px" class="row between">
          <span class="bold">TOTAL</span><span style="font-family:var(--display);font-weight:800;font-size:20px">${fmt.money(o.total)}</span></div>
        <div class="center tiny muted" style="margin-top:14px">Forma de pagamento: ${Store.pmName(o.paymentMethod)}</div>`,
      footer:`<button class="btn btn-ghost" data-c>Fechar</button><button class="btn btn-primary" data-pr>${icon('download')} Imprimir</button>`,
      onMount(m){m.querySelector("[data-c]").onclick=Modal.close;
        /* window.print() sozinho imprimia a tela inteira do sistema. A classe
           faz o CSS de impressão esconder tudo menos o recibo. */
        m.querySelector("[data-pr]").onclick=()=>{ document.body.classList.add("imprimindo-recibo");
          window.print(); setTimeout(()=>document.body.classList.remove("imprimindo-recibo"), 500); };}});
  }

  /* Checkout a partir de um agendamento.
     Se a comanda desse atendimento já foi fechada, mostra o recibo em vez
     de abrir outra: antes dava para fechar duas vezes e a receita dobrava. */
  Views.checkoutFromAppt = function (a) {
    const ja = Store.comandaDo(a.id);
    if (ja) { toast("Este atendimento já tem comanda fechada."); receipt(ja); return; }
    const v = Store.apptView(a);
    orderForm({ clientId: a.clientId, proId: a.proId, apptId: a.id, date: a.start,
      items: [{ type: "service", refId: a.serviceId, name: v.service.name, qty: 1, price: a.price }] });
  };

  /* Seletor de cor do esmalte. A cor é o registro do trabalho: é ela que
     aparece na ficha, nos retornos e no portal quando não há foto.
     Cartela agrupada por família (como ela organiza os vidros), com busca
     quando a lista cresce e um atalho para repetir a cor da última visita.
     opcoes: { clienteId, ignorarId } para achar essa última cor. */
  function seletorDeCor(host, atual, aoEscolher, opcoes = {}) {
    let escolhida = atual || null;
    let busca = "";
    const ultima = Store.ultimaCorDa(opcoes.clienteId, opcoes.ignorarId);
    const norm = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    host.innerHTML = `<div class="cs">
      <div class="cs-topo">
        <span class="unha cs-previa" aria-hidden="true"></span>
        <div class="cs-escolha" aria-live="polite"></div>
      </div>
      ${Store.cores.length > 12 ? `<div class="input-group cs-busca"><span class="ic-left">${icon("search")}</span>
        <input class="input" type="search" placeholder="Buscar pelo nome" aria-label="Buscar cor pelo nome" /></div>` : ""}
      <div class="cs-grupos"></div>
      <div class="cs-rodape">
        <button type="button" class="btn btn-sm btn-ghost" data-nova>${icon("plus")} Cadastrar cor nova</button>
      </div>
      <div class="cs-nova" hidden>
        <label class="cs-nova-cor" title="Escolher o tom">
          <span class="unha" style="--c:#e3bcb0"></span>
          <input type="color" value="#e3bcb0" aria-label="Tom da cor nova" />
        </label>
        <div class="grow" style="min-width:0">
          <input class="input" id="cor-nome" placeholder="Nome, como está no vidro" maxlength="30" />
          <p class="tiny muted" style="margin-top:4px">Toque na unha para escolher o tom.</p>
        </div>
        <button type="button" class="btn btn-primary" id="cor-ok">Adicionar</button>
      </div>
    </div>`;

    const topo = () => {
      const c = escolhida && Store.polish(escolhida);
      const prev = host.querySelector(".cs-previa");
      prev.classList.toggle("vazia", !c);
      prev.style.setProperty("--c", c ? c.hex : "transparent");
      const repetir = ultima && ultima.id !== escolhida
        ? `<button type="button" class="cs-repetir" data-cor="${ultima.id}">
             <span class="unha" style="--c:${esc(ultima.hex)}"></span><span>Usar a da última vez, <b>${esc(ultima.name)}</b></span></button>` : "";
      host.querySelector(".cs-escolha").innerHTML = c
        ? `<div class="cs-nome">${esc(c.name)}</div>
           <div class="row gap-8" style="flex-wrap:wrap">${repetir}
             <button type="button" class="cs-limpar" data-cor="">Tirar a cor</button></div>`
        : `<div class="cs-nome muted">Nenhuma cor escolhida</div>${repetir}`;
      host.querySelectorAll(".cs-escolha [data-cor]").forEach(b => b.onclick = () => escolher(b.dataset.cor || null));
    };

    const grupos = () => {
      const lista = Store.cores.filter(c => !busca || norm(c.name).includes(busca));
      const porFamilia = new Map();
      lista.forEach(c => {
        const f = Store.familiaDaCor(c.hex);
        if (!porFamilia.has(f.i)) porFamilia.set(f.i, { nome: f.nome, cores: [] });
        porFamilia.get(f.i).cores.push({ ...c, l: f.l });
      });
      const alvo = host.querySelector(".cs-grupos");
      alvo.innerHTML = !lista.length
        ? `<p class="small muted cs-nada">Nenhuma cor com esse nome. Cadastre abaixo.</p>`
        : [...porFamilia.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => `
          <div class="cs-grupo" role="group" aria-label="${g.nome}">
            <div class="cs-grupo-t">${g.nome}</div>
            <div class="cs-cartela">${g.cores.sort((a, b) => b.l - a.l).map(c => `
              <button type="button" class="cs-op${escolhida === c.id ? " sel" : ""}" data-cor="${c.id}"
                aria-pressed="${escolhida === c.id}" title="${esc(c.name)}">
                <span class="unha" style="--c:${esc(c.hex)}"></span>
                <span class="cs-op-nome">${esc(c.name)}</span>
              </button>`).join("")}</div>
          </div>`).join("");
      alvo.querySelectorAll("[data-cor]").forEach(b => b.onclick = () => escolher(b.dataset.cor));
    };

    const escolher = (id) => { escolhida = id || null; aoEscolher(escolhida); topo(); grupos(); };

    const campo = host.querySelector(".cs-busca input");
    if (campo) campo.oninput = () => { busca = norm(campo.value.trim()); grupos(); };

    const nova = host.querySelector(".cs-nova");
    const tom = nova.querySelector("input[type=color]");
    tom.oninput = () => nova.querySelector(".cs-nova-cor .unha").style.setProperty("--c", tom.value);
    host.querySelector("[data-nova]").onclick = () => {
      nova.hidden = !nova.hidden;
      if (!nova.hidden) nova.querySelector("#cor-nome").focus();
    };
    host.querySelector("#cor-ok").onclick = () => {
      const name = nova.querySelector("#cor-nome").value.trim();
      if (!name) { toast("Dê um nome para a cor.", "err"); return; }
      if (Store.cores.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast("Já existe uma cor com esse nome.", "err"); return; }
      const c = Store.upsert("polishColors", { name, hex: tom.value });
      nova.hidden = true; nova.querySelector("#cor-nome").value = "";
      if (campo) { campo.value = ""; busca = ""; }
      escolher(c.id);
    };

    topo(); grupos();
  }
  Views.seletorDeCor = seletorDeCor;

  /* Cor de identificação da profissional: uma paleta curta de tons que
     combinam com o painel, mais um tom livre para quem quiser outro. */
  const TONS_PERFIL = ["#b31f52", "#8a4459", "#76506e", "#6d5a7e", "#5b6478", "#4f6b66", "#5f6e4e", "#8a6446", "#7a5250"];
  Views.paletaDePerfil = function (host, atual, aoEscolher) {
    let cor = (atual || TONS_PERFIL[0]).toLowerCase();
    const pintar = () => {
      const livre = !TONS_PERFIL.includes(cor);
      host.innerHTML = `<div class="pp" role="radiogroup" aria-label="Cor de identificação">
        ${TONS_PERFIL.map(t => `<button type="button" class="pp-op${t === cor ? " sel" : ""}" role="radio"
          aria-checked="${t === cor}" aria-label="Cor ${t}" data-t="${t}" style="--c:${t}"></button>`).join("")}
        <label class="pp-op pp-livre${livre ? " sel" : ""}" title="Outro tom" style="${livre ? `--c:${cor}` : ""}">
          ${livre ? "" : icon("plus")}<input type="color" value="${livre ? cor : "#b31f52"}" aria-label="Escolher outro tom" /></label>
      </div>`;
      host.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { cor = b.dataset.t; aoEscolher(cor); pintar(); });
      host.querySelector(".pp-livre input").onchange = (e) => { cor = e.target.value.toLowerCase(); aoEscolher(cor); pintar(); };
    };
    pintar();
  };

  function orderForm(preset) {
    const db = Store.db;
    preset = preset || {};
    let items = (preset.items || []).map(i => ({ ...i }));
    let cor = preset.apptId ? (Store.byId("appts", preset.apptId) || {}).polishId || null : null;
    const soUma = db.professionals.filter(p => p.active !== false).length <= 1;

    Modal.open({
      title: preset.apptId ? "Fechar atendimento" : "Nova comanda", size: "lg",
      body: `<div class="col" style="gap:16px">
        <div class="form-grid">
          <div class="field${soUma ? " full" : ""}"><label>Cliente *</label><select class="select" id="oc-cli"><option value="">Selecione...</option>
            ${db.clients.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${c.id}" ${preset.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join("")}</select></div>
          <div class="field"${soUma ? " hidden" : ""}><label>Profissional *</label><select class="select" id="oc-pro">
            ${db.professionals.map(p=>`<option value="${p.id}" ${preset.proId===p.id?'selected':''}>${esc(p.name)}</option>`).join("")}</select></div>
        </div>
        <div id="oc-pacotes"></div>
        <div class="card" style="background:var(--surface-2)">
          <div class="card-head"><h3>Itens</h3>
            <div class="row gap-8 wrap">
              <select class="select btn-sm" id="oc-add-type" style="height:32px;width:auto;font-size:12.5px">
                <option value="service">Serviço</option><option value="product">Produto</option><option value="package">Pacote</option></select>
              <select class="select" id="oc-add-ref" style="height:32px;width:auto;font-size:12.5px;max-width:220px"></select>
              <button class="btn btn-sm btn-primary" id="oc-add" aria-label="Adicionar item">${icon('plus')}</button></div></div>
          <div id="oc-items"></div>
        </div>
        ${preset.apptId ? `<div class="field"><label>Cor usada</label><div id="oc-cor"></div>
          <span class="hint">Fica na ficha dela e aparece nos retornos: "da última vez foi Vinho".</span></div>` : ""}
        <div class="form-grid">
          <div class="field"><label>Forma de pagamento *</label><select class="select" id="oc-pm">
            ${Store.PAYMENT_METHODS.map(p=>`<option value="${p.id}">${p.name}</option>`).join("")}</select>
            <span class="hint" id="oc-pm-nota"></span></div>
          <div class="field"><label>Desconto (R$)</label><input class="input" type="number" step="0.01" min="0" id="oc-disc" value="0" /></div>
        </div>
        <div class="row between" style="padding:16px;background:var(--brand-50);border-radius:12px">
          <span class="bold">Total</span>
          <span class="oc-total" id="oc-total">R$ 0,00</span></div>
      </div>`,
      footer:`<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>${icon('check')} Fechar comanda</button>`,
      onMount(m){
        const typeSel=m.querySelector("#oc-add-type"), refSel=m.querySelector("#oc-add-ref");
        const cliSel = m.querySelector("#oc-cli"), pmSel = m.querySelector("#oc-pm");
        const fillRef=()=>{ const t=typeSel.value;
          const src = t==="service"?db.services.filter(s=>s.active):t==="product"?db.products:db.packages.filter(p=>p.active!==false);
          refSel.innerHTML = src.length ? src.map(x=>`<option value="${x.id}">${esc(x.name)} — ${fmt.money(x.price)}</option>`).join("")
                                        : `<option value="">Nada cadastrado</option>`; };
        typeSel.onchange=fillRef; fillRef();
        if (preset.apptId) seletorDeCor(m.querySelector("#oc-cor"), cor, (c) => { cor = c; },
          { clienteId: preset.clientId, ignorarId: preset.apptId });

        const subtotal = () => items.reduce((s,i)=>s+(i.usarPacote ? 0 : i.price*i.qty),0);
        const total = () => pmSel.value === "COURTESY" ? 0 : Math.max(0, subtotal() - (+m.querySelector("#oc-disc").value||0));

        /* Pacote em andamento que cobre um serviço da comanda: oferece usar
           a sessão em vez de cobrar de novo. */
        const pintarPacotes = () => {
          const box = m.querySelector("#oc-pacotes"); box.innerHTML = "";
          const clientId = cliSel.value; if (!clientId) return;
          items.filter(i => i.type === "service").forEach(it => {
            const pk = Store.pacotesAtivos(clientId, it.refId)[0];
            if (!pk) { it.usarPacote = false; delete it.pacoteCliente; return; }
            const el = h(`<label class="oc-pacote">
              <span class="switch"><input type="checkbox" ${it.usarPacote ? "checked" : ""} /><span class="track"></span><span class="thumb"></span></span>
              <div><div class="bold small">Usar sessão do pacote "${esc(pk.name)}"</div>
              <div class="tiny muted">${esc(it.name)} · restam ${pk.remaining} de ${pk.total}${pk.expiresAt ? " · vale até " + fmt.date(pk.expiresAt + "T12:00") : ""}</div></div></label>`);
            el.querySelector("input").onchange = (e) => {
              it.usarPacote = e.target.checked;
              if (it.usarPacote) { it.pacoteCliente = pk.id; it.qty = 1; } else delete it.pacoteCliente;
              paint();
            };
            box.appendChild(el);
          });
        };

        const pintarPagamento = () => {
          const nota = m.querySelector("#oc-pm-nota");
          const c = Store.byId("clients", cliSel.value);
          if (pmSel.value === "CREDIT") nota.textContent = c ? `Crédito disponível: ${fmt.money(c.credit||0)}` : "Escolha a cliente.";
          else if (pmSel.value === "COURTESY") nota.textContent = "Cortesia fica registrada com total zero.";
          else nota.textContent = "";
        };

        const paint=()=>{
          const box=m.querySelector("#oc-items"); box.innerHTML="";
          if(!items.length) box.appendChild(h(`<div class="empty" style="padding:26px"><div class="em-ic">${icon('receipt')}</div>Adicione serviços ou produtos.</div>`));
          items.forEach((it,i)=>{
            const row=h(`<div class="lrow oc-item">
              <span class="badge ${it.type==='service'?'b-violet':it.type==='product'?'b-amber':'b-green'}">${it.type==='service'?'Serviço':it.type==='product'?'Produto':'Pacote'}</span>
              <div class="grow" style="min-width:0"><div class="bold truncate">${esc(it.name)}</div>
                <div class="tiny muted">${it.usarPacote ? "sessão do pacote" : fmt.money(it.price) + " × " + it.qty}</div></div>
              <input class="input" type="number" min="1" value="${it.qty}" style="width:66px;height:32px" data-qty ${it.usarPacote?"disabled":""} aria-label="Quantidade" />
              <span class="bold" style="width:88px;text-align:right">${it.usarPacote ? "—" : fmt.money(it.price*it.qty)}</span>
              <button class="btn btn-icon btn-sm btn-ghost" data-rm aria-label="Remover item">${icon('trash')}</button></div>`);
            row.querySelector("[data-qty]").onchange=(e)=>{items[i].qty=Math.max(1,Math.floor(+e.target.value)||1);paint();};
            row.querySelector("[data-rm]").onclick=()=>{items.splice(i,1);pintarPacotes();paint();};
            box.appendChild(row);
          });
          m.querySelector("#oc-total").textContent=fmt.money(total());
          pintarPagamento();
        };
        m.querySelector("#oc-add").onclick=()=>{
          const t=typeSel.value, id=refSel.value;
          const src = t==="service"?db.services:t==="product"?db.products:db.packages;
          const x=src.find(z=>z.id===id); if(!x)return;
          const ex=items.find(i=>i.refId===id&&i.type===t&&!i.usarPacote);
          if(ex) ex.qty++; else items.push({type:t,refId:id,name:x.name,qty:1,price:x.price});
          pintarPacotes(); paint();
        };
        m.querySelector("#oc-disc").addEventListener("input",paint);
        pmSel.addEventListener("change",paint);
        cliSel.addEventListener("change",()=>{ pintarPacotes(); paint(); });
        m.querySelector("[data-cancel]").onclick=Modal.close;
        pintarPacotes(); paint();

        m.querySelector("[data-save]").onclick=()=>{
          const clientId=cliSel.value;
          if(!clientId){toast("Selecione a cliente.","err");return;}
          if(!items.length){toast("Adicione ao menos um item.","err");return;}
          if (preset.apptId && Store.comandaDo(preset.apptId)) { toast("Este atendimento já tem comanda fechada.","err"); Modal.close(); return; }

          const sub = subtotal();
          const disc = +m.querySelector("#oc-disc").value || 0;
          if (disc < 0) { toast("O desconto não pode ser negativo.","err"); return; }
          if (disc > sub) { toast(`O desconto passa do valor dos itens (${fmt.money(sub)}).`,"err"); return; }
          const pm = pmSel.value;
          const valor = total();

          // Pagar com crédito: tem que haver saldo, e o saldo baixa de verdade
          const cli = Store.byId("clients", clientId);
          let creditUsed = 0;
          if (pm === "CREDIT") {
            if ((cli.credit||0) < valor) { toast(`Crédito insuficiente: ela tem ${fmt.money(cli.credit||0)}.`,"err"); return; }
            creditUsed = valor;
          }

          const pedido = Store.upsert("orders",{ clientId, proId:m.querySelector("#oc-pro").value, items,
            total: valor, discount: pm === "COURTESY" ? sub : disc, paymentMethod: pm, creditUsed,
            apptId: preset.apptId || undefined,
            // comanda de um atendimento vale no dia do atendimento, não no dia
            // em que ela lembrou de fechar
            date: preset.date || new Date().toISOString(), status:"CLOSED" });

          if (creditUsed) { cli.credit = +((cli.credit||0) - creditUsed).toFixed(2); Store.upsert("clients", cli); }

          items.forEach(i => {
            if (i.type === "product") { const p=Store.byId("products",i.refId); if(p){p.stock=Math.max(0,p.stock-i.qty);Store.upsert("products",p);} }
            if (i.usarPacote && i.pacoteCliente) { const cp = Store.byId("clientPackages", i.pacoteCliente); if (cp) { cp.remaining = Math.max(0, cp.remaining - 1); Store.upsert("clientPackages", cp); } }
            if (i.type === "package") {
              const pk = Store.byId("packages", i.refId);
              if (pk) for (let k = 0; k < i.qty; k++) {
                const vence = pk.validityDays ? new Date(Date.now() + pk.validityDays * 864e5) : null;
                Store.upsert("clientPackages", { clientId, packageId: pk.id, name: pk.name, services: pk.services.slice(),
                  total: pk.sessions, remaining: pk.sessions, orderId: pedido.id, createdAt: new Date().toISOString(),
                  expiresAt: vence ? Store.diaLocal(vence.toISOString()) : null });
              }
            }
          });

          if (preset.apptId) {
            const a = Store.byId("appts", preset.apptId);
            if (a) { a.status="DONE"; a.paid=true; a.paymentMethod=pm; a.polishId = cor || null; Store.upsert("appts",a); }
          }
          Modal.close(); rerender(); toast("Comanda fechada.","ok");
        };
      }
    });
  }

  /* =========================================================
     COBRANÇAS
     ========================================================= */
  Views.cobrancas = function () {
    const db = Store.db;
    const wrap = h(`<div class="col" style="gap:16px"></div>`);
    const sit = (c) => Store.situacaoCobranca(c);
    const pend = db.charges.filter(c=>sit(c)==="PENDING");
    const over = db.charges.filter(c=>sit(c)==="OVERDUE");
    const paid = db.charges.filter(c=>sit(c)==="PAID");

    wrap.appendChild(h(`<div class="stat-grid">
      ${[
        {l:"A receber",v:fmt.money(pend.reduce((s,c)=>s+c.amount,0)),ic:"clock",c:"var(--brand-500)"},
        {l:"Vencidas",v:fmt.money(over.reduce((s,c)=>s+c.amount,0)),ic:"alert",c:"var(--danger)"},
        {l:"Recebidas",v:fmt.money(paid.reduce((s,c)=>s+c.amount,0)),ic:"check",c:"var(--accent)"},
        {l:"Total em aberto",v:pend.length+over.length,ic:"dollar",c:"var(--gold)"},
      ].map(s=>`<div class="stat"><div class="stat-ic" style="background:color-mix(in srgb, ${s.c} 13%, transparent);color:${s.c}">${icon(s.ic)}</div>
        <div class="lbl">${s.l}</div><div class="val">${s.v}</div></div>`).join("")}</div>`));

    wrap.appendChild(h(`<div class="filterbar"><div class="grow"></div>
      <button class="btn btn-primary" id="ch-new">${icon('plus')} Nova cobrança</button></div>`));
    wrap.querySelector("#ch-new").onclick=()=>chargeForm();

    const card = h(`<div class="card"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Cliente</th><th>Descrição</th><th>Vencimento</th><th>Situação</th><th class="num">Valor</th><th></th></tr></thead>
      <tbody></tbody></table></div></div>`);
    const tb = card.querySelector("tbody");
    const sorted = db.charges.slice().sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    if(!sorted.length) tb.appendChild(h(`<tr><td colspan="6"><div class="empty"><div class="em-ic">${icon('dollar')}</div>Nenhuma cobrança registrada.</div></td></tr>`));
    sorted.forEach(ch=>{
      const c=Store.byId("clients",ch.clientId);
      const s0 = sit(ch);
      const st = s0==="PAID"?{l:"Pago",c:"b-green"}:s0==="OVERDUE"?{l:"Vencido",c:"b-red"}:{l:"Pendente",c:"b-amber"};
      const tr=h(`<tr>
        <td><div class="row gap-8">${avatar(c?c.name:"?", 'sm')}<span class="bold">${esc(c?c.name:"—")}</span></div></td>
        <td class="small">${esc(ch.desc)}</td>
        <td class="small">${fmt.date(ch.dueDate)}${ch.paidAt?`<div class="tiny muted">pago em ${fmt.date(ch.paidAt)} · ${Store.pmName(ch.paymentMethod)}</div>`:""}</td>
        <td><span class="badge ${st.c}">${st.l}</span></td>
        <td class="num bold">${fmt.money(ch.amount)}</td>
        <td class="right"><button class="btn btn-icon btn-sm btn-ghost" data-menu>${icon('list')}</button></td></tr>`);
      tr.querySelector("[data-menu]").onclick=(e)=>rowMenu(e,[
        ...(ch.status!=="PAID"?[{t:"Registrar pagamento",ic:"check",fn:()=>receberCobranca(ch)}]:[]),
        {t:"Cobrar no WhatsApp",ic:"whatsapp",fn:()=>{ if(c) window.open(waLink(c.phone, `Oi ${c.name.split(" ")[0]}, tudo bem? Passando pra lembrar do valor de ${fmt.money(ch.amount)} referente a ${ch.desc}. Qualquer dúvida estou à disposição 🙏`),"_blank"); }},
        {t:"Editar",ic:"edit",fn:()=>chargeForm(ch)},
        {t:"Excluir",ic:"trash",danger:true,fn:()=>Modal.confirm({title:"Excluir cobrança",message:"Tem certeza que deseja deletar?",danger:true,confirmText:"Excluir",onConfirm(){Store.remove("charges",ch.id);rerender();}})},
      ]);
      tb.appendChild(tr);
    });
    wrap.appendChild(card);
    return wrap;
  };

  /* Receber: quando e como. Antes só virava "Pago", sem data nem forma. */
  function receberCobranca(ch) {
    Modal.open({ title: "Registrar pagamento", size: "sm",
      body: `<div class="col" style="gap:12px">
        <p class="small muted">${esc(ch.desc)} · <b>${fmt.money(ch.amount)}</b></p>
        <div class="form-grid">
          <div class="field"><label>Recebido em</label><input class="input" type="date" id="rc-d" value="${Store.todayISO()}" /></div>
          <div class="field"><label>Forma</label><select class="select" id="rc-pm">
            ${Store.PAYMENT_METHODS.filter(p=>!["COURTESY","CREDIT"].includes(p.id)).map(p=>`<option value="${p.id}">${p.name}</option>`).join("")}</select></div>
        </div></div>`,
      footer: `<button class="btn btn-ghost" data-c>Cancelar</button><button class="btn btn-primary" data-ok>Registrar</button>`,
      onMount(m) {
        m.querySelector("[data-c]").onclick = Modal.close;
        m.querySelector("[data-ok]").onclick = () => {
          const d = m.querySelector("#rc-d").value;
          if (!d) { toast("Informe a data.", "err"); return; }
          ch.status = "PAID"; ch.paidAt = new Date(d + "T12:00:00").toISOString();
          ch.paymentMethod = m.querySelector("#rc-pm").value;
          Store.upsert("charges", ch); Modal.close(); rerender(); toast("Pagamento registrado.", "ok");
        };
      } });
  }

  function chargeForm(ch) {
    const db=Store.db; ch=ch||{};
    Modal.open({ title: ch.id?"Editar cobrança":"Nova cobrança",
      body:`<div class="form-grid">
        <div class="field full"><label>Cliente *</label><select class="select" id="cf-cli">
          ${db.clients.map(c=>`<option value="${c.id}" ${ch.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join("")}</select></div>
        <div class="field full"><label>Descrição</label><input class="input" id="cf-desc" value="${esc(ch.desc||"")}" placeholder="Pacote Noiva — parcela 2" /></div>
        <div class="field"><label>Valor (R$) *</label><input class="input" type="number" step="0.01" id="cf-amt" value="${ch.amount||""}" /></div>
        <div class="field"><label>Vencimento *</label><input class="input" type="date" id="cf-due" value="${ch.dueDate||Store.todayISO()}" /></div>
        <div class="field full"><label>Situação</label><select class="select" id="cf-st">
          <option value="PENDING" ${ch.status==="PENDING"?'selected':''}>Pendente</option>
          <option value="PAID" ${ch.status==="PAID"?'selected':''}>Pago</option></select></div>
      </div>`,
      footer:`<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
      onMount(m){m.querySelector("[data-cancel]").onclick=Modal.close;
        m.querySelector("[data-save]").onclick=()=>{
          const amt=+m.querySelector("#cf-amt").value; if(!amt){toast("Informe o valor.","err");return;}
          Store.upsert("charges",{id:ch.id,clientId:m.querySelector("#cf-cli").value,desc:m.querySelector("#cf-desc").value.trim(),
            amount:amt,dueDate:m.querySelector("#cf-due").value,status:m.querySelector("#cf-st").value});
          Modal.close();rerender();toast("Salvo com sucesso.","ok");};}});
  }

  /* =========================================================
     DESPESAS
     ========================================================= */
  Views.despesas = function () {
    const db=Store.db;
    const wrap=h(`<div class="col" style="gap:16px"></div>`);

    // Meses que têm lançamento, do mais recente para o mais antigo.
    const meses=[...new Set(db.expenses.map(e=>Store.mesLocal(e.date)))].sort().reverse();
    const atual=Store.todayISO().slice(0,7);
    if(expMonth===null) expMonth = meses.includes(atual) ? atual : (meses[0]||atual);

    const todos = expMonth==="all";
    const me = todos ? db.expenses.slice() : db.expenses.filter(e=>Store.mesLocal(e.date)===expMonth);
    const byCat={}; me.forEach(e=>byCat[e.category]=(byCat[e.category]||0)+e.amount);

    const rotulo=(m)=>{ if(m==="all") return "Todos os meses";
      const [a,b]=m.split("-"); const d=new Date(+a,+b-1,1);
      return d.toLocaleDateString("pt-BR",{month:"long",year:"numeric"}); };

    // Navegação por mês. Os cartões, a tabela e o gráfico usam o MESMO
    // recorte — antes os cartões mostravam o mês e a tabela mostrava tudo.
    const idx=meses.indexOf(expMonth);
    const bar=h(`<div class="filterbar">
      <div class="row gap-6">
        <button class="btn btn-icon btn-ghost" id="m-prev" aria-label="Mês anterior"
          ${(todos||idx<0||idx>=meses.length-1)?"disabled":""}>${icon('chevL')}</button>
        <select class="select" id="m-sel" style="width:auto;min-width:190px">
          ${meses.map(m=>`<option value="${m}" ${m===expMonth?"selected":""}>${rotulo(m)}</option>`).join("")}
          <option value="all" ${todos?"selected":""}>Todos os meses</option>
        </select>
        <button class="btn btn-icon btn-ghost" id="m-next" aria-label="Próximo mês"
          ${(todos||idx<=0)?"disabled":""}>${icon('chevR')}</button>
      </div>
      <span class="chip">${me.length} lançamento(s)</span>
      <div class="grow"></div>
      <button class="btn btn-primary" id="e-new">${icon('plus')} Nova despesa</button></div>`);

    wrap.appendChild(h(`<div class="stat-grid">
      ${[
        {l:todos?"Despesas (total)":"Despesas no mês",v:fmt.money(me.reduce((s,e)=>s+e.amount,0)),ic:"wallet",c:"var(--danger)"},
        {l:"Pagas",v:fmt.money(me.filter(e=>e.paid).reduce((s,e)=>s+e.amount,0)),ic:"check",c:"var(--accent)"},
        {l:"Em aberto",v:fmt.money(me.filter(e=>!e.paid).reduce((s,e)=>s+e.amount,0)),ic:"clock",c:"var(--warn)"},
        {l:"Lançamentos",v:me.length,ic:"list",c:"var(--brand-500)"},
      ].map(s=>`<div class="stat"><div class="stat-ic" style="background:color-mix(in srgb, ${s.c} 13%, transparent);color:${s.c}">${icon(s.ic)}</div>
        <div class="lbl">${s.l}</div><div class="val">${s.v}</div></div>`).join("")}</div>`));

    wrap.appendChild(bar);
    bar.querySelector("#e-new").onclick=()=>expenseForm();
    bar.querySelector("#m-sel").onchange=(ev)=>{ expMonth=ev.target.value; rerender(); };
    // meses[] está em ordem decrescente: índice maior = mês mais antigo
    bar.querySelector("#m-prev").onclick=()=>{ if(idx<meses.length-1){ expMonth=meses[idx+1]; rerender(); } };
    bar.querySelector("#m-next").onclick=()=>{ if(idx>0){ expMonth=meses[idx-1]; rerender(); } };

    const grid=h(`<div class="dash-grid" style="--cols:2fr 1fr;gap:16px"></div>`);
    const card=h(`<div class="card"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Situação</th><th class="num">Valor</th><th></th></tr></thead><tbody></tbody></table></div></div>`);
    const tb=card.querySelector("tbody");
    const list=me.slice().sort((a,b)=>b.date.localeCompare(a.date));
    if(!list.length) tb.appendChild(h(`<tr><td colspan="6"><div class="empty"><div class="em-ic">${icon('wallet')}</div>
      Nenhuma despesa em ${esc(rotulo(expMonth))}.</div></td></tr>`));
    list.forEach(e=>{
      const tr=h(`<tr><td class="bold">${esc(e.desc)}</td>
        <td><span class="chip">${esc(e.category)}</span></td>
        <td class="small">${fmt.date(e.date)}</td>
        <td><span class="badge ${e.paid?'b-green':'b-amber'}">${e.paid?'Paga':'Em aberto'}</span></td>
        <td class="num bold" style="color:var(--danger)">-${fmt.money(e.amount)}</td>
        <td class="right"><button class="btn btn-icon btn-sm btn-ghost" data-menu>${icon('list')}</button></td></tr>`);
      tr.querySelector("[data-menu]").onclick=(ev)=>rowMenu(ev,[
        {t:e.paid?"Marcar em aberto":"Marcar como paga",ic:"check",fn:()=>{e.paid=!e.paid;Store.upsert("expenses",e);rerender();}},
        {t:"Editar",ic:"edit",fn:()=>expenseForm(e)},
        {t:"Excluir",ic:"trash",danger:true,fn:()=>Modal.confirm({title:"Excluir despesa",message:"Tem certeza que deseja deletar?",danger:true,confirmText:"Excluir",onConfirm(){Store.remove("expenses",e.id);rerender();}})},
      ]);
      tb.appendChild(tr);
    });
    grid.appendChild(card);

    const total=Object.values(byCat).reduce((s,v)=>s+v,0)||1;
    grid.appendChild(h(`<div class="card card-pad">
      <h3 style="font-size:15px;margin-bottom:14px">Por categoria</h3>
      ${Object.entries(byCat).length?Object.entries(byCat).map(([k,v])=>`
        <div style="margin-bottom:14px"><div class="row between small" style="margin-bottom:5px">
          <span class="bold">${esc(k)}</span><span class="muted">${fmt.money(v)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(v/total*100).toFixed(0)}%"></div></div></div>`).join("")
        :`<div class="empty" style="padding:20px">Sem dados no período.</div>`}</div>`));
    wrap.appendChild(grid);
    return wrap;
  };

  function expenseForm(e) {
    const db=Store.db; e=e||{};
    Modal.open({ title:e.id?"Editar despesa":"Nova despesa",
      body:`<div class="form-grid">
        <div class="field full"><label>Descrição *</label><input class="input" id="ef-d" value="${esc(e.desc||"")}" placeholder="Aluguel do salão" /></div>
        <div class="field"><label>Categoria</label><select class="select" id="ef-c">
          ${["Fixas","Variáveis","Estoque","Impostos","Marketing","Equipe","Outros"].map(c=>`<option ${e.category===c?'selected':''}>${c}</option>`).join("")}</select></div>
        <div class="field"><label>Valor (R$) *</label><input class="input" type="number" step="0.01" id="ef-a" value="${e.amount||""}" /></div>
        <div class="field"><label>Data</label><input class="input" type="date" id="ef-dt" value="${e.date?Store.diaLocal(e.date):Store.todayISO()}" /></div>
        <div class="field"><label>Fornecedor</label><select class="select" id="ef-s"><option value="">—</option>
          ${db.suppliers.map(s=>`<option value="${s.id}" ${e.supplier===s.id?'selected':''}>${esc(s.name)}</option>`).join("")}</select></div>
        <div class="field full"><label>Já foi paga?</label><div class="row" style="height:42px">
          <span class="switch"><input type="checkbox" id="ef-p" ${e.paid?"checked":""} /><span class="track"></span><span class="thumb"></span></span></div></div>
      </div>`,
      footer:`<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
      onMount(m){m.querySelector("[data-cancel]").onclick=Modal.close;
        m.querySelector("[data-save]").onclick=()=>{
          const d=m.querySelector("#ef-d").value.trim(); if(!d){toast("Preencha a descrição.","err");return;}
          Store.upsert("expenses",{id:e.id,desc:d,category:m.querySelector("#ef-c").value,amount:+m.querySelector("#ef-a").value||0,
            date:new Date(m.querySelector("#ef-dt").value).toISOString(),supplier:m.querySelector("#ef-s").value,paid:m.querySelector("#ef-p").checked});
          Modal.close();rerender();toast("Salvo com sucesso.","ok");};}});
  }

  /* =========================================================
     PRODUTOS & ESTOQUE
     ========================================================= */
  let prodTab="produtos";
  Views.produtos = function () {
    const db=Store.db;
    const wrap=h(`<div class="col" style="gap:0"></div>`);
    const tabsEl=h(`<div class="tabs">
      <button data-t="produtos" class="${prodTab==='produtos'?'active':''}">Produtos <span class="count" style="margin-left:6px">${db.products.length}</span></button>
      <button data-t="fornecedores" class="${prodTab==='fornecedores'?'active':''}">Fornecedores <span class="count" style="margin-left:6px">${db.suppliers.length}</span></button>
    </div>`);
    tabsEl.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{prodTab=b.dataset.t;rerender();});
    wrap.appendChild(tabsEl);

    if(prodTab==="fornecedores"){
      const box=h(`<div class="col" style="gap:16px"></div>`);
      box.appendChild(h(`<div class="filterbar"><div class="grow"></div><button class="btn btn-primary" id="sp-new">${icon('plus')} Novo fornecedor</button></div>`));
      box.querySelector("#sp-new").onclick=()=>supplierForm();
      const card=h(`<div class="card"><div id="sp-list"></div></div>`);
      const l=card.querySelector("#sp-list");
      if(!db.suppliers.length) l.appendChild(h(`<div class="empty"><div class="em-ic">${icon('package')}</div>Nenhum fornecedor.</div>`));
      db.suppliers.forEach(s=>{
        const row=h(`<div class="lrow">${avatar(s.name,'sm')}
          <div class="grow"><div class="bold">${esc(s.name)}</div><div class="tiny muted">${fmt.phone(s.phone)} · ${esc(s.cnpj||"—")}</div></div>
          <button class="btn btn-icon btn-sm btn-ghost" data-e>${icon('edit')}</button>
          <button class="btn btn-icon btn-sm btn-ghost" data-d>${icon('trash')}</button></div>`);
        row.querySelector("[data-e]").onclick=()=>supplierForm(s);
        row.querySelector("[data-d]").onclick=()=>Modal.confirm({title:"Excluir fornecedor",message:"Tem certeza?",danger:true,confirmText:"Excluir",onConfirm(){Store.remove("suppliers",s.id);rerender();}});
        l.appendChild(row);
      });
      box.appendChild(card); wrap.appendChild(box); return wrap;
    }

    const box=h(`<div class="col" style="gap:16px"></div>`);
    const low=db.products.filter(p=>p.stock<=p.min);
    if(low.length) box.appendChild(h(`<div class="card card-pad" style="border-color:color-mix(in srgb,var(--warn) 40%,transparent);background:var(--warn-soft)">
      <div class="row" style="gap:10px;color:var(--warn)">${icon('alert')}
        <div><div class="bold">${low.length} produto(s) com estoque baixo</div>
        <div class="small">${low.map(p=>esc(p.name)+" ("+p.stock+")").join(" · ")}</div></div></div></div>`));

    box.appendChild(h(`<div class="stat-grid">
      ${[
        {l:"Itens em estoque",v:db.products.reduce((s,p)=>s+p.stock,0),ic:"box",c:"var(--brand-500)"},
        {l:"Valor do estoque",v:fmt.money(db.products.reduce((s,p)=>s+p.stock*p.cost,0)),ic:"dollar",c:"var(--accent)"},
        {l:"Estoque baixo",v:low.length,ic:"alert",c:"var(--warn)"},
        {l:"Produtos",v:db.products.length,ic:"package",c:"var(--gold)"},
      ].map(s=>`<div class="stat"><div class="stat-ic" style="background:color-mix(in srgb, ${s.c} 13%, transparent);color:${s.c}">${icon(s.ic)}</div>
        <div class="lbl">${s.l}</div><div class="val">${s.v}</div></div>`).join("")}</div>`));

    box.appendChild(h(`<div class="filterbar"><div class="grow"></div>
      <button class="btn btn-ghost" id="p-buy">${icon('download')} Registrar compra</button>
      <button class="btn btn-primary" id="p-new">${icon('plus')} Novo produto</button></div>`));
    box.querySelector("#p-new").onclick=()=>productForm();
    box.querySelector("#p-buy").onclick=()=>purchaseForm();

    const card=h(`<div class="card"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Produto</th><th>SKU</th><th class="num">Estoque</th><th class="num">Custo</th><th class="num">Venda</th><th>Margem</th><th></th></tr></thead><tbody></tbody></table></div></div>`);
    const tb=card.querySelector("tbody");
    if(!db.products.length) tb.appendChild(h(`<tr><td colspan="7"><div class="empty"><div class="em-ic">${icon('box')}</div>Nenhum produto cadastrado.</div></td></tr>`));
    db.products.forEach(p=>{
      const marg=p.price?Math.round((1-p.cost/p.price)*100):0;
      const tr=h(`<tr><td><div class="bold">${esc(p.name)}</div>
          <div class="tiny muted">${p.stock<=p.min?'<span style="color:var(--warn)">estoque mínimo: '+p.min+'</span>':'mín. '+p.min}</div></td>
        <td class="small muted">${esc(p.sku||"—")}</td>
        <td class="num"><span class="badge ${p.stock===0?'b-red':p.stock<=p.min?'b-amber':'b-green'}">${p.stock}</span></td>
        <td class="num">${fmt.money(p.cost)}</td><td class="num bold">${fmt.money(p.price)}</td>
        <td><span class="bold" style="color:${marg>40?'var(--accent)':'var(--warn)'}">${marg}%</span></td>
        <td class="right"><button class="btn btn-icon btn-sm btn-ghost" data-menu>${icon('list')}</button></td></tr>`);
      tr.querySelector("[data-menu]").onclick=(e)=>rowMenu(e,[
        {t:"Editar",ic:"edit",fn:()=>productForm(p)},
        {t:"Entrada de estoque",ic:"plus",fn:()=>{const v=prompt(`Quantidade a adicionar em "${p.name}":`,"10"); if(v&&!isNaN(+v)){p.stock+=+v;Store.upsert("products",p);rerender();toast("Estoque atualizado.","ok");}}},
        {t:"Excluir",ic:"trash",danger:true,fn:()=>Modal.confirm({title:"Excluir produto",message:"Tem certeza?",danger:true,confirmText:"Excluir",onConfirm(){Store.remove("products",p.id);rerender();}})},
      ]);
      tb.appendChild(tr);
    });
    box.appendChild(card);
    wrap.appendChild(box);
    return wrap;
  };

  function productForm(p){
    const db=Store.db; p=p||{};
    Modal.open({title:p.id?"Editar produto":"Novo produto",
      body:`<div class="form-grid">
        <div class="field full"><label>Nome *</label><input class="input" id="pf-n" value="${esc(p.name||"")}" placeholder="Shampoo Profissional 1L" /></div>
        <div class="field"><label>SKU / Código</label><input class="input" id="pf-s" value="${esc(p.sku||"")}" /></div>
        <div class="field"><label>Fornecedor</label><select class="select" id="pf-sup"><option value="">—</option>
          ${db.suppliers.map(s=>`<option value="${s.id}" ${p.supplier===s.id?'selected':''}>${esc(s.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Estoque atual</label><input class="input" type="number" id="pf-st" value="${p.stock||0}" /></div>
        <div class="field"><label>Estoque mínimo</label><input class="input" type="number" id="pf-mn" value="${p.min||0}" /></div>
        <div class="field"><label>Custo (R$)</label><input class="input" type="number" step="0.01" id="pf-c" value="${p.cost||0}" /></div>
        <div class="field"><label>Preço de venda (R$)</label><input class="input" type="number" step="0.01" id="pf-p" value="${p.price||0}" /></div>
      </div>`,
      footer:`<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
      onMount(m){m.querySelector("[data-cancel]").onclick=Modal.close;
        m.querySelector("[data-save]").onclick=()=>{const n=m.querySelector("#pf-n").value.trim();
          if(!n){toast("Preencha o nome.","err");return;}
          Store.upsert("products",{id:p.id,name:n,sku:m.querySelector("#pf-s").value.trim(),supplier:m.querySelector("#pf-sup").value,
            stock:+m.querySelector("#pf-st").value||0,min:+m.querySelector("#pf-mn").value||0,
            cost:+m.querySelector("#pf-c").value||0,price:+m.querySelector("#pf-p").value||0});
          Modal.close();rerender();toast("Salvo com sucesso.","ok");};}});
  }

  function supplierForm(s){
    s=s||{};
    Modal.open({title:s.id?"Editar fornecedor":"Novo fornecedor",
      body:`<div class="form-grid">
        <div class="field full"><label>Nome *</label><input class="input" id="sf-n" value="${esc(s.name||"")}" /></div>
        <div class="field"><label>Telefone</label><input class="input" id="sf-p" value="${esc(s.phone||"")}" /></div>
        <div class="field"><label>CNPJ</label><input class="input" id="sf-c" value="${esc(s.cnpj||"")}" placeholder="11.222.333/0001-81" /></div>
      </div>`,
      footer:`<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
      onMount(m){m.querySelector("[data-cancel]").onclick=Modal.close;
        m.querySelector("[data-save]").onclick=()=>{const n=m.querySelector("#sf-n").value.trim();
          if(!n){toast("Preencha o nome.","err");return;}
          Store.upsert("suppliers",{id:s.id,name:n,phone:m.querySelector("#sf-p").value.trim(),cnpj:m.querySelector("#sf-c").value.trim()});
          Modal.close();rerender();toast("Salvo com sucesso.","ok");};}});
  }

  function purchaseForm(){
    const db=Store.db;
    Modal.open({title:"Registrar compra de estoque",
      body:`<div class="form-grid">
        <div class="field"><label>Produto</label><select class="select" id="bu-p">
          ${db.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Quantidade</label><input class="input" type="number" id="bu-q" value="10" min="1" /></div>
        <div class="field"><label>Custo unitário (R$)</label><input class="input" type="number" step="0.01" id="bu-c" value="0" /></div>
        <div class="field"><label>Fornecedor</label><select class="select" id="bu-s"><option value="">—</option>
          ${db.suppliers.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div>
        <div class="field full"><label>Lançar como despesa?</label><div class="row" style="height:42px">
          <span class="switch"><input type="checkbox" id="bu-e" checked /><span class="track"></span><span class="thumb"></span></span>
          <span class="small muted">Cria automaticamente uma despesa na categoria Estoque.</span></div></div>
      </div>`,
      footer:`<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Registrar compra</button>`,
      onMount(m){m.querySelector("[data-cancel]").onclick=Modal.close;
        m.querySelector("[data-save]").onclick=()=>{
          const p=Store.byId("products",m.querySelector("#bu-p").value);
          const q=+m.querySelector("#bu-q").value||0, c=+m.querySelector("#bu-c").value||0;
          if(!p||q<=0){toast("Informe produto e quantidade.","err");return;}
          p.stock+=q; if(c) p.cost=c; Store.upsert("products",p);
          if(m.querySelector("#bu-e").checked&&c>0){
            const sup=m.querySelector("#bu-s").value;
            Store.upsert("expenses",{desc:`Compra de estoque — ${p.name} (${q}un)`,category:"Estoque",amount:q*c,
              date:new Date().toISOString(),supplier:sup,paid:true});
          }
          Modal.close();rerender();toast("Compra registrada.","ok");};}});
  }

  /* =========================================================
     PROFISSIONAIS & COMISSÃO
     ========================================================= */
  Views.profissionais = function () {
    const db=Store.db;
    const wrap=h(`<div class="col" style="gap:16px"></div>`);
    const month=Store.todayISO().slice(0,7);

    wrap.appendChild(h(`<div class="filterbar"><div class="grow"></div>
      <button class="btn btn-primary" id="pr-new">${icon('plus')} Novo profissional</button></div>`));
    wrap.querySelector("#pr-new").onclick=()=>proForm();

    const grid=h(`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:16px"></div>`);
    db.professionals.forEach(p=>{
      const orders=db.orders.filter(o=>o.proId===p.id&&Store.mesLocal(o.date)===month);
      const gross=orders.reduce((s,o)=>s+o.total,0);
      const comm=gross*(p.commission/100);
      const appts=db.appts.filter(a=>a.proId===p.id&&a.status==="DONE").length;
      const card=h(`<div class="card card-pad">
        <div class="row between" style="align-items:flex-start">
          <div class="row" style="gap:12px">
            <span class="avatar md" style="background:${p.color}">${fmt.initials(p.name)}</span>
            <div><div style="font-family:var(--display);font-weight:700">${esc(p.name)}</div>
              <div class="tiny muted">${Store.ROLES[p.role].label}</div></div></div>
          <button class="btn btn-icon btn-sm btn-ghost" data-menu>${icon('list')}</button></div>
        <div class="divider" style="margin:14px 0"></div>
        <div class="row between"><div><div class="tiny faint bold">FATUROU (MÊS)</div>
            <div style="font-family:var(--display);font-weight:800;font-size:17px">${fmt.money(gross)}</div></div>
          <div class="right"><div class="tiny faint bold">COMISSÃO ${p.commission}%</div>
            <div style="font-family:var(--display);font-weight:800;font-size:17px;color:var(--accent)">${fmt.money(comm)}</div></div></div>
        <div class="row between small muted" style="margin-top:12px">
          <span>${appts} atendimentos</span>
          <span>${(p.services||[]).length} serviços habilitados</span></div>
        <button class="btn btn-ghost btn-block btn-sm" style="margin-top:12px" data-pay>${icon('dollar')} Fechar comissão</button>
      </div>`);
      card.querySelector("[data-menu]").onclick=(e)=>rowMenu(e,[
        {t:"Editar",ic:"edit",fn:()=>proForm(p)},
        {t:"Ver agenda",ic:"calendar",fn:()=>go("agenda")},
        {t:"Excluir",ic:"trash",danger:true,fn:()=>Modal.confirm({title:"Excluir profissional",message:"Tem certeza?",danger:true,confirmText:"Excluir",onConfirm(){Store.remove("professionals",p.id);rerender();}})},
      ]);
      card.querySelector("[data-pay]").onclick=()=>{
        Modal.open({title:`Fechamento de comissão — ${esc(p.name)}`,size:"sm",
          body:`<div class="col" style="gap:12px">
            <div class="row between"><span class="muted">Período</span><span class="bold">${new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</span></div>
            <div class="row between"><span class="muted">Atendimentos</span><span class="bold">${orders.length}</span></div>
            <div class="row between"><span class="muted">Faturamento bruto</span><span class="bold">${fmt.money(gross)}</span></div>
            <div class="row between"><span class="muted">Percentual</span><span class="bold">${p.commission}%</span></div>
            <div class="divider" style="margin:4px 0"></div>
            <div class="row between"><span class="bold">Total a pagar</span>
              <span style="font-family:var(--display);font-weight:800;font-size:20px;color:var(--accent)">${fmt.money(comm)}</span></div></div>`,
          footer:`<button class="btn btn-ghost" data-c>Fechar</button><button class="btn btn-primary" data-ok>Lançar pagamento</button>`,
          onMount(m){m.querySelector("[data-c]").onclick=Modal.close;
            m.querySelector("[data-ok]").onclick=()=>{
              Store.upsert("expenses",{desc:`Comissão — ${p.name}`,category:"Equipe",amount:comm,date:new Date().toISOString(),supplier:"",paid:true});
              Modal.close();rerender();toast("Comissão lançada nas despesas.","ok");};}});
      };
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    return wrap;
  };

  function proForm(p){
    const db=Store.db; p=p||{services:[]};
    Modal.open({title:p.id?"Editar profissional":"Novo profissional",
      body:`<div class="form-grid">
        <div class="field full"><label>Nome *</label><input class="input" id="pr-n" value="${esc(p.name||"")}" /></div>
        <div class="field"><label>E-mail</label><input class="input" type="email" id="pr-e" value="${esc(p.email||"")}" /></div>
        <div class="field"><label>Telefone</label><input class="input" id="pr-p" data-fone value="${esc(p.phone||"")}" /></div>
        <div class="field"><label>Perfil de acesso</label><select class="select" id="pr-r">
          ${Object.values(Store.ROLES).map(r=>`<option value="${r.id}" ${p.role===r.id?'selected':''}>${r.label}</option>`).join("")}</select></div>
        <div class="field"><label>Comissão (%)</label><input class="input" type="number" id="pr-c" value="${p.commission||0}" min="0" max="100" /></div>
        <div class="field full"><label>Cor de identificação</label><div id="pr-col"></div>
          <span class="hint">Aparece no avatar e no portal da cliente.</span></div>
        <div class="field"><label>Ativo</label><div class="row" style="height:42px">
          <span class="switch"><input type="checkbox" id="pr-a" ${p.active!==false?"checked":""} /><span class="track"></span><span class="thumb"></span></span></div></div>
        <div class="field full"><label>Serviços que executa</label>
          <select class="select" id="pr-s" multiple size="5" style="height:auto;padding:8px">
          ${db.services.map(s=>`<option value="${s.id}" ${(p.services||[]).includes(s.id)?'selected':''}>${esc(s.name)}</option>`).join("")}</select></div>
      </div>`,
      footer:`<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
      onMount(m){m.querySelector("[data-cancel]").onclick=Modal.close;
        let corPro=p.color||"#b31f52"; Views.paletaDePerfil(m.querySelector("#pr-col"),corPro,c=>{corPro=c;});
        m.querySelector("[data-save]").onclick=()=>{const n=m.querySelector("#pr-n").value.trim();
          if(!n){toast("Preencha o nome.","err");return;}
          Store.upsert("professionals",{id:p.id,name:n,email:m.querySelector("#pr-e").value.trim(),phone:m.querySelector("#pr-p").value.trim(),
            role:m.querySelector("#pr-r").value,commission:+m.querySelector("#pr-c").value||0,color:corPro,
            active:m.querySelector("#pr-a").checked,services:[...m.querySelector("#pr-s").selectedOptions].map(o=>o.value)});
          Modal.close();rerender();toast("Salvo com sucesso.","ok");};}});
  }
})();
