/* ============================================================
   nailagenda — Configurações (empresa, horários, preferências, dados)
   ============================================================ */
window.Views = window.Views || {};

(function () {
  let tab = "empresa";
  const DOW = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

  Views.config = function () {
    const wrap = h(`<div class="col" style="gap:0"></div>`);
    const tabs = [
      { id:"empresa", label:"Empresa" },
      { id:"horarios", label:"Horários de atendimento" },
      { id:"agenda", label:"Preferências da agenda" },
      { id:"perfil", label:"Meu perfil" },
      { id:"dados", label:"Dados do sistema" },
    ];
    const tabsEl = h(`<div class="tabs">${tabs.map(t=>`<button data-t="${t.id}" class="${tab===t.id?'active':''}">${t.label}</button>`).join("")}</div>`);
    tabsEl.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{tab=b.dataset.t;rerender();});
    wrap.appendChild(tabsEl);

    const map = { empresa, horarios, agendaPrefs, perfil, dados };
    wrap.appendChild((map[tab] || empresa)());
    return wrap;
  };

  function saveCard(onSave) {
    const el = h(`<div class="row" style="margin-top:20px"><button class="btn btn-primary">${icon('check')} Salvar alterações</button></div>`);
    el.querySelector("button").onclick = onSave;
    return el;
  }

  /* ---------- Empresa ---------- */
  function empresa() {
    const c = Store.db.company;
    const box = h(`<div style="max-width:720px">
      <div class="card card-pad">
        <h3 style="font-size:15px;margin-bottom:4px">Dados do estabelecimento</h3>
        <p class="small muted" style="margin-bottom:20px">Essas informações aparecem nos recibos e nas mensagens enviadas.</p>
        <div class="form-grid">
          <div class="field full"><label>Nome do estabelecimento</label><input class="input" id="cf-name" value="${esc(c.name)}" /></div>
          <div class="field"><label>Segmento</label><select class="select" id="cf-seg">
            ${["Salão de Beleza","Clínica de Estética","Barbearia","Studio de Unhas","Clínica Odontológica","Quadras Esportivas","Outro"]
              .map(s=>`<option ${c.segment===s?'selected':''}>${s}</option>`).join("")}</select></div>
          <div class="field"><label>WhatsApp de contato</label><input class="input" id="cf-phone" data-fone value="${esc(c.phone)}" /></div>
          <div class="field full"><label>Endereço</label><input class="input" id="cf-addr" value="${esc(c.address||"")}" placeholder="Rua, número, bairro, cidade" /></div>
        </div>
      </div></div>`);
    box.appendChild(saveCard(() => {
      c.name = box.querySelector("#cf-name").value.trim() || c.name;
      c.segment = box.querySelector("#cf-seg").value;
      c.phone = box.querySelector("#cf-phone").value.trim();
      c.address = box.querySelector("#cf-addr").value.trim();
      Store.save(); toast("Atualizado com sucesso.", "ok");
    }));
    return box;
  }

  /* ---------- Horários ----------
     Cada dia da semana tem até dois períodos. Dois períodos descrevem o
     intervalo do almoço: 09–12 e 13–19 significa que às 12h30 ninguém
     consegue marcar, nem ela nem a cliente. Antes só existia um par
     abre/fecha para a semana inteira, então o almoço era invisível para o
     sistema e o sábado tinha o mesmo expediente da terça. */
  function horarios() {
    const c = Store.db.company;
    const b = c.booking;
    const hhmm = (v) => /^\d{2}:\d{2}$/.test(v || "") ? v : "";

    const linhaDia = (i) => {
      const per = c.hours[i] || [];
      const p1 = per[0] || ["", ""], p2 = per[1] || ["", ""];
      const aberto = per.length > 0;
      return `<div class="hr-day${aberto ? "" : " off"}" data-day="${i}">
        <label class="hr-day-head">
          <span class="switch"><input type="checkbox" data-on="${i}" ${aberto ? "checked" : ""} /><span class="track"></span><span class="thumb"></span></span>
          <span class="bold" style="font-size:13px">${DOW[i]}</span>
        </label>
        <div class="hr-times">
          <div class="hr-pair">
            <input class="input input-sm" type="time" data-hr="${i}-0-0" value="${hhmm(p1[0])}" />
            <span class="tiny faint">às</span>
            <input class="input input-sm" type="time" data-hr="${i}-0-1" value="${hhmm(p1[1])}" />
          </div>
          <div class="hr-pair">
            <input class="input input-sm" type="time" data-hr="${i}-1-0" value="${hhmm(p2[0])}" />
            <span class="tiny faint">às</span>
            <input class="input input-sm" type="time" data-hr="${i}-1-1" value="${hhmm(p2[1])}" />
          </div>
        </div>
      </div>`;
    };

    const box = h(`<div style="max-width:760px">
      <div class="card card-pad">
        <h3 style="font-size:15px;margin-bottom:4px">Dias e horários de atendimento</h3>
        <p class="small muted" style="margin-bottom:18px">O segundo par de horários é o seu intervalo. Deixe em branco se você não para.</p>
        <div class="col" style="gap:8px">${DOW.map((_, i) => linhaDia(i)).join("")}</div>
      </div>

      <div class="card card-pad" style="margin-top:16px">
        <h3 style="font-size:15px;margin-bottom:4px">Regras do agendamento online</h3>
        <p class="small muted" style="margin-bottom:18px">Valem só para o que a cliente marca sozinha pelo portal. Você continua podendo encaixar qualquer horário.</p>
        <div class="form-grid">
          <div class="field"><label>Intervalo entre horários</label>
            <select class="select" id="bk-slot">${[15, 20, 30, 45, 60].map(v => `<option value="${v}" ${b.slotMinutes === v ? "selected" : ""}>${v} minutos</option>`).join("")}</select></div>
          <div class="field"><label>Antecedência mínima</label>
            <select class="select" id="bk-notice">${[0, 1, 2, 4, 12, 24, 48].map(v => `<option value="${v}" ${b.noticeHours === v ? "selected" : ""}>${v === 0 ? "Sem mínimo" : v + "h antes"}</option>`).join("")}</select></div>
          <div class="field"><label>Pode marcar até</label>
            <select class="select" id="bk-horizon">${[7, 15, 30, 60, 90, 180].map(v => `<option value="${v}" ${b.horizonDays === v ? "selected" : ""}>${v} dias à frente</option>`).join("")}</select></div>
          <div class="field"><label>Cancela ou remarca até</label>
            <select class="select" id="bk-cancel">${[0, 2, 6, 12, 24, 48].map(v => `<option value="${v}" ${b.cancelHours === v ? "selected" : ""}>${v === 0 ? "Até a hora" : v + "h antes"}</option>`).join("")}</select></div>
        </div>
      </div>
      <div id="hr-blocos"></div>
    </div>`);

    box.querySelectorAll("[data-on]").forEach(sw => sw.onchange = () => {
      const i = sw.dataset.on;
      box.querySelector(`.hr-day[data-day="${i}"]`).classList.toggle("off", !sw.checked);
      const abre = box.querySelector(`[data-hr="${i}-0-0"]`);
      if (sw.checked && !abre.value) { abre.value = "09:00"; box.querySelector(`[data-hr="${i}-0-1"]`).value = "19:00"; }
    });

    box.querySelector("#hr-blocos").appendChild(bloqueios());

    box.appendChild(saveCard(() => {
      const hours = {}, erros = [];
      for (let i = 0; i < 7; i++) {
        if (!box.querySelector(`[data-on="${i}"]`).checked) { hours[i] = []; continue; }
        const per = [];
        for (const j of [0, 1]) {
          const a = box.querySelector(`[data-hr="${i}-${j}-0"]`).value;
          const z = box.querySelector(`[data-hr="${i}-${j}-1"]`).value;
          if (!a && !z) continue;
          if (!a || !z) { erros.push(`${DOW[i]}: preencha os dois horários do ${j === 0 ? "1º" : "2º"} período.`); continue; }
          if (z <= a) { erros.push(`${DOW[i]}: o fim precisa ser depois do início.`); continue; }
          per.push([a, z]);
        }
        if (!per.length) { erros.push(`${DOW[i]}: informe um período ou desligue o dia.`); continue; }
        if (per[1] && per[1][0] < per[0][1]) erros.push(`${DOW[i]}: o segundo período começa antes de o primeiro acabar.`);
        hours[i] = per;
      }
      if (erros.length) { toast(erros[0], "err"); return; }

      c.hours = hours;
      c.booking = {
        slotMinutes: +box.querySelector("#bk-slot").value,
        noticeHours: +box.querySelector("#bk-notice").value,
        horizonDays: +box.querySelector("#bk-horizon").value,
        cancelHours: +box.querySelector("#bk-cancel").value,
      };
      c._horariosRevisados = true;
      if (Store.save()) { toast("Horários atualizados.", "ok"); rerender(); }
    }));
    return box;
  }

  /* ---------- Bloqueios e folgas ----------
     Férias, médico, curso. Sem isto, o único jeito de fechar uma tarde era
     desligar o dia da semana inteiro — e aí fechava todas as terças. */
  function bloqueios() {
    const hoje = Store.todayISO();
    const futuros = (Store.db.blocks || [])
      .filter(b => b.date >= hoje)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    const box = h(`<div class="card card-pad" style="margin-top:16px">
      <div class="row between" style="margin-bottom:4px">
        <h3 style="font-size:15px">Bloqueios e folgas</h3>
        <button class="btn btn-sm btn-ghost" id="bl-add">${icon("plus")} Bloquear</button>
      </div>
      <p class="small muted" style="margin-bottom:16px">Períodos em que você não atende. A cliente não vê esses horários.</p>
      <div class="col" style="gap:8px" id="bl-lista"></div>
    </div>`);

    const ul = box.querySelector("#bl-lista");
    if (!futuros.length) ul.appendChild(h(`<div class="small muted">Nenhum bloqueio marcado.</div>`));
    else futuros.forEach(b => {
      const row = h(`<div class="row between" style="padding:10px 12px;border:1px solid var(--line);border-radius:10px;gap:10px">
        <div style="min-width:0">
          <div class="bold" style="font-size:13px">${esc(b.reason || "Bloqueado")}</div>
          <div class="tiny muted">${fmt.date(b.date + "T12:00:00")} · ${b.start}–${b.end}</div>
        </div>
        <button class="btn btn-icon btn-sm btn-ghost" data-x aria-label="Remover bloqueio">${icon("trash")}</button>
      </div>`);
      row.querySelector("[data-x]").onclick = () => {
        Store.db.blocks = Store.db.blocks.filter(x => x.id !== b.id);
        if (Store.save()) { toast("Bloqueio removido.", "ok"); rerender(); }
      };
      ul.appendChild(row);
    });

    box.querySelector("#bl-add").onclick = () => Modal.open({
      title: "Bloquear um período", size: "sm",
      body: `<div class="col" style="gap:14px">
        <div class="field"><label>Dia</label><input class="input" type="date" id="bq-d" value="${hoje}" min="${hoje}" /></div>
        <div class="form-grid">
          <div class="field"><label>Das</label><input class="input" type="time" id="bq-a" value="12:00" /></div>
          <div class="field"><label>Até</label><input class="input" type="time" id="bq-b" value="18:00" /></div>
        </div>
        <div class="field"><label>Motivo</label><input class="input" id="bq-r" placeholder="Médico, curso, folga..." maxlength="60" /></div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-c>Cancelar</button><button class="btn btn-primary" data-ok>Bloquear</button>`,
      onMount(m) {
        m.querySelector("[data-c]").onclick = Modal.close;
        m.querySelector("[data-ok]").onclick = () => {
          const date = m.querySelector("#bq-d").value;
          const start = m.querySelector("#bq-a").value, end = m.querySelector("#bq-b").value;
          if (!date || !start || !end) { toast("Preencha dia e horários.", "err"); return; }
          if (end <= start) { toast("O fim precisa ser depois do início.", "err"); return; }
          /* Bloquear por cima de uma cliente já marcada esconderia o problema:
             o horário sumiria da tela dela sem ninguém avisar a cliente. */
          const ocupado = Store.db.appts.find(a => {
            if (Schedule.day(a.start) !== date || a.status === "CANCELED" || a.status === "NO_SHOW") return false;
            const ini = Schedule.time(a.start);
            return ini < end && Schedule.toTime(Schedule.toMin(ini) + a.durationMin) > start;
          });
          if (ocupado) {
            const nome = (Store.byId("clients", ocupado.clientId) || {}).name || "Uma cliente";
            toast(`${nome} tem horário às ${Schedule.time(ocupado.start)} nesse período. Remarque antes de bloquear.`, "err");
            return;
          }
          Store.upsert("blocks", { date, start, end, reason: m.querySelector("#bq-r").value.trim() });
          Modal.close(); rerender(); toast("Período bloqueado.", "ok");
        };
      }
    });
    return box;
  }

  /* ---------- Preferências da agenda ---------- */
  function agendaPrefs() {
    const s = Store.db.settings;
    const box = h(`<div style="max-width:720px">
      <div class="card card-pad">
        <h3 style="font-size:15px;margin-bottom:4px">Comportamento da agenda</h3>
        <p class="small muted" style="margin-bottom:20px">Ajuste como os agendamentos e lembretes funcionam.</p>
        <div class="col" style="gap:14px">
          <label class="row between" style="cursor:pointer;padding:14px;border:1px solid var(--line);border-radius:12px">
            <div><div class="bold" style="font-size:13.5px">Confirmar agendamentos automaticamente</div>
              <div class="tiny muted">Novos agendamentos já entram como confirmados.</div></div>
            <span class="switch"><input type="checkbox" id="ag-auto" ${s.autoConfirm?'checked':''} /><span class="track"></span><span class="thumb"></span></span></label>
          <label class="row between" style="cursor:pointer;padding:14px;border:1px solid var(--line);border-radius:12px">
            <div><div class="bold" style="font-size:13.5px">Abrir WhatsApp no aplicativo desktop</div>
              <div class="tiny muted">Se desativado, abre o WhatsApp Web no navegador.</div></div>
            <span class="switch"><input type="checkbox" id="ag-wa" ${s.whatsappDesktop?'checked':''} /><span class="track"></span><span class="thumb"></span></span></label>
          <div class="field"><label>Tema da interface</label>
            <select class="select" id="ag-theme">
              <option value="light" ${s.theme==='light'?'selected':''}>Claro</option>
              <option value="dark" ${s.theme==='dark'?'selected':''}>Escuro</option></select></div>
        </div>
      </div></div>`);
    box.appendChild(saveCard(() => {
      s.autoConfirm = box.querySelector("#ag-auto").checked;
      s.whatsappDesktop = box.querySelector("#ag-wa").checked;
      s.theme = box.querySelector("#ag-theme").value;
      Store.save(); document.documentElement.setAttribute("data-theme", s.theme);
      toast("Preferências salvas.", "ok"); rerender();
    }));
    return box;
  }

  /* ---------- Meu perfil ---------- */
  function perfil() {
    const u = Store.currentUser();
    const box = h(`<div style="max-width:720px">
      <div class="card card-pad">
        <div class="row" style="gap:16px;margin-bottom:22px">
          <span class="avatar lg" style="background:${u.color}">${fmt.initials(u.name)}</span>
          <div><div style="font-family:var(--display);font-weight:700;font-size:18px">${esc(u.name)}</div>
            <div class="small muted">${Store.ROLES[u.role].label} · ${esc(u.email)}</div></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Nome</label><input class="input" id="pf-n" value="${esc(u.name)}" /></div>
          <div class="field"><label>E-mail</label><input class="input" type="email" id="pf-e" value="${esc(u.email)}" /></div>
          <div class="field"><label>Telefone</label><input class="input" id="pf-p" data-fone value="${esc(u.phone)}" /></div>
          <div class="field full"><label>Sua cor</label><div id="pf-c"></div>
            <span class="hint">Aparece no seu avatar e no portal das clientes.</span></div>
        </div>
        <div class="divider"></div>
        <h3 style="font-size:15px;margin-bottom:4px">Alterar a senha do painel</h3>
        <p class="small muted" style="margin-bottom:14px" id="pf-senha-nota"></p>
        <div class="form-grid">
          <div class="field"><label>Senha atual</label>
            <input class="input" type="password" id="pf-old" autocomplete="current-password" placeholder="••••••••" /></div>
          <div class="field"><label>Nova senha</label>
            <input class="input" type="password" id="pf-new" autocomplete="new-password" placeholder="mínimo 8 caracteres" /></div>
          <div class="field"><label>Repita a nova senha</label>
            <input class="input" type="password" id="pf-new2" autocomplete="new-password" placeholder="••••••••" /></div>
        </div>
      </div></div>`);

    let corPerfil = u.color;
    Views.paletaDePerfil(box.querySelector("#pf-c"), corPerfil, c => {
      corPerfil = c; box.querySelector(".avatar.lg").style.background = c;
    });

    /* Antes esta seção só checava se o campo "senha atual" estava
       preenchido e seguia em frente sem trocar nada. */
    const naNuvem = window.Nuvem && Nuvem.modo === "nuvem";
    box.querySelector("#pf-senha-nota").innerHTML = naNuvem
      ? "Conferida pelo servidor. Ao trocar, os outros aparelhos saem e pedem a senha nova."
      : "Guardada como hash PBKDF2 neste navegador. Se esquecer, não há como recuperar — só recomeçar.";

    box.appendChild(saveCard(async () => {
      u.name  = box.querySelector("#pf-n").value.trim() || u.name;
      u.email = box.querySelector("#pf-e").value.trim();
      u.phone = box.querySelector("#pf-p").value.trim();
      u.color = corPerfil;

      const atual = box.querySelector("#pf-old").value;
      const nova  = box.querySelector("#pf-new").value;
      const nova2 = box.querySelector("#pf-new2").value;

      if (atual || nova || nova2) {
        if (!atual)            { toast("Informe a senha atual.", "err"); return; }
        if (nova.length < 8)   { toast("A nova senha precisa ter pelo menos 8 caracteres.", "err"); return; }
        if (nova !== nova2)    { toast("As duas senhas novas não batem.", "err"); return; }
        if (/^\d+$/.test(nova)) { toast("Não use só números — misture letras.", "err"); return; }
        if (naNuvem) {
          try {
            const r = await Nuvem.pedir("/api/auth/senha", { method: "POST", body: { atual, nova } });
            Store.upsert("professionals", u);
            toast(r.message || "Senha alterada.", "ok"); rerender();
          } catch (e) { toast(e.message || "Não foi possível trocar a senha.", "err"); }
          return;
        }
        if (!await Store.conferirSenhaPainel(atual)) { toast("Senha atual incorreta.", "err"); return; }
        if (!await Store.definirSenhaPainel(nova))   { toast("Não foi possível salvar a nova senha.", "err"); return; }
        Store.upsert("professionals", u);
        toast("Senha alterada. Use a nova no próximo acesso.", "ok");
        rerender();
        return;
      }

      Store.upsert("professionals", u);
      toast("Perfil atualizado.", "ok");
      rerender();
    }));
    return box;
  }

  /* ---------- Dados ---------- */
  function dados() {
    const db = Store.db;
    const counts = [
      { l:"Clientes", n:db.clients.length }, { l:"Agendamentos", n:db.appts.length },
      { l:"Serviços", n:db.services.length }, { l:"Comandas", n:db.orders.length },
      { l:"Produtos", n:db.products.length }, { l:"Modelos de mensagem", n:db.messages.length },
    ];
    const box = h(`<div class="col" style="gap:20px;max-width:720px">
      <div class="card card-pad">
        <h3 style="font-size:15px;margin-bottom:4px">Resumo dos seus dados</h3>
        <p class="small muted" style="margin-bottom:18px">Tudo é salvo localmente no seu navegador nesta versão de demonstração.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
          ${counts.map(c=>`<div style="padding:14px;border:1px solid var(--line);border-radius:12px">
            <div class="tiny faint bold">${c.l.toUpperCase()}</div>
            <div style="font-family:var(--display);font-weight:800;font-size:22px">${c.n}</div></div>`).join("")}
        </div>
        <div class="divider"></div>
        <div class="row gap-8 wrap">
          <button class="btn btn-primary" id="dd-baixar">${icon('download')} Baixar backup (.json)</button>
          <button class="btn btn-ghost" id="dd-export">${icon('copy')} Copiar dados</button>
          <button class="btn btn-ghost" id="dd-import">${icon('refresh')} Restaurar de um backup</button>
          ${Store.ehDemonstracao() ? `<button class="btn btn-danger" id="dd-zero">${icon('trash')} Começar do zero</button>` : ""}
          <button class="btn btn-ghost" id="dd-reset">${icon('refresh')} Carregar dados de exemplo</button>
        </div>
      </div></div>`);
    /* Copiar em vez de baixar: link de download é bloqueado em alguns
       ambientes (visualizadores embarcados) e falharia em silêncio. */
    /* Download de verdade. O backup vira um arquivo com data no nome, que
       ela guarda no celular ou no Drive. Se o ambiente bloquear download
       (visualizador embarcado), cai no copiar, que sempre funciona. */
    box.querySelector("#dd-baixar").onclick = () => {
      const json = JSON.stringify(db, null, 2);
      const nome = `backup-nailagenda-${Store.todayISO()}.json`;
      try {
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url; a.download = nome;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Store.db._ultimoBackup = new Date().toISOString(); Store.save();
        toast(`Backup salvo como ${nome}.`, "ok");
      } catch {
        toast("Este ambiente bloqueia download. Use Copiar dados.", "err");
      }
    };

    box.querySelector("#dd-import").onclick = () => Modal.open({
      title: "Restaurar de um backup",
      body: `<div class="col" style="gap:14px">
        <div class="row gap-8" style="padding:12px;border-radius:12px;background:var(--warn-soft);color:var(--warn)">
          ${icon('alert')}<div class="small">Isto <b>substitui tudo</b> que está no sistema agora.
          Baixe um backup do estado atual antes, se tiver dúvida.</div></div>
        <div class="field"><label>Escolher arquivo</label>
          <input class="input" type="file" id="im-file" accept=".json,application/json" /></div>
        <div class="field"><label>…ou colar o conteúdo</label>
          <textarea class="textarea mono" id="im-txt" placeholder='{"company": …}'
            style="min-height:130px;font-size:11.5px"></textarea></div>
        <div id="im-resumo"></div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-c>Cancelar</button>
               <button class="btn btn-primary" data-ok disabled>Restaurar</button>`,
      onMount(m) {
        let candidato = null;
        const ok = m.querySelector("[data-ok]");
        const resumo = m.querySelector("#im-resumo");

        const conferir = (texto) => {
          candidato = null; ok.disabled = true;
          if (!texto.trim()) { resumo.innerHTML = ""; return; }
          let obj;
          try { obj = JSON.parse(texto); }
          catch { resumo.innerHTML = `<div class="small" style="color:var(--danger)">Arquivo ilegível: não é um JSON válido.</div>`; return; }
          const erro = Store.validarBackup(obj);
          if (erro) { resumo.innerHTML = `<div class="small" style="color:var(--danger)">${esc(erro)}</div>`; return; }
          const r = Store.resumoBackup(obj);
          candidato = obj; ok.disabled = false;
          resumo.innerHTML = `<div class="small" style="padding:12px;border-radius:12px;background:var(--surface-2)">
            <b>Backup válido.</b><br>${r.clientes} clientes · ${r.atendimentos} atendimentos ·
            ${r.comandas} comandas · ${r.servicos} serviços</div>`;
        };

        m.querySelector("#im-txt").addEventListener("input", (e) => conferir(e.target.value));
        m.querySelector("#im-file").addEventListener("change", (e) => {
          const f = e.target.files[0];
          if (!f) return;
          const fr = new FileReader();
          fr.onload = () => { m.querySelector("#im-txt").value = String(fr.result); conferir(String(fr.result)); };
          fr.onerror = () => toast("Não foi possível ler o arquivo.", "err");
          fr.readAsText(f);
        });

        m.querySelector("[data-c]").onclick = Modal.close;
        ok.onclick = () => {
          if (!candidato) return;
          const r = Store.importAll(candidato);
          if (!r.ok) { toast(r.erro, "err"); return; }
          Modal.close();
          toast(`Backup restaurado: ${r.resumo.clientes} clientes, ${r.resumo.atendimentos} atendimentos.`, "ok");
          rerender();
        };
      }
    });

    box.querySelector("#dd-export").onclick = () => {
      const json = JSON.stringify(db, null, 2);
      const kb = (new Blob([json]).size / 1024).toFixed(0);
      Modal.open({
        title: "Exportar dados",
        body: `<p class="small muted" style="margin-bottom:12px">
            Cópia completa da sua base (${kb} KB): clientes, agendamentos,
            atendimentos e configurações. Guarde em um lugar seguro.</p>
          <textarea class="textarea mono" id="ex-json" readonly
            style="min-height:200px;font-size:11.5px;white-space:pre">${esc(json)}</textarea>`,
        footer: `<button class="btn btn-ghost" data-c>Fechar</button>
                 <button class="btn btn-primary" data-copy>${icon('copy')} Copiar tudo</button>`,
        onMount(m) {
          m.querySelector("[data-c]").onclick = Modal.close;
          m.querySelector("[data-copy]").onclick = async () => {
            const ta = m.querySelector("#ex-json");
            try {
              await navigator.clipboard.writeText(json);
              toast("Dados copiados.", "ok");
            } catch {
              // Sem permissão de área de transferência: seleciona para copiar à mão.
              ta.focus(); ta.select();
              toast("Selecionado — use Ctrl+C para copiar.");
            }
          };
        }
      });
    };
    box.querySelector("#dd-reset").onclick = () => Modal.confirm({
      title:"Carregar dados de exemplo", danger:true, confirmText:"Substituir pelos exemplos",
      message:"Tudo o que está no sistema agora é trocado por clientes e atendimentos inventados. Só faz sentido para demonstrar. Baixe um backup antes se tiver dado de verdade aqui.",
      onConfirm(){ Store.reset(); rerender(); toast("Dados de exemplo carregados.", "ok"); }
    });

    /* Começar do zero. Antes o único reset recolocava 28 clientes e 338
       atendimentos inventados: o teste de verdade nascia misturado com a
       Marina Alves Costa, e o financeiro mostrava R$ 9 mil que não existem.
       Os serviços, horários e mensagens ficam — são a configuração dela. */
    const zero = box.querySelector("#dd-zero");
    if (zero) zero.onclick = () => Modal.open({
      title: "Começar do zero", size: "sm",
      body: `<div class="col" style="gap:12px">
        <p class="small" style="line-height:1.6">Sai: <b>clientes, agendamentos, comandas, despesas, cobranças e materiais</b> de exemplo.</p>
        <p class="small" style="line-height:1.6">Fica: <b>serviços, horários, mensagens e cores</b>. Confira os preços e durações dos serviços depois — são de exemplo.</p>
        <label class="row gap-8 small" style="cursor:pointer">
          <span class="switch"><input type="checkbox" id="z-svc" /><span class="track"></span><span class="thumb"></span></span>
          Apagar os serviços de exemplo também</label>
        <div class="field"><label>Para confirmar, digite <b>COMEÇAR</b></label><input class="input" id="z-conf" autocomplete="off" /></div>
        <p class="tiny muted">Um backup do estado atual é baixado antes, por garantia.</p></div>`,
      footer: `<button class="btn btn-ghost" data-c>Cancelar</button><button class="btn btn-danger" data-ok disabled>Começar do zero</button>`,
      onMount(m) {
        const ok = m.querySelector("[data-ok]");
        m.querySelector("#z-conf").addEventListener("input", e => ok.disabled = e.target.value.trim().toUpperCase() !== "COMEÇAR");
        m.querySelector("[data-c]").onclick = Modal.close;
        ok.onclick = () => {
          // backup antes, sempre
          try {
            const url = URL.createObjectURL(new Blob([JSON.stringify(Store.db, null, 2)], { type: "application/json" }));
            const a = document.createElement("a"); a.href = url; a.download = `backup-antes-de-zerar-${Store.todayISO()}.json`;
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch {}
          const antes = Store.comecarDoZero({ manterServicos: !m.querySelector("#z-svc").checked });
          if (!antes) { toast("Não foi possível gravar. Nada foi apagado.", "err"); return; }
          Modal.close(); go("dashboard"); rerender();
          toast("Pronto. Sistema limpo para os seus dados.", "ok");
        };
      }
    });
    return box;
  }
})();
