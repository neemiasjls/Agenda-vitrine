/* Carrega o Store e o Schedule fora do navegador.
   Os dois são IIFEs que escrevem em `window`; aqui montamos um window de
   mentira com localStorage em memória, para cada teste rodar numa base
   limpa e isolada — sem precisar de framework nem de browser. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

export function carregar() {
  const memoria = new Map();
  const janela = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: {
      getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
      setItem: (k, v) => memoria.set(k, String(v)),
      removeItem: (k) => memoria.delete(k),
    },
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder,
    // o app avisa por toast e, sem ele, por alert. Guardamos o que foi dito
    // para o teste poder conferir a mensagem que a Marina veria.
    alert(msg) { janela.__avisos.push(String(msg)); },
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
    console,
  };
  janela.__avisos = [];
  janela.window = janela;
  janela.globalThis = janela;

  const ctx = vm.createContext(janela);
  for (const arquivo of ["assets/js/store.js", "assets/js/agenda-core.js", "assets/js/schedule.js"]) {
    vm.runInContext(readFileSync(join(raiz, arquivo), "utf8"), ctx, { filename: arquivo });
  }
  return { Store: janela.Store, Schedule: janela.Schedule, janela, memoria };
}

/* Zera a agenda para o teste montar só o cenário que lhe interessa. */
export function agendaVazia(Store) {
  Store.db.appts.length = 0;
  Store.db.blocks.length = 0;
  Store.save();
}

/* Data futura que cai num dia da semana pedido (0=dom … 6=sáb). */
export function proximoDia(diaDaSemana, aPartirDe = new Date()) {
  const d = new Date(aPartirDe);
  d.setHours(12, 0, 0, 0);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() !== diaDaSemana);
  return d;
}

export const iso = (d) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

/* Monta um horário local e devolve no mesmo formato que o app grava. */
export const em = (dataISO, hora) => new Date(`${dataISO}T${hora}`).toISOString();
