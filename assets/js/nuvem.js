/* ============================================================
   nailagenda — Sincronização com o servidor
   ------------------------------------------------------------
   O app continua lendo e gravando em memória, do jeito que sempre
   fez: nenhuma tela precisou virar assíncrona. Esta camada:

     • grava no localStorage na hora   (instantâneo, funciona sem sinal)
     • empurra para o servidor depois  (agrupado, 1,5s após a última mexida)
     • puxa do servidor ao abrir       (celular e computador batem)
     • para tudo se houver conflito    (alguém salvou antes; não sobrescreve)

   Sem servidor configurado, tudo isto fica quieto e o app funciona
   exatamente como antes, só neste navegador.
   ============================================================ */
(function () {
  const ATRASO = 1500;

  let modo = "local";        // local | nuvem
  let versao = 0;
  let papel = "visitante";
  let timer = null;
  let enviando = false;
  let sujo = false;
  let ultimoErro = null;

  const ouvintes = new Set();
  const avisar = () => ouvintes.forEach((f) => { try { f(estado()); } catch {} });

  const estado = () => ({ modo, papel, versao, enviando, sujo, erro: ultimoErro });

  async function pedir(caminho, opcoes = {}) {
    const r = await fetch(caminho, {
      method: opcoes.method || "GET",
      headers: opcoes.body ? { "Content-Type": "application/json" } : undefined,
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
      credentials: "same-origin",
    });
    /* Exige JSON de verdade. Um servidor estatico que devolve index.html
       para qualquer caminho responderia 200 com HTML aqui, e o app se
       acharia conectado a um servidor que nao existe. */
    let dados = null;
    const tipo = r.headers.get("Content-Type") || "";
    if (tipo.includes("application/json")) { try { dados = await r.json(); } catch {} }
    else if (r.ok) { const e = new Error("Resposta nao e da API."); e.status = 0; throw e; }
    if (!r.ok) {
      const e = new Error((dados && dados.erro) || "Falha na comunicação.");
      e.status = r.status; e.dados = dados;
      throw e;
    }
    return dados;
  }

  /* ---------- Abertura ---------- */

  async function iniciar() {
    let sessao;
    try { sessao = await pedir("/api/session"); }
    catch (e) {
      // 503 = servidor sem banco configurado. Não é erro para a usuária:
      // é o modo local, que era o único que existia antes.
      modo = "local"; avisar(); return estado();
    }
    // Só assume a nuvem se a resposta tiver a cara da nossa API.
    if (!sessao || sessao.configurado !== true || typeof sessao.papel !== "string") {
      modo = "local"; avisar(); return estado();
    }
    modo = "nuvem";
    papel = sessao.papel;
    if (papel === "profissional") await puxar();
    avisar();
    return estado();
  }

  /* Traz o que está no servidor. Se o servidor ainda está vazio, envia o
     que existe neste navegador — é a primeira subida dos dados. */
  async function puxar() {
    const r = await pedir("/api/state");
    if (r.data) {
      Store.adotar(r.data);
      versao = r.version;
    } else {
      versao = 0;
      await enviar(true);
    }
    avisar();
  }

  /* ---------- Envio ---------- */

  function agendarEnvio() {
    if (modo !== "nuvem" || papel !== "profissional") return;
    sujo = true; avisar();
    clearTimeout(timer);
    timer = setTimeout(() => { enviar().catch(() => {}); }, ATRASO);
  }

  async function enviar(primeira = false) {
    if (modo !== "nuvem" || papel !== "profissional" || enviando) return;
    enviando = true; ultimoErro = null; avisar();
    try {
      const r = await pedir("/api/state", {
        method: "POST",
        body: { data: Store.db, version: versao },
      });
      versao = r.version;
      sujo = false;
    } catch (e) {
      if (e.status === 409 && e.dados && e.dados.conflito) {
        /* Alguém salvou antes — o celular dela, ou outra aba. Trazer o
           que está no servidor é mais seguro do que passar por cima:
           o que se perde aqui é o que ela acabou de digitar e pode
           refazer; o que se perderia lá pode ser de ontem. */
        Store.adotar(e.dados.data);
        versao = e.dados.version;
        sujo = false;
        if (window.toast) toast("Seus dados foram atualizados por outro aparelho. A tela foi recarregada.", "warn");
        if (window.rerender) rerender();
      } else if (e.status === 401 || e.status === 403) {
        papel = "visitante";
        ultimoErro = "Sua sessão expirou. Entre de novo.";
        if (window.toast) toast(ultimoErro, "err");
      } else {
        ultimoErro = e.message;
        // Fica sujo: a próxima gravação tenta de novo. O dado não se
        // perde — está no localStorage deste navegador.
        clearTimeout(timer);
        timer = setTimeout(() => { enviar().catch(() => {}); }, 15000);
      }
    } finally {
      enviando = false; avisar();
    }
  }

  /* Última tentativa ao fechar a aba, para não deixar nada só no
     navegador quando ela troca de aparelho em seguida. */
  function aoSair() {
    if (modo !== "nuvem" || papel !== "profissional" || !sujo) return;
    try {
      navigator.sendBeacon("/api/state", new Blob(
        [JSON.stringify({ data: Store.db, version: versao })],
        { type: "application/json" }));
    } catch {}
  }

  /* ---------- Login da Marina ---------- */

  async function entrar(email, senha) {
    await pedir("/api/auth/login", { method: "POST", body: { email, password: senha } });
    papel = "profissional";
    await puxar();
    return true;
  }

  async function sair() {
    try { await pedir("/api/auth/logout", { method: "POST" }); } catch {}
    papel = "visitante"; versao = 0; avisar();
  }

  window.Nuvem = {
    iniciar, puxar, enviar, agendarEnvio, entrar, sair, pedir, aoSair,
    get modo() { return modo; },
    get papel() { return papel; },
    get versao() { return versao; },
    estado,
    aoMudar(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
  };

  // Toda gravação local agenda uma subida.
  window.addEventListener("serena:change", agendarEnvio);
  window.addEventListener("pagehide", aoSair);
})();
