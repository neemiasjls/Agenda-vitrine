/* ============================================================
   nailagenda — App shell + router
   Sistema de Marina Lopes, nail designer autônoma.
   Ela trabalha sozinha, agenda pelo Direct e o
   retorno de manutenção é o que sustenta o faturamento.
   ============================================================ */
(function () {
  const NAV = [
    { section: "Dia a dia" },
    { id: "dashboard", label: "Visão geral", icon: "grid" },
    { id: "agenda", label: "Agenda", icon: "calendar" },
    { id: "solicitacoes", label: "Solicitações", icon: "bell" },
    { id: "retornos", label: "Retornos", icon: "refresh" },
    { id: "mensagens", label: "Mensagens", icon: "message" },
    { section: "Clientes" },
    { id: "clientes", label: "Clientes", icon: "users" },
    { id: "comandas", label: "Atendimentos", icon: "receipt" },
    { id: "cobrancas", label: "A receber", icon: "dollar" },
    { section: "Catálogo" },
    { id: "servicos", label: "Serviços", icon: "sparkles" },
    { id: "produtos", label: "Materiais", icon: "box" },
    { id: "despesas", label: "Despesas", icon: "wallet" },
    { section: "Números" },
    { id: "relatorios", label: "Financeiro", icon: "chart" },
    { section: "Sistema" },
    { id: "config", label: "Configurações", icon: "gear" },
  ];

  /* Destinos da barra inferior no mobile. "__more" abre a gaveta completa. */
  const BOTTOM_NAV = [
    { id: "dashboard", label: "Início", icon: "grid" },
    { id: "agenda", label: "Agenda", icon: "calendar" },
    { id: "retornos", label: "Retornos", icon: "refresh" },
    { id: "clientes", label: "Clientes", icon: "users" },
    { id: "__more", label: "Mais", icon: "menu" },
  ];

  const PAGE_META = {
    dashboard: { title: "Visão geral", sub: "Seu dia, seus retornos e o mês até aqui." },
    agenda: { title: "Agenda", sub: "Horários, confirmações e sessões do dia." },
    solicitacoes: { title: "Solicitações", sub: "Horários que as clientes pediram e esperam sua confirmação." },
    retornos: { title: "Retornos", sub: "Quem já passou do ponto de manutenção." },
    mensagens: { title: "Mensagens", sub: "Modelos de WhatsApp que se preenchem sozinhos." },
    clientes: { title: "Clientes", sub: "Ficha, histórico de trabalhos e cores usadas." },
    comandas: { title: "Atendimentos", sub: "Fechamento, pagamento e histórico." },
    cobrancas: { title: "A receber", sub: "Valores em aberto e controle de pagamento." },
    servicos: { title: "Serviços", sub: "Catálogo, duração, preço e ciclo de retorno." },
    produtos: { title: "Materiais", sub: "Gel, fibra, lixas — o que está acabando." },
    despesas: { title: "Despesas", sub: "Custos e saídas do caixa." },
    relatorios: { title: "Financeiro", sub: "Receita, despesas, atendimentos e clientes por período." },
    config: { title: "Configurações", sub: "Perfil, horários e dados do sistema." },
  };

  const app = document.getElementById("app");
  let route = "dashboard";
  const ROTAS = new Set(["dashboard","agenda","solicitacoes","retornos","mensagens","clientes",
    "comandas","cobrancas","servicos","produtos","despesas","relatorios","config"]);
  let sidebarOpen = false;

  /* ---------- Theme ---------- */
  function applyTheme() {
    const t = Store.db.settings.theme || "light";
    document.documentElement.setAttribute("data-theme", t);
  }
  function toggleTheme() {
    Store.db.settings.theme = Store.db.settings.theme === "dark" ? "light" : "dark";
    Store.save(); applyTheme();
    document.querySelector("#theme-btn").innerHTML = icon(Store.db.settings.theme === "dark" ? "sun" : "moon");
  }

  /* ---------- Auth gate ---------- */
  function isAuthed() { return sessionStorage.getItem("nailagenda.auth") === "1"; }

  /* ---------- Dois portais ----------
     `#cliente`  → portal da cliente (telefone + senha, agenda sozinha)
     qualquer    → painel da Marina (e-mail + senha)
     São sessões separadas: entrar num não dá acesso ao outro. */
  const isClientPortal = () => location.hash.replace(/^#\/?/, "") === "cliente";

  /* ---------- Render root ---------- */
  function render() {
    applyTheme();
    app.innerHTML = "";
    if (isClientPortal()) {
      window.rerender = null;                 // o portal instala o seu
      app.appendChild(Views.clientePortal());
      return;
    }
    window.rerender = renderRoute;             // devolve o do painel
    if (!isAuthed()) { app.appendChild(Views.auth(login)); return; }
    const alvo = location.hash.replace(/^#\/?/, "");
    if (ROTAS.has(alvo)) route = alvo;         // abre direto na tela do link
    app.appendChild(shell());
    paint(route);
  }

  /* A tela abre na hora com o que já está no navegador; a conversa com o
     servidor acontece depois. Esperar a rede para desenhar deixaria a
     Marina olhando um retângulo branco no 4G da rua. */
  async function ligarNuvem() {
    if (!window.Nuvem) return;
    try {
      const st = await Nuvem.iniciar();
      if (st.modo !== "nuvem") return;

      if (isClientPortal()) {
        /* No portal, o que aparece na tela tem de vir do servidor: os
           procedimentos, os preços e os horários ocupados. Pintar com o
           que está neste navegador mostraria dados de demonstração para
           uma cliente de verdade. */
        await PortalNuvem.carregarCatalogo();
        await PortalNuvem.carregarMinhaConta().catch(() => {});   // 401 = ainda não entrou
        return;
      }

      if (st.papel === "profissional") {
        sessionStorage.setItem("nailagenda.auth", "1");   // o cookie já provou quem é
        render();
      } else if (sessionStorage.getItem("nailagenda.auth")) {
        // O navegador achava que estava logada, o servidor discorda.
        sessionStorage.removeItem("nailagenda.auth");
        render();
      }
    } catch (e) { console.warn("nuvem:", e.message); }
  }

  /* Tela de espera do portal: curta, e só enquanto o servidor responde. */
  function portalCarregando() {
    return h(`<div class="portal"><div class="portal-body"
      style="display:grid;place-items:center;min-height:60vh;gap:14px;text-align:center;padding:30px">
      <div class="portal-logo" style="width:52px;height:52px">${icon("nail")}</div>
      <div class="small muted">Carregando os horários…</div>
    </div></div>`);
  }

  /* Trocar de portal (#cliente) recria a tela inteira; trocar de rota
     dentro do painel so repinta o conteudo, sem remontar o shell. */
  let eraPortalCliente = isClientPortal();
  window.addEventListener("hashchange", () => {
    const agoraPortal = isClientPortal();
    if (agoraPortal !== eraPortalCliente || !document.getElementById("view")) {
      eraPortalCliente = agoraPortal;
      render();
      return;
    }
    const id = location.hash.replace(/^#\/?/, "") || "dashboard";
    paint(ROTAS.has(id) ? id : "dashboard");
  });

  function login() {
    sessionStorage.setItem("nailagenda.auth", "1");
    route = "dashboard"; location.hash = "dashboard";
    render();
  }
  async function logout() {
    sessionStorage.removeItem("nailagenda.auth");
    if (window.Nuvem && Nuvem.modo === "nuvem") await Nuvem.sair();
    render();
  }

  function navBadgeCount(id) {
    const db = Store.db;
    if (id === "agenda") return db.appts.filter(a => Schedule.day(a.start) === Store.todayISO() && a.status !== "CANCELED").length;
    if (id === "solicitacoes") return Views.pendentes ? Views.pendentes() : 0;
    if (id === "retornos") return Store.dueForMaintenance().length;
    if (id === "cobrancas") return db.charges.filter(c => c.status !== "PAID").length;
    if (id === "produtos") return db.products.filter(p => p.stock <= p.min).length;
    return 0;
  }

  function shell() {
    const user = Store.currentUser();
    const el = h(`<div class="shell">
      <aside class="sidebar ${sidebarOpen?'open':''}" id="sidebar">
        <div class="brand">
          <div class="logo">${icon('nail')}</div>
          <div>
            <div class="name">nail<span>agenda</span></div>
            <div class="brand-sub">nail designer</div>
          </div>
        </div>
        <nav class="nav" id="nav"></nav>
        <div style="margin-top:auto">
          <div class="nav-divider"></div>
          <div class="row" style="padding:8px 8px 4px;gap:10px">
            ${avatar(user.name,'md')}
            <div style="min-width:0" class="grow">
              <div class="bold truncate" style="font-size:13px">${esc(user.name)}</div>
              <div class="tiny muted truncate">${Store.ROLES[user.role].label}</div>
            </div>
            <button class="btn btn-icon btn-ghost btn-sm" id="logout-btn" title="Sair">${icon('logout')}</button>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="btn btn-icon btn-ghost hamburger" id="ham">${icon('menu')}</button>
          <div class="page-title" id="page-title">Visão geral</div>
          <div class="grow"></div>
          <div class="input-group searchbox desktop-only">
            <span class="ic-left">${icon('search')}</span>
            <input class="input" id="global-search" placeholder="Buscar cliente, serviço..." />
          </div>
          <span id="sync-chip" class="sync-chip" hidden></span>
          <button class="btn btn-icon btn-ghost" id="theme-btn" title="Tema">${icon(Store.db.settings.theme==='dark'?'sun':'moon')}</button>
          <button class="btn btn-icon btn-ghost" id="notif-btn" title="Notificações" style="position:relative">${icon('bell')}
            ${/* Aceso só quando há algo de verdade. Um ponto permanente
                  ensina a ignorar o aviso. */ avisos().length
              ? `<span class="notif-dot"></span>` : ""}</button>
        </header>
        <main class="content" id="view"></main>
      </div>
      <nav class="bottomnav" id="bottomnav" aria-label="Navegação principal"></nav>
    </div>`);

    // Barra inferior (só aparece no mobile — ver CSS).
    const bn = el.querySelector("#bottomnav");
    BOTTOM_NAV.forEach(item => {
      const cnt = item.id === "__more" ? 0 : navBadgeCount(item.id);
      const b = h(`<button data-bn="${item.id}" class="${item.id===route?'active':''}"
        aria-label="${item.label}" ${item.id===route?'aria-current="page"':''}>
        ${icon(item.icon)}<span>${item.label}</span>
        ${cnt?`<span class="bn-count">${cnt>9?'9+':cnt}</span>`:''}</button>`);
      b.onclick = () => {
        if (item.id === "__more") {
          sidebarOpen = true;
          document.getElementById("sidebar").classList.add("open");
          toggleScrim();
          return;
        }
        go(item.id);
      };
      bn.appendChild(b);
    });

    // nav
    const nav = el.querySelector("#nav");
    NAV.forEach(item => {
      if (item.section) { nav.appendChild(h(`<div class="nav-section">${item.section}</div>`)); return; }
      const cnt = navBadgeCount(item.id);
      const n = h(`<div class="nav-item ${item.id===route?'active':''}" data-route="${item.id}">
        ${icon(item.icon)}<span class="grow">${item.label}</span>
        ${item.badge?`<span style="color:var(--gold)">${item.badge}</span>`:''}
        ${cnt?`<span class="count">${cnt}</span>`:''}</div>`);
      n.onclick = () => go(item.id);
      nav.appendChild(n);
    });

    el.querySelector("#logout-btn").onclick = () => Modal.confirm({ title:"Sair", message:"Deseja encerrar a sessão?", confirmText:"Sair", danger:true, onConfirm:logout });
    el.querySelector("#theme-btn").onclick = toggleTheme;
    el.querySelector("#ham").onclick = () => { sidebarOpen = !sidebarOpen; document.getElementById("sidebar").classList.toggle("open", sidebarOpen); toggleScrim(); };
    el.querySelector("#notif-btn").onclick = notifications;

    /* Indicador de sincronização. Ela precisa saber, sem abrir nada, se
       o que acabou de anotar já saiu deste aparelho. */
    const chip = el.querySelector("#sync-chip");
    const pintarSync = (st) => {
      if (!st || st.modo !== "nuvem") { chip.hidden = true; return; }
      chip.hidden = false;
      const [cls, txt, titulo] =
        st.erro           ? ["erro",   "sem conexão", "O que você anotou está salvo neste aparelho e sobe assim que a conexão voltar."]
      : st.enviando       ? ["indo",   "salvando…",   "Enviando para o servidor."]
      : st.sujo           ? ["indo",   "salvando…",   "Alterações aguardando envio."]
      :                     ["ok",     "sincronizado","Tudo salvo no servidor."];
      chip.className = "sync-chip " + cls;
      chip.textContent = txt;
      chip.title = titulo;
    };
    if (window.Nuvem) { pintarSync(Nuvem.estado()); Nuvem.aoMudar(pintarSync); }

    const gs = el.querySelector("#global-search");
    gs.addEventListener("keydown", e => { if(e.key==="Enter" && gs.value.trim()){ go("clientes"); setTimeout(()=>{ const i=document.querySelector("#cli-search"); if(i){i.value=gs.value; i.dispatchEvent(new Event("input"));}},50); }});
    return el;
  }

  function toggleScrim() {
    let s = document.getElementById("scrim");
    if (sidebarOpen && !s) {
      s = h(`<div class="scrim" id="scrim"></div>`);
      s.onclick = () => { sidebarOpen=false; document.getElementById("sidebar").classList.remove("open"); s.remove(); };
      document.body.appendChild(s);
    } else if (!sidebarOpen && s) s.remove();
  }

  /* A rota vive no hash. Sem isso, o botao Voltar do celular saia do app
     inteiro em vez de voltar uma tela — e nao dava para mandar o link de
     uma tela especifica para ninguem. */
  function go(id) {
    const atual = location.hash.replace(/^#\/?/, "");
    if (atual !== id) { location.hash = id; return; }   // hashchange chama paint
    paint(id);
  }
  function paint(id) {
    route = id; sidebarOpen = false; toggleScrim();
    document.getElementById("sidebar").classList.remove("open");
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.route === id));
    document.querySelectorAll("[data-bn]").forEach(b => {
      const on = b.dataset.bn === id;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    renderRoute();
    document.getElementById("view").scrollTo(0,0);
    window.scrollTo(0,0);
  }
  window.go = go;

  function renderRoute() {
    const meta = PAGE_META[route] || { title: route };
    document.getElementById("page-title").textContent = meta.title;
    const view = document.getElementById("view");
    view.innerHTML = "";
    const header = h(`<div style="margin-bottom:22px">
      <h1 style="font-size:24px">${meta.title}</h1>
      <p class="page-sub">${meta.sub||""}</p></div>`);
    // Some views render their own header
    const selfHeader = ["agenda","mensagens","dashboard"];
    if (!selfHeader.includes(route)) view.appendChild(header);

    const map = {
      dashboard: dashboard,
      agenda: Views.agenda,
      solicitacoes: Views.solicitacoes,
      retornos: Views.retornos,
      comandas: Views.comandas,
      cobrancas: Views.cobrancas,
      mensagens: Views.mensagens,
      clientes: Views.clientes,
      servicos: Views.servicos,
      produtos: Views.produtos,
      despesas: Views.despesas,
      relatorios: Views.relatorios,
      config: Views.config,
    };
    const fn = map[route] || (() => h(`<div class="empty">Em construção</div>`));
    view.appendChild(fn());
    // refresh nav counts
    document.querySelectorAll(".nav-item").forEach(n=>{
      const cnt = navBadgeCount(n.dataset.route); const ex = n.querySelector(".count");
      if(cnt){ if(ex) ex.textContent=cnt; else n.appendChild(h(`<span class="count">${cnt}</span>`)); }
      else if(ex) ex.remove();
    });
  }
  window.rerender = renderRoute;

  /* O que merece a atenção dela agora, em ordem de urgência.
     O pedido de horário vem primeiro: é o único item com prazo. */
  function avisos() {
    const db = Store.db;
    const items = [];
    const pedidos = Views.pendentes ? Views.pendentes() : 0;
    if (pedidos) items.push({ ic:"bell", c:"b-amber", ir:"solicitacoes",
      t:`${pedidos} pedido${pedidos>1?"s":""} de horário esperando você confirmar` });

    db.clients.filter(c => c.birthdate && c.birthdate.slice(5) === Store.todayISO().slice(5))
      .forEach(c => items.push({ ic:"cake", c:"b-violet", ir:"clientes", t:`Aniversário de ${c.name} hoje` }));
    db.charges.filter(c => Store.situacaoCobranca(c) === "OVERDUE")
      .forEach(c => items.push({ ic:"alert", c:"b-red", ir:"cobrancas", t:`Cobrança vencida — ${fmt.money(c.amount)}` }));
    db.products.filter(p => p.stock <= p.min)
      .forEach(p => items.push({ ic:"box", c:"b-amber", ir:"produtos", t:`Estoque baixo: ${p.name} (${p.stock})` }));
    return items;
  }

  function notifications() {
    const items = avisos();
    Modal.open({
      title: "Notificações", size:"sm",
      body: items.length ? `<div class="col" style="gap:4px">${items.map((i,ix)=>`
        <button class="notif-item" data-ir="${ix}">
          <span class="badge ${i.c}" style="width:30px;height:30px;justify-content:center;border-radius:9px">${icon(i.ic)}</span>
          <span style="font-size:13px;text-align:left">${esc(i.t)}</span>
          ${icon("chevR")}</button>`).join("")}</div>`
        : `<div class="empty"><div class="em-ic">${icon('check')}</div>Tudo em dia por aqui!</div>`,
      footer: `<button class="btn btn-ghost" data-close>Fechar</button>`,
      onMount(m){
        m.querySelector("[data-close]").onclick = Modal.close;
        m.querySelectorAll("[data-ir]").forEach(b => b.onclick = () => {
          Modal.close(); go(items[+b.dataset.ir].ir);
        });
      }
    });
  }

  /* ============ DASHBOARD ============ */
  function dashboard() {
    const db = Store.db;
    const today = Store.todayISO();
    const todays = db.appts.filter(a => Schedule.day(a.start) === today && a.status !== "CANCELED")
      .sort((a,b)=>a.start.localeCompare(b.start));

    // Janela móvel de 30 dias: sempre informativa (o mês-calendário fica
    // vazio no dia 1 e não serve como retrato do negócio).
    const since = new Date(Date.now() - 30*864e5);
    const prevSince = new Date(Date.now() - 60*864e5);
    const inWindow = (d, from, to) => { const x=new Date(d); return x>=from && (!to || x<to); };

    const winOrders = db.orders.filter(o => inWindow(o.date, since));
    const prevOrders = db.orders.filter(o => inWindow(o.date, prevSince, since));
    const revenue = winOrders.reduce((s,o)=>s+o.total,0);
    const prevRevenue = prevOrders.reduce((s,o)=>s+o.total,0);
    const winExp = db.expenses.filter(e => inWindow(e.date, since)).reduce((s,e)=>s+e.amount,0);
    const profit = revenue - winExp;
    const newClients = db.clients.filter(c => c.createdAt && inWindow(c.createdAt, since)).length;
    const ticket = winOrders.length ? revenue/winOrders.length : 0;
    const growth = prevRevenue ? Math.round(((revenue-prevRevenue)/prevRevenue)*100) : 0;

    const wrap = h(`<div class="col" style="gap:22px"></div>`);

    /* Primeiros passos. Depois de "Começar do zero" o painel era uma parede
       de zeros sem dizer por onde ir. Cada passo se marca sozinho a partir
       dos dados, e o quadro some quando ela já usa o sistema de verdade. */
    const passos = [
      { ok: db.services.some(s => s.active && s.returnDays != null && s.price > 0 && !db._servicosPendentes),
        t: "Confira seus serviços", d: "Preço, duração e em quantos dias ela volta. A agenda usa a duração para não marcar duas juntas.",
        ir: "servicos", marcar: () => { db._servicosPendentes = false; Store.save(); } },
      { ok: Boolean(db.company._horariosRevisados),
        t: "Ajuste seus horários", d: "Dias de trabalho, intervalo do almoço e as regras do agendamento online.",
        ir: "config", marcar: () => { db.company._horariosRevisados = true; Store.save(); } },
      { ok: db.clients.length > 0, t: "Cadastre sua primeira cliente", d: "Nome e WhatsApp bastam. O resto você completa com o tempo.", ir: "clientes" },
      { ok: db.appts.length > 0, t: "Marque o primeiro horário", d: "Pela agenda. Na hora de fechar, registre a cor que usou.", ir: "agenda" },
      { ok: Boolean(db._ultimoBackup), t: "Faça um backup", d: "Configurações › Dados do sistema. Guarde o arquivo no celular ou no Drive.", ir: "config" },
    ];
    const feitos = passos.filter(p => p.ok).length;
    const mostrarPassos = !Store.ehDemonstracao() && feitos < passos.length && db.orders.length < 5;
    if (mostrarPassos) {
      const card = h(`<div class="card card-pad passos">
        <div class="row between" style="align-items:baseline;margin-bottom:4px">
          <h3 style="font-size:16px">Primeiros passos</h3>
          <span class="tiny faint">${feitos} de ${passos.length}</span></div>
        <div class="passos-barra"><i style="transform:scaleX(${feitos / passos.length})"></i></div>
        <div class="col" style="gap:6px;margin-top:12px">${passos.map((p, i) => `
          <button class="passo${p.ok ? " feito" : ""}" data-i="${i}">
            <span class="passo-ic">${icon(p.ok ? "check" : "chevR")}</span>
            <span style="min-width:0"><span class="bold small">${p.t}</span><span class="tiny muted" style="display:block">${p.d}</span></span>
          </button>`).join("")}</div></div>`);
      card.querySelectorAll("[data-i]").forEach(b => b.onclick = () => {
        const p = passos[+b.dataset.i];
        if (p.marcar) p.marcar();
        go(p.ir);
      });
      wrap.appendChild(card);
    }

    /* Abertura: o dia dela, contado pelas cores. Cada horário aparece como
       uma unha pintada com o esmalte combinado ou, se ainda não há, com a
       última cor que a cliente usou. Sem cor registrada, a unha fica vazia. */
    const agora = Date.now();
    const ativos = todays.filter(a => a.status !== "NO_SHOW");
    const proxima = ativos.find(a => a.status !== "DONE" &&
      new Date(a.start).getTime() + (a.durationMin || 60) * 6e4 > agora);
    const dataLonga = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    const resumo = !ativos.length ? "Nenhum horário marcado para hoje."
      : `${ativos.length} ${ativos.length === 1 ? "atendimento" : "atendimentos"} hoje` +
        (proxima ? `, a próxima às ${fmt.time(proxima.start)}.` : ". Todos já passaram.");
    const hero = h(`<section class="hoje" aria-labelledby="hoje-t">
      <div class="hoje-topo">
        <div><h1 id="hoje-t" class="hoje-data">${esc(dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1))}</h1>
          <p class="page-sub">${resumo}</p></div>
        <div class="hoje-acoes">
          <button class="btn btn-ghost" data-ir="comandas">${icon("receipt")} Abrir comanda</button>
          <button class="btn btn-primary" data-ir="agenda">${icon("plus")} Novo agendamento</button>
        </div>
      </div>
      <ol class="fila" aria-label="Horários de hoje"></ol>
    </section>`);
    const fila = hero.querySelector(".fila");
    if (!ativos.length) fila.appendChild(h(`<li class="fila-vazia"><span class="unha vazia" aria-hidden="true"></span>
      <span>Dia livre. Toque em <b>Novo agendamento</b> para encaixar alguém.</span></li>`));
    ativos.forEach(a => {
      const v = Store.apptView(a);
      const cor = (a.polishId && Store.polish(a.polishId)) || Store.ultimaCorDa(a.clientId, a.id);
      const feito = a.status === "DONE";
      const li = h(`<li><button class="fila-item${a === proxima ? " proxima" : ""}${feito ? " feito" : ""}">
        <span class="unha${cor ? "" : " vazia"}"${cor ? ` style="--c:${cor.hex}"` : ""} aria-hidden="true"></span>
        <span class="fila-hora">${fmt.time(a.start)}</span>
        <span class="fila-nome">${esc(v.client.name.split(" ")[0])}</span>
        <span class="fila-serv">${esc(v.service.name)}</span>
        <span class="fila-cor">${cor ? esc(cor.name) + (a.polishId ? "" : ", da última vez") : "Sem cor registrada"}</span>
        ${a === proxima ? `<span class="fila-tag">Próxima</span>` : feito ? `<span class="fila-tag ok">${icon("check")} Feito</span>` : ""}
      </button></li>`);
      const bt = li.querySelector("button");
      bt.setAttribute("aria-label", `${fmt.time(a.start)}, ${v.client.name}, ${v.service.name}${cor ? ", cor " + cor.name : ""}`);
      bt.onclick = () => go("agenda");
      fila.appendChild(li);
    });
    hero.querySelectorAll("[data-ir]").forEach(b => b.onclick = () => go(b.dataset.ir));
    wrap.prepend(hero);

    // Os números do mês numa faixa só, em vez de um cartão para cada.
    const stats = [
      { lbl:"Faturamento, 30 dias", val:fmt.money(revenue),
        delta:(growth>=0?"+":"")+growth+"% sobre os 30 anteriores", up:growth>=0 },
      { lbl:"Lucro estimado", val:fmt.money(profit), delta:"menos "+fmt.money(winExp)+" de despesas" },
      { lbl:"Ticket médio", val:fmt.money(ticket), delta:winOrders.length+" comandas fechadas" },
      { lbl:"Clientes novas", val:newClients, delta:"nos últimos 30 dias" },
    ];
    wrap.appendChild(h(`<div class="stat-grid">${stats.map(s=>`
      <div class="stat">
        <div class="lbl">${s.lbl}</div>
        <div class="val">${s.val}</div>
        <div class="delta ${s.up==null?'':s.up?'up':'down'}">${s.up==null?'':icon(s.up?'arrowUp':'arrowDown')} ${s.delta}</div>
      </div>`).join("")}</div>`));

    const grid = h(`<div class="dash-grid" style="--cols:1.3fr 1fr"></div>`);

    // faturamento últimos 7 dias
    const days = [];
    for (let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); const key=d.toISOString().slice(0,10);
      const val = db.orders.filter(o=>Store.diaLocal(o.date)===key).reduce((s,o)=>s+o.total,0);
      days.push({ label: i ? d.toLocaleDateString("pt-BR",{weekday:"short"}).slice(0,3) : "hoje", val, hoje: !i }); }
    const max = Math.max(...days.map(d=>d.val),1);
    const chart = h(`<div class="card card-pad">
      <div class="row between" style="margin-bottom:6px"><h3 style="font-size:15px">Faturamento da semana</h3>
        <span class="chip">${icon('chart')} ${fmt.money(days.reduce((s,d)=>s+d.val,0))}</span></div>
      <div class="barchart">${days.map(d=>`<div class="bar${d.hoje?" hoje":""}" style="height:${Math.max(6,d.val/max*100)}%">
        <span class="val">${fmt.money0(d.val)}</span><span class="cap">${d.label}</span></div>`).join("")}</div>
      <div style="height:22px"></div></div>`);
    grid.appendChild(chart);
    wrap.appendChild(grid);

    // birthdays this month
    const monthBdays = db.clients.filter(c=>c.birthdate && c.birthdate.slice(5,7)===today.slice(5,7))
      .sort((a,b)=>a.birthdate.slice(8).localeCompare(b.birthdate.slice(8)));
    const bd = h(`<div class="card"><div class="card-head"><h3>Aniversariantes do mês ${icon('cake')}</h3>
      <button class="btn btn-sm btn-ghost" id="go-msg">Parabenizar</button></div><div id="bd-list"></div></div>`);
    const bl = bd.querySelector("#bd-list");
    if(!monthBdays.length) bl.appendChild(h(`<div class="empty" style="padding:24px"><div class="em-ic">${icon('cake')}</div>Ninguém faz aniversário este mês.</div>`));
    monthBdays.slice(0,5).forEach(c=>{
      const row = h(`<div class="lrow">${avatar(c.name,'sm')}
        <div class="grow"><div class="bold">${esc(c.name)}</div><div class="tiny muted">Dia ${c.birthdate.slice(8)}, ${fmt.age(c.birthdate)}</div></div>
        <button class="btn btn-sm btn-accent">${icon('whatsapp')}</button></div>`);
      // Abre a escolha de mensagem com revisão, em vez de disparar a primeira
      // da lista (e quebrar quando não havia nenhuma cadastrada).
      row.querySelector("button").onclick = () => Views.pickMessageFor({ client: c });
      bl.appendChild(row);
    });
    bd.querySelector("#go-msg").onclick=()=>go("mensagens");
    grid.appendChild(bd);

    return wrap;
  }

  window.addEventListener("serena:change", () => {
    document.querySelectorAll(".nav-item").forEach(n=>{
      const cnt = navBadgeCount(n.dataset.route); const ex = n.querySelector(".count");
      if(cnt){ if(ex) ex.textContent=cnt; else n.appendChild(h(`<span class="count">${cnt}</span>`)); }
      else if(ex) ex.remove();
    });
    document.querySelectorAll("[data-bn]").forEach(b=>{
      if(b.dataset.bn === "__more") return;
      const cnt = navBadgeCount(b.dataset.bn); const ex = b.querySelector(".bn-count");
      const txt = cnt>9 ? "9+" : String(cnt);
      if(cnt){ if(ex) ex.textContent=txt; else b.appendChild(h(`<span class="bn-count">${txt}</span>`)); }
      else if(ex) ex.remove();
    });
  });

  applyTheme();
  if (isClientPortal()) {
    /* Aqui vale esperar: são poucos milissegundos, e o preço de pintar
       antes seria mostrar preço errado para a cliente. */
    app.appendChild(portalCarregando());
    ligarNuvem().finally(render);
  } else {
    render();            // painel abre na hora, com o cache local
    ligarNuvem();        // e conversa com o servidor em seguida
  }
})();
