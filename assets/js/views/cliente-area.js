/* ============================================================
   nailagenda — Portal da Cliente

   Painel separado do da profissional. A cliente entra em `#cliente`
   (o link que a Marina põe na bio do Instagram), acessa com telefone
   + senha e agenda sozinha.

   Regra de negócio: o agendamento nasce PENDENTE. Sessões de unha
   ocupam de 1 a 3 horas, então quem confirma é a Marina — a cliente
   pede o horário, não fecha a agenda dela sozinha.
   (Configurações → "Confirmar automaticamente" inverte isso.)
   ============================================================ */
window.Views = window.Views || {};

(function () {
  const SESSION = "nailagenda.cliente";   // sessão própria, separada da do painel dela
  let logged = null;
  let step = "login";                 // login | home | book | history | profile
  let booking = { serviceId: null, proId: null, date: null, time: null };
  let calMonth = null;                // mês exibido no calendário de agendamento

  const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };

  const naNuvem = () => window.PortalNuvem && PortalNuvem.naNuvem();

  /* A mesma regra do servidor. Antes a tela pedia 6 caracteres e o
     servidor recusava tudo abaixo de 8 — o cadastro "dava errado". */
  const erroSenha = (pw) => pw.length < 8 ? "A senha precisa ter ao menos 8 caracteres."
    : /^\d+$/.test(pw) ? "Misture letras e números na senha." : null;
  const DICA_SENHA = "Mínimo 8 caracteres, com letras";
  const primeiroNome = () => ((Store.db.company && Store.db.company.name) || "a profissional").split(" ")[0];

  function restoreSession() {
    if (naNuvem()) {
      /* Na nuvem a sessão vive num cookie HttpOnly que este script não
         consegue ler. Quem diz se ela está logada é a resposta do
         servidor, não o sessionStorage. */
      const conta = PortalNuvem.conta;
      logged = conta && conta.perfil ? Store.byId("clients", conta.perfil.id) : null;
      if (logged && step === "login") step = "home";
      if (!logged) step = "login";
      return;
    }
    if (logged) return;
    const id = sessionStorage.getItem(SESSION);
    if (id) logged = Store.byId("clients", id) || null;
    if (logged) step = step === "login" ? "home" : step;
  }
  function signIn(c) { logged = c; step = "home"; try { sessionStorage.setItem(SESSION, c.id); } catch (e) {} }
  function signOut() {
    logged = null; step = "login";
    try { sessionStorage.removeItem(SESSION); } catch (e) {}
    if (naNuvem()) PortalNuvem.sair().then(() => { if (window.rerender) rerender(); });
  }

  /* Roda uma ação da nuvem travando o botão e mostrando o erro que o
     servidor mandou, em vez de falhar calada. */
  async function comServidor(botao, acao, msgOk) {
    const rotulo = botao && botao.textContent;
    if (botao) { botao.disabled = true; botao.textContent = "Aguarde…"; }
    try {
      await acao();
      if (msgOk) toast(msgOk, "ok");
      return true;
    } catch (e) {
      toast((e && e.message) || "Não foi possível concluir. Tente de novo.", "err");
      return false;
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = rotulo; }
    }
  }

  Views.clientePortal = function () {
    restoreSession();
    const co = Store.db.company;
    const wrap = h(`<div class="portal"></div>`);

    const head = h(`<header class="portal-head">
      <div class="portal-head-inner">
        <div class="row gap-8" style="min-width:0">
          <div class="portal-logo">${icon('nail')}</div>
          <div style="min-width:0">
            <div class="portal-brand truncate">${esc(co.name)}</div>
            <div class="portal-tag truncate">${esc(co.segment)}</div>
          </div>
        </div>
        ${logged ? `<button class="btn btn-icon btn-sm portal-out" id="ca-out" aria-label="Sair da conta" title="Sair">${icon('logout')}</button>` : ''}
      </div>
      ${logged ? `<div class="portal-hello">
        <span class="avatar md" style="background:rgba(255,255,255,.22)">${fmt.initials(logged.name)}</span>
        <div><div class="portal-hello-sm">Olá,</div>
        <div class="portal-hello-name">${esc(logged.name.split(" ")[0])}</div></div></div>`
      : `<div class="portal-boasvindas">
        <h1 class="portal-titulo">Agende seu horário</h1>
        <p class="portal-bio">${esc(co.tagline || "Unhas com cuidado, no seu horário")}</p>
      </div>`}
    </header>`);
    wrap.appendChild(head);
    if (logged) head.querySelector("#ca-out").onclick = () => { signOut(); paint(); };

    const shell = h(`<div class="portal-body"></div>`);
    wrap.appendChild(shell);

    const cat = (window.PortalNuvem && PortalNuvem.catalogo && PortalNuvem.catalogo["ateliê"]) || {};
    const handle = String(cat.handle || co.handle || "").replace(/^@/, "");
    const fone = cat.phone || co.phone;
    wrap.appendChild(h(`<footer class="portal-rodape">
      <div class="portal-rodape-nome">${esc(co.name || "")}</div>
      <div class="portal-rodape-links">
        ${handle ? `<a href="https://instagram.com/${encodeURIComponent(handle)}" target="_blank" rel="noopener">@${esc(handle)}</a>` : ""}
        ${fone ? `<a href="${waLink(fone, "Oi! Vim pelo site de agendamento.")}" target="_blank" rel="noopener">${icon("whatsapp")} WhatsApp</a>` : ""}
      </div></footer>`));

    const paint = () => {
      // o cabeçalho muda entre logada e deslogada, então repinta a tela toda
      const host = document.getElementById("app");
      if (host) { host.innerHTML = ""; host.appendChild(Views.clientePortal()); window.scrollTo(0, 0); }
    };
    const paintBody = () => {
      shell.innerHTML = "";
      if (!logged) { shell.appendChild(loginScreen()); return; }
      shell.appendChild(navBar());
      if (step === "home") shell.appendChild(homeScreen());
      if (step === "book") shell.appendChild(bookScreen());
      if (step === "history") shell.appendChild(historyScreen());
      if (step === "profile") shell.appendChild(profileScreen());
    };

    // Estado com que ESTE cabeçalho foi montado. Se ele mudar (login ou
    // logout), repintar só o corpo deixaria o topo desatualizado — sem
    // saudação e sem botão de sair.
    const headerFor = !!logged;

    // As telas internas chamam rerender().
    window.rerender = () => {
      restoreSession();
      if (!!logged !== headerFor) paint();   // mudou de sessão: tela toda
      else paintBody();                      // mesma sessão: só o corpo
    };
    Views._caPaint = paintBody;
    Views._caSignIn = signIn;
    paintBody();
    return wrap;
  };

  function navBar() {
    const items = [
      { id:"home", ic:"grid", l:"Início" },
      { id:"book", ic:"plus", l:"Agendar" },
      { id:"history", ic:"clock", l:"Histórico" },
      { id:"profile", ic:"user", l:"Perfil" },
    ];
    const el = h(`<nav class="portal-nav" aria-label="Seções">
      ${items.map(i=>`<button data-s="${i.id}"${step===i.id?' aria-current="page"':''}>${icon(i.ic)}<span>${i.l}</span></button>`).join("")}</nav>`);
    el.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { step = b.dataset.s; Views._caPaint(); });
    return el;
  }

  /* ---------- Login / cadastro da cliente ----------
     Acesso apenas por telefone + senha: a cliente nunca informa e-mail,
     CPF ou qualquer outro dado sensível para entrar. */
  function loginScreen() {
    const db = Store.db;
    const semSenha = db.clients.filter(c => !c.passwordHash).length;
    const el = h(`<div class="card-pad col" style="gap:16px">
      <div>
        <h2 class="portal-form-t">Entrar</h2>
        <p class="small muted" style="margin-top:2px">Com o telefone e a senha do seu cadastro.</p></div>

      <div class="field"><label>Telefone / WhatsApp</label>
        <input class="input" id="ca-phone" data-fone autocomplete="tel" placeholder="(11) 91234-5678" /></div>

      <div class="field"><label>Senha</label>
        <div class="input-group">
          <input class="input" id="ca-pw" type="password" autocomplete="current-password" placeholder="Sua senha" />
          <button type="button" class="btn btn-icon btn-sm btn-ghost" id="ca-eye"
            aria-label="Mostrar senha" title="Mostrar senha"
            style="position:absolute;right:5px;top:50%;transform:translateY(-50%);border:none;background:transparent">${icon('eye')}</button>
        </div></div>

      <button class="btn btn-primary btn-block" id="ca-in" style="height:46px">Entrar</button>
      <button class="btn btn-ghost btn-block btn-sm" id="ca-forgot">Esqueci minha senha</button>

      <div class="divider" style="margin:4px 0"></div>
      <div class="center small muted">Primeira vez aqui?</div>
      <button class="btn btn-ghost btn-block" id="ca-new">${icon('plus')} Criar meu cadastro</button>

      ${/* Atalho de desenvolvimento. Num site publicado isto entregaria
            nome e telefone das clientes para quem abrisse o link — então
            só aparece rodando na própria máquina. */
        !naNuvem() && (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? `
      <div class="card card-pad" style="background:var(--surface-2)">
        <div class="small bold">Contas de teste <span class="muted" style="font-weight:400">(só no computador de desenvolvimento)</span></div>
        <div class="small muted" style="margin-top:6px">
          ${semSenha ? "Estes cadastros ainda não têm senha — no primeiro acesso você define a sua." : "Toque para preencher o telefone."}</div>
        <div class="col" style="gap:4px;margin-top:8px">
          ${db.clients.slice(0,3).map(c=>`<button class="btn btn-sm btn-subtle" data-p="${c.phone}" style="justify-content:space-between">
            <span>${esc(c.name)}</span><span class="mono tiny">${fmt.phone(c.phone)}</span></button>`).join("")}
        </div></div>` : ""}
    </div>`);

    el.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { el.querySelector("#ca-phone").value = fmt.phone(b.dataset.p); });
    el.querySelector("#ca-eye").onclick = (e) => {
      const btn = e.currentTarget, i = el.querySelector("#ca-pw");
      const show = i.type === "password";
      i.type = show ? "text" : "password";
      btn.innerHTML = icon(show ? "eyeOff" : "eye");
      btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
      btn.setAttribute("title", show ? "Ocultar senha" : "Mostrar senha");
      i.focus();
    };

    const entrar = async () => {
      const phone = el.querySelector("#ca-phone").value;
      const pw = el.querySelector("#ca-pw").value;
      if (!Store.onlyDigits(phone)) { toast("Informe seu telefone.", "err"); return; }

      if (naNuvem()) {
        /* Quem confere a senha é o servidor: PBKDF2 com 210 mil ciclos,
           contador de tentativas e bloqueio temporário. */
        if (!pw) { toast("Informe sua senha.", "err"); return; }
        const ok = await comServidor(el.querySelector("#ca-in"),
          () => PortalNuvem.entrar(phone, pw));
        if (ok) { rerender(); toast("Bem-vinda de volta!", "ok"); }
        return;
      }

      const c = Store.findClientByPhone(phone);
      // Mensagem genérica: não revela se o telefone existe na base.
      if (!c) { toast("Telefone ou senha incorretos.", "err"); return; }

      if (!c.passwordHash) { firstAccessDialog(c); return; }
      if (!pw) { toast("Informe sua senha.", "err"); return; }
      if (!(await Store.checkPassword(c, pw))) { toast("Telefone ou senha incorretos.", "err"); return; }
      signIn(c); rerender(); toast(`Bem-vinda, ${c.name.split(" ")[0]}!`, "ok");
    };
    el.querySelector("#ca-in").onclick = entrar;
    el.querySelector("#ca-pw").addEventListener("keydown", e => { if (e.key === "Enter") entrar(); });
    el.querySelector("#ca-phone").addEventListener("keydown", e => { if (e.key === "Enter") entrar(); });

    el.querySelector("#ca-forgot").onclick = () => {
      if (naNuvem()) {
        /* Não existe envio de código: prometer um era mentir. Quem libera
           um novo cadastro é a profissional, pela ficha da cliente. */
        const fone = (PortalNuvem.catalogo && PortalNuvem.catalogo["ateliê"] && PortalNuvem.catalogo["ateliê"].phone) || Store.db.company.phone;
        const quem = primeiroNome();
        Modal.open({
          title: "Esqueci minha senha", size: "sm",
          body: `<p class="small" style="line-height:1.6">Por segurança, a senha não é enviada por mensagem.</p>
            <p class="small muted" style="line-height:1.6;margin-top:8px">Chame a ${esc(quem)} no WhatsApp. Ela libera um
            novo cadastro para o seu telefone, e você cria uma senha nova em <b>Criar meu cadastro</b>.
            Seus horários e o seu histórico continuam.</p>`,
          footer: `<button class="btn btn-ghost" data-c>Fechar</button>${fone ? `<a class="btn btn-accent" target="_blank" rel="noopener"
            href="${waLink(fone, `Oi, ${quem}! Esqueci a senha do agendamento. Pode liberar um novo cadastro para o meu telefone?`)}">${icon("whatsapp")} Chamar no WhatsApp</a>` : ""}`,
          onMount(m) { m.querySelector("[data-c]").onclick = Modal.close; }
        });
        return;
      }
      const c = Store.findClientByPhone(el.querySelector("#ca-phone").value);
      Modal.open({
        title: "Esqueci minha senha", size: "sm",
        body: `<p class="small muted" style="line-height:1.6">
          Enviaremos um código por WhatsApp para o número informado e você poderá definir uma nova senha.</p>
          <div class="field" style="margin-top:12px"><label>Telefone</label>
          <input class="input" id="fg-p" data-fone value="${esc(el.querySelector("#ca-phone").value)}" placeholder="(11) 91234-5678" /></div>`,
        footer: `<button class="btn btn-ghost" data-c>Cancelar</button><button class="btn btn-primary" data-ok>Enviar código</button>`,
        onMount(m) {
          m.querySelector("[data-c]").onclick = Modal.close;
          m.querySelector("[data-ok]").onclick = () => {
            Modal.close();
            // Sem backend não há envio real de código — ver README (SMS/WhatsApp OTP).
            if (c) { toast("Demo: defina uma nova senha agora.", "ok"); firstAccessDialog(c, true); }
            else toast("Se o número existir, você receberá um código.", "ok");
          };
        }
      });
    };

    el.querySelector("#ca-new").onclick = () => {
      Modal.open({
        title: "Criar cadastro",
        body: `<div class="form-grid">
          <div class="field full"><label>Nome completo *</label><input class="input" id="nc-n" placeholder="Seu nome" /></div>
          <div class="field"><label>Telefone / WhatsApp *</label><input class="input" id="nc-p" data-fone autocomplete="tel" placeholder="(11) 91234-5678" /></div>
          <div class="field"><label>Data de nascimento</label><input class="input" type="date" id="nc-b" /></div>
          <div class="field"><label>Senha *</label><input class="input" type="password" id="nc-pw" autocomplete="new-password" placeholder="${DICA_SENHA}" /></div>
          <div class="field"><label>Confirmar senha *</label><input class="input" type="password" id="nc-pw2" autocomplete="new-password" /></div>
        </div>
        <p class="small muted" style="margin-top:12px">Pedimos apenas telefone e senha — nenhum dado sensível é necessário para agendar.</p>`,
        footer: `<button class="btn btn-ghost" data-c>Cancelar</button><button class="btn btn-primary" data-ok>Criar conta</button>`,
        onMount(m) {
          m.querySelector("[data-c]").onclick = Modal.close;
          m.querySelector("[data-ok]").onclick = async () => {
            const n = m.querySelector("#nc-n").value.trim(), p = m.querySelector("#nc-p").value.trim();
            const pw = m.querySelector("#nc-pw").value, pw2 = m.querySelector("#nc-pw2").value;
            if (!n || !p) { toast("Preencha nome e telefone.", "err"); return; }
            if (Store.onlyDigits(p).length < 10) { toast("Informe o telefone com DDD.", "err"); return; }
            const fraca = erroSenha(pw);
            if (fraca) { toast(fraca, "err"); return; }
            if (pw !== pw2) { toast("As senhas não conferem.", "err"); return; }

            if (naNuvem()) {
              const ok = await comServidor(m.querySelector("[data-ok]"),
                () => PortalNuvem.cadastrar(n, p, pw, m.querySelector("#nc-b").value));
              if (ok) { Modal.close(); rerender(); toast("Conta criada. Bem-vinda!", "ok"); }
              return;
            }

            if (Store.findClientByPhone(p)) { toast("Já existe um cadastro com esse telefone.", "err"); return; }
            const c = Store.upsert("clients", { name:n, phone:p, email:"",
              birthdate:m.querySelector("#nc-b").value, credit:0, tags:[], notes:"",
              createdAt:new Date().toISOString(), anamnese:null });
            await Store.setPassword(c, pw);
            signIn(c); Modal.close(); rerender(); toast("Cadastro criado com sucesso!", "ok");
          };
        }
      });
    };
    return el;
  }

  /* Primeiro acesso: cadastro criado pelo salão ainda não tem senha */
  function firstAccessDialog(c, isReset) {
    Modal.open({
      title: isReset ? "Definir nova senha" : "Primeiro acesso",
      size: "sm",
      body: `<p class="small muted" style="line-height:1.6">
          ${isReset ? "Escolha uma nova senha para sua conta." :
          `Olá, <b>${esc(c.name.split(" ")[0])}</b>! Seu cadastro já existe aqui no salão. Crie uma senha para acessar seus agendamentos.`}</p>
        <div class="field" style="margin-top:14px"><label>Nova senha</label>
          <input class="input" type="password" id="fa-pw" autocomplete="new-password" placeholder="${DICA_SENHA}" /></div>
        <div class="field" style="margin-top:12px"><label>Confirmar senha</label>
          <input class="input" type="password" id="fa-pw2" autocomplete="new-password" /></div>`,
      footer: `<button class="btn btn-ghost" data-c>Cancelar</button><button class="btn btn-primary" data-ok>Salvar senha</button>`,
      onMount(m) {
        m.querySelector("[data-c]").onclick = Modal.close;
        m.querySelector("[data-ok]").onclick = async () => {
          const pw = m.querySelector("#fa-pw").value, pw2 = m.querySelector("#fa-pw2").value;
          const fraca = erroSenha(pw);
          if (fraca) { toast(fraca, "err"); return; }
          if (pw !== pw2) { toast("As senhas não conferem.", "err"); return; }
          await Store.setPassword(c, pw);
          signIn(c); Modal.close(); rerender(); toast("Senha criada. Bem-vinda!", "ok");
        };
      }
    });
  }

  /* ---------- Home da cliente ---------- */
  function homeScreen() {
    const db = Store.db;
    const now = new Date();
    const next = db.appts.filter(a => a.clientId === logged.id && a.status !== "CANCELED" && new Date(a.start) >= now)
      .sort((a,b)=>a.start.localeCompare(b.start));
    const raiz = h(`<div class="card-pad portal-home"><div class="ph-principal"></div><div class="ph-lateral"></div></div>`);
    const el = raiz.querySelector(".ph-principal");
    const lado = raiz.querySelector(".ph-lateral");

    if (next.length) {
      const a = next[0]; const v = Store.apptView(a); const st = Store.APPT_STATUS[a.status];
      const podeMexer = Schedule.clientCanChange(a);   // prazo de cancelamento online
      const card = h(`<div class="card card-pad" style="border-color:var(--brand-500);background:var(--brand-50)">
        <div class="row between"><span class="badge ${st.cls}">${st.label}</span>
          <span class="small bold" style="color:var(--brand-700)">Próximo horário</span></div>
        <div style="font-family:var(--display);font-weight:800;font-size:18px;margin-top:10px;color:var(--brand-800)">${esc(v.service.name)}</div>
        <div class="small" style="margin-top:6px;color:var(--brand-700)">
          ${icon('calendar')} ${fmt.dateTime(a.start)}<br>
          ${icon('user')} com ${esc(v.pro.name)}<br>
          ${icon('dollar')} ${fmt.money(a.price)}</div>
        <div class="row gap-8" style="margin-top:14px">
          <button class="btn btn-sm btn-ghost grow" data-resch ${podeMexer?"":"disabled"}>${icon('refresh')} Remarcar</button>
          <button class="btn btn-sm btn-danger grow" data-cancel ${podeMexer?"":"disabled"}>${icon('x')} Cancelar</button></div>
        ${podeMexer ? "" : `<div class="tiny" style="margin-top:10px;color:var(--brand-700)">
          Faltam menos de ${Store.db.company.booking?.cancelHours ?? 24}h — para mudar este horário, fale com a Marina.</div>`}</div>`);
      if (podeMexer) {
      card.querySelector("[data-resch]").onclick = () => rescheduleDialog(a);
      card.querySelector("[data-cancel]").onclick = () => Modal.confirm({
        title:"Cancelar agendamento", danger:true, confirmText:"Sim, cancelar",
        message:`Cancelar seu horário de <b>${esc(v.service.name)}</b> em ${fmt.dateTime(a.start)}?`,
        async onConfirm(){
          if (!Schedule.clientCanChange(a)) { toast("O prazo para cancelar online terminou. Fale com a Marina.", "err"); return; }
          if (naNuvem()) {
            if (await comServidor(null, () => PortalNuvem.cancelar(a.id))) {
              rerender(); toast("Agendamento cancelado.", "ok");
            }
            return;
          }
          a.status="CANCELED"; Store.upsert("appts", a); rerender(); toast("Agendamento cancelado.", "ok"); }});
      }
      el.appendChild(card);
    }

    /* Os serviços na própria tela inicial: um toque já abre os dias livres
       daquele serviço. Sem horário marcado, ficam no centro; com horário,
       vão para o lado, como "agendar outro". */
    const ativos = db.services.filter(s => s.active !== false);
    const servicos = h(`<section class="ph-bloco">
      ${next.length ? `<h2 class="ph-titulo-sm">Agendar outro serviço</h2>`
        : `<div><h2 class="ph-titulo">Nenhum horário marcado</h2>
           <p class="small muted" style="margin-top:2px">Escolha um serviço para ver os dias com vaga.</p></div>`}
      <div class="ph-servicos">${ativos.slice(0, next.length ? 4 : 5).map(s => `
        <button class="ph-servico" data-svc="${s.id}">
          <span style="min-width:0"><span class="bold truncate" style="display:block">${esc(s.name)}</span>
            <span class="tiny muted">${s.duration} min</span></span>
          <span class="ph-preco">${fmt.money(s.price)}</span>${icon('chevR')}</button>`).join("")}</div>
      <button class="btn ${next.length ? "btn-ghost" : "btn-primary"} btn-block" id="h-book"${next.length ? "" : ' style="height:46px"'}>${
        ativos.length > (next.length ? 4 : 5) ? "Ver todos os serviços" : "Agendar horário"}</button>
    </section>`);
    servicos.querySelectorAll("[data-svc]").forEach(b => b.onclick = () => {
      booking = { serviceId: b.dataset.svc, proId: null, date: null, time: null };
      step = "book"; Views._caPaint();
    });
    servicos.querySelector("#h-book").onclick = () => { step = "book"; booking = { serviceId:null, proId:null, date:null, time:null }; Views._caPaint(); };
    (next.length ? lado : el).appendChild(servicos);

    /* ---- Manutenção: quanto tempo desde a última vez ----
       O mesmo ciclo que a Marina vê em Retornos, do lado da cliente.
       Ela se programa sozinha em vez de esperar ser chamada. */
    const feitos = db.appts
      .filter(a => a.clientId === logged.id && a.status === "DONE")
      .sort((a, b) => b.start.localeCompare(a.start));
    const ultimo = feitos[0];
    const svcUlt = ultimo ? Store.byId("services", ultimo.serviceId) : null;

    if (svcUlt && svcUlt.returnDays > 0 && !next.length) {
      const dias = Math.floor((Date.now() - new Date(ultimo.start)) / 864e5);
      const faltam = svcUlt.returnDays - dias;
      const pct = Math.min(100, Math.round((dias / svcUlt.returnDays) * 100));
      const venceu = faltam <= 0;
      lado.appendChild(h(`<div class="card card-pad">
        <div class="row between" style="margin-bottom:8px">
          <span class="small bold">${venceu ? "Hora da manutenção" : "Próxima manutenção"}</span>
          <span class="badge ${venceu ? "b-amber" : "b-gray"}">
            ${venceu ? `${Math.abs(faltam)} dia(s) de atraso` : `em ~${faltam} dia(s)`}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;
          background:${venceu ? "var(--warn)" : "var(--brand-500)"}"></div></div>
        <div class="tiny muted" style="margin-top:8px">
          Seu último ${esc(svcUlt.name)} foi há ${dias} dias.
          O ciclo costuma ser de ${svcUlt.returnDays} dias.</div></div>`));
    }

    /* ---- Repetir o de sempre: agendar em um toque ---- */
    if (svcUlt) {
      const rep = h(`<button class="btn btn-ghost btn-block" id="h-rep" style="justify-content:space-between;height:auto;padding:12px 14px">
        <span class="row gap-8" style="min-width:0">
          ${icon('refresh')}
          <span style="text-align:left;min-width:0">
            <span class="bold" style="display:block;font-size:13px">Repetir o de sempre</span>
            <span class="tiny muted truncate" style="display:block">${esc(svcUlt.name)}, ${fmt.money(svcUlt.price)}</span>
          </span></span>
        ${icon('chevR')}</button>`);
      rep.onclick = () => {
        booking = { serviceId: svcUlt.id, proId: null, date: null, time: null };
        step = "book"; Views._caPaint();
      };
      lado.appendChild(rep);
    }

    if (logged.credit > 0)
      lado.appendChild(h(`<div class="card card-pad" style="background:var(--accent-soft);border:none">
        <div class="row gap-10"><span style="color:var(--accent-ink)">${icon('wallet')}</span>
        <div><div class="bold" style="color:var(--accent-ink)">Você tem ${fmt.money(logged.credit)} em créditos</div>
        <div class="tiny" style="color:var(--accent-ink);opacity:.85">Use no seu próximo atendimento.</div></div></div></div>`));

    /* ---- Meus últimos trabalhos ----
       A cor usada é o registro. A cliente lembra o que fez e pede igual. */
    const comCor = feitos.filter(a => a.polishId).slice(0, 6);
    if (comCor.length) {
      const strip = h(`<div>
        <div class="row between" style="margin-bottom:8px">
          <span class="small bold">Meus últimos trabalhos</span>
          <button class="btn btn-sm btn-ghost" id="h-all" style="height:26px;padding:0 8px">Ver tudo</button>
        </div>
        <div class="work-strip">${comCor.map(a => {
          const pol = Store.polish(a.polishId), s = Store.byId("services", a.serviceId);
          return `<div class="work-item" title="${esc(s.name)}, ${esc(pol.name)}">
            <span class="unha" style="--c:${esc(pol.hex)}" aria-hidden="true"></span>
            <span class="tiny muted truncate">${esc(pol.name)}</span>
            <span class="tiny faint">${new Date(a.start).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}</span>
          </div>`;
        }).join("")}</div></div>`);
      strip.querySelector("#h-all").onclick = () => { step = "history"; Views._caPaint(); };
      lado.appendChild(strip);
    }

    if (next.length > 1) {
      el.appendChild(h(`<div class="small bold">Outros horários marcados</div>`));
      next.slice(1).forEach(a => {
        const v = Store.apptView(a);
        el.appendChild(h(`<div class="row" style="gap:12px;padding:12px;border:1px solid var(--line);border-radius:12px">
          <div style="font-family:var(--display);font-weight:700;color:var(--brand-600);font-size:12.5px;width:58px">
            ${new Date(a.start).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}<br>${fmt.time(a.start)}</div>
          <div class="grow"><div class="bold" style="font-size:13px">${esc(v.service.name)}</div>
            <div class="tiny muted">${esc(v.pro.name)}</div></div></div>`));
      });
    }
    if (!lado.children.length) lado.remove();
    return raiz;
  }

  /* ---------- Fluxo de agendamento ---------- */
  function bookScreen() {
    const db = Store.db;
    const el = h(`<div class="card-pad col" style="gap:18px"></div>`);

    // Numeração corrida: um passo pulado não pode deixar buraco.
    let passo = 0;
    const n = () => ++passo;

    // 1. Serviço
    el.appendChild(h(`<div><div class="small bold" style="margin-bottom:8px">${n()}. Escolha o serviço</div>
      <div class="col" style="gap:8px" id="bk-svc">
      ${db.services.filter(s=>s.active !== false).map(s=>`<button class="btn btn-ghost" data-svc="${s.id}"
        style="height:auto;padding:12px;justify-content:space-between;${booking.serviceId===s.id?'border-color:var(--brand-500);background:var(--brand-50)':''}">
        <span style="text-align:left"><span class="bold">${esc(s.name)}</span><br>
          <span class="tiny muted">${s.duration} min</span></span>
        <span class="bold">${fmt.money(s.price)}</span></button>`).join("")}</div></div>`));
    el.querySelectorAll("[data-svc]").forEach(b => b.onclick = () => { booking.serviceId = b.dataset.svc; booking.time=null; Views._caPaint(); });

    if (!booking.serviceId) return el;

    // 2. Profissional — só existe passo se houver escolha de verdade.
    // A Marina atende sozinha: perguntar "com quem?" para uma opção só
    // é um passo a mais sem informação nenhuma.
    const svc = Store.byId("services", booking.serviceId);
    const pros = db.professionals.filter(p => p.role !== "SECRETARY" && (p.services||[]).includes(svc.id));
    const proList = pros.length ? pros : db.professionals.filter(p => p.role !== "SECRETARY");

    if (proList.length === 1) {
      booking.proId = proList[0].id;                 // seleciona e segue
    } else {
      el.appendChild(h(`<div><div class="small bold" style="margin-bottom:8px">${n()}. Escolha a profissional</div>
        <div class="row wrap gap-8">
        ${proList.map(p=>`<button class="btn btn-ghost" data-pro="${p.id}"
          style="${booking.proId===p.id?'border-color:var(--brand-500);background:var(--brand-50)':''}">
          <span class="avatar sm" style="background:${p.color};width:22px;height:22px;font-size:10px">${fmt.initials(p.name)}</span>
          ${esc(p.name.split(" ")[0])}</button>`).join("")}</div></div>`));
      el.querySelectorAll("[data-pro]").forEach(b => b.onclick = () => { booking.proId = b.dataset.pro; booking.time = null; Views._caPaint(); });
    }

    if (!booking.proId) return el;

    // 3. Data — calendário do mês.
    // Cada dia já sabe se tem vaga para ESTE serviço, então a cliente não
    // precisa tentar dia a dia até achar um que caiba.
    el.appendChild(h(`<div><div class="small bold" style="margin-bottom:8px">${n()}. Escolha o dia</div>
      <div id="cal-host"></div></div>`));
    el.querySelector("#cal-host").appendChild(calendar(svc));

    if (!booking.date) return el;

    // 4. Horário (slots livres calculados de verdade)
    const slots = freeSlots(booking.date, booking.proId, svc.duration);
    el.appendChild(h(`<div><div class="small bold" style="margin-bottom:8px">${n()}. Escolha o horário</div>
      ${slots.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px">
        ${slots.map(t=>`<button class="btn btn-ghost btn-sm" data-time="${t}"
          style="${booking.time===t?'border-color:var(--brand-500);background:var(--brand-50);color:var(--brand-700)':''}">${t}</button>`).join("")}</div>`
        : `<div class="card card-pad center small muted">Nenhum horário livre neste dia. Escolha outra data.</div>`}</div>`));
    el.querySelectorAll("[data-time]").forEach(b => b.onclick = () => { booking.time = b.dataset.time; Views._caPaint(); });

    if (!booking.time) return el;

    // 5. Confirmação
    const pro = Store.byId("professionals", booking.proId);
    const conf = h(`<div class="card card-pad" style="background:var(--brand-50);border-color:var(--brand-200)">
      <div class="small bold" style="color:var(--brand-700)">Resumo do agendamento</div>
      <div class="col" style="gap:6px;margin-top:10px">
        <div class="row between small"><span class="muted">Serviço</span><span class="bold">${esc(svc.name)}</span></div>
        <div class="row between small"><span class="muted">Profissional</span><span class="bold">${esc(pro.name)}</span></div>
        <div class="row between small"><span class="muted">Data</span><span class="bold">${fmt.date(booking.date)} às ${booking.time}</span></div>
        <div class="row between small"><span class="muted">Duração</span><span class="bold">${svc.duration} min</span></div>
        <div class="divider" style="margin:6px 0"></div>
        <div class="row between"><span class="bold">Total</span>
          <span style="font-family:var(--display);font-weight:800;font-size:19px;color:var(--brand-700)">${fmt.money(svc.price)}</span></div>
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:14px;height:46px" id="bk-go">${icon('check')} Confirmar agendamento</button></div>`);
    conf.querySelector("#bk-go").onclick = async () => {
      /* Confere de novo na hora de gravar. Entre escolher o horário e
         tocar em confirmar, a Marina pode ter encaixado alguém ali —
         validar só na escolha deixava as duas no mesmo horário. */
      const r = Schedule.check({ date: booking.date, time: booking.time, durationMin: svc.duration });
      if (!r.ok) {
        toast("Esse horário acabou de ser ocupado. Escolha outro, por favor.", "err");
        booking.time = null; rerender();   // volta para a escolha de horario
        return;
      }

      if (naNuvem()) {
        /* Esta verificação acima é só para avisar cedo. A que vale é a do
           servidor, que refaz a conta com a agenda de verdade antes de
           gravar — duas clientes tocando ao mesmo tempo não passam. */
        const ok = await comServidor(conf.querySelector("#bk-go"),
          () => PortalNuvem.agendar({ serviceId: svc.id, date: booking.date, time: booking.time }));
        if (!ok) { booking.time = null; rerender(); return; }
        const auto = (Store.db.company.booking || {}).autoConfirm;
        booking = { serviceId: null, proId: null, date: null, time: null };
        step = "home"; rerender();
        toast(auto ? "Horário confirmado." : "Pedido enviado. A Marina confirma em instantes.", "ok");
        return;
      }

      Store.upsert("appts", {
        clientId: logged.id, serviceId: svc.id, proId: pro.id,
        start: new Date(`${booking.date}T${booking.time}`).toISOString(),
        durationMin: svc.duration, price: svc.price,
        status: Store.db.settings.autoConfirm ? "CONFIRMED" : "SCHEDULED",
        notes: "Agendado pela cliente", source: "client", paid: false, paymentMethod: null,
      });
      booking = { serviceId:null, proId:null, date:null, time:null };
      step = "home"; rerender();
      toast(Store.db.settings.autoConfirm
        ? "Horário confirmado."
        : "Pedido enviado. A Marina confirma em instantes.", "ok");
    };
    el.appendChild(conf);
    return el;
  }

  /* Slots livres reais: respeita horário da empresa, duração e conflitos */
  /* ---------- Calendário de seleção de dia ----------
     Um dia só fica clicável se couber ao menos um horário do serviço
     escolhido. Assim a cliente enxerga a disponibilidade antes de tocar,
     em vez de descobrir "nenhum horário livre" a cada tentativa. */
  function calendar(svc) {
    const db = Store.db;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if (!calMonth) calMonth = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    const ano = calMonth.getFullYear(), mes = calMonth.getMonth();
    const primeiro = new Date(ano, mes, 1);
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const vazios = primeiro.getDay();                       // domingo = 0
    // Não deixa voltar para meses que já passaram
    const podeVoltar = new Date(ano, mes, 1) > new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    const el = h(`<div class="cal">
      <div class="cal-nav">
        <button class="btn btn-icon btn-sm btn-ghost" id="cal-prev" ${podeVoltar ? "" : "disabled"}
          aria-label="Mês anterior">${icon('chevL')}</button>
        <div class="cal-title cap-first">${primeiro.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div>
        <button class="btn btn-icon btn-sm btn-ghost" id="cal-next" aria-label="Próximo mês">${icon('chevR')}</button>
      </div>
      <div class="cal-dows">${["dom","seg","ter","qua","qui","sex","sáb"]
        .map(d => `<span>${d}</span>`).join("")}</div>
      <div class="cal-days" id="cal-days"></div>
      <div class="cal-legend">
        <span><i class="dot-livre"></i> com vaga</span>
        <span><i class="dot-cheio"></i> sem vaga</span>
      </div>
    </div>`);

    const grid = el.querySelector("#cal-days");
    for (let i = 0; i < vazios; i++) grid.appendChild(h(`<span></span>`));

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const d = new Date(ano, mes, dia);
      const ds = iso(d);
      const passado = d < hoje;
      const trabalha = Schedule.openDay(ds);
      // só calcula slots quando o dia é candidato de verdade
      const vagas = (!passado && trabalha) ? freeSlots(ds, booking.proId, svc.duration).length : 0;
      const livre = vagas > 0;
      const hojeMesmo = ds === iso(hoje);

      const cell = h(`<button class="cal-day${livre ? "" : " off"}${booking.date === ds ? " sel" : ""}${hojeMesmo ? " hoje" : ""}"
        ${livre ? "" : "disabled"} data-date="${ds}"
        aria-label="${d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}${livre ? `, ${vagas} horário(s) livre(s)` : ", sem vaga"}">
        <span>${dia}</span>${livre ? '<i class="dot-livre"></i>' : ""}</button>`);
      if (livre) cell.onclick = () => { booking.date = ds; booking.time = null; Views._caPaint(); };
      grid.appendChild(cell);
    }

    el.querySelector("#cal-prev").onclick = () => {
      if (!podeVoltar) return;
      calMonth = new Date(ano, mes - 1, 1); Views._caPaint();
    };
    el.querySelector("#cal-next").onclick = () => { calMonth = new Date(ano, mes + 1, 1); Views._caPaint(); };
    return el;
  }

  /* Delegado ao motor único (assets/js/schedule.js): expediente do dia,
     intervalo de almoço, bloqueios, antecedência mínima e limite de dias
     à frente. Esta função tinha a própria cópia das regras e ignorava
     tanto os dias de folga quanto o almoço. */
  function freeSlots(dateStr, proId, durationMin, ignoreId) {
    return Schedule.slots({ date: dateStr, durationMin, ignoreId, forClient: true });
  }

  /* ---------- Remarcar ---------- */
  function rescheduleDialog(a) {
    const svc = Store.byId("services", a.serviceId);
    Modal.open({
      title: "Remarcar horário",
      body: `<div class="col" style="gap:14px">
        <p class="small muted">Escolha uma nova data e horário para <b>${esc(svc.name)}</b>.</p>
        <div class="field"><label>Nova data</label><input class="input" type="date" id="rs-d" value="${Schedule.day(a.start)}" min="${Store.todayISO()}" /></div>
        <div class="field"><label>Horários disponíveis</label><div id="rs-slots"></div></div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-c>Cancelar</button><button class="btn btn-primary" data-ok>Confirmar remarcação</button>`,
      onMount(m) {
        let picked = null;
        const paint = () => {
          const d = m.querySelector("#rs-d").value;
          // ignoreId: o próprio horário dela não pode bloquear a remarcação
          const slots = freeSlots(d, a.proId, a.durationMin, a.id);
          const box = m.querySelector("#rs-slots");
          const motivo = !d ? "Escolha uma data."
            : !Schedule.openDay(d) ? "A Marina não atende nesse dia da semana."
            : "Nenhum horário livre nesta data.";
          box.innerHTML = slots.length
            ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px">
               ${slots.map(t=>`<button class="btn btn-ghost btn-sm" data-t="${t}">${t}</button>`).join("")}</div>`
            : `<div class="small muted">${motivo}</div>`;
          box.querySelectorAll("[data-t]").forEach(b => b.onclick = () => {
            picked = b.dataset.t;
            box.querySelectorAll("[data-t]").forEach(x=>{x.style.borderColor="";x.style.background="";});
            b.style.borderColor="var(--brand-500)"; b.style.background="var(--brand-50)";
          });
        };
        m.querySelector("#rs-d").onchange = () => { picked = null; paint(); };
        paint();
        m.querySelector("[data-c]").onclick = Modal.close;
        m.querySelector("[data-ok]").onclick = async () => {
          if (!picked) { toast("Escolha um horário.", "err"); return; }
          const dia = m.querySelector("#rs-d").value;

          if (naNuvem()) {
            const ok = await comServidor(m.querySelector("[data-ok]"),
              () => PortalNuvem.remarcar({ id: a.id, date: dia, time: picked }));
            if (ok) { Modal.close(); rerender(); toast("Horário remarcado.", "ok"); }
            return;
          }

          a.start = new Date(`${dia}T${picked}`).toISOString();
          a.status = "SCHEDULED";
          Store.upsert("appts", a); Modal.close(); rerender(); toast("Horário remarcado.", "ok");
        };
      }
    });
  }

  /* ---------- Histórico ---------- */
  function historyScreen() {
    const db = Store.db;
    const list = db.appts.filter(a => a.clientId === logged.id).sort((a,b)=>b.start.localeCompare(a.start));
    const el = h(`<div class="card-pad col" style="gap:10px"></div>`);
    const spent = db.orders.filter(o=>o.clientId===logged.id).reduce((s,o)=>s+o.total,0);
    const feitos = list.filter(a => a.status === "DONE");
    const desde = logged.createdAt ? new Date(logged.createdAt) : null;
    // A cor mais repetida diz mais sobre o gosto dela que qualquer média
    const contagem = {};
    feitos.forEach(a => { if (a.polishId) contagem[a.polishId] = (contagem[a.polishId] || 0) + 1; });
    const favId = Object.keys(contagem).sort((x, y) => contagem[y] - contagem[x])[0];
    const favorita = favId ? Store.polish(favId) : null;

    el.appendChild(h(`<div class="row" style="gap:10px;margin-bottom:4px">
      <div class="card card-pad grow center" style="padding:12px"><div class="tiny muted">Atendimentos</div>
        <div style="font-family:var(--display);font-weight:800;font-size:20px">${feitos.length}</div></div>
      <div class="card card-pad grow center" style="padding:12px"><div class="tiny muted">Total investido</div>
        <div style="font-family:var(--display);font-weight:800;font-size:20px">${fmt.money(spent)}</div></div></div>`));

    if (favorita || desde) {
      el.appendChild(h(`<div class="card card-pad" style="background:var(--surface-2)">
        <div class="row between wrap" style="gap:10px">
          ${favorita ? `<div class="row gap-8">
            <span class="unha" style="--c:${esc(favorita.hex)}" aria-hidden="true"></span>
            <div><div class="tiny muted">Cor favorita</div>
            <div class="small bold">${esc(favorita.name)}</div>
            <div class="tiny muted">usada ${contagem[favId]}×</div></div></div>` : ""}
          ${desde ? `<div class="right"><div class="tiny muted">Cliente desde</div>
            <div class="small bold cap-first">${desde.toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</div></div>` : ""}
        </div></div>`));
    }

    if (!list.length) el.appendChild(h(`<div class="empty"><div class="em-ic">${icon('clock')}</div>Nenhum atendimento ainda.</div>`));

    list.forEach(a => {
      const v = Store.apptView(a); const st = Store.APPT_STATUS[a.status];
      const pol = Store.polish(a.polishId);
      el.appendChild(h(`<div class="row" style="gap:12px;padding:12px;border:1px solid var(--line);border-radius:12px">
        <div class="work-thumb" style="width:44px;height:44px" title="${pol ? esc(pol.name) : "Sem cor registrada"}">
          ${a.photos && a.photos.length
            ? `<img src="${esc(a.photos[0])}" alt="Trabalho de ${fmt.date(a.start)}" />`
            : pol ? `<span class="swatch sm" style="background:${pol.hex}"></span>`
                  : `<span class="faint">${icon('camera')}</span>`}
        </div>
        <div class="grow" style="min-width:0"><div class="bold" style="font-size:13.5px">${esc(v.service.name)}</div>
          <div class="tiny muted truncate">${fmt.date(a.start)} às ${fmt.time(a.start)}${pol ? ` · ${esc(pol.name)}` : ""}</div></div>
        <div class="col" style="align-items:flex-end;gap:3px">
          <span class="badge ${st.cls}">${st.label}</span>
          <span class="tiny bold">${fmt.money(a.price)}</span></div></div>`));
    });
    return el;
  }

  /* ---------- Perfil da cliente ---------- */
  function profileScreen() {
    const el = h(`<div class="card-pad col" style="gap:14px">
      <div class="center" style="padding:6px 0">
        ${avatar(logged.name,'lg')}
        <div style="font-family:var(--display);font-weight:700;font-size:16px;margin-top:8px">${esc(logged.name)}</div>
        <div class="small muted">${fmt.phone(logged.phone)}</div></div>
      <div class="form-grid">
        <div class="field full"><label>Nome completo</label><input class="input" id="pp-n" value="${esc(logged.name)}" /></div>
        <div class="field"><label>Telefone</label><input class="input" id="pp-p" data-fone value="${esc(logged.phone)}"
          ${naNuvem() ? `readonly aria-describedby="pp-p-dica"` : ""} />
          ${naNuvem() ? `<span class="hint" id="pp-p-dica">É o seu login. Para trocar, fale com a ${esc(primeiroNome())}.</span>` : ""}</div>
        <div class="field"><label>Data de nascimento</label><input class="input" type="date" id="pp-b" value="${esc(logged.birthdate||"")}" /></div>
      </div>
      <button class="btn btn-primary btn-block" id="pp-save">Salvar meus dados</button>
      <div class="card card-pad" style="background:var(--surface-2)">
        <div class="row between"><span class="small bold">Crédito disponível</span>
          <span class="bold" style="color:var(--accent)">${fmt.money(logged.credit||0)}</span></div></div>
      <button class="btn btn-ghost btn-block" id="pp-pw">${icon('gear')} Trocar minha senha</button>
    </div>`);

    el.querySelector("#pp-pw").onclick = () => {
      Modal.open({
        title: "Trocar senha", size: "sm",
        body: `<div class="field"><label>Senha atual</label>
            <input class="input" type="password" id="cp-old" autocomplete="current-password" /></div>
          <div class="field" style="margin-top:12px"><label>Nova senha</label>
            <input class="input" type="password" id="cp-new" autocomplete="new-password" placeholder="${DICA_SENHA}" /></div>
          <div class="field" style="margin-top:12px"><label>Confirmar nova senha</label>
            <input class="input" type="password" id="cp-new2" autocomplete="new-password" /></div>`,
        footer: `<button class="btn btn-ghost" data-c>Cancelar</button>
                 <button class="btn btn-primary" data-ok>Salvar senha</button>`,
        onMount(m) {
          m.querySelector("[data-c]").onclick = Modal.close;
          m.querySelector("[data-ok]").onclick = async () => {
            const atual = m.querySelector("#cp-old").value;
            const nova = m.querySelector("#cp-new").value;
            const nova2 = m.querySelector("#cp-new2").value;
            const fraca = erroSenha(nova);
            if (fraca) { toast(fraca, "err"); return; }
            if (nova !== nova2) { toast("As senhas não conferem.", "err"); return; }
            if (naNuvem()) {
              // quem confere a senha atual é o servidor; no navegador não há hash dela
              const ok = await comServidor(m.querySelector("[data-ok]"), () => PortalNuvem.trocarSenha(atual, nova));
              if (ok) { Modal.close(); toast("Senha alterada.", "ok"); }
              return;
            }
            if (!(await Store.checkPassword(logged, atual))) { toast("Senha atual incorreta.", "err"); return; }
            await Store.setPassword(logged, nova);
            Modal.close(); toast("Senha alterada.", "ok");
          };
        }
      });
    };
    el.querySelector("#pp-save").onclick = async () => {
      if (naNuvem()) {
        // antes gravava só na cópia da tela e dizia "Dados atualizados"
        const ok = await comServidor(el.querySelector("#pp-save"), () => PortalNuvem.salvarPerfil({
          name: el.querySelector("#pp-n").value.trim(), birthdate: el.querySelector("#pp-b").value }), "Dados salvos.");
        if (ok) rerender();
        return;
      }
      logged.name = el.querySelector("#pp-n").value.trim() || logged.name;
      logged.phone = el.querySelector("#pp-p").value.trim();
      logged.birthdate = el.querySelector("#pp-b").value;
      Store.upsert("clients", logged); rerender(); toast("Dados atualizados.", "ok");
    };
    return el;
  }
})();
