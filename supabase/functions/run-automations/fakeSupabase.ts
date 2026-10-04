// Test-only: an in-memory stand-in for the Supabase client, covering the
// query-builder calls the workflow engine makes. Not deployed.
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "update" | "insert" | "delete" = "select";
  private patch: Row | Row[] = {};
  private returning = false;
  private head = false;
  private countWanted = false;
  private one: "single" | "maybe" | null = null;
  private sortCol: string | null = null;
  private asc = true;
  private max = Infinity;

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.head = !!opts?.head;
      this.countWanted = !!opts?.count;
    } else {
      this.returning = true;
    }
    return this;
  }
  update(patch: Row) { this.op = "update"; this.patch = patch; return this; }
  insert(rows: Row | Row[]) { this.op = "insert"; this.patch = rows; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  is(c: string, v: null) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  lte(c: string, v: string) { this.filters.push((r) => String(r[c]) <= v); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => (r[c] ?? null) !== v);
    else if (op === "in") {
      const list = String(v).replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
      this.filters.push((r) => !list.includes(String(r[c])));
    }
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) { this.sortCol = c; this.asc = o?.ascending !== false; return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }

  private run() {
    if (this.db.failOn?.(this.table, this.op, this.patch)) return { data: null, error: { message: `forced failure on ${this.table}` } };
    const t = (this.db.tables[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let rows: Row[] = [];
    if (this.op === "insert") {
      const list = Array.isArray(this.patch) ? this.patch : [this.patch];
      rows = list.map((r) => ({ id: uuid(), created_at: new Date().toISOString(), ...r }));
      t.push(...rows);
    } else if (this.op === "update") {
      rows = t.filter(match);
      for (const r of rows) Object.assign(r, this.patch);
    } else if (this.op === "delete") {
      rows = t.filter(match);
      this.db.tables[this.table] = t.filter((r) => !match(r));
    } else {
      rows = t.filter(match);
      if (this.sortCol) {
        const c = this.sortCol;
        rows = [...rows].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (this.asc ? 1 : -1));
      }
      rows = rows.slice(0, this.max);
    }
    const copy = rows.map((r) => structuredClone(r));
    if (this.op === "select" && this.head) return { data: null, error: null, count: copy.length };
    if (this.op !== "select" && !this.returning) return { data: null, error: null };
    if (this.one === "single") return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: "not one row" } };
    if (this.one === "maybe") return { data: copy[0] ?? null, error: null };
    return { data: copy, error: null, count: this.countWanted ? copy.length : null };
  }

  then<A, B>(ok?: ((v: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  rpcCalls: string[] = [];
  /** Make a write fail, to test error handling. */
  failOn?: (table: string, op: string, patch: unknown) => boolean;
  from(table: string) { return new Query(this, table); }
  rpc(name: string) { this.rpcCalls.push(name); return Promise.resolve({ data: 0, error: null }); }
  rows(table: string) { return this.tables[table] ?? []; }
}
