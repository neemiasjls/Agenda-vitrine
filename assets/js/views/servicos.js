/* ============================================================
   SERENA — Serviços, categorias e pacotes
   ============================================================ */
window.Views = window.Views || {};

(function () {
  let tab = "servicos";

  Views.servicos = function () {
    const db = Store.db;
    const wrap = h(`<div class="col" style="gap:0"></div>`);
    const tabsEl = h(`<div class="tabs">
      <button data-t="servicos" class="${tab==='servicos'?'active':''}">Serviços <span class="count" style="margin-left:6px">${db.services.length}</span></button>
      <button data-t="categorias" class="${tab==='categorias'?'active':''}">Categorias <span class="count" style="margin-left:6px">${db.categories.length}</span></button>
      <button data-t="pacotes" class="${tab==='pacotes'?'active':''}">Pacotes <span class="count" style="margin-left:6px">${db.packages.length}</span></button>
    </div>`);
    tabsEl.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{tab=b.dataset.t;rerender();});
    wrap.appendChild(tabsEl);

    if (tab === "servicos") wrap.appendChild(servicesTab());
    if (tab === "categorias") wrap.appendChild(categoriesTab());
    if (tab === "pacotes") wrap.appendChild(packagesTab());
    return wrap;
  };

  function servicesTab() {
    const db = Store.db;
    const box = h(`<div class="col" style="gap:16px"></div>`);
    const bar = h(`<div class="filterbar">
      <div class="input-group" style="max-width:300px;flex:1"><span class="ic-left">${icon('search')}</span>
        <input class="input" id="s-q" placeholder="Buscar serviço..." /></div>
      <div class="grow"></div>
      <button class="btn btn-primary" id="s-new">${icon('plus')} Adicionar serviço</button></div>`);
    bar.querySelector("#s-new").onclick = () => serviceForm();
    box.appendChild(bar);

    const grid = h(`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px" id="s-grid"></div>`);
    box.appendChild(grid);

    function paint() {
      const q = (bar.querySelector("#s-q").value||"").toLowerCase();
      grid.innerHTML = "";
      const list = db.services.filter(s => s.name.toLowerCase().includes(q));
      if (!list.length) { grid.appendChild(h(`<div class="empty" style="grid-column:1/-1"><div class="em-ic">${icon('briefcase')}</div>Nenhum serviço encontrado.</div>`)); return; }
      list.forEach(s => {
        const cat = Store.byId("categories", s.cat);
        const margin = s.price ? Math.round(((s.price - s.cost)/s.price)*100) : 0;
        const card = h(`<div class="card card-pad">
          <div class="row between" style="align-items:flex-start">
            <div style="min-width:0">
              <div class="row gap-8"><span class="badge b-violet">${esc(cat?cat.name:"Sem categoria")}</span>
                ${!s.active?'<span class="badge b-gray">inativo</span>':''}</div>
              <div style="font-family:var(--display);font-weight:700;font-size:15.5px;margin-top:8px">${esc(s.name)}</div>
            </div>
            <button class="btn btn-icon btn-sm btn-ghost" data-menu>${icon('list')}</button>
          </div>
          <div class="row between" style="margin-top:14px">
            <div><div class="tiny faint bold">PREÇO</div><div style="font-family:var(--display);font-weight:800;font-size:19px">${fmt.money(s.price)}</div></div>
            <div class="right"><div class="tiny faint bold">DURAÇÃO</div><div class="bold">${s.duration} min</div></div>
          </div>
          <div class="divider" style="margin:14px 0"></div>
          <div class="row between small muted">
            <span>Custo: ${fmt.money(s.cost)}</span>
            <span class="bold" style="color:${margin>50?'var(--accent)':'var(--warn)'}">Margem ${margin}%</span>
          </div></div>`);
        card.querySelector("[data-menu]").onclick = (e) => rowMenu(e, [
          { t:"Editar", ic:"edit", fn:()=>serviceForm(s) },
          { t: s.active?"Desativar":"Ativar", ic:"check", fn:()=>{ s.active=!s.active; Store.upsert("services",s); rerender(); } },
          { t:"Excluir", ic:"trash", danger:true, fn:()=>Modal.confirm({title:"Excluir serviço",message:`Excluir "${esc(s.name)}"?`,danger:true,confirmText:"Excluir",onConfirm(){ if(Store.remove("services",s.id)) toast("Serviço excluído.","ok"); rerender(); }}) },
        ]);
        grid.appendChild(card);
      });
    }
    bar.querySelector("#s-q").addEventListener("input", paint);
    paint();
    return box;
  }

  function serviceForm(s) {
    const db = Store.db; s = s || {};
    Modal.open({
      title: s.id ? "Editar serviço" : "Adicionar serviço",
      body: `<div class="form-grid">
        <div class="field full"><label>Nome do serviço *</label><input class="input" id="sv-name" value="${esc(s.name||"")}" placeholder="Manutenção de gel" /></div>
        <div class="field"><label>Categoria</label><select class="select" id="sv-cat">
          ${db.categories.map(c=>`<option value="${c.id}" ${s.cat===c.id?'selected':''}>${esc(c.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Duração (minutos) *</label><input class="input" type="number" id="sv-dur" value="${s.duration||60}" min="5" step="5" /></div>
        <div class="field"><label>Preço (R$) *</label><input class="input" type="number" step="0.01" id="sv-price" value="${s.price!=null?s.price:""}" /></div>
        <div class="field"><label>Retorno em (dias)</label>
          <input class="input" type="number" id="sv-ret" value="${s.returnDays!=null?s.returnDays:""}" min="0" max="365" step="1" placeholder="ex.: 21" />
          <span class="hint">Quando ela precisa voltar. É o que alimenta a tela Retornos. Deixe 0 se não tem retorno (remoção, nail art avulsa).</span></div>
        <div class="field"><label>Custo do serviço (R$)</label><input class="input" type="number" step="0.01" id="sv-cost" value="${s.cost||0}" />
          <span class="hint">Utilizado para lançamento de despesas e cálculo de margem.</span></div>
        <div class="field full"><label>Serviço ativo</label>
          <div class="row" style="height:42px"><span class="switch"><input type="checkbox" id="sv-act" ${s.active!==false?"checked":""} /><span class="track"></span><span class="thumb"></span></span>
          <span class="small muted">Serviços inativos não aparecem no agendamento.</span></div></div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
      onMount(m) {
        m.querySelector("[data-cancel]").onclick = Modal.close;
        m.querySelector("[data-save]").onclick = () => {
          const name = m.querySelector("#sv-name").value.trim();
          if (!name) { toast("Preencha o nome do serviço.", "err"); return; }
          const dur = +m.querySelector("#sv-dur").value;
          if (!(dur >= 5 && dur <= 720)) { toast("Duração entre 5 minutos e 12 horas. A agenda usa esse tempo para não marcar duas clientes juntas.", "err"); return; }
          const preco = +m.querySelector("#sv-price").value;
          if (!(preco >= 0)) { toast("Informe o preço.", "err"); return; }
          const ret = m.querySelector("#sv-ret").value === "" ? 0 : Math.round(+m.querySelector("#sv-ret").value);
          if (!(ret >= 0 && ret <= 365)) { toast("Retorno entre 0 e 365 dias.", "err"); return; }
          if (Store.db.services.some(x => x.id !== s.id && x.name.trim().toLowerCase() === name.toLowerCase())) {
            toast("Já existe um serviço com esse nome.", "err"); return; }
          Store.upsert("services", { id:s.id, name, cat:m.querySelector("#sv-cat").value,
            duration:dur, price:preco, returnDays:ret,
            cost:+m.querySelector("#sv-cost").value||0, active:m.querySelector("#sv-act").checked });
          Modal.close(); rerender(); toast(s.id ? "Serviço atualizado." : "Serviço cadastrado.", "ok");
        };
      }
    });
  }

  function categoriesTab() {
    const db = Store.db;
    const box = h(`<div class="col" style="gap:16px"></div>`);
    box.appendChild(h(`<div class="filterbar"><div class="grow"></div>
      <button class="btn btn-primary" id="c-new">${icon('plus')} Nova categoria</button></div>`));
    box.querySelector("#c-new").onclick = () => catForm();
    const card = h(`<div class="card"><div id="c-list"></div></div>`);
    const l = card.querySelector("#c-list");
    if (!db.categories.length) l.appendChild(h(`<div class="empty"><div class="em-ic">${icon('tag')}</div>Nenhuma categoria.</div>`));
    db.categories.forEach(c => {
      const n = db.services.filter(s=>s.cat===c.id).length;
      const row = h(`<div class="lrow">
        <span class="badge b-violet" style="width:32px;height:32px;justify-content:center;border-radius:10px">${icon('tag')}</span>
        <div class="grow"><div class="bold">${esc(c.name)}</div><div class="tiny muted">${n} serviço(s)</div></div>
        <button class="btn btn-icon btn-sm btn-ghost" data-e>${icon('edit')}</button>
        <button class="btn btn-icon btn-sm btn-ghost" data-d>${icon('trash')}</button></div>`);
      row.querySelector("[data-e]").onclick = () => catForm(c);
      row.querySelector("[data-d]").onclick = () => Modal.confirm({title:"Excluir categoria",message:`Excluir "${esc(c.name)}"?`,danger:true,confirmText:"Excluir",
        onConfirm(){ if(Store.remove("categories",c.id)) toast("Categoria excluída.","ok"); rerender(); }});
      l.appendChild(row);
    });
    box.appendChild(card);
    return box;
  }

  function catForm(c) {
    c = c || {};
    Modal.open({ title: c.id?"Editar categoria":"Nova categoria", size:"sm",
      body:`<div class="field"><label>Nome da categoria</label><input class="input" id="ct-n" value="${esc(c.name||"")}" placeholder="Cabelo" /></div>`,
      footer:`<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
      onMount(m){ m.querySelector("[data-cancel]").onclick=Modal.close;
        m.querySelector("[data-save]").onclick=()=>{ const n=m.querySelector("#ct-n").value.trim();
          if(!n){toast("Preencha esse campo para continuar.","err");return;}
          Store.upsert("categories",{id:c.id,name:n}); Modal.close(); rerender(); toast("Salvo com sucesso.","ok"); };}});
  }

  function packagesTab() {
    const db = Store.db;
    const box = h(`<div class="col" style="gap:16px"></div>`);
    box.appendChild(h(`<div class="filterbar"><div class="grow"></div>
      <button class="btn btn-primary" id="p-new">${icon('plus')} Novo pacote</button></div>`));
    box.querySelector("#p-new").onclick = () => pkgForm();
    const grid = h(`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px"></div>`);
    if (!db.packages.length) grid.appendChild(h(`<div class="empty" style="grid-column:1/-1"><div class="em-ic">${icon('package')}</div>Nenhum pacote cadastrado.</div>`));
    db.packages.forEach(p => {
      const svcNames = p.services.map(id=>{const s=Store.byId("services",id); return s?s.name:"";}).filter(Boolean);
      const avulso = p.services.reduce((t,id)=>{const s=Store.byId("services",id);return t+(s?s.price:0);},0) * (p.sessions/p.services.length||1);
      const eco = avulso>p.price ? Math.round((1-p.price/avulso)*100) : 0;
      const card = h(`<div class="card card-pad">
        <div class="row between"><span class="badge b-green">${icon('package')} Pacote</span>
          <button class="btn btn-icon btn-sm btn-ghost" data-menu>${icon('list')}</button></div>
        <div style="font-family:var(--display);font-weight:700;font-size:16px;margin-top:10px">${esc(p.name)}</div>
        <div class="small muted" style="margin-top:4px">${svcNames.join(" · ")}</div>
        <div class="row between" style="margin-top:14px">
          <div><div class="tiny faint bold">VALOR</div><div style="font-family:var(--display);font-weight:800;font-size:20px">${fmt.money(p.price)}</div></div>
          <div class="right"><div class="tiny faint bold">SESSÕES</div><div class="bold">${p.sessions}</div></div>
          <div class="right"><div class="tiny faint bold">VALIDADE</div><div class="bold">${p.validityDays}d</div></div>
        </div>
        ${eco?`<div style="margin-top:12px;padding:8px 10px;background:var(--accent-soft);border-radius:10px;color:var(--accent-ink);font-size:12px;font-weight:700">Economia de ${eco}% vs. avulso</div>`:''}
      </div>`);
      card.querySelector("[data-menu]").onclick = (e) => rowMenu(e, [
        { t:"Editar", ic:"edit", fn:()=>pkgForm(p) },
        { t:"Vender pacote", ic:"receipt", fn:()=>{ toast("Abra uma comanda para vender o pacote.","ok"); go("comandas"); } },
        { t:"Excluir", ic:"trash", danger:true, fn:()=>Modal.confirm({title:"Excluir pacote",message:`Excluir "${esc(p.name)}"?`,danger:true,confirmText:"Excluir",onConfirm(){Store.remove("packages",p.id);rerender();}}) },
      ]);
      grid.appendChild(card);
    });
    box.appendChild(grid);
    return box;
  }

  function pkgForm(p) {
    const db = Store.db; p = p || { services: [] };
    Modal.open({ title: p.id?"Editar pacote":"Novo pacote",
      body:`<div class="form-grid">
        <div class="field full"><label>Nome do pacote *</label><input class="input" id="pk-n" value="${esc(p.name||"")}" placeholder="Pacote Noiva" /></div>
        <div class="field full"><label>Serviços inclusos</label>
          <select class="select" id="pk-svc" multiple size="6" style="height:auto;padding:8px">
          ${db.services.map(s=>`<option value="${s.id}" ${p.services.includes(s.id)?'selected':''}>${esc(s.name)}</option>`).join("")}</select>
          <span class="hint">Segure Ctrl (ou Cmd) para selecionar vários.</span></div>
        <div class="field"><label>Nº de sessões</label><input class="input" type="number" id="pk-ses" value="${p.sessions||4}" min="1" /></div>
        <div class="field"><label>Preço total (R$)</label><input class="input" type="number" step="0.01" id="pk-price" value="${p.price||""}" /></div>
        <div class="field"><label>Validade (dias)</label><input class="input" type="number" id="pk-val" value="${p.validityDays||90}" /></div>
        <div class="field"><label>Ativo</label><div class="row" style="height:42px">
          <span class="switch"><input type="checkbox" id="pk-act" ${p.active!==false?"checked":""} /><span class="track"></span><span class="thumb"></span></span></div></div>
      </div>`,
      footer:`<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
      onMount(m){ m.querySelector("[data-cancel]").onclick=Modal.close;
        m.querySelector("[data-save]").onclick=()=>{
          const n=m.querySelector("#pk-n").value.trim(); if(!n){toast("Preencha o nome.","err");return;}
          Store.upsert("packages",{id:p.id,name:n,services:[...m.querySelector("#pk-svc").selectedOptions].map(o=>o.value),
            sessions:+m.querySelector("#pk-ses").value||1, price:+m.querySelector("#pk-price").value||0,
            validityDays:+m.querySelector("#pk-val").value||90, active:m.querySelector("#pk-act").checked});
          Modal.close(); rerender(); toast("Criado com sucesso.","ok"); };}});
  }

  /* menu contextual reutilizável */
  window.rowMenu = function (e, items) {
    e.stopPropagation();
    document.querySelectorAll(".menu").forEach(x=>x.remove());
    const r = e.currentTarget.getBoundingClientRect();
    const menu = h(`<div class="menu" style="top:${r.bottom+window.scrollY+6}px;left:${Math.min(r.left+window.scrollX-120, window.innerWidth-200)}px">
      ${items.map((i,idx)=>`<button data-i="${idx}" class="${i.danger?'danger':''}">${icon(i.ic||'chevR')} ${i.t}</button>`).join("")}</div>`);
    document.body.appendChild(menu);
    menu.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{ menu.remove(); items[+b.dataset.i].fn(); });
    setTimeout(()=>document.addEventListener("click", function close(){ menu.remove(); document.removeEventListener("click", close); }),0);
  };
})();
