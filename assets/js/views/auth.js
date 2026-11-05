/* ============================================================
   nailagenda — Login / autenticação
   ============================================================ */
window.Views = window.Views || {};

/* Não há senha neste arquivo.
   • Com servidor: quem valida é o Worker (PBKDF2; hash no banco, Supabase ou D1), e a sessão
     volta num cookie HttpOnly que o JavaScript da página não consegue ler.
   • Sem servidor: confere contra o hash PBKDF2 guardado em Store.db.
     Continua não sendo segurança real — o navegador é de quem está na
     frente dele — mas a senha deixou de estar legível no código-fonte. */
const EMAIL_LOCAL = "admin@example.com";

Views.auth = function (onLogin) {
  const el = h(`<div class="auth-wrap">
    <div class="auth-visual">
      <div class="row" style="gap:10px">
        <div class="logo" style="width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center">${icon('nail')}</div>
        <div style="font-family:var(--display);font-weight:800;font-size:20px">nailagenda</div>
      </div>
      <div>
        <h1 style="color:#fff;font-size:40px;line-height:1.12;max-width:15ch">Cada cliente, cada cor, cada retorno.</h1>
        <p style="opacity:.9;margin-top:16px;max-width:44ch;font-size:15px">
          A agenda lembra o que você fez na última vez e avisa quando ela precisa voltar. Você cuida das unhas; o resto fica anotado.</p>
        <!-- A cartela de esmaltes dela, no lugar de cartões de recurso -->
        <div class="auth-cartela" aria-hidden="true">${(Store.cores || []).slice(0, 10)
          .map(c => `<span class="unha" style="--c:${esc(c.hex)}"></span>`).join("")}</div>
      </div>
      <div style="opacity:.75;font-size:12.5px">Unhas com cuidado, no seu horário</div>
    </div>

    <div class="auth-form-side">
      <div class="auth-card">
        <div class="row" style="gap:10px;margin-bottom:26px">
          <div class="logo" style="width:36px;height:36px;border-radius:11px;background:var(--brand-500);display:flex;align-items:center;justify-content:center;color:#fff">${icon('nail')}</div>
          <div>
            <div style="font-family:var(--display);font-weight:800;font-size:19px;line-height:1.05">nail<span style="color:var(--brand-500)">agenda</span></div>
            <div class="brand-sub">nail designer</div>
          </div>
        </div>

        <!-- Sem nome aqui: a tela ainda não sabe quem está do outro lado,
             e o nome ficaria exposto a qualquer um que abrisse o link. -->
        <h2 style="font-size:26px">Bem-vinda de volta</h2>
        <p class="muted" style="margin-top:6px;margin-bottom:24px">Entre para ver sua agenda de hoje.</p>

        <form id="login-form" class="col" style="gap:16px">
          <div class="field">
            <label for="email">E-mail</label>
            <div class="input-group">
              <span class="ic-left">${icon('user')}</span>
              <input class="input" id="email" type="email" placeholder="voce@example.com"
                autocomplete="username" required />
            </div>
          </div>
          <div class="field">
            <label for="pw">Senha</label>
            <div class="input-group">
              <span class="ic-left">${icon('gear')}</span>
              <input class="input" id="pw" type="password" placeholder="Sua senha"
                autocomplete="current-password" required />
              <button type="button" class="btn btn-icon btn-sm btn-ghost" id="toggle-pw"
                aria-label="Mostrar senha" title="Mostrar senha"
                style="position:absolute;right:5px;top:50%;transform:translateY(-50%);border:none;background:transparent">${icon('eye')}</button>
            </div>
          </div>

          <div class="row between">
            <label class="row" style="gap:8px;cursor:pointer;font-size:13px">
              <span class="switch"><input type="checkbox" id="remember" checked /><span class="track"></span><span class="thumb"></span></span>
              Manter conectada
            </label>
            <a href="#" class="small" style="color:var(--brand-600);font-weight:600" id="forgot">Esqueceu a senha?</a>
          </div>

          <button class="btn btn-primary btn-block" type="submit" style="height:46px">Entrar no painel</button>
        </form>

        <div class="card card-pad" id="modo-aviso" style="margin-top:22px;background:var(--surface-2)">
          <div class="row" style="gap:10px;align-items:flex-start">
            <span style="color:var(--brand-500)">${icon('nail')}</span>
            <div class="small muted" id="modo-texto">Verificando o servidor…</div>
          </div>
        </div>
      </div>
    </div>
  </div>`);

  /* O rodapé diz em qual modo ela está. Antes afirmava "demonstração"
     mesmo com o servidor ligado. */
  const pintarModo = () => {
    const alvo = el.querySelector("#modo-texto");
    if (!alvo) return;
    alvo.innerHTML = (window.Nuvem && Nuvem.modo === "nuvem")
      ? "Conectado ao servidor: seus dados ficam salvos na nuvem e aparecem no celular e no computador."
      : "Modo local: os dados ficam salvos <b>só neste navegador</b>. Faça backup em Configurações.";
  };
  pintarModo();
  if (window.Nuvem) Nuvem.aoMudar(pintarModo);

  el.querySelector("#toggle-pw").onclick = (e) => {
    const btn = e.currentTarget, i = el.querySelector("#pw");
    const show = i.type === "password";
    i.type = show ? "text" : "password";
    btn.innerHTML = icon(show ? "eyeOff" : "eye");
    btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    btn.setAttribute("title", show ? "Ocultar senha" : "Mostrar senha");
  };
  /* Dizia "link enviado" sem enviar nada. Agora conta o que realmente
     dá para fazer em cada modo, em vez de fingir um e-mail. */
  el.querySelector("#forgot").onclick = (e) => {
    e.preventDefault();
    const naNuvem = window.Nuvem && Nuvem.modo === "nuvem";
    Modal.open({
      title: "Esqueceu a senha?", size: "sm",
      body: naNuvem
        ? `<p class="small" style="line-height:1.6">Não há envio de e-mail de recuperação: o sistema não
             guarda seu e-mail em nenhum serviço de disparo.</p>
           <p class="small muted" style="line-height:1.6;margin-top:10px">Quem cuida do sistema redefine em
             um minuto, pelo computador dele, com o comando <code>npm run senha</code>. Seus dados não são tocados.</p>`
        : `<p class="small" style="line-height:1.6">Este navegador está no modo local: os dados ficam só aqui,
             e não existe servidor para enviar e-mail.</p>
           <p class="small muted" style="line-height:1.6;margin-top:10px">Se você perdeu a senha, é possível
             recomeçar limpando os dados deste navegador — o que apaga tudo que não tiver backup.</p>`,
      footer: `<button class="btn btn-ghost" data-cancel>Entendi</button>`,
      onMount(m) { m.querySelector("[data-cancel]").onclick = Modal.close; }
    });
  };
  el.querySelector("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const botao = el.querySelector("#login-form button[type=submit]");
    const mail = el.querySelector("#email").value.trim().toLowerCase();
    const pw = el.querySelector("#pw").value;
    if (!mail || !pw) { toast("Preencha e-mail e senha para continuar.", "err"); return; }

    const recusar = (msg) => {
      // Mensagem única para os dois casos: não revela qual campo errou.
      toast(msg || "E-mail ou senha incorretos.", "err");
      const campo = el.querySelector("#pw");
      campo.focus(); campo.select();
    };

    botao.disabled = true;
    const rotulo = botao.textContent;
    botao.textContent = "Entrando…";
    try {
      if (window.Nuvem && Nuvem.modo === "nuvem") {
        await Nuvem.entrar(mail, pw);        // servidor decide
        onLogin();
        return;
      }
      // Sem servidor: PBKDF2 contra o hash local. Os 210 mil ciclos
      // levam um instante — daí o botão travado enquanto calcula.
      const ok = mail === EMAIL_LOCAL && await Store.conferirSenhaPainel(pw);
      if (!ok) { recusar(); return; }
      onLogin();
    } catch (erro) {
      recusar(erro && erro.status === 429
        ? "Muitas tentativas. Espere um minuto e tente de novo."
        : (erro && erro.message) || null);
    } finally {
      botao.disabled = false;
      botao.textContent = rotulo;
    }
  };
  return el;
};
