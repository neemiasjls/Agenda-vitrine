/* ============================================================
   SERENA — Store (domínio + persistência localStorage)
   ============================================================ */
(function () {
  // v2: modelo de salão (equipe, cabelo) trocado pelo de nail designer solo.
  // Subir a versão descarta a base antiga do navegador em vez de misturar schemas.
  const KEY = "nailagenda.db.v2";
  const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 9);
  /* Data de HOJE no fuso dela. toISOString() devolve o dia em UTC: às
     21h de São Paulo já é amanhã em Greenwich, e o sistema inteiro
     (agenda de hoje, destaque do dia, contagem no menu) pulava um dia. */
  const todayISO = () => { const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

  /* Expediente padrão: seg–sáb, com almoço das 12h às 13h. Domingo fechado. */
  const DEFAULT_HOURS = () => ({
    0: [],
    1: [["09:00","12:00"],["13:00","19:00"]],
    2: [["09:00","12:00"],["13:00","19:00"]],
    3: [["09:00","12:00"],["13:00","19:00"]],
    4: [["09:00","12:00"],["13:00","19:00"]],
    5: [["09:00","12:00"],["13:00","19:00"]],
    6: [["09:00","14:00"]],
  });

  /* Migração sem perda: bases gravadas antes do motor de disponibilidade
     tinham openHour/closeHour/workdays. Convertemos para o formato novo em
     vez de subir a versão da chave, que apagaria os dados já cadastrados. */
  function migrate(d) {
    const c = d.company || (d.company = {});
    if (!c.hours) {
      if (c.openHour != null && Array.isArray(c.workdays)) {
        const faixa = [[String(c.openHour).padStart(2,"0") + ":00",
                        String(c.closeHour).padStart(2,"0") + ":00"]];
        c.hours = {};
        for (let i = 0; i < 7; i++) c.hours[i] = c.workdays.includes(i) ? faixa.map(f => [...f]) : [];
      } else c.hours = DEFAULT_HOURS();
    }
    if (!c.booking) c.booking = { slotMinutes: c.slotMinutes || 30, noticeHours: 2, horizonDays: 60, cancelHours: 24 };
    delete c.openHour; delete c.closeHour; delete c.workdays; delete c.slotMinutes;
    if (!Array.isArray(d.blocks)) d.blocks = [];
    if (!Array.isArray(d.clientPackages)) d.clientPackages = [];
    /* A paleta era uma constante no código: ela não tinha como acrescentar
       o esmalte que comprou semana passada. Agora mora na base. */
    if (!Array.isArray(d.polishColors)) d.polishColors = POLISH_COLORS.map(c => ({ ...c }));
    /* Configurações que a tela salvava e nenhum código lia. */
    if (d.settings) delete d.settings.reminderHoursBefore;
    if (d.company) { delete d.company.plan; delete d.company.trialEndsAt; }
    if (!d.adminAuth) d.adminAuth = { salt: "2e9697b78f5aa8a08b2b4cbbfea193c0",
      hash: "CJjEjaX0VVMGsORzF7qYNG7NhRORyLTStrJKFus_EQM", iterations: 210000 };
    return d;
  }

  /* ---------- Constantes de domínio (extraídas do sistema original) ---------- */
  const PAYMENT_METHODS = [
    { id: "CASH", name: "Dinheiro", icon: "cash" },
    { id: "BANK_TRANSFER", name: "PIX / Transferência", icon: "pix" },
    { id: "CREDIT_CARD", name: "Cartão de Crédito", icon: "card" },
    { id: "DEBIT_CARD", name: "Cartão de Débito", icon: "card" },
    { id: "CHECK", name: "Cheque", icon: "check" },
    { id: "COURTESY", name: "Cortesia", icon: "gift" },
    { id: "CREDIT", name: "Crédito do Cliente", icon: "wallet" },
  ];

  const APPT_STATUS = {
    SCHEDULED: { id: "SCHEDULED", label: "Agendado", cls: "b-violet" },
    CONFIRMED: { id: "CONFIRMED", label: "Confirmado", cls: "b-green" },
    DONE: { id: "DONE", label: "Atendido", cls: "b-gray" },
    NO_SHOW: { id: "NO_SHOW", label: "Não compareceu", cls: "b-amber" },
    CANCELED: { id: "CANCELED", label: "Cancelado", cls: "b-red" },
  };

  const ROLES = {
    ADMIN: { id: "ADMIN", label: "Administrador(a)" },
    SECRETARY: { id: "SECRETARY", label: "Secretária" },
    EMPLOYEE: { id: "EMPLOYEE", label: "Profissional" },
  };

  const MSG_VARS = [
    { tag: "#{cliente}", label: "Primeiro nome da cliente", sample: "Marina" },
    { tag: "#{cliente_completo}", label: "Nome completo da cliente", sample: "Marina Alves Costa" },
    { tag: "#{servico}", label: "Serviço agendado", sample: "Alongamento em Gel" },
    { tag: "#{data_horario}", label: "Data e horário completos", sample: "seg, 15/09 às 14:00" },
    { tag: "#{data_formato1}", label: "Data (15/09/2026)", sample: "15/09/2026" },
    { tag: "#{data_formato2}", label: "Data por extenso", sample: "15 de setembro" },
    { tag: "#{hora_inicio}", label: "Hora de início", sample: "14:00" },
    { tag: "#{hora_fim}", label: "Hora de término", sample: "17:00" },
    { tag: "#{valorTotal}", label: "Valor do serviço", sample: "R$ 200,00" },
    { tag: "#{profissional}", label: "Seu nome (assinatura)", sample: "Marina Lopes" },
  ];

  /* Esmaltes usados no atendimento.
     A cor é o registro: quando não há foto, o swatch conta o que foi feito. */
  const POLISH_COLORS = [
    { id: "pol_1",  name: "Nude Rosado",      hex: "#E3BCB0" },
    { id: "pol_2",  name: "Vermelho Clássico",hex: "#C21E3A" },
    { id: "pol_3",  name: "Preto",            hex: "#1A1A1A" },
    { id: "pol_4",  name: "Francesinha",      hex: "#F4EFE9" },
    { id: "pol_5",  name: "Rosa Chiclete",    hex: "#EE5C93" },
    { id: "pol_6",  name: "Vinho",            hex: "#6E2A36" },
    { id: "pol_7",  name: "Nude Café",        hex: "#B98C6E" },
    { id: "pol_8",  name: "Azul Marinho",     hex: "#2B3A6B" },
    { id: "pol_9",  name: "Verde Militar",    hex: "#4A5D3A" },
    { id: "pol_10", name: "Glitter Prata",    hex: "#B9BEC6" },
    { id: "pol_11", name: "Lilás",            hex: "#A98BD0" },
    { id: "pol_12", name: "Off-white Leitoso",hex: "#EDE7DE" },
  ];

  // Tons fechados e parentes entre si: o avatar identifica sem competir
  // com a cor do esmalte, que é a única cor forte que deve saltar na tela.
  const AVATAR_COLORS = ["#8a4459","#6d5a7e","#4f6b66","#8a6446","#5b6478","#7a5250","#5f6e4e","#76506e"];
  const colorFor = (s) => AVATAR_COLORS[Math.abs(hash(s || "x")) % AVATAR_COLORS.length];
  function hash(s){let h=0;for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i);h|=0}return h}

  /* ---------- Seed ---------- */
  function seed() {
    const T = new Date();
    const shift = (days, h, m) => {
      const d = new Date(T); d.setDate(d.getDate() + days); d.setHours(h, m || 0, 0, 0);
      return d.toISOString();
    };
    const iso = (d) => d.toISOString().slice(0, 10);

    // Ela trabalha sozinha. A lista existe para o modelo de dados continuar
    // coerente (agendamento aponta para quem atendeu), mas não há equipe.
    const professionals = [
      { id: "pro_1", name: "Marina Lopes", role: "ADMIN", email: "admin@example.com",
        phone: "11987650001", color: "#B0184A", commission: 0, active: true,
        services: ["srv_1","srv_2","srv_3","srv_4","srv_5","srv_6","srv_7","srv_8","srv_9","srv_10"] },
    ];

    const categories = [
      { id: "cat_1", name: "Alongamento" },
      { id: "cat_2", name: "Manutenção" },
      { id: "cat_3", name: "Esmaltação" },
      { id: "cat_4", name: "Pés" },
      { id: "cat_5", name: "Nail Art" },
    ];

    // `returnDays` é o coração do negócio: a partir dele o sistema sabe
    // sozinho quando a cliente está passando do ponto de manutenção.
    // 0 = serviço que não gera ciclo de retorno.
    const services = [
      { id: "srv_1",  name: "Alongamento em Fibra de Vidro", cat: "cat_1", price: 180, cost: 32, duration: 180, returnDays: 21, active: true },
      { id: "srv_2",  name: "Alongamento em Gel",            cat: "cat_1", price: 200, cost: 38, duration: 180, returnDays: 21, active: true },
      { id: "srv_3",  name: "Manutenção",                    cat: "cat_2", price: 110, cost: 18, duration: 120, returnDays: 21, active: true },
      { id: "srv_4",  name: "Esmaltação em Gel",             cat: "cat_3", price:  70, cost: 10, duration:  60, returnDays: 15, active: true },
      { id: "srv_5",  name: "Banho de Gel (unha natural)",   cat: "cat_3", price:  90, cost: 14, duration:  90, returnDays: 18, active: true },
      { id: "srv_6",  name: "Blindagem",                     cat: "cat_3", price:  80, cost: 12, duration:  75, returnDays: 18, active: true },
      { id: "srv_7",  name: "Remoção",                       cat: "cat_2", price:  50, cost:  6, duration:  45, returnDays:  0, active: true },
      { id: "srv_8",  name: "Spa dos Pés",                   cat: "cat_4", price:  80, cost: 11, duration:  60, returnDays: 30, active: true },
      { id: "srv_9",  name: "Pedicure",                      cat: "cat_4", price:  55, cost:  7, duration:  50, returnDays: 30, active: true },
      { id: "srv_10", name: "Nail Art (por unha)",           cat: "cat_5", price:  10, cost:  2, duration:  15, returnDays:  0, active: true },
    ];

    const packages = [
      { id: "pkg_1", name: "Trimestral de Manutenção", services: ["srv_3"], sessions: 4, price: 400, validityDays: 90, active: true },
      { id: "pkg_2", name: "Combo Mãos + Pés",         services: ["srv_4","srv_9"], sessions: 2, price: 220, validityDays: 45, active: true },
    ];

    const products = [
      { id: "prd_1", name: "Gel Construtor 30g",      sku: "GEL-30",  stock: 6,  min: 3,  cost: 48, price: 0, supplier: "sup_1" },
      { id: "prd_2", name: "Fibra de Vidro (rolo)",   sku: "FIB-01",  stock: 2,  min: 3,  cost: 35, price: 0, supplier: "sup_1" },
      { id: "prd_3", name: "Top Coat Selante 15ml",   sku: "TOP-15",  stock: 9,  min: 4,  cost: 29, price: 0, supplier: "sup_2" },
      { id: "prd_4", name: "Acetona / Removedor 1L",  sku: "ACE-1L",  stock: 0,  min: 2,  cost: 22, price: 0, supplier: "sup_2" },
      { id: "prd_5", name: "Lixa 180/240 (pacote)",   sku: "LIX-180", stock: 24, min: 10, cost: 18, price: 0, supplier: "sup_2" },
    ];

    const suppliers = [
      { id: "sup_1", name: "NailPro Distribuidora", phone: "1130001111", cnpj: "11.222.333/0001-81" },
      { id: "sup_2", name: "Beauty Supply Brasil",  phone: "1140002222", cnpj: "11.222.333/0001-81" },
    ];

    const firstNames = ["Camila","Fernanda","Patrícia","Aline","Larissa","Bruna","Carolina","Vanessa",
      "Marina","Renata","Tatiane","Priscila","Amanda","Gabriela","Juliana","Débora",
      "Camila","Letícia","Beatriz","Natália","Sabrina","Jéssica","Mariana","Rafaela",
      "Elaine","Bianca","Simone","Thaís"];
    const lastNames = ["Alves Costa","Souza","Oliveira","Ferreira","Rodrigues","Martins","Barbosa","Ribeiro","Gomes","Carvalho","Mendes","Araújo"];
    const clients = [];
    for (let i = 0; i < firstNames.length; i++) {
      const name = firstNames[i] + " " + lastNames[i % lastNames.length];
      // aniversários distribuídos por todos os meses do ano
      const bd = new Date(1985 + (i % 15), i % 12, ((i * 7) % 27) + 1);
      clients.push({
        id: "cli_" + (i + 1),
        name,
        phone: "1199" + String(700000 + i * 137).slice(0, 6),
        email: name.split(" ")[0].toLowerCase() + i + "@example.com",
        birthdate: iso(bd),
        cpf: "",
        notes: i % 4 === 0 ? "Prefere atendimento pela manhã." : "",
        credit: i % 6 === 0 ? 50 : 0,
        tags: i % 5 === 0 ? ["VIP"] : [],
        createdAt: shift(-180 + i * 12, 10),   // cadastros ao longo de 6 meses
        anamnese: i % 3 === 0 ? { allergies: "Nenhuma", conditions: "—", updatedAt: shift(-30, 12) } : null,
      });
    }

    // Agendamentos. Sessões de unha são longas, então cabem poucas por dia:
    // um alongamento de 3h ocupa metade do expediente.
    //
    // A carteira é dividida de propósito para o ciclo de retorno ficar real:
    //   • 0-9   fiéis, já têm o próximo horário marcado
    //   • 10-19 em dia, mas sem próximo horário — vencem em breve
    //   • 20-27 sumidas, última visita entre 25 e 70 dias atrás
    const FIEIS = 10, ATIVAS = 20;
    const appts = [];
    const statuses = ["CONFIRMED","SCHEDULED","CONFIRMED","SCHEDULED"];
    let ai = 0;

    const mkAppt = (cli, svc, d, hour, min, opts = {}) => {
      const past = d < 0;
      const a = {
        id: "apt_" + (++ai),
        clientId: cli.id,
        proId: "pro_1",
        serviceId: svc.id,
        start: shift(d, hour, min),
        durationMin: svc.duration,
        price: svc.price,
        status: opts.status || (past ? "DONE" : statuses[ai % statuses.length]),
        notes: "",
        // O registro do trabalho: cor usada e fotos. Sem foto, o swatch conta.
        polishId: POLISH_COLORS[ai % POLISH_COLORS.length].id,
        photos: [],
        paid: past,
        paymentMethod: past ? PAYMENT_METHODS[ai % 5].id : null,
      };
      appts.push(a);
      return a;
    };

    // Histórico das clientes ativas (0-19) e horários futuros só das fiéis (0-9).
    for (let d = -120; d <= 6; d++) {
      const dow = new Date(Date.now() + d * 864e5).getDay();
      if (dow === 0) continue;                    // domingo ela não atende
      const n = d >= 0 ? 1 + ((d + 4) % 3) : 3;   // 1 a 3 por dia
      let cursor = 9;                             // preenche o dia em sequência
      for (let k = 0; k < n; k++) {
        const svc = services[(ai + k) % services.length];
        if (cursor + svc.duration / 60 > 19) break;
        const cli = d >= 0 ? clients[(ai + k) % FIEIS] : clients[(ai + k) % ATIVAS];
        const hour = Math.floor(cursor), min = (cursor % 1) * 60;
        cursor += svc.duration / 60 + 0.25;       // 15min de intervalo
        // uma falta ocasional, não uma a cada dia
        const status = d < 0 && ai % 23 === 0 ? "NO_SHOW" : undefined;
        mkAppt(cli, svc, d, hour, min, { status });
      }
    }

    // Clientes sumidas (20-27): última visita entre 26 e 75 dias atrás, sem
    // horário marcado. São elas que alimentam a tela de Retornos.
    const cicloServicos = services.filter(s => s.returnDays > 0);
    [26, 31, 38, 45, 52, 60, 68, 75].forEach((diasAtras, i) => {
      const cli = clients[ATIVAS + i];
      if (!cli) return;
      const svc = cicloServicos[i % cicloServicos.length];
      // duas visitas: mostra que era cliente recorrente antes de sumir
      mkAppt(cli, svc, -(diasAtras + svc.returnDays), 10 + (i % 6), 0);
      mkAppt(cli, svc, -diasAtras, 9 + (i % 7), (i % 2) * 30);
    });

    // Comandas / vendas fechadas (histórico financeiro)
    // ~1-2 vendas por dia nos últimos 120 dias (garante dados no mês corrente
    // mesmo quando hoje é dia 1, e alimenta os relatórios de 6 meses)
    const orders = [];
    let oid = 0;
    for (let d = 120; d >= 0; d--) {
      const dow = new Date(Date.now() - d * 864e5).getDay();
      if (dow === 0) continue;                       // domingo fechado
      const perDay = 3 + ((d + dow) % 3);            // 3 a 5 vendas/dia
      for (let k = 0; k < perDay; k++) {
        const svc = services[(d + k) % services.length];
        const cli = clients[(d * 3 + k) % clients.length];
        const pro = professionals[0];   // ela atende sozinha
        orders.push({
          id: "ord_" + (++oid),
          clientId: cli.id,
          proId: pro.id,
          items: [{ type: "service", refId: svc.id, name: svc.name, qty: 1, price: svc.price }],
          total: svc.price,
          paymentMethod: PAYMENT_METHODS[(d + k) % 5].id,
          discount: 0,
          date: shift(-d, 10 + ((d + k) % 8)),
          status: "CLOSED",
        });
      }
    }

    // Despesas recorrentes dos últimos 6 meses + variáveis do mês corrente
    const expenses = [];
    let eid = 0;
    const recurring = [
      { desc: "Aluguel do salão", category: "Fixas", amount: 2400, day: 5 },
      { desc: "Energia elétrica", category: "Fixas", amount: 430, day: 10 },
      { desc: "Internet e telefone", category: "Fixas", amount: 180, day: 12 },
      { desc: "Marketing / anúncios", category: "Marketing", amount: 300, day: 15 },
      { desc: "Compra de estoque — BellaHair", category: "Estoque", amount: 680, day: 20 },
    ];
    for (let mBack = 5; mBack >= 0; mBack--) {
      recurring.forEach((r) => {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - mBack);
        d.setDate(Math.min(r.day, 28)); d.setHours(9, 0, 0, 0);
        if (d > new Date()) return;                 // não lança despesa futura
        expenses.push({ id: "exp_" + (++eid), desc: r.desc, category: r.category,
          amount: r.amount, date: d.toISOString(), paid: mBack > 0, supplier: r.category === "Estoque" ? "sup_1" : "" });
      });
    }

    const charges = [ // Cobranças (a receber)
      { id: "chg_1", clientId: "cli_3", amount: 100, dueDate: shift(3,9).slice(0,10), status: "PENDING", desc: "Alongamento — restante" },
      { id: "chg_2", clientId: "cli_7", amount: 100, dueDate: shift(-2,9).slice(0,10), status: "OVERDUE", desc: "Trimestral de Manutenção — parcela 2" },
      { id: "chg_3", clientId: "cli_1", amount: 70, dueDate: shift(-15,9).slice(0,10), status: "PAID", desc: "Esmaltação em Gel" },
    ];

    // Modelos de mensagens pré-definidas.
    // Como ela é sozinha, as mensagens falam na primeira pessoa —
    // #{profissional} não faz sentido no texto dela.
    const messages = [
      { id: "msg_1", title: "Confirmação de agendamento", category: "Confirmação", active: true, favorite: true,
        body: "Oii #{cliente}! 💅 Passando pra confirmar seu horário de *#{servico}* no dia #{data_horario}. Posso confirmar? 😊" },
      { id: "msg_2", title: "Lembrete véspera", category: "Lembrete", active: true, favorite: true,
        body: "Oi #{cliente}! Lembrando do seu horário amanhã, #{data_formato2}, às #{hora_inicio}. Te espero! ✨" },
      { id: "msg_3", title: "Hora da manutenção", category: "Retorno", active: true, favorite: true,
        body: "Oi #{cliente}! Já faz um tempinho desde o seu último #{servico} — suas unhas devem estar pedindo manutenção 💅 Quer que eu separe um horário essa semana?" },
      { id: "msg_4", title: "Preparo antes do alongamento", category: "Orientação", active: true, favorite: false,
        body: "Oi #{cliente}! Seu horário é #{data_horario} e o procedimento leva cerca de 3 horas. Vem com as unhas sem esmalte e evita passar creme nas mãos no dia, tá? Assim o material adere melhor 💛" },
      { id: "msg_5", title: "Cuidados pós-atendimento", category: "Orientação", active: true, favorite: false,
        body: "#{cliente}, ficou lindo! 😍 Nas primeiras 24h evita água muito quente e usa luva pra lavar louça. Qualquer coisa que soltar antes de #{data_formato1}, me chama que eu ajeito 💛" },
      { id: "msg_6", title: "Feliz aniversário", category: "Relacionamento", active: true, favorite: false,
        body: "Feliz aniversário, #{cliente}! 🎉 Que seu ano seja lindo — e suas unhas também. Te espero pra comemorar com um mimo especial 💝" },
      { id: "msg_7", title: "Cliente sumida", category: "Retorno", active: true, favorite: false,
        body: "Oi #{cliente}, sumida! 🥰 Bateu saudade de cuidar das suas unhas. Que tal marcar seu #{servico}? Tenho horário essa semana." },
      { id: "msg_8", title: "Cobrança amigável", category: "Financeiro", active: true, favorite: false,
        body: "Oi #{cliente}, tudo bem? Passando pra lembrar do valor de #{valorTotal} do seu atendimento. Qualquer dúvida me chama 🙏" },
    ];

    return {
      company: { name: "Marina Lopes", segment: "Nail Designer", phone: "11912345678",
        handle: "@marina.exemplo", tagline: "Unhas com cuidado, no seu horário",
        /* Horário por dia da semana (0=dom). Dois períodos = intervalo de almoço. */
        hours: DEFAULT_HOURS(),
        booking: { slotMinutes: 30, noticeHours: 2, horizonDays: 60, cancelHours: 24 },
        currency: "BRL" },
      session: { userId: "pro_1" },
      professionals, categories, services, packages, products, suppliers,
      clients, appts, orders, expenses, charges, messages, blocks: [], clientPackages: [],
      settings: { theme: "light", autoConfirm: false, whatsappDesktop: false },
      /* Hash da senha inicial do painel. Na vitrine, é a senha de demonstração do README.
         Ela troca em Configurações › Meu perfil. */
      adminAuth: { salt: "2e9697b78f5aa8a08b2b4cbbfea193c0",
                   hash: "CJjEjaX0VVMGsORzF7qYNG7NhRORyLTStrJKFus_EQM", iterations: 210000 },
      _seededAt: new Date().toISOString(),
    };
  }

  /* ---------- Persistência ---------- */
  let db;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      db = raw ? JSON.parse(raw) : seed();
    } catch (e) { db = seed(); }
    migrate(db);
    save();
  }

  /* Gravação. Um catch vazio aqui era perigoso: se o navegador recusasse
     (cota cheia, modo privativo), a tela continuava mostrando o registro
     "salvo" que nunca chegou ao disco. Agora a falha aparece. */
  let avisouFalha = false;

  /* Modo portal: a cliente ve um recorte do ateliê montado pelo servidor
     (so os servicos, os horarios ocupados sem nome e os dados dela).
     Esse recorte NAO pode encostar no cache do painel: se a Marina usar
     o portal no proprio celular, o painel dela ficaria achando que so
     existe uma cliente. Entao, no portal, nada vai para o localStorage. */
  let soMemoria = false;
  function escopoPortal(dados) {
    soMemoria = true;
    db = migrate(dados);
  }

  function save() {
    if (soMemoria) { window.dispatchEvent(new CustomEvent("serena:change")); return true; }
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      avisouFalha = false;
    } catch (e) {
      const cheio = /quota|exceeded|full/i.test(e.name + " " + e.message);
      if (!avisouFalha) {
        avisouFalha = true;
        const msg = cheio
          ? "Sem espaço no navegador. Exporte um backup em Configurações e libere espaço — o que você acabou de fazer NÃO foi salvo."
          : "Não foi possível salvar neste navegador. O que você acabou de fazer não ficou gravado.";
        if (window.toast) toast(msg, "err"); else alert(msg);
      }
      window.dispatchEvent(new CustomEvent("serena:savefail", { detail: e }));
      return false;
    }
    window.dispatchEvent(new CustomEvent("serena:change"));
    return true;
  }
  function reset() { db = seed(); save(); }

  /* Adota o documento que veio do servidor. Grava direto, sem passar
     pelo save() normal: isto NAO e uma alteracao dela, e disparar o
     evento de mudanca faria a sincronizacao devolver ao servidor o
     que acabou de chegar de la. */
  function adotar(documento) {
    db = migrate(documento);
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  }

  /* Restauração de backup. Exportar sem poder importar de volta é um
     backup que não salva ninguém. Aqui o arquivo é conferido antes de
     encostar nos dados: se vier torto, a base atual fica como está. */
  const COLECOES = ["professionals","categories","services","packages","products",
    "suppliers","clients","appts","orders","expenses","charges","messages"];

  function validarBackup(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj))
      return "Este arquivo não é um backup do sistema.";
    if (!obj.company || typeof obj.company !== "object")
      return "Backup incompleto: faltam os dados do estabelecimento.";
    const faltando = COLECOES.filter((c) => !Array.isArray(obj[c]));
    if (faltando.length)
      return `Backup incompleto: faltam ${faltando.slice(0, 3).join(", ")}.`;
    const semId = COLECOES.find((c) => obj[c].some((x) => !x || !x.id));
    if (semId) return `Registros sem identificação em ${semId}.`;
    return null;
  }

  function resumoBackup(obj) {
    return { clientes: (obj.clients || []).length, atendimentos: (obj.appts || []).length,
      comandas: (obj.orders || []).length, servicos: (obj.services || []).length,
      gerado: obj._seededAt || null };
  }

  function importAll(obj) {
    const erro = validarBackup(obj);
    if (erro) return { ok: false, erro };
    const anterior = db;
    db = migrate(obj);
    if (!save()) { db = anterior; return { ok: false, erro: "Não foi possível gravar neste navegador." }; }
    return { ok: true, resumo: resumoBackup(db) };
  }

  /* ---------- Query helpers ---------- */
  const byId = (arr, id) => db[arr].find((x) => x.id === id);

  /* Campos aceitos por coleção. Sem isso, `{...antigo, ...novo}` gravava
     qualquer chave que chegasse — uma tela com bug (ou, num backend, a
     própria cliente) conseguiria escrever `credit`, `paid` ou `role`
     mandando um campo a mais. Nada fora desta lista entra. */
  const FIELDS = {
    professionals: ["name","role","email","phone","color","commission","active","services"],
    categories:    ["name"],
    services:      ["name","cat","price","cost","duration","returnDays","active"],
    packages:      ["name","services","sessions","price","validityDays","active"],
    products:      ["name","sku","stock","min","cost","price","supplier"],
    suppliers:     ["name","phone","cnpj"],
    clients:       ["name","phone","email","birthdate","cpf","notes","credit","tags",
                    "createdAt","anamnese","salt","passwordHash","portalLiberado"],
    appts:         ["clientId","proId","serviceId","start","durationMin","price","status",
                    "notes","polishId","photos","paid","paymentMethod","source"],
    orders:        ["clientId","proId","items","total","paymentMethod","discount","date","status",
                    "apptId","creditUsed"],
    /* Pacote vendido: quantas sessões restam e até quando valem. Sem isto,
       vender "4 manutenções" não deixava rastro nenhum. */
    clientPackages:["clientId","packageId","name","services","total","remaining","expiresAt","orderId","createdAt"],
    expenses:      ["desc","category","amount","date","paid","supplier"],
    charges:       ["clientId","amount","dueDate","status","desc","paidAt","paymentMethod"],
    messages:      ["title","category","active","favorite","body"],
    blocks:        ["date","start","end","reason"],
    polishColors:  ["name","hex"],
  };
  function pick(coll, obj) {
    const permitidos = FIELDS[coll];
    if (!permitidos) return { ...obj };            // coleção sem schema: passa direto
    const out = {};
    for (const k of permitidos) if (k in obj) out[k] = obj[k];
    return out;
  }

  function upsert(coll, obj) {
    const limpo = pick(coll, obj);
    if (!obj.id) {
      limpo.id = uid(coll.slice(0, 3));
      db[coll].push(limpo);
      obj.id = limpo.id;                            // devolve o id ao chamador
    } else {
      limpo.id = obj.id;
      const i = db[coll].findIndex((x) => x.id === obj.id);
      if (i >= 0) db[coll][i] = { ...db[coll][i], ...limpo };
      else db[coll].push(limpo);
    }
    save();
    return byId(coll, obj.id) || limpo;
  }

  /* Vínculos que impedem exclusão. Apagar uma cliente com histórico
     deixaria atendimentos apontando para um id que não existe mais —
     e o financeiro do mês passado mudaria sozinho. */
  const LINKS = {
    clients:       [["appts","clientId"], ["orders","clientId"], ["charges","clientId"], ["clientPackages","clientId"]],
    services:      [["appts","serviceId"]],
    professionals: [["appts","proId"], ["orders","proId"]],
    suppliers:     [["products","supplier"], ["expenses","supplier"]],
    categories:    [["services","cat"]],
  };
  function linkedTo(coll, id) {
    for (const [outra, campo] of LINKS[coll] || []) {
      const n = db[outra].filter((x) => x[campo] === id).length;
      if (n) return { coll: outra, count: n };
    }
    return null;
  }
  function remove(coll, id) {
    const preso = linkedTo(coll, id);
    if (preso) {
      const nome = { appts: "atendimento", orders: "comanda", charges: "cobrança", clientPackages: "pacote",
                     products: "produto", expenses: "despesa", services: "serviço" }[preso.coll] || "registro";
      const erro = `Não dá para excluir: há ${preso.count} ${nome}${preso.count > 1 ? "s" : ""} ligado${preso.count > 1 ? "s" : ""} a este cadastro. Desative em vez de excluir, para preservar o histórico.`;
      if (window.toast) toast(erro, "err"); else alert(erro);
      return false;
    }
    db[coll] = db[coll].filter((x) => x.id !== id);
    save();
    return true;
  }

  /* ---------- Senha do painel (só no modo local) ----------
     Antes a senha estava em texto puro dentro de auth.js: quem abrisse o
     código-fonte da página lia. Agora fica só o hash PBKDF2 — 210 mil
     iterações, o mesmo custo que o servidor usa. Continua não sendo
     segurança de verdade (o navegador é de quem está na frente dele);
     com o servidor ligado, quem valida é o servidor e nada disto
     é consultado. */
  const PBKDF2_ITER = 210000;

  function hexBytes(h) {
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  async function derivarPBKDF2(senha, saltHex, iter = PBKDF2_ITER) {
    const material = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: hexBytes(saltHex), iterations: iter },
      material, 256);
    return b64url(new Uint8Array(bits));
  }

  /* Comparação em tempo constante: um === vaza, pelo tempo de resposta,
     quantos caracteres do começo bateram. */
  function iguaisSeguro(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  async function conferirSenhaPainel(senha) {
    const cred = db.adminAuth;
    if (!cred || !cred.hash || !cred.salt) return false;
    return iguaisSeguro(await derivarPBKDF2(senha, cred.salt, cred.iterations || PBKDF2_ITER), cred.hash);
  }

  async function definirSenhaPainel(senha) {
    const salt = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    db.adminAuth = { salt, hash: await derivarPBKDF2(senha, salt), iterations: PBKDF2_ITER };
    return save();
  }

  /* ---------- Senhas (área da cliente) ----------
     SHA-256 + salt por cliente. Suficiente para a demo local; em produção o
     hash tem de ser feito no servidor com bcrypt/argon2 (ver README). */
  function newSalt() {
    return [...crypto.getRandomValues(new Uint8Array(16))]
      .map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function hashPw(pw, salt) {
    const data = new TextEncoder().encode(salt + "::" + pw);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function setPassword(client, pw) {
    client.salt = newSalt();
    client.passwordHash = await hashPw(pw, client.salt);
    upsert("clients", client);
    return client;
  }
  async function checkPassword(client, pw) {
    if (!client.passwordHash || !client.salt) return false;
    return (await hashPw(pw, client.salt)) === client.passwordHash;
  }
  const onlyDigits = (s) => (s || "").replace(/\D/g, "");
  function findClientByPhone(phone) {
    const p = onlyDigits(phone);
    if (!p) return null;
    return db.clients.find(c => onlyDigits(c.phone) === p) || null;
  }

  window.Store = {
    load, save, reset, adotar, escopoPortal, uid, todayISO,
    importAll, validarBackup, resumoBackup,
    setPassword, checkPassword, findClientByPhone, onlyDigits,
    conferirSenhaPainel, definirSenhaPainel,
    get db() { return db; },
    byId, upsert, remove, linkedTo, colorFor, hash,
    PAYMENT_METHODS, APPT_STATUS, ROLES, MSG_VARS, POLISH_COLORS,
    polish: (id) => (db.polishColors || POLISH_COLORS).find(p => p.id === id) || null,
    get cores() { return db.polishColors || POLISH_COLORS; },
    /* A última cor que a cliente usou, fora o atendimento em edição. */
    ultimaCorDa(clientId, ignorarId) {
      if (!clientId) return null;
      const agora = Date.now();
      const ant = db.appts.filter(a => a.clientId === clientId && a.polishId && a.id !== ignorarId
          && a.status !== "CANCELED" && new Date(a.start).getTime() < agora)
        .sort((x, y) => y.start.localeCompare(x.start))[0];
      return ant ? this.polish(ant.polishId) : null;
    },
    /* Família da cor, pelo matiz/saturação/luz do hex. Serve para agrupar
       a cartela como ela pensa: nudes, rosas, vermelhos... */
    familiaDaCor(hex) {
      const n = parseInt(String(hex).replace("#", "").padEnd(6, "0").slice(0, 6), 16);
      const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
      const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
      let hue = 0;
      if (d) { hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; hue *= 60; if (hue < 0) hue += 360; }
      if (sat < .14 || l > .9 || l < .13) return { i: 6, nome: "Branco, preto e prata", l };
      if (hue >= 12 && hue < 50) return sat < .62 || l > .72 ? { i: 0, nome: "Nudes", l } : { i: 3, nome: "Corais e laranjas", l };
      if (hue >= 290 || hue < 12) {
        if (hue >= 290 && hue < 335) return { i: 1, nome: "Rosas", l };
        return l > .62 ? { i: 1, nome: "Rosas", l } : { i: 2, nome: "Vermelhos e vinhos", l };
      }
      if (hue < 170) return { i: 4, nome: "Amarelos e verdes", l };
      return { i: 5, nome: "Azuis e lilases", l };
    },

    /* ---------- Ciclo de manutenção ----------
       O motor de receita recorrente: cada serviço tem `returnDays`, e a partir
       do último atendimento o sistema calcula sozinho quando a cliente vence. */
    lastVisit(clientId) {
      return db.appts
        .filter(a => a.clientId === clientId && a.status === "DONE")
        .sort((a, b) => b.start.localeCompare(a.start))[0] || null;
    },
    /* Retorna { appt, service, dueDate, daysOverdue } para cada cliente cujo
       ciclo já venceu e que ainda não tem horário futuro marcado. */
    dueForMaintenance(graceDays = 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const hasFuture = new Set(
        db.appts.filter(a => new Date(a.start) >= today && a.status !== "CANCELED")
                .map(a => a.clientId)
      );
      const out = [];
      for (const c of db.clients) {
        if (hasFuture.has(c.id)) continue;              // já vai voltar
        const last = this.lastVisit(c.id);
        if (!last) continue;
        const svc = byId("services", last.serviceId);
        if (!svc || !svc.returnDays) continue;          // serviço sem ciclo
        const due = new Date(last.start);
        due.setDate(due.getDate() + svc.returnDays);
        const daysOverdue = Math.floor((today - due) / 864e5);
        if (daysOverdue >= graceDays) {
          out.push({ client: c, appt: last, service: svc, dueDate: due, daysOverdue });
        }
      }
      return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
    },
    pmName: (id) => (PAYMENT_METHODS.find((p) => p.id === id) || {}).name || "—",
    currentUser: () => byId("professionals", db.session.userId),
    // enriquecimento
    /* Uma referência quebrada (backup antigo, importação) derrubava a tela
       inteira em `v.client.name`. Agora vira um rótulo, e o resto segue. */
    apptView(a) {
      return { ...a,
        client:  byId("clients", a.clientId)        || { id: a.clientId, name: "Cliente removida", phone: "" },
        pro:     byId("professionals", a.proId)     || (db.professionals[0] || { name: "", color: "#b31f52" }),
        service: byId("services", a.serviceId)      || { id: a.serviceId, name: "Serviço removido", duration: a.durationMin, price: a.price } };
    },

    /* Datas locais. `date` e `start` são gravados em UTC: fatiar a string
       põe a comanda das 21h30 no dia seguinte — e, no último dia do mês,
       no mês seguinte. */
    diaLocal(isoStr) {
      const d = new Date(isoStr);
      return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    },
    mesLocal(isoStr) { return this.diaLocal(isoStr).slice(0, 7); },

    /* Pacotes da cliente que ainda valem e cobrem este serviço. */
    pacotesAtivos(clientId, serviceId) {
      const hoje = todayISO();
      return (db.clientPackages || []).filter(p =>
        p.clientId === clientId && p.remaining > 0 && (!p.expiresAt || p.expiresAt >= hoje) &&
        (!serviceId || (p.services || []).includes(serviceId)));
    },

    /* Situação da cobrança. "Vencida" dependia de ela mudar à mão: passou do
       prazo e continuava "Pendente" para sempre, e o aviso de cobrança
       vencida nunca aparecia com dado real. Agora sai da data. */
    situacaoCobranca(ch) {
      if (ch.status === "PAID") return "PAID";
      return ch.dueDate && ch.dueDate < todayISO() ? "OVERDUE" : "PENDING";
    },

    /* Comanda já fechada para este atendimento? */
    comandaDo(apptId) { return db.orders.find(o => o.apptId === apptId) || null; },

    /* Desfaz os efeitos de uma comanda antes de apagá-la: o atendimento
       volta a ficar em aberto, o estoque volta, o crédito volta, a sessão
       de pacote volta. Apagar sem isto deixava tudo marcado como pago. */
    excluirComanda(orderId) {
      const o = byId("orders", orderId);
      if (!o) return false;
      if (o.apptId) {
        const a = byId("appts", o.apptId);
        if (a) { a.paid = false; a.paymentMethod = null; }
      }
      for (const it of o.items || []) {
        if (it.type === "product") { const pr = byId("products", it.refId); if (pr) pr.stock += it.qty; }
        if (it.pacoteCliente) { const cp = byId("clientPackages", it.pacoteCliente); if (cp) cp.remaining += it.qty; }
      }
      if (o.creditUsed) { const c = byId("clients", o.clientId); if (c) c.credit = (c.credit || 0) + o.creditUsed; }
      // pacote vendido nesta comanda deixa de existir junto
      db.clientPackages = (db.clientPackages || []).filter(cp => cp.orderId !== o.id);
      db.orders = db.orders.filter(x => x.id !== o.id);
      return save();
    },

    /* Começar do zero: tira clientes, agenda e financeiro de exemplo, e
       mantém o que é configuração dela (serviços, horários, mensagens).
       Antes, o único reset recolocava 28 clientes e 338 atendimentos
       inventados — o teste de verdade nascia contaminado. */
    comecarDoZero({ manterServicos = true } = {}) {
      const antes = JSON.parse(JSON.stringify(db));
      for (const c of ["clients","appts","orders","expenses","charges","blocks","clientPackages","products","suppliers"])
        db[c] = [];
      if (!manterServicos) { db.services = []; db.packages = []; db.categories = []; }
      db.professionals = db.professionals.slice(0, 1);
      db._comecouEm = new Date().toISOString();
      // os serviços de exemplo têm preço e duração inventados: pede conferência
      db._servicosPendentes = manterServicos;
      delete db._ultimoBackup;
      delete db._seededAt;
      if (!save()) { db = antes; return null; }
      return antes;                        // quem chamou guarda como backup
    },
    ehDemonstracao() { return Boolean(db._seededAt) && !db._comecouEm; },
  };
  load();
})();
