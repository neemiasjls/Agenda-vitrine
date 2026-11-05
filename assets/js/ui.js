/* ============================================================
   SERENA — UI helpers (ícones, toast, modal, formatação)
   ============================================================ */
(function () {
  /* ---------- Ícones: traçados baseados no Feather Icons (MIT, Copyright (c) 2013-2023 Cole Bemis; ver THIRD_PARTY_NOTICES.md) ---------- */
  const P = {
    grid:'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    users:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    user:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    briefcase:'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
    box:'M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7L12 12l8.7-5M12 22V12',
    receipt:'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM8 7h8M8 11h8M8 15h5',
    message:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    wallet:'M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z',
    coins:'M8 8a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM19 5a6 6 0 0 1-3.5 5.4M16 3.5a6 6 0 0 1 0 11',
    chart:'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
    gauge:'M12 14l4-4M3.5 15a9 9 0 1 1 17 0M12 14a2 2 0 1 0 0-.01',
    star:'M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z',
    gear:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    eye:'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    eyeOff:'M17.9 17.9A10.7 10.7 0 0 1 12 20c-7 0-11-8-11-8a19.6 19.6 0 0 1 5.1-6M9.9 4.2A10 10 0 0 1 12 4c7 0 11 8 11 8a19.5 19.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22',
    plus:'M12 5v14M5 12h14',
    bell:'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
    menu:'M3 12h18M3 6h18M3 18h18',
    x:'M18 6L6 18M6 6l12 12',
    check:'M20 6L9 17l-5-5',
    chevL:'M15 18l-6-6 6-6', chevR:'M9 18l6-6-6-6',
    chevD:'M6 9l6 6 6-6', chevU:'M18 15l-6-6-6 6',
    edit:'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
    trash:'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    phone:'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
    whatsapp:'M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2zM8 8.5c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.7 1.7c.1.2.1.4 0 .6l-.5.6c-.1.2-.2.3 0 .6a6 6 0 0 0 2.7 2.4c.3.1.5.1.7-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.4 0 .5-.2 1.2-.5 1.4-.4.3-1 .6-1.7.6a7.5 7.5 0 0 1-6.5-6.4c0-.6.2-1.2.5-1.6z',
    clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
    dollar:'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    tag:'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-8-8V3h6.6l8 8a2 2 0 0 1-.6 2.4zM7.5 7.5h.01',
    cake:'M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s1-1 3-1 3 2 5 2 3-2 5-2 3 1 3 1M12 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 4v7',
    logout:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    moon:'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    sun:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    copy:'M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1',
    filter:'M22 3H2l8 9.5V19l4 2v-8.5z',
    heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.5 1-1a5.5 5.5 0 0 0 0-7.9z',
    scissors:'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
    arrowUp:'M12 19V5M5 12l7-7 7 7', arrowDown:'M12 5v14M19 12l-7 7-7-7',
    ghost:'M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-2 2 2 3-2 3 2 2-2 3 2V10a8 8 0 0 0-8-8z',
    layers:'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    trending:'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
    package:'M16.5 9.4L7.5 4.2M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7L12 12l8.7-5M12 22V12',
    gift:'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
    alert:'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
    sparkles:'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 3v4M21 5h-4M5 17v4M7 19H3',
    mapPin:'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    external:'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
    download:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    percent:'M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    refresh:'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
    court:'M3 5h18v14H3zM12 5v14M3 12h18M7 9v6M17 9v6',
    // Silhueta de unha amendoada: a marca do ofício dela.
    nail:'M12 2c3 0 5 2.2 5 5.2 0 3.4-1 8.3-1.5 11.1a3.6 3.6 0 0 1-3.5 3 3.6 3.6 0 0 1-3.5-3C8 15.5 7 10.6 7 7.2 7 4.2 9 2 12 2zM8.4 12.5h7.2',
    swatch:'M4 4h7v16H4zM13 4h7v16h-7M13 9h7M13 15h7',
    camera:'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  };
  window.icon = function (name, cls) {
    const d = P[name] || P.grid;
    return `<svg class="ic ${cls||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d.split('M').filter(Boolean).map(s=>`<path d="M${s}"/>`).join('')}</svg>`;
  };

  /* ---------- Formatação ---------- */
  const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  /* "1993-09-02" sozinho o navegador lê como meia-noite em UTC — que em
     São Paulo ainda é dia 1º, 21h. Aniversário e datas de bloqueio saíam
     um dia antes. Data sem hora é lida ao meio-dia local. */
  const D = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? new Date(d + "T12:00:00") : new Date(d);
  window.fmt = {
    money: (n) => MONEY.format(n || 0),
    money0: (n) => "R$ " + (Math.round(n||0)).toLocaleString("pt-BR"),
    date: (d) => D(d).toLocaleDateString("pt-BR"),
    dateLong: (d) => D(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    dow: (d) => D(d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
    time: (d) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    dateTime: (d) => { const x=new Date(d); return `${fmt.dow(x)}, ${x.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})} às ${fmt.time(x)}`; },
    phone: (p) => { p = (p||"").replace(/\D/g,""); if(p.length<10) return p; return p.length===11?`(${p.slice(0,2)}) ${p.slice(2,7)}-${p.slice(7)}`:`(${p.slice(0,2)}) ${p.slice(2,6)}-${p.slice(6)}`; },
    initials: (n) => (n||"?").split(" ").filter(Boolean).slice(0,2).map(s=>s[0]).join("").toUpperCase(),
    age: (bd) => { if(!bd) return "—"; const d=D(bd),n=new Date(); let a=n.getFullYear()-d.getFullYear(); if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))a--; return a+" anos"; },
  };

  /* No celular as tabelas viram cartões (CSS). Cada célula precisa do
     nome da coluna para aparecer como rótulo; em vez de repetir isso em
     cada tela, as tabelas são rotuladas aqui assim que entram na página.
     A coluna-título é a primeira, ou a que tiver data-titulo no <th>. */
  const rotular = (t) => {
    const ths = t.tHead ? [...t.tHead.rows[0].cells] : [];
    const nomes = ths.map(th => th.textContent.trim());
    let titulo = ths.findIndex(th => th.hasAttribute("data-titulo"));
    if (titulo < 0) titulo = 0;
    for (const tb of t.tBodies) for (const tr of tb.rows) [...tr.cells].forEach((td, i) => {
      if (td.colSpan > 1 || td.dataset.label !== undefined) return;
      td.dataset.label = nomes[i] || "";
      if (i === titulo) td.classList.add("tbl-titulo");
      else if (td.querySelector("button") && !td.textContent.trim()) td.classList.add("tbl-acoes");
    });
  };
  /* ---------- Campos de senha e de telefone, em todo o sistema ----------
     Em vez de repetir o código em cada formulário, os campos são
     melhorados aqui assim que aparecem na página:
     • todo campo de senha ganha o botão de mostrar/ocultar;
     • todo campo de telefone vira "(11) 91234-5678" enquanto ela digita. */
  const ehFone = (el) => el && el.tagName === "INPUT" &&
    (el.hasAttribute("data-fone") || el.type === "tel" || el.inputMode === "tel");

  function mascaraFone(bruto) {
    let d = String(bruto || "").replace(/\D/g, "");
    if (d.length > 11 && d.startsWith("55")) d = d.slice(2);      // +55 colado
    d = d.slice(0, 11);
    if (!d) return "";
    if (d.length <= 2) return "(" + d;
    const ddd = d.slice(0, 2), r = d.slice(2);
    if (r.length <= 4) return `(${ddd}) ${r}`;
    if (d.length <= 10) return `(${ddd}) ${r.slice(0, 4)}-${r.slice(4)}`;
    return `(${ddd}) ${r.slice(0, 5)}-${r.slice(5)}`;
  }
  window.mascaraFone = mascaraFone;
  const digitosAntes = (v, pos) => (v.slice(0, pos).match(/\d/g) || []).length;
  function aplicarFone(el, bruto, nDig) {
    const novo = mascaraFone(bruto);
    el.value = novo;
    if (document.activeElement !== el) return;
    let pos = 0, vistos = 0;
    if (nDig > 0) for (let i = 0; i < novo.length; i++) {
      if (/\d/.test(novo[i]) && ++vistos === nDig) { pos = i + 1; break; }
    }
    if (nDig > 0 && vistos < nDig) pos = novo.length;
    el.setSelectionRange(pos, pos);
  }
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (ehFone(el)) aplicarFone(el, el.value, digitosAntes(el.value, el.selectionStart ?? el.value.length));
  });
  /* Apagar logo depois de ")", " " ou "-" apagaria só o enfeite, que a
     máscara põe de volta: o cursor ficaria preso. Apaga o dígito antes. */
  document.addEventListener("beforeinput", (e) => {
    const el = e.target;
    if (!ehFone(el) || e.inputType !== "deleteContentBackward" || el.selectionStart !== el.selectionEnd) return;
    const pos = el.selectionStart;
    if (!pos || /\d/.test(el.value[pos - 1])) return;
    e.preventDefault();
    let i = pos - 1;
    while (i > 0 && !/\d/.test(el.value[i - 1])) i--;
    if (i === 0) return;
    const bruto = el.value.slice(0, i - 1) + el.value.slice(i);
    aplicarFone(el, bruto, digitosAntes(el.value, i - 1));
  });

  function prepararFone(el) {
    if (el.dataset.foneOk) return;
    el.dataset.foneOk = "1";
    el.setAttribute("inputmode", "tel");
    el.setAttribute("autocomplete", el.getAttribute("autocomplete") || "tel");
    el.maxLength = 16;
    if (el.value) el.value = mascaraFone(el.value);
  }

  function prepararSenha(input) {
    if (input.dataset.olho) return;
    input.dataset.olho = "1";
    const pai = input.parentElement;
    if (!pai || pai.querySelector("button")) return;          // já tem o próprio botão
    const caixa = document.createElement("span");
    caixa.className = "senha-caixa";
    input.replaceWith(caixa);
    caixa.appendChild(input);
    const b = document.createElement("button");
    b.type = "button"; b.className = "senha-olho";
    const pintar = (mostrando) => {
      b.innerHTML = icon(mostrando ? "eyeOff" : "eye");
      b.setAttribute("aria-label", mostrando ? "Ocultar senha" : "Mostrar senha");
      b.title = mostrando ? "Ocultar senha" : "Mostrar senha";
      b.setAttribute("aria-pressed", String(mostrando));
    };
    pintar(false);
    b.onclick = () => {
      const mostrar = input.type === "password";
      input.type = mostrar ? "text" : "password";
      pintar(mostrar);
      input.focus();
    };
    caixa.appendChild(b);
  }

  function prepararCampos(raiz) {
    if (!raiz.querySelectorAll) return;
    const lista = raiz.matches && raiz.matches("input") ? [raiz] : raiz.querySelectorAll("input");
    lista.forEach((el) => {
      if (el.type === "password") prepararSenha(el);
      else if (ehFone(el)) prepararFone(el);
    });
  }

  const pendentes = new Set();
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      const t = n.closest && n.closest("table.tbl");
      if (t) pendentes.add(t);
      if (n.querySelectorAll) n.querySelectorAll("table.tbl").forEach(x => pendentes.add(x));
      prepararCampos(n);
    }
    if (pendentes.size) queueMicrotask(() => { pendentes.forEach(rotular); pendentes.clear(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  prepararCampos(document);

  window.avatar = (name, size) => `<span class="avatar ${size||'md'}" style="background:${Store.colorFor(name)}">${fmt.initials(name)}</span>`;

  /* ---------- Toast ---------- */
  window.toast = function (msg, type) {
    const root = document.getElementById("toast-root");
    const el = document.createElement("div");
    el.className = "toast " + (type || "");
    const ic = type === "err" ? "alert" : type === "ok" ? "check" : "bell";
    el.innerHTML = `<span class="t-ic">${icon(ic)}</span><div>${msg}</div>`;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(20px)"; el.style.transition=".25s"; setTimeout(() => el.remove(), 260); }, 2600);
  };

  /* ---------- Modal ---------- */
  window.Modal = {
    open({ title, body, footer, size, onMount }) {
      const root = document.getElementById("modal-root");
      root.innerHTML = `<div class="modal-scrim" data-close>
        <div class="modal ${size||''}" role="dialog" aria-modal="true">
          <div class="modal-head"><h3>${title||''}</h3>
            <button class="btn btn-icon btn-ghost btn-sm" data-close>${icon('x')}</button></div>
          <div class="modal-body">${body||''}</div>
          ${footer!==false ? `<div class="modal-foot">${footer||''}</div>` : ''}
        </div></div>`;
      root.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", (e) => { if (e.target.closest(".modal") && e.target.hasAttribute("data-close")===false) return; Modal.close(); }));
      root.querySelector(".modal-scrim").addEventListener("mousedown", (e) => { if (e.target.classList.contains("modal-scrim")) Modal.close(); });
      document.addEventListener("keydown", Modal._esc);
      if (onMount) onMount(root.querySelector(".modal"));
      return root.querySelector(".modal");
    },
    close() { document.getElementById("modal-root").innerHTML = ""; document.removeEventListener("keydown", Modal._esc); },
    _esc(e) { if (e.key === "Escape") Modal.close(); },
    confirm({ title, message, confirmText, danger, onConfirm }) {
      Modal.open({
        title: title || "Confirmar", size: "sm",
        body: `<p class="muted" style="line-height:1.6">${message||"Tem certeza?"}</p>`,
        footer: `<button class="btn btn-ghost" data-cancel>Cancelar</button>
                 <button class="btn ${danger?'btn-danger':'btn-primary'}" data-ok>${confirmText||"Confirmar"}</button>`,
        onMount(m) {
          m.querySelector("[data-cancel]").onclick = Modal.close;
          m.querySelector("[data-ok]").onclick = () => { Modal.close(); onConfirm && onConfirm(); };
        }
      });
    }
  };

  /* ---------- DOM helper ---------- */
  window.h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  window.esc = (s) => String(s==null?"":s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* WhatsApp deep link */
  /* wa.me abre o aplicativo no celular e o WhatsApp Web no computador.
     O endereço antigo (web.whatsapp.com) no celular — o aparelho que ela
     mais usa — caía numa página pedindo para abrir no computador.
     "Abrir no aplicativo do computador" (Configurações) usa whatsapp://. */
  window.waLink = (phone, text) => {
    const p = (phone||"").replace(/\D/g,"");
    const full = p.length <= 11 ? "55" + p : p;
    const t = encodeURIComponent(text||"");
    const noCelular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const desktop = !noCelular && window.Store && Store.db.settings && Store.db.settings.whatsappDesktop;
    return desktop ? `whatsapp://send?phone=${full}&text=${t}` : `https://wa.me/${full}${t ? "?text=" + t : ""}`;
  };
})();
