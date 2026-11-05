/* D1 de mentira, mas com SQLite de verdade (node:sqlite).
   Roda a migração real, então os CHECKs, o UPSERT com WHERE e o RETURNING
   são os mesmos que o D1 vai executar. */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

/* O D1 aceita parâmetros numerados (?1, ?2 — e o mesmo ?3 repetido); o
   node:sqlite não. Aqui ?N vira $pN e os valores viram um objeto — o SQL
   de produção fica exatamente como o D1 vai rodar. */
class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\?(\d+)/g, "$p$1"); this.v = []; }
  bind(...v) { this.v = v; return this; }
  _args() { return [Object.fromEntries(this.v.map((x, i) => ["p" + (i + 1), x]))]; }
  _stmt() { return this.db.prepare(this.sql); }
  async first() { return this._stmt().get(...this._args()) ?? null; }
  async all() { return { results: this._stmt().all(...this._args()) }; }
  async run() { const r = this._stmt().run(...this._args()); return { meta: { changes: Number(r.changes) } }; }
  _exec() { const r = this._stmt().run(...this._args()); return { meta: { changes: Number(r.changes) } }; }
}

export function novoD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(raiz, "migrations", "0001_nailagenda.sql"), "utf8"));
  return {
    _sqlite: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(lista) {       // como no D1: transação única
      db.exec("BEGIN");
      try { const out = lista.map(s => s._exec()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}
