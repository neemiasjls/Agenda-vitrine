/* ============================================================
   nailagenda — Clientes, ficha completa, anamnese, créditos, unificação
   ============================================================ */
window.Views = window.Views || {};

(function () {
  let filter = { q: "", tab: "todos" };

  Views.clientes = function () {
    const db = Store.db;
    const wrap = h(`<div class="col" style="gap:0"></div>`);

    const today = new Date();
    const monthKey = Store.todayISO().slice(5,7);
    const lastVisitOf = (id) => {
      const list = db.appts.filter(a => a.clientId===id && a.status==="DONE").sort((a,b)=>b.start.localeCompare(a.start));
      return list[0] ? list[0].start : null;
    };
    const spendOf = (id) => db.orders.filter(o=>o.clientId===id).reduce((s,o)=>s+o.total,0);

    const tabs = [
      { id:"todos", label:"Todos", n:db.clients.length },
      { id:"aniversariantes", label:"Aniversariantes do mês", n:db.clients.filter(c=>c.birthdate&&c.birthdate.slice(5,7)===monthKey).length },
      { id:"sumidos", label:"Sumidas (60+ dias)", n:db.clients.filter(c=>{const lv=lastVisitOf(c.id); return !lv || (today-new Date(lv))/864e5>60;}).length },
      { id:"credito", label:"Com crédito", n:db.clients.filter(c=>c.credit>0).length },
      { id:"vip", label:"VIP", n:db.clients.filter(c=>(c.tags||[]).includes("VIP")).length },
    ];

    const bar = h(`<div class="filterbar cli-bar">
      <div class="input-group cli-busca">
        <span class="ic-left">${icon('search')}</span>
        <input class="input" id="cli-search" placeholder="Buscar por nome, telefone ou e-mail" value="${esc(filter.q)}" />
      </div>
      <div class="grow"></div>
      <button class="btn btn-ghost" id="merge">${icon('layers')} Unificar duplicados</button>
      <button class="btn btn-primary" id="new-cli">${icon('plus')} Nova cliente</button>
    </div>`);
    wrap.appendChild(bar);

    const tabsEl = h(`<div class="tabs">${tabs.map(t=>`<button data-tab="${t.id}" class="${filter.tab===t.id?'active':''}">${t.label} <span class="count" style="margin-left:6px">${t.n}</span></button>`).join("")}</div>`);
    wrap.appendChild(tabsEl);
    tabsEl.querySelectorAll("[data-tab]").forEach(b=> b.onclick=()=>{ filter.tab=b.dataset.tab; rerender(); });

    bar.querySelector("#new-cli").onclick = () => Views.clientForm();
    bar.querySelector("#merge").onclick = mergeDialog;
    const si = bar.querySelector("#cli-search");
    si.addEventListener("input", () => { filter.q = si.value; paint(); });

    const card = h(`<div class="card"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Cliente</th><th>Contato</th><th>Última visita</th><th>Última cor</th><th class="num">Total gasto</th><th>Crédito</th><th></th></tr></thead>
      <tbody id="cli-rows"></tbody></table></div></div>`);
    wrap.appendChild(card);

    function paint() {
      const q = filter.q.trim().toLowerCase();
      let list = db.clients.slice();
      if (filter.tab==="aniversariantes") list = list.filter(c=>c.birthdate&&c.birthdate.slice(5,7)===monthKey);
      if (filter.tab==="sumidos") list = list.filter(c=>{const lv=lastVisitOf(c.id); return !lv || (today-new Date(lv))/864e5>60;});
      if (filter.tab==="credito") list = list.filter(c=>c.credit>0);
      if (filter.tab==="vip") list = list.filter(c=>(c.tags||[]).includes("VIP"));
      /* "Patricia" acha "Patrícia"; "(11) 99970" acha o telefone gravado só
         com dígitos. Antes as duas buscas voltavam vazias. */
      if (q) {
        const sem = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const qt = sem(q), qd = q.replace(/\D/g, "");
        list = list.filter(c => sem(c.name + " " + (c.email || "")).includes(qt) ||
                                (qd.length >= 3 && (c.phone || "").replace(/\D/g, "").includes(qd)));
      }
      list.sort((a,b)=>a.name.localeCompare(b.name));

      const tb = card.querySelector("#cli-rows");
      tb.innerHTML = "";
      if (!list.length) { tb.appendChild(h(`<tr><td colspan="7"><div class="empty"><div class="em-ic">${icon('users')}</div>Nenhuma cliente encontrada.</div></td></tr>`)); return; }
      list.forEach(c => {
        const lv = lastVisitOf(c.id);
        const daysAgo = lv ? Math.floor((today-new Date(lv))/864e5) : null;
        const cor = Store.ultimaCorDa(c.id);
        const tr = h(`<tr class="clickable">
          <td><div class="row" style="gap:10px">${avatar(c.name,'sm')}
            <div><div class="bold">${esc(c.name)}</div>
            <div class="tiny muted">${c.birthdate?fmt.age(c.birthdate):"—"} ${(c.tags||[]).includes("VIP")?'<span class="badge b-violet" style="margin-left:6px">VIP</span>':''}</div></div></div></td>
          <td><div class="small">${fmt.phone(c.phone)}</div><div class="tiny muted">${esc(c.email||"—")}</div></td>
          <td>${lv?`<div class="small">${fmt.date(lv)}</div><div class="tiny ${daysAgo>60?'':'muted'}" ${daysAgo>60?'style="color:var(--warn)"':''}>${daysAgo} dias atrás</div>`:'<span class="muted small">Nunca atendida</span>'}</td>
          <td>${cor ? `<span class="cor-linha"><span class="unha" style="--c:${esc(cor.hex)}" aria-hidden="true"></span>${esc(cor.name)}</span>` : '<span class="muted small">—</span>'}</td>
          <td class="num bold">${fmt.money(spendOf(c.id))}</td>
          <td>${c.credit>0?`<span class="badge b-green">${fmt.money(c.credit)}</span>`:'<span class="muted small">—</span>'}</td>
          <td class="right"><div class="row gap-6" style="justify-content:flex-end">
            <button class="btn btn-icon btn-sm btn-ghost" data-wa title="WhatsApp">${icon('whatsapp')}</button>
            <button class="btn btn-icon btn-sm btn-ghost" data-edit title="Editar">${icon('edit')}</button>
          </div></td></tr>`);
        tr.onclick = (e) => { if (e.target.closest("button")) return; clientDetail(c.id); };
        tr.querySelector("[data-wa]").onclick = () => Views.pickMessageFor({ client: c });
        tr.querySelector("[data-edit]").onclick = () => Views.clientForm(c);
        tb.appendChild(tr);
      });
    }
    paint();
    return wrap;
  };

  /* ---------- Formulário de cliente ---------- */
  Views.clientForm = function (existing, onDone) {
    const c = existing || {};
    Modal.open({
      title: existing ? "Editar cliente" : "Novo cliente",
      body: `<div class="form-grid">
        <div class="field full"><label>Nome completo *</label><input class="input" id="c-name" value="${esc(c.name||"")}" placeholder="Marina Alves Costa" /></div>
        <div class="field"><label>WhatsApp / Telefone *</label><input class="input" id="c-phone" data-fone value="${esc(c.phone||"")}" placeholder="(11) 91234-5678" /></div>
        <div class="field"><label>E-mail</label><input class="input" id="c-mail" type="email" value="${esc(c.email||"")}" placeholder="cliente@example.com" /></div>
        <div class="field"><label>Data de nascimento</label><input class="input" type="date" id="c-bd" value="${esc(c.birthdate||"")}" /></div>
        <div class="field"><label>CPF</label><input class="input" id="c-cpf" value="${esc(c.cpf||"")}" placeholder="529.982.247-25" /></div>
        <div class="field"><label>Crédito disponível (R$)</label><input class="input" type="number" step="0.01" id="c-credit" value="${c.credit||0}" /></div>
        <div class="field"><label>Marcar como VIP</label>
          <div class="row" style="height:42px"><span class="switch"><input type="checkbox" id="c-vip" ${(c.tags||[]).includes("VIP")?"checked":""} /><span class="track"></span><span class="thumb"></span></span>
          <span class="small muted">Destaque na lista e relatórios</span></div></div>
        <div class="field full"><label>Anotações internas</label>
          <textarea class="textarea" id="c-notes" placeholder="Preferências, histórico, observações...">${esc(c.notes||"")}</textarea></div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>${existing?"Salvar":"Cadastrar"}</button>`,
      onMount(m) {
        m.querySelector("[data-cancel]").onclick = Modal.close;
        m.querySelector("[data-save]").onclick = () => {
          const name = m.querySelector("#c-name").value.trim();
          const phone = m.querySelector("#c-phone").value.trim();
          if (!name) { toast("Preencha o nome para continuar.", "err"); return; }
          if (!phone) { toast("Informe um telefone/WhatsApp.", "err"); return; }
          const dig = phone.replace(/\D/g, "");
          if (dig.length < 10 || dig.length > 13) { toast("Telefone com DDD, por favor — ex.: (11) 99999-9999.", "err"); return; }
          const credito = +m.querySelector("#c-credit").value || 0;
          if (credito < 0) { toast("O crédito não pode ser negativo.", "err"); return; }
          const dup = Store.db.clients.find(x => x.id!==c.id && (x.phone||"").replace(/\D/g,"")===phone.replace(/\D/g,""));
          if (dup) { toast(`Cliente já existe: ${dup.name}`, "err"); return; }
          const obj = { id: c.id, name, phone,
            email: m.querySelector("#c-mail").value.trim(),
            birthdate: m.querySelector("#c-bd").value,
            cpf: m.querySelector("#c-cpf").value.trim(),
            credit: credito,
            notes: m.querySelector("#c-notes").value.trim(),
            tags: m.querySelector("#c-vip").checked ? ["VIP"] : [],
            createdAt: c.createdAt || new Date().toISOString(),
            anamnese: c.anamnese || null,
          };
          Store.upsert("clients", obj);
          Modal.close(); toast(existing?"Cliente atualizado.":"Cliente cadastrado com sucesso.", "ok");
          if (onDone) onDone(obj); else rerender();
        };
      }
    });
  };

  /* ---------- Ficha do cliente ---------- */
  function clientDetail(id) {
    const db = Store.db;
    const c = Store.byId("clients", id); if (!c) return;
    const history = db.appts.filter(a=>a.clientId===id).sort((a,b)=>b.start.localeCompare(a.start));
    const orders = db.orders.filter(o=>o.clientId===id).sort((a,b)=>b.date.localeCompare(a.date));
    const total = orders.reduce((s,o)=>s+o.total,0);
    const noShows = history.filter(a=>a.status==="NO_SHOW").length;
    const cancels = history.filter(a=>a.status==="CANCELED").length;

    const tabsHTML = `
      <div class="tabs" id="cd-tabs">
        <button data-t="hist" class="active">Histórico</button>
        <button data-t="anam">Anamnese</button>
        <button data-t="fin">Financeiro</button>
        <button data-t="notes">Anotações</button>
      </div><div id="cd-body"></div>`;

    Modal.open({
      title: "Ficha do cliente", size: "lg",
      body: `<div class="col" style="gap:18px">
        <div class="row wrap" style="gap:16px">
          ${avatar(c.name,'lg')}
          <div class="grow" style="min-width:180px">
            <div style="font-family:var(--display);font-weight:700;font-size:19px">${esc(c.name)}</div>
            <div class="small muted">${fmt.phone(c.phone)} · ${esc(c.email||"sem e-mail")}</div>
            <div class="small muted">${c.birthdate?`${fmt.date(c.birthdate)} · ${fmt.age(c.birthdate)}`:"Data de nascimento não informada"}</div>
          </div>
          <div class="row gap-8">
            <button class="btn btn-sm btn-accent" id="cd-wa">${icon('whatsapp')} Mensagem</button>
            <button class="btn btn-sm btn-primary" id="cd-book">${icon('plus')} Agendar</button>
          </div>
        </div>
        ${(() => {
          const cont = {};
          history.filter(a => a.polishId && a.status === "DONE").forEach(a => cont[a.polishId] = (cont[a.polishId]||0) + 1);
          const top = Object.entries(cont).sort((x,y) => y[1]-x[1]).slice(0, 6).map(([id,n]) => ({ p: Store.polish(id), n })).filter(x => x.p);
          return top.length ? `<div class="cd-cores"><span class="small bold">Cores que ela mais usa</span>
            <div class="row gap-8 wrap">${top.map(({p,n}) => `<span class="cd-cor"><span class="unha" style="--c:${esc(p.hex)}" aria-hidden="true"></span>${esc(p.name)}<em>${n}×</em></span>`).join("")}</div></div>` : "";
        })()}
        ${/* Só existe portal com servidor. Se ela esqueceu a senha, a
              profissional libera e a cliente cria o cadastro de novo com o
              mesmo telefone; a ficha e o histórico continuam os mesmos. */
          window.Nuvem && Nuvem.modo === "nuvem" ? `<div class="cd-portal">
          <div style="min-width:0"><div class="small bold">Acesso ao portal</div>
            <div class="tiny muted" id="cd-portal-t">${c.portalLiberado
              ? "Liberado. Ela já pode criar o cadastro de novo com o mesmo telefone."
              : "Se ela esqueceu a senha, libere um novo cadastro. O histórico continua."}</div></div>
          <button class="btn btn-sm btn-ghost" id="cd-portal" ${c.portalLiberado ? "disabled" : ""}>${c.portalLiberado ? "Liberado" : "Liberar novo cadastro"}</button>
        </div>` : ""}
        ${(() => {
          const pk = Store.pacotesAtivos(c.id);
          return pk.length ? `<div class="cd-pacotes">${pk.map(x => `<span class="badge b-green">${esc(x.name)}: ${x.remaining} de ${x.total} sessões${x.expiresAt ? " · até " + fmt.date(x.expiresAt + "T12:00") : ""}</span>`).join(" ")}</div>` : "";
        })()}
        <div class="stat-grid stat-grid-4">
          ${[
            {l:"Total gasto",v:fmt.money(total)},
            {l:"Atendimentos",v:history.filter(a=>a.status==="DONE").length},
            {l:"Faltas",v:noShows},
            {l:"Crédito",v:fmt.money(c.credit||0)},
          ].map(s=>`<div class="stat" style="padding:12px"><div class="lbl" style="font-size:11px">${s.l}</div><div class="val" style="font-size:18px">${s.v}</div></div>`).join("")}
        </div>
        ${tabsHTML}
      </div>`,
      footer: `<button class="btn btn-danger" id="cd-del" style="margin-right:auto">${icon('trash')} Excluir</button>
               <button class="btn btn-ghost" data-close2>Fechar</button><button class="btn btn-ghost" id="cd-edit">${icon('edit')} Editar cadastro</button>`,
      onMount(m) {
        m.querySelector("[data-close2]").onclick = Modal.close;
        m.querySelector("#cd-edit").onclick = () => { Modal.close(); Views.clientForm(c); };
        const btPortal = m.querySelector("#cd-portal");
        if (btPortal) btPortal.onclick = () => {
          Store.upsert("clients", { id: c.id, portalLiberado: true });
          c.portalLiberado = true;
          btPortal.disabled = true; btPortal.textContent = "Liberado";
          m.querySelector("#cd-portal-t").textContent = "Liberado. Ela já pode criar o cadastro de novo com o mesmo telefone.";
          toast("Cadastro liberado. Avise a cliente para criar de novo no portal.", "ok");
        };
        m.querySelector("#cd-del").onclick = () => {
          if (Store.linkedTo("clients", c.id)) {
            toast("Ela tem histórico. Para não perder o financeiro, o cadastro fica — só dá para excluir cliente sem atendimentos.", "err");
            return;
          }
          Modal.confirm({ title: "Excluir cliente", danger: true, confirmText: "Excluir",
            message: `Excluir <b>${esc(c.name)}</b>? Ela não tem nenhum atendimento registrado.`,
            onConfirm() { if (Store.remove("clients", c.id)) toast("Cliente excluída.", "ok"); rerender(); } });
        };
        m.querySelector("#cd-wa").onclick = () => { Modal.close(); Views.pickMessageFor({ client: c }); };
        /* Antes passava um objeto como se fosse um agendamento existente: o
           formulário abria como "Editar", no horário de agora (14:37) e com o
           primeiro serviço da lista — e quebrava se não houvesse serviço. */
        m.querySelector("#cd-book").onclick = () => {
          Modal.close();
          const ultimo = history.find(a => a.status === "DONE");
          Views.apptForm(null, Store.todayISO(), null, { clientId: c.id, serviceId: ultimo && ultimo.serviceId });
        };

        const body = m.querySelector("#cd-body");
        const paint = (t) => {
          if (t === "hist") {
            body.innerHTML = history.length ? `<div class="card"><div class="table-wrap"><table class="tbl">
              <thead><tr><th>Data</th><th>Serviço</th><th>Cor</th><th>Situação</th><th class="num">Valor</th></tr></thead>
              <tbody>${history.map(a=>{const v=Store.apptView(a),st=Store.APPT_STATUS[a.status];
                return `<tr><td class="small">${fmt.date(a.start)} <span class="muted">${fmt.time(a.start)}</span></td>
                <td>${esc(v.service.name)}</td>
                <td class="small">${(p => p ? `<span class="row gap-6"><span class="swatch sm" style="background:${p.hex}"></span>${esc(p.name)}</span>` : '<span class="muted">—</span>')(Store.polish(a.polishId))}</td>
                <td><span class="badge ${st.cls}">${st.label}</span></td>
                <td class="num bold">${fmt.money(a.price)}</td></tr>`;}).join("")}</tbody></table></div></div>`
              : `<div class="empty"><div class="em-ic">${icon('calendar')}</div>Nenhum atendimento registrado.</div>`;
          }
          if (t === "anam") {
            const an = c.anamnese || {};
            body.innerHTML = `<div class="form-grid">
              <div class="field full"><label>Alergias e sensibilidades</label><textarea class="textarea" id="an-al" placeholder="Acetona, gel, cola, monômero, látex...">${esc(an.allergies||"")}</textarea></div>
              <div class="field full"><label>Saúde que muda o procedimento</label><textarea class="textarea" id="an-cond" placeholder="Gestação, diabetes, micose, psoríase, anticoagulante, quimioterapia...">${esc(an.conditions||"")}</textarea></div>
              <div class="field"><label>Como são as unhas dela</label><input class="input" id="an-type" value="${esc(an.type||"")}" placeholder="Fracas, quebradiças, roídas, descamando..." /></div>
              <div class="field"><label>Última atualização</label><input class="input" disabled value="${an.updatedAt?fmt.date(an.updatedAt):"Nunca preenchida"}" /></div>
              <div class="full"><button class="btn btn-primary" id="an-save">Salvar anamnese</button></div></div>`;
            body.querySelector("#an-save").onclick = () => {
              c.anamnese = { allergies: body.querySelector("#an-al").value, conditions: body.querySelector("#an-cond").value,
                type: body.querySelector("#an-type").value, updatedAt: new Date().toISOString() };
              Store.upsert("clients", c); toast("Anamnese salva.", "ok"); paint("anam");
            };
          }
          if (t === "fin") {
            body.innerHTML = `
              <div class="row between" style="margin-bottom:12px">
                <div class="bold">Crédito disponível: <span style="color:var(--accent)">${fmt.money(c.credit||0)}</span></div>
                <button class="btn btn-sm btn-ghost" id="add-credit">${icon('plus')} Lançar crédito</button></div>
              ${orders.length?`<div class="card"><div class="table-wrap"><table class="tbl">
                <thead><tr><th>Data</th><th>Itens</th><th>Pagamento</th><th class="num">Total</th></tr></thead>
                <tbody>${orders.map(o=>`<tr><td class="small">${fmt.date(o.date)}</td>
                  <td class="small">${o.items.map(i=>esc(i.name)).join(", ")}</td>
                  <td><span class="chip">${Store.pmName(o.paymentMethod)}</span></td>
                  <td class="num bold">${fmt.money(o.total)}</td></tr>`).join("")}</tbody></table></div></div>`
                :`<div class="empty"><div class="em-ic">${icon('receipt')}</div>Nenhuma compra registrada.</div>`}`;
            body.querySelector("#add-credit").onclick = () => {
              const volta = () => clientDetail(c.id);
              Modal.open({ title: "Lançar crédito", size: "sm",
                body: `<div class="col" style="gap:12px">
                  <p class="small muted">Saldo atual: <b>${fmt.money(c.credit||0)}</b>. Use para adiantamento ou troco que ela deixou.</p>
                  <div class="field"><label>Valor (R$)</label><input class="input" type="number" id="cr-v" step="0.01" min="0.01" value="50" /></div></div>`,
                footer: `<button class="btn btn-ghost" data-c>Cancelar</button><button class="btn btn-primary" data-ok>Lançar</button>`,
                onMount(mm) {
                  mm.querySelector("[data-c]").onclick = volta;
                  mm.querySelector("[data-ok]").onclick = () => {
                    const v = +mm.querySelector("#cr-v").value;
                    if (!(v > 0)) { toast("Informe um valor maior que zero.", "err"); return; }
                    c.credit = +((c.credit||0) + v).toFixed(2); Store.upsert("clients", c);
                    toast("Crédito lançado.","ok"); volta();
                  };
                } });
            };
          }
          if (t === "notes") {
            body.innerHTML = `<div class="field"><label>Anotações internas (não visíveis para a cliente)</label>
              <textarea class="textarea" id="nt" style="min-height:160px">${esc(c.notes||"")}</textarea></div>
              <button class="btn btn-primary" style="margin-top:12px" id="nt-save">Salvar anotações</button>`;
            body.querySelector("#nt-save").onclick = () => { c.notes = body.querySelector("#nt").value; Store.upsert("clients", c); toast("Anotações salvas.","ok"); };
          }
        };
        paint("hist");
        m.querySelectorAll("#cd-tabs button").forEach(b => b.onclick = () => {
          m.querySelectorAll("#cd-tabs button").forEach(x=>x.classList.remove("active"));
          b.classList.add("active"); paint(b.dataset.t);
        });
      }
    });
  }
  Views.clientDetail = clientDetail;

  /* ---------- Unificar duplicados ---------- */
  function mergeDialog() {
    const db = Store.db;
    // sugestão automática: mesmo telefone ou nomes muito parecidos
    const groups = {};
    db.clients.forEach(c => {
      const key = c.name.toLowerCase().split(" ")[0] + "|" + (c.phone||"").replace(/\D/g,"").slice(-4);
      (groups[key] = groups[key] || []).push(c);
    });
    const dups = Object.values(groups).filter(g => g.length > 1);

    Modal.open({
      title: "Unificar cadastros duplicados", size: "lg",
      body: `<div class="tabs" id="mg-tabs">
          <button data-t="auto" class="active">Sugestão automática</button>
          <button data-t="man">Seleção manual</button></div>
        <div id="mg-body"></div>`,
      footer: `<button class="btn btn-ghost" data-close2>Fechar</button>`,
      onMount(m) {
        m.querySelector("[data-close2]").onclick = Modal.close;
        const body = m.querySelector("#mg-body");
        const paint = (t) => {
          if (t === "auto") {
            body.innerHTML = `<p class="small muted" style="margin-bottom:14px">
              Aqui o sistema sugere contatos repetidos e você seleciona quais quer unificar.</p>` +
              (dups.length ? dups.map((g,i)=>`<div class="card card-pad" style="margin-bottom:10px">
                <div class="row between"><div><div class="bold">${esc(g[0].name)}</div>
                <div class="tiny muted">${g.length} cadastros semelhantes: ${g.map(x=>fmt.phone(x.phone)).join(" · ")}</div></div>
                <button class="btn btn-sm btn-primary" data-g="${i}">Unificar</button></div></div>`).join("")
                : `<div class="empty"><div class="em-ic">${icon('check')}</div>Nenhum contato duplicado encontrado.</div>`);
            body.querySelectorAll("[data-g]").forEach(b => b.onclick = () => {
              const g = dups[+b.dataset.g];
              Modal.confirm({ title:"Unificar contatos", message:`Tem certeza que deseja unificar ${g.length} cadastros em "${esc(g[0].name)}"?`,
                confirmText:"Unificar", onConfirm(){ doMerge(g[0], g.slice(1)); Modal.close(); rerender(); }});
            });
          } else {
            body.innerHTML = `<p class="small muted" style="margin-bottom:14px">
              Selecione manualmente dois ou mais contatos e clique para unificar.</p>
              <div class="field"><label>Cliente principal (será mantido)</label>
                <select class="select" id="mg-main"><option value="">Selecione aqui o cliente principal</option>
                ${db.clients.map(c=>`<option value="${c.id}">${esc(c.name)} — ${fmt.phone(c.phone)}</option>`).join("")}</select></div>
              <div class="field" style="margin-top:12px"><label>Contatos a unificar (serão removidos)</label>
                <select class="select" id="mg-others" multiple size="7" style="height:auto;padding:8px">
                ${db.clients.map(c=>`<option value="${c.id}">${esc(c.name)} — ${fmt.phone(c.phone)}</option>`).join("")}</select>
                <span class="hint">Segure Ctrl (ou Cmd) para selecionar vários.</span></div>
              <button class="btn btn-primary" style="margin-top:14px" id="mg-do">Unificar selecionados</button>`;
            body.querySelector("#mg-do").onclick = () => {
              const mainId = body.querySelector("#mg-main").value;
              const others = [...body.querySelector("#mg-others").selectedOptions].map(o=>o.value).filter(x=>x!==mainId);
              if (!mainId) { toast("Selecione acima o cliente principal.", "err"); return; }
              if (!others.length) { toast("Selecione um ou mais contatos para unificar.", "err"); return; }
              doMerge(Store.byId("clients", mainId), others.map(id=>Store.byId("clients",id)));
              Modal.close(); rerender();
            };
          }
        };
        paint("auto");
        m.querySelectorAll("#mg-tabs button").forEach(b=>b.onclick=()=>{
          m.querySelectorAll("#mg-tabs button").forEach(x=>x.classList.remove("active")); b.classList.add("active"); paint(b.dataset.t);
        });
      }
    });
  }

  function doMerge(main, others) {
    const db = Store.db;
    others.forEach(o => {
      if (!o || o.id === main.id) return;
      db.appts.forEach(a => { if (a.clientId === o.id) a.clientId = main.id; });
      db.orders.forEach(x => { if (x.clientId === o.id) x.clientId = main.id; });
      db.charges.forEach(x => { if (x.clientId === o.id) x.clientId = main.id; });
      (db.clientPackages || []).forEach(x => { if (x.clientId === o.id) x.clientId = main.id; });
      main.credit = (main.credit||0) + (o.credit||0);
      if (!main.email && o.email) main.email = o.email;
      if (!main.birthdate && o.birthdate) main.birthdate = o.birthdate;
      db.clients = db.clients.filter(x => x.id !== o.id);
    });
    Store.upsert("clients", main);
    toast("Contatos unificados com sucesso.", "ok");
  }
})();
