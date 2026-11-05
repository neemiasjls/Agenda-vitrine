/* ============================================================
   nailagenda — Portal da cliente no modo nuvem
   ------------------------------------------------------------
   O portal foi escrito lendo Store.db direto, de forma síncrona.
   Em vez de reescrever as telas, montamos aqui um Store.db recortado
   com o que o servidor deixou sair:

     • os procedimentos ativos
     • o expediente, os bloqueios e os horários ocupados — ANÔNIMOS
     • os dados e os agendamentos da cliente que entrou, e só dela

   Assim o calendário continua calculando as vagas na hora, sem uma
   requisição por dia, e o servidor confere de novo na hora de gravar.
   Quem manda é ele: o que for calculado aqui é só para a tela.
   ============================================================ */
(function () {
  let catalogo = null;
  let minhaConta = null;

  const naNuvem = () => window.Nuvem && Nuvem.modo === "nuvem";

  /* Remonta o Store.db com o recorte. Nada disto vai para o localStorage
     (ver Store.escopoPortal). */
  function montar() {
    if (!catalogo) return;
    const eu = minhaConta && minhaConta.perfil;

    /* Os horários ocupados viram agendamentos sem dono. O motor de
       disponibilidade só precisa de início e duração para saber que
       aquele espaço não está livre. */
    const ocupados = (catalogo.ocupado || []).map((o, i) => ({
      id: "ocupado_" + i, clientId: null, proId: "pro_1", serviceId: null,
      start: o.start, durationMin: o.durationMin, price: 0, status: "CONFIRMED",
    }));

    const meus = (minhaConta ? minhaConta.agendamentos : []).map((a) => ({
      id: a.id, clientId: eu.id, proId: "pro_1", serviceId: a.serviceId,
      start: a.start, durationMin: a.durationMin, price: a.price,
      status: a.status, polishId: a.polishId, notes: "", source: "client",
      paid: false, paymentMethod: null,
    }));

    /* Os horários dela também aparecem na lista anônima. Tirar a
       duplicata evita que o próprio horário dela apareça como um
       segundo compromisso na mesma hora. */
    const meusInicios = new Set(meus.map((a) => a.start + "|" + a.durationMin));
    const semDuplicata = ocupados.filter((o) => !meusInicios.has(o.start + "|" + o.durationMin));

    Store.escopoPortal({
      company: {
        ...(catalogo["ateliê"] || {}),
        segment: "Nail Designer",
        hours: catalogo.expediente || {},
        booking: catalogo.regras || {},
      },
      settings: { theme: (Store.db && Store.db.settings && Store.db.settings.theme) || "light",
                  autoConfirm: false, whatsappDesktop: false },
      professionals: [{ id: "pro_1", name: (catalogo["ateliê"] || {}).name || "Profissional",
                        role: "ADMIN", email: "", phone: "", color: "#b31f52", active: true, services: [] }],
      categories: [], services: catalogo.servicos || [], packages: [], products: [], suppliers: [],
      clients: eu ? [{ ...eu, email: "", cpf: "", notes: "", tags: [], anamnese: null,
                       createdAt: new Date().toISOString() }] : [],
      appts: [...semDuplicata, ...meus],
      orders: [], expenses: [], charges: [], messages: [],
      blocks: (catalogo.bloqueios || []).map((b, i) => ({ id: "blq_" + i, ...b, reason: "" })),
      session: { userId: "pro_1" },
    });
  }

  async function carregarCatalogo() {
    catalogo = await Nuvem.pedir("/api/catalogo");
    montar();
    return catalogo;
  }

  async function carregarMinhaConta() {
    minhaConta = await Nuvem.pedir("/api/cliente/dados");
    montar();
    return minhaConta;
  }

  /* Depois de qualquer ação que muda a agenda, os dois lados precisam
     voltar: a conta dela E a ocupação geral (o horário que ela acabou
     de pegar tem de sumir para as outras). */
  async function recarregar() {
    const [c, m] = await Promise.all([
      Nuvem.pedir("/api/catalogo"),
      Nuvem.pedir("/api/cliente/dados").catch(() => minhaConta),
    ]);
    catalogo = c; minhaConta = m;
    montar();
  }

  /* Se a sessão foi aceita mas a conta não abriu, isso precisa aparecer:
     antes o portal dizia "Bem-vinda" e continuava parado no login. */
  function exigirConta() {
    if (!minhaConta) throw new Error("Entramos, mas sua conta não abriu. Atualize a página e tente de novo.");
  }

  window.PortalNuvem = {
    naNuvem,
    get catalogo() { return catalogo; },
    get conta() { return minhaConta; },
    carregarCatalogo, carregarMinhaConta, recarregar,

    async entrar(telefone, senha) {
      const r = await Nuvem.pedir("/api/cliente/entrar", {
        method: "POST", body: { phone: telefone, password: senha } });
      await recarregar();
      exigirConta();
      return r;
    },
    async cadastrar(nome, telefone, senha, nascimento) {
      const r = await Nuvem.pedir("/api/cliente/cadastrar", {
        method: "POST", body: { name: nome, phone: telefone, password: senha, birthdate: nascimento || "" } });
      await recarregar();
      exigirConta();
      return r;
    },
    async salvarPerfil({ name, birthdate }) {
      minhaConta = await Nuvem.pedir("/api/cliente/perfil", { method: "POST", body: { name, birthdate: birthdate || "" } });
      montar();
    },
    async trocarSenha(atual, nova) {
      await Nuvem.pedir("/api/cliente/senha", { method: "POST", body: { atual, nova } });
    },
    async sair() {
      try { await Nuvem.pedir("/api/cliente/sair", { method: "POST" }); } catch {}
      minhaConta = null; montar();
    },
    async agendar({ serviceId, date, time }) {
      await Nuvem.pedir("/api/cliente/agendar", { method: "POST", body: { serviceId, date, time } });
      await recarregar();
    },
    async remarcar({ id, date, time }) {
      await Nuvem.pedir("/api/cliente/remarcar", { method: "POST", body: { id, date, time } });
      await recarregar();
    },
    async cancelar(id) {
      await Nuvem.pedir("/api/cliente/cancelar", { method: "POST", body: { id } });
      await recarregar();
    },
  };
})();
