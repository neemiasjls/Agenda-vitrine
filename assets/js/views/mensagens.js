/* ============================================================
   SERENA — Mensagens Pré-definidas (feature destaque)
   Modelos de WhatsApp com variáveis dinâmicas + preview ao vivo
   ============================================================ */
window.Views = window.Views || {};

(function () {
  const CATEGORIES = ["Confirmação", "Lembrete", "Retorno", "Relacionamento", "Financeiro", "Outros"];
  const CAT_STYLE = {
    "Confirmação": { cls: "b-green", ic: "check" },
    "Lembrete": { cls: "b-violet", ic: "clock" },
    "Retorno": { cls: "b-amber", ic: "refresh" },
    "Relacionamento": { cls: "b-violet", ic: "heart" },
    "Financeiro": { cls: "b-gray", ic: "dollar" },
    "Outros": { cls: "b-gray", ic: "message" },
  };

  let selectedId = null;
  let filterCat = "todas";
  let query = "";

  /* ---------- Substituição de variáveis ---------- */
  Views.renderTemplate = function (body, client, ctx) {
    ctx = ctx || {};
    const c = client || {};
    const first = (c.name || "Cliente").split(" ")[0];
    const start = ctx.start ? new Date(ctx.start) : null;
    const end = start ? new Date(start.getTime() + (ctx.durationMin || 60) * 60000) : null;
    const map = {
      "#{cliente}": first,
      "#{cliente_completo}": c.name || "Cliente",
      "#{servico}": ctx.serviceName || "seu serviço",
      "#{profissional}": ctx.proName || (Store.currentUser() || {}).name || "nossa equipe",
      "#{data_horario}": start ? fmt.dateTime(start) : "[data]",
      "#{data_formato1}": start ? fmt.date(start) : "[data]",
      "#{data_formato2}": start ? start.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }) : "[data]",
      "#{hora_inicio}": start ? fmt.time(start) : "[horário]",
      "#{hora_fim}": end ? fmt.time(end) : "[horário]",
      "#{valorTotal}": ctx.price != null ? fmt.money(ctx.price) : "[valor]",
    };
    let out = body || "";
    Object.entries(map).forEach(([k, v]) => { out = out.split(k).join(v); });
    return out;
  };

  // Preview com valores de exemplo (quando não há cliente escolhido)
  function previewSample(body) {
    let out = body || "";
    Store.MSG_VARS.forEach(v => { out = out.split(v.tag).join(v.sample); });
    return out;
  }

  // Destaca variáveis no editor (visualização)
  function highlight(body) {
    return esc(body).replace(/#\{[a-zA-Z_0-9]+\}/g,
      m => `<span style="background:var(--brand-100);color:var(--brand-700);border-radius:4px;padding:0 3px;font-weight:600">${m}</span>`);
  }

  /* ---------- View principal ---------- */
  Views.mensagens = function () {
    const db = Store.db;
    if (!selectedId || !Store.byId("messages", selectedId)) selectedId = db.messages[0] ? db.messages[0].id : null;

    const wrap = h(`<div class="col" style="gap:18px"></div>`);

    wrap.appendChild(h(`<div class="row between wrap" style="gap:14px">
      <div>
        <h1 style="font-size:24px">Mensagens Pré-definidas</h1>
        <p class="page-sub">Modelos prontos de WhatsApp com variáveis que se preenchem sozinhas.</p>
      </div>
      <div class="row gap-8">
        <button class="btn btn-ghost" id="msg-help">${icon('sparkles')} Como funciona</button>
        <button class="btn btn-primary" id="msg-new">${icon('plus')} Nova mensagem</button>
      </div>
    </div>`));
    wrap.querySelector("#msg-new").onclick = () => { selectedId = null; openEditor(null); };
    wrap.querySelector("#msg-help").onclick = helpDialog;

    // Stats
    wrap.appendChild(h(`<div class="stat-grid">
      ${[
        {l:"Modelos criados",v:db.messages.length,ic:"message",c:"var(--brand-500)"},
        {l:"Ativos",v:db.messages.filter(m=>m.active).length,ic:"check",c:"var(--accent)"},
        {l:"Favoritos",v:db.messages.filter(m=>m.favorite).length,ic:"star",c:"var(--gold)"},
        {l:"Variáveis disponíveis",v:Store.MSG_VARS.length,ic:"tag",c:"#e64980"},
      ].map(s=>`<div class="stat"><div class="stat-ic" style="background:color-mix(in srgb, ${s.c} 13%, transparent);color:${s.c}">${icon(s.ic)}</div>
        <div class="lbl">${s.l}</div><div class="val">${s.v}</div></div>`).join("")}</div>`));

    // Filtros
    const bar = h(`<div class="filterbar">
      <div class="input-group" style="max-width:300px;flex:1"><span class="ic-left">${icon('search')}</span>
        <input class="input" id="m-q" placeholder="Buscar modelo..." value="${esc(query)}" /></div>
      <div class="seg" id="m-cats">
        <button data-c="todas" class="${filterCat==='todas'?'active':''}">Todas</button>
        ${CATEGORIES.map(c=>`<button data-c="${c}" class="${filterCat===c?'active':''}">${c}</button>`).join("")}
      </div></div>`);
    wrap.appendChild(bar);
    bar.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { filterCat = b.dataset.c; rerender(); });
    bar.querySelector("#m-q").addEventListener("input", (e) => { query = e.target.value; paintList(); });

    // Layout: lista + preview
    const grid = h(`<div class="msg-grid"></div>`);
    const listCol = h(`<div class="col" style="gap:12px" id="m-list"></div>`);
    const sideCol = h(`<div id="m-side" class="msg-side"></div>`);
    grid.appendChild(listCol); grid.appendChild(sideCol);
    wrap.appendChild(grid);

    function paintList() {
      const q = query.trim().toLowerCase();
      let list = db.messages.slice();
      if (filterCat !== "todas") list = list.filter(m => m.category === filterCat);
      if (q) list = list.filter(m => (m.title + m.body).toLowerCase().includes(q));
      list.sort((a,b) => (b.favorite?1:0)-(a.favorite?1:0) || a.title.localeCompare(b.title));

      listCol.innerHTML = "";
      if (!list.length) { listCol.appendChild(h(`<div class="card"><div class="empty">
        <div class="em-ic">${icon('message')}</div>Nenhum modelo encontrado.
        <button class="btn btn-sm btn-primary" style="margin-top:8px" id="e-new">${icon('plus')} Criar modelo</button></div></div>`));
        listCol.querySelector("#e-new").onclick = () => openEditor(null); return; }

      list.forEach(m => {
        const cs = CAT_STYLE[m.category] || CAT_STYLE["Outros"];
        const vars = (m.body.match(/#\{[a-zA-Z_0-9]+\}/g) || []).length;
        const card = h(`<div class="card card-pad clickable" style="${selectedId===m.id?'border-color:var(--brand-500);box-shadow:var(--ring)':''}">
          <div class="row between" style="align-items:flex-start;gap:10px">
            <div class="row gap-8" style="min-width:0">
              <span class="badge ${cs.cls}">${icon(cs.ic)} ${m.category}</span>
              ${m.favorite?`<span style="color:var(--gold)" title="Favorito">${icon('star')}</span>`:''}
              ${!m.active?`<span class="badge b-gray">inativo</span>`:''}
            </div>
            <button class="btn btn-icon btn-sm btn-ghost" data-menu>${icon('list')}</button>
          </div>
          <div style="font-family:var(--display);font-weight:700;font-size:15.5px;margin-top:10px">${esc(m.title)}</div>
          <div class="small muted clamp-2" style="margin-top:6px">${highlight(m.body.slice(0,140))}${m.body.length>140?'…':''}</div>
          <div class="row between" style="margin-top:14px">
            <span class="tiny faint">${vars} variável(is) · ${m.body.length} caracteres</span>
            <div class="row gap-6">
              <button class="btn btn-sm btn-ghost" data-copy title="Copiar texto">${icon('copy')}</button>
              <button class="btn btn-sm btn-accent" data-send>${icon('whatsapp')} Enviar</button>
            </div>
          </div>
        </div>`);
        card.onclick = (e) => { if (e.target.closest("button")) return; selectedId = m.id; paintList(); paintSide(); };
        card.querySelector("[data-copy]").onclick = () => {
          navigator.clipboard && navigator.clipboard.writeText(m.body);
          toast("Modelo copiado para a área de transferência.", "ok");
        };
        card.querySelector("[data-send]").onclick = () => sendDialog(m);
        card.querySelector("[data-menu]").onclick = (e) => rowMenu(e, [
          { t:"Editar", ic:"edit", fn:()=>openEditor(m) },
          { t:m.favorite?"Remover dos favoritos":"Marcar como favorito", ic:"star", fn:()=>{ m.favorite=!m.favorite; Store.upsert("messages",m); rerender(); } },
          { t:m.active?"Desativar":"Ativar", ic:"check", fn:()=>{ m.active=!m.active; Store.upsert("messages",m); rerender(); } },
          { t:"Duplicar", ic:"copy", fn:()=>{ Store.upsert("messages",{title:m.title+" (cópia)",category:m.category,body:m.body,active:false,favorite:false}); rerender(); toast("Modelo duplicado.","ok"); } },
          { t:"Excluir", ic:"trash", danger:true, fn:()=>Modal.confirm({title:"Excluir modelo",message:`Excluir "${esc(m.title)}"? Esta ação não pode ser desfeita.`,danger:true,confirmText:"Excluir",
              onConfirm(){ Store.remove("messages",m.id); selectedId=null; rerender(); toast("Modelo excluído.","ok"); }}) },
        ]);
        listCol.appendChild(card);
      });
    }

    function paintSide() {
      const m = Store.byId("messages", selectedId);
      sideCol.innerHTML = "";
      if (!m) { sideCol.appendChild(h(`<div class="card"><div class="empty">
        <div class="em-ic">${icon('message')}</div>Selecione um modelo para pré-visualizar.</div></div>`)); return; }

      const card = h(`<div class="card">
        <div class="card-head"><h3>Pré-visualização</h3>
          <span class="chip">${icon('whatsapp')} WhatsApp</span></div>
        <div class="card-pad">
          <div class="wa-shell">
            <div class="wa-preview">${esc(previewSample(m.body))}
              <div style="text-align:right;font-size:10.5px;opacity:.55;margin-top:6px">${fmt.time(new Date())} ✓✓</div></div>
          </div>
          <p class="tiny muted center" style="margin-top:10px">Exemplo com dados fictícios. Ao enviar, as variáveis usam os dados reais da cliente.</p>
          <div class="divider"></div>
          <div class="tiny faint bold" style="margin-bottom:8px">VARIÁVEIS USADAS NESTE MODELO</div>
          <div class="row wrap gap-6">
            ${(() => { const used=[...new Set(m.body.match(/#\{[a-zA-Z_0-9]+\}/g)||[])];
              return used.length? used.map(u=>{const v=Store.MSG_VARS.find(x=>x.tag===u);
                return `<span class="var-pill" title="${v?esc(v.label):''}">${u}</span>`;}).join("")
                : '<span class="small muted">Nenhuma variável — texto fixo.</span>'; })()}
          </div>
          <div class="divider"></div>
          <div class="col gap-8">
            <button class="btn btn-primary btn-block" id="pv-send">${icon('whatsapp')} Enviar para uma cliente</button>
            <button class="btn btn-ghost btn-block" id="pv-edit">${icon('edit')} Editar modelo</button>
          </div>
        </div></div>`);
      card.querySelector("#pv-send").onclick = () => sendDialog(m);
      card.querySelector("#pv-edit").onclick = () => openEditor(m);
      sideCol.appendChild(card);

      // painel de variáveis disponíveis
      sideCol.appendChild(h(`<div class="card" style="margin-top:16px">
        <div class="card-head"><h3>Variáveis disponíveis</h3></div>
        <div class="card-pad col" style="gap:8px">
          ${Store.MSG_VARS.map(v=>`<div class="row between" style="gap:10px">
            <code style="font-size:11.5px;color:var(--brand-600);font-weight:700">${v.tag}</code>
            <span class="tiny muted right">${esc(v.label)}</span></div>`).join("")}
        </div></div>`));
    }

    paintList(); paintSide();
    return wrap;
  };

  /* ---------- Editor de modelo ---------- */
  function openEditor(m) {
    m = m || { category: "Confirmação", active: true, favorite: false, body: "" };
    Modal.open({
      title: m.id ? "Editar mensagem" : "Nova mensagem pré-definida", size: "lg",
      body: `<div class="col" style="gap:16px">
        <div class="form-grid">
          <div class="field"><label>Título do modelo *</label>
            <input class="input" id="me-title" value="${esc(m.title||"")}" placeholder="Confirmação de agendamento" /></div>
          <div class="field"><label>Categoria</label><select class="select" id="me-cat">
            ${CATEGORIES.map(c=>`<option ${m.category===c?'selected':''}>${c}</option>`).join("")}</select></div>
        </div>

        <div class="field">
          <label>Texto da mensagem *</label>
          <textarea class="textarea" id="me-body" style="min-height:150px"
            placeholder="Escreva a mensagem e clique nas variáveis abaixo para inserir...">${esc(m.body||"")}</textarea>
          <div class="row between" style="margin-top:6px">
            <span class="hint">Dica: use *asteriscos* para negrito no WhatsApp.</span>
            <span class="hint mono" id="me-count">0 caracteres</span>
          </div>
        </div>

        <div>
          <div class="tiny faint bold" style="margin-bottom:8px">CLIQUE PARA INSERIR UMA VARIÁVEL</div>
          <div class="row wrap gap-6" id="me-vars">
            ${Store.MSG_VARS.map(v=>`<button type="button" class="var-pill" data-tag="${v.tag}" title="${esc(v.label)}">${icon('plus')} ${v.tag}</button>`).join("")}
          </div>
        </div>

        <div>
          <div class="tiny faint bold" style="margin-bottom:8px">PRÉ-VISUALIZAÇÃO</div>
          <div class="wa-shell"><div class="wa-preview" id="me-prev">—</div></div>
        </div>

        <div class="row gap-16 wrap">
          <label class="row" style="gap:8px;cursor:pointer;font-size:13px">
            <span class="switch"><input type="checkbox" id="me-act" ${m.active!==false?"checked":""} /><span class="track"></span><span class="thumb"></span></span>
            Modelo ativo</label>
          <label class="row" style="gap:8px;cursor:pointer;font-size:13px">
            <span class="switch"><input type="checkbox" id="me-fav" ${m.favorite?"checked":""} /><span class="track"></span><span class="thumb"></span></span>
            Favorito</label>
        </div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancelar</button>
               <button class="btn btn-primary" data-save>${m.id?"Salvar alterações":"Criar modelo"}</button>`,
      onMount(mo) {
        const ta = mo.querySelector("#me-body");
        const prev = mo.querySelector("#me-prev");
        const count = mo.querySelector("#me-count");
        const sync = () => {
          prev.textContent = previewSample(ta.value) || "Sua mensagem aparecerá aqui...";
          count.textContent = ta.value.length + " caracteres";
        };
        ta.addEventListener("input", sync); sync();

        mo.querySelectorAll("[data-tag]").forEach(b => b.onclick = () => {
          const tag = b.dataset.tag;
          const s = ta.selectionStart, e = ta.selectionEnd;
          ta.value = ta.value.slice(0, s) + tag + ta.value.slice(e);
          ta.focus(); ta.selectionStart = ta.selectionEnd = s + tag.length;
          sync();
        });

        mo.querySelector("[data-cancel]").onclick = Modal.close;
        mo.querySelector("[data-save]").onclick = () => {
          const title = mo.querySelector("#me-title").value.trim();
          const body = ta.value.trim();
          if (!title) { toast("Preencha o título do modelo.", "err"); return; }
          if (!body) { toast("Escreva o texto da mensagem.", "err"); return; }
          const saved = Store.upsert("messages", { id: m.id, title, body,
            category: mo.querySelector("#me-cat").value,
            active: mo.querySelector("#me-act").checked,
            favorite: mo.querySelector("#me-fav").checked });
          selectedId = saved.id;
          Modal.close(); rerender();
          toast(m.id ? "Modelo atualizado." : "Modelo criado com sucesso.", "ok");
        };
      }
    });
  }

  /* ---------- Enviar mensagem (escolher cliente + contexto) ---------- */
  function sendDialog(m) {
    const db = Store.db;
    const upcoming = db.appts.filter(a => a.status !== "CANCELED" && new Date(a.start) >= new Date(Date.now()-864e5))
      .sort((a,b)=>a.start.localeCompare(b.start));

    Modal.open({
      title: "Enviar mensagem", size: "lg",
      body: `<div class="col" style="gap:16px">
        <div class="card card-pad" style="background:var(--surface-2)">
          <div class="tiny faint bold">MODELO SELECIONADO</div>
          <div class="bold" style="margin-top:4px">${esc(m.title)}</div></div>

        <div class="seg" id="sd-mode" style="width:fit-content">
          <button data-m="appt" class="active">A partir de um agendamento</button>
          <button data-m="cli">Escolher cliente</button>
        </div>

        <div id="sd-picker"></div>

        <div>
          <div class="tiny faint bold" style="margin-bottom:8px">MENSAGEM QUE SERÁ ENVIADA</div>
          <div class="wa-shell"><div class="wa-preview" id="sd-prev">—</div></div>
        </div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancelar</button>
               <button class="btn btn-ghost" id="sd-copy">${icon('copy')} Copiar</button>
               <button class="btn btn-accent" id="sd-go">${icon('whatsapp')} Abrir no WhatsApp</button>`,
      onMount(mo) {
        const picker = mo.querySelector("#sd-picker");
        const prev = mo.querySelector("#sd-prev");
        let current = { client: null, ctx: {} };

        const refresh = () => {
          prev.textContent = current.client
            ? Views.renderTemplate(m.body, current.client, current.ctx)
            : previewSample(m.body);
        };

        const paintPicker = (mode) => {
          if (mode === "appt") {
            picker.innerHTML = `<div class="field"><label>Agendamento</label>
              <select class="select" id="sd-appt"><option value="">Selecione um agendamento...</option>
              ${upcoming.map(a=>{const v=Store.apptView(a);
                return `<option value="${a.id}">${fmt.date(a.start)} ${fmt.time(a.start)} — ${esc(v.client.name)} (${esc(v.service.name)})</option>`;}).join("")}
              </select></div>`;
            const sel = picker.querySelector("#sd-appt");
            sel.onchange = () => {
              const a = Store.byId("appts", sel.value);
              if (!a) { current = { client:null, ctx:{} }; refresh(); return; }
              const v = Store.apptView(a);
              current = { client: v.client, ctx: { start:a.start, durationMin:a.durationMin, price:a.price,
                serviceName:v.service.name, proName:v.pro.name } };
              refresh();
            };
            if (upcoming.length) { sel.value = upcoming[0].id; sel.onchange(); }
          } else {
            picker.innerHTML = `<div class="field"><label>Cliente</label>
              <select class="select" id="sd-cli"><option value="">Selecione um cliente...</option>
              ${db.clients.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${c.id}">${esc(c.name)} — ${fmt.phone(c.phone)}</option>`).join("")}
              </select></div>`;
            const sel = picker.querySelector("#sd-cli");
            sel.onchange = () => { current = { client: Store.byId("clients", sel.value), ctx: {} }; refresh(); };
            if (db.clients.length) { sel.value = db.clients[0].id; sel.onchange(); }
          }
        };
        paintPicker("appt");
        mo.querySelectorAll("#sd-mode button").forEach(b => b.onclick = () => {
          mo.querySelectorAll("#sd-mode button").forEach(x=>x.classList.remove("active"));
          b.classList.add("active"); current={client:null,ctx:{}}; paintPicker(b.dataset.m);
        });

        mo.querySelector("[data-cancel]").onclick = Modal.close;
        mo.querySelector("#sd-copy").onclick = () => {
          navigator.clipboard && navigator.clipboard.writeText(prev.textContent);
          toast("Mensagem copiada.", "ok");
        };
        mo.querySelector("#sd-go").onclick = () => {
          if (!current.client) { toast("Selecione uma cliente para enviar.", "err"); return; }
          window.open(waLink(current.client.phone, prev.textContent), "_blank");
          Modal.close(); toast("WhatsApp aberto em nova aba.", "ok");
        };
      }
    });
  }
  Views.sendMessageDialog = sendDialog;

  /* ---------- Atalho: escolher modelo para um cliente/agendamento ---------- */
  /* Variáveis que só fazem sentido com um horário marcado. */
  const PRECISA_HORARIO = ["#{data_horario}", "#{data_formato1}", "#{data_formato2}", "#{hora_inicio}", "#{hora_fim}", "#{valorTotal}"];

  /* De onde vêm as variáveis quando ela manda a partir da lista de clientes,
     sem um agendamento na mão. Antes ficava tudo vazio e o texto saía com
     a data e a hora de AGORA e valor R$ 0,00 — uma "confirmação" de um
     horário que não existia, mandada para uma cliente de verdade. */
  function contextoPara(v) {
    if (v.service) return { start: v.start, durationMin: v.durationMin, price: v.price,
      serviceName: v.service.name, proName: v.pro && v.pro.name, fonte: "deste horário" };
    const c = v.client || {};
    const agora = new Date();
    const dela = Store.db.appts.filter(a => a.clientId === c.id);
    const prox = dela.filter(a => new Date(a.start) >= agora && a.status !== "CANCELED" && a.status !== "NO_SHOW")
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    const ult = dela.filter(a => a.status === "DONE").sort((a, b) => b.start.localeCompare(a.start))[0];
    const ref = prox || null;
    const svc = Store.byId("services", (prox || ult || {}).serviceId);
    return {
      start: ref && ref.start, durationMin: ref && ref.durationMin, price: ref && ref.price,
      serviceName: svc && svc.name, temHorario: Boolean(ref),
      fonte: prox ? "do próximo horário dela" : ult ? "do último serviço dela" : null,
    };
  }

  Views.pickMessageFor = function (v) {
    const db = Store.db;
    const active = db.messages.filter(m => m.active);
    const ctx = contextoPara(v);
    const semHorario = !v.service && !ctx.temHorario;
    const usaHorario = (body) => PRECISA_HORARIO.some(t => (body || "").includes(t));
    Modal.open({
      title: `Enviar mensagem para ${esc((v.client.name||"").split(" ")[0])}`, size:"lg",
      body: `<div class="col" style="gap:12px" id="pm-list">
        ${ctx.fonte ? `<p class="tiny muted" style="margin:-2px 0 2px">Os dados do texto vêm ${ctx.fonte}.</p>` : ""}
        ${active.length ? active.map(m=>{
          const cs = CAT_STYLE[m.category]||CAT_STYLE["Outros"];
          const bloqueado = semHorario && usaHorario(m.body);
          return `<div class="card card-pad${bloqueado ? " msg-off" : " clickable"}" data-id="${m.id}">
            <div class="row between"><span class="badge ${cs.cls}">${icon(cs.ic)} ${m.category}</span>
              ${bloqueado ? `<span class="tiny muted">precisa de um horário marcado</span>`
                          : `<button class="btn btn-sm btn-accent" data-go="${m.id}">${icon('whatsapp')} Revisar e enviar</button>`}</div>
            <div class="bold" style="margin-top:8px">${esc(m.title)}</div>
            <div class="small muted" style="margin-top:6px;line-height:1.55">${esc(Views.renderTemplate(m.body, v.client, ctx).slice(0,180))}${m.body.length>180?'…':''}</div>
          </div>`;}).join("")
          : `<div class="empty"><div class="em-ic">${icon('message')}</div>Nenhum modelo ativo. Crie um em Mensagens Pré-definidas.</div>`}
      </div>`,
      footer: `<button class="btn btn-ghost" data-c>Fechar</button>
               <button class="btn btn-ghost" id="pm-free">${icon('edit')} Mensagem livre</button>`,
      onMount(mo) {
        mo.querySelector("[data-c]").onclick = Modal.close;
        /* Revisar antes de mandar: o texto vai para uma pessoa de verdade, e
           o preview da lista corta em 180 caracteres. */
        const revisar = (m) => {
          const texto = Views.renderTemplate(m.body, v.client, ctx);
          Modal.open({ title: esc(m.title), body: `<div class="col" style="gap:10px">
              <div class="small muted">Para <b>${esc(v.client.name || "")}</b> · ${fmt.phone(v.client.phone)}</div>
              <textarea class="textarea" id="rv-txt" style="min-height:170px">${esc(texto)}</textarea>
              <span class="hint">Ajuste o que quiser. Nada é enviado sozinho: o WhatsApp abre e você manda.</span></div>`,
            footer: `<button class="btn btn-ghost" data-v>Voltar</button><button class="btn btn-accent" data-ok>${icon('whatsapp')} Abrir WhatsApp</button>`,
            onMount(mm) {
              mm.querySelector("[data-v]").onclick = () => Views.pickMessageFor(v);
              mm.querySelector("[data-ok]").onclick = () => {
                if (!(v.client.phone || "").replace(/\D/g, "")) { toast("Esta cliente não tem telefone cadastrado.", "err"); return; }
                window.open(waLink(v.client.phone, mm.querySelector("#rv-txt").value), "_blank");
                Modal.close();
              };
            } });
        };
        mo.querySelectorAll("[data-go]").forEach(b => b.onclick = (e) => { e.stopPropagation(); revisar(Store.byId("messages", b.dataset.go)); });
        mo.querySelectorAll(".card.clickable[data-id]").forEach(cd => cd.onclick = () => revisar(Store.byId("messages", cd.dataset.id)));
        mo.querySelector("#pm-free").onclick = () => {
          Modal.close();
          window.open(waLink(v.client.phone, ""), "_blank");
        };
      }
    });
  };

  function helpDialog() {
    Modal.open({
      title: "Como funcionam as mensagens pré-definidas",
      body: `<div class="col" style="gap:16px">
        ${[
          {ic:"edit",t:"1. Crie um modelo",d:"Escreva o texto uma única vez — por exemplo, a confirmação de agendamento que você manda todo dia."},
          {ic:"tag",t:"2. Insira variáveis",d:"Clique em variáveis como #{cliente} ou #{data_horario}. Elas são substituídas automaticamente pelos dados reais."},
          {ic:"whatsapp",t:"3. Envie em um clique",d:"Escolha o agendamento ou a cliente e o sistema abre o WhatsApp com a mensagem já pronta."},
          {ic:"star",t:"4. Organize por categoria",d:"Confirmação, lembrete, retorno, relacionamento e financeiro — marque os favoritos para acesso rápido."},
        ].map(s=>`<div class="row" style="gap:12px;align-items:flex-start">
          <span class="badge b-violet" style="width:34px;height:34px;justify-content:center;border-radius:10px;flex:none">${icon(s.ic)}</span>
          <div><div class="bold">${s.t}</div><div class="small muted" style="margin-top:2px">${s.d}</div></div></div>`).join("")}
        <div class="card card-pad" style="background:var(--surface-2)">
          <div class="tiny faint bold">EXEMPLO</div>
          <div class="small" style="margin-top:6px;line-height:1.7">
            <code style="color:var(--brand-600)">Oi #{cliente}, seu #{servico} é #{data_horario}!</code><br>
            <span class="muted">vira</span><br>
            <span class="bold">Oi Marina, seu Corte + Escova é seg, 15/09 às 14:00!</span></div></div>
      </div>`,
      footer: `<button class="btn btn-primary" data-c>Entendi</button>`,
      onMount(m){ m.querySelector("[data-c]").onclick = Modal.close; }
    });
  }
})();
