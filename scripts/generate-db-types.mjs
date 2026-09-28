#!/usr/bin/env node
/**
 * Erzeugt src/lib/supabase/database.types.ts aus den Migrationen – ohne Docker.
 *
 * Die Migrationen werden in PGlite (Postgres als WebAssembly) mit einer
 * minimalen Supabase-Nachbildung ausgeführt; anschließend wird das Schema
 * "public" ausgelesen und im Format von `supabase gen types typescript`
 * ausgegeben (Tables/Views/Functions inkl. Relationships).
 *
 * Mit einem verknüpften Supabase-Projekt kann alternativ das offizielle
 * Kommando verwendet werden:
 *   npx supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outFile = join(root, "src", "lib", "supabase", "database.types.ts");

const db = new PGlite();
await db.exec(readFileSync(join(root, "tests", "db", "supabase-shim.sql"), "utf8"));
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
}

const q = async (sql, params = []) => (await db.query(sql, params)).rows;

function tsType(udt, isArray) {
  const base = (() => {
    switch (udt) {
      case "uuid": case "text": case "varchar": case "bpchar": case "citext":
      case "date": case "timestamptz": case "timestamp": case "time": case "timetz": case "interval":
      case "inet": case "bytea": case "name":
        return "string";
      case "int2": case "int4": case "int8": case "float4": case "float8": case "numeric": case "oid":
        return "number";
      case "bool":
        return "boolean";
      case "json": case "jsonb":
        return "Json";
      case "void":
        return "undefined";
      default:
        return "unknown";
    }
  })();
  return isArray ? `${base}[]` : base;
}

const tables = await q(`
  select c.relname as name, c.relkind as kind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
   order by c.relname`);

const columns = await q(`
  select c.relname as table_name, a.attname as column_name, a.attnum,
         t.typname as udt, t.typcategory = 'A' as is_array,
         et.typname as elem_udt,
         not a.attnotnull as nullable,
         (a.atthasdef or a.attidentity <> '' or a.attgenerated <> '') as has_default,
         a.attidentity = 'a' as identity_always,
         a.attgenerated <> '' as generated
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
   where n.nspname = 'public' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
   order by c.relname, a.attnum`);

const fks = await q(`
  select con.conname as name, src.relname as table_name, tgt.relname as ref_table,
         array(select att.attname from unnest(con.conkey) with ordinality k(attnum, ord)
                 join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum order by k.ord)::text[] as cols,
         array(select att.attname from unnest(con.confkey) with ordinality k(attnum, ord)
                 join pg_attribute att on att.attrelid = con.confrelid and att.attnum = k.attnum order by k.ord)::text[] as ref_cols,
         exists (
           select 1 from pg_index i
            where i.indrelid = con.conrelid and (i.indisunique or i.indisprimary) and i.indpred is null
              and (select array_agg(x order by x) from unnest(i.indkey::int2[]) x) =
                  (select array_agg(x order by x) from unnest(con.conkey) x)
         ) as one_to_one
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_namespace sn on sn.oid = src.relnamespace
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace tn on tn.oid = tgt.relnamespace
   where con.contype = 'f' and sn.nspname = 'public' and tn.nspname = 'public'
   order by src.relname, con.conname`);

const functions = await q(`
  select p.proname as name, p.proretset as returns_set,
         rt.typname as ret_udt, rt.typtype as ret_typtype, rt.typcategory = 'A' as ret_is_array,
         ret_elem.typname as ret_elem_udt,
         rrel.relname as ret_relation,
         p.pronargs as nargs, p.pronargdefaults as ndefaults,
         coalesce(p.proargnames, '{}') as argnames,
         coalesce(p.proargmodes::text[], '{}') as argmodes,
         array(select t.typname from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality a(oid, ord)
                 join pg_type t on t.oid = a.oid order by a.ord)::text[] as argtypes,
         array(select t.typcategory = 'A' from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality a(oid, ord)
                 join pg_type t on t.oid = a.oid order by a.ord)::bool[] as argisarray,
         array(select coalesce(et.typname, '') from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality a(oid, ord)
                 join pg_type t on t.oid = a.oid left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
                order by a.ord)::text[] as argelem
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type rt on rt.oid = p.prorettype
    left join pg_type ret_elem on ret_elem.oid = rt.typelem and rt.typcategory = 'A'
    left join pg_class rrel on rrel.oid = rt.typrelid and rt.typtype = 'c'
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and rt.typname <> 'trigger'
   order by p.proname`);

const colsByTable = new Map();
for (const c of columns) {
  if (!colsByTable.has(c.table_name)) colsByTable.set(c.table_name, []);
  colsByTable.get(c.table_name).push(c);
}
const fksByTable = new Map();
for (const f of fks) {
  if (!fksByTable.has(f.table_name)) fksByTable.set(f.table_name, []);
  fksByTable.get(f.table_name).push(f);
}

const ind = (n) => "  ".repeat(n);
const colType = (c) => tsType(c.is_array ? c.elem_udt : c.udt, c.is_array);

function renderRelationships(table, depth) {
  const list = fksByTable.get(table) ?? [];
  if (list.length === 0) return `${ind(depth)}Relationships: []`;
  const items = list.map((f) => [
    `${ind(depth + 1)}{`,
    `${ind(depth + 2)}foreignKeyName: "${f.name}"`,
    `${ind(depth + 2)}columns: [${f.cols.map((c) => `"${c}"`).join(", ")}]`,
    `${ind(depth + 2)}isOneToOne: ${f.one_to_one ? "true" : "false"}`,
    `${ind(depth + 2)}referencedRelation: "${f.ref_table}"`,
    `${ind(depth + 2)}referencedColumns: [${f.ref_cols.map((c) => `"${c}"`).join(", ")}]`,
    `${ind(depth + 1)}},`,
  ].join("\n"));
  return `${ind(depth)}Relationships: [\n${items.join("\n")}\n${ind(depth)}]`;
}

function renderTable(t, depth) {
  const cols = colsByTable.get(t.name) ?? [];
  const row = cols.map((c) => `${ind(depth + 2)}${c.column_name}: ${colType(c)}${c.nullable ? " | null" : ""}`).join("\n");
  const lines = [`${ind(depth)}${t.name}: {`, `${ind(depth + 1)}Row: {`, row, `${ind(depth + 1)}}`];
  if (t.kind === "r") {
    const ins = cols
      .filter((c) => !c.generated && !c.identity_always)
      .map((c) => `${ind(depth + 2)}${c.column_name}${c.nullable || c.has_default ? "?" : ""}: ${colType(c)}${c.nullable ? " | null" : ""}`)
      .join("\n");
    const upd = cols
      .filter((c) => !c.generated && !c.identity_always)
      .map((c) => `${ind(depth + 2)}${c.column_name}?: ${colType(c)}${c.nullable ? " | null" : ""}`)
      .join("\n");
    lines.push(`${ind(depth + 1)}Insert: {`, ins, `${ind(depth + 1)}}`, `${ind(depth + 1)}Update: {`, upd, `${ind(depth + 1)}}`);
  }
  lines.push(renderRelationships(t.name, depth + 1), `${ind(depth)}}`);
  return lines.join("\n");
}

function renderFunction(f, depth) {
  const inArgs = [];
  const outCols = [];
  const n = f.argtypes.length;
  for (let i = 0; i < n; i++) {
    const mode = f.argmodes[i] ?? "i";
    const name = f.argnames[i] || `arg${i}`;
    const type = tsType(f.argisarray[i] ? f.argelem[i] : f.argtypes[i], f.argisarray[i]);
    if (mode === "i" || mode === "b") inArgs.push({ name, type });
    if (mode === "t" || mode === "o" || mode === "b") outCols.push({ name, type });
  }
  const firstDefault = inArgs.length - f.ndefaults;
  const args = inArgs.length === 0
    ? "Record<PropertyKey, never>"
    // Postgres-Funktionen akzeptieren NULL für jedes Argument; die Prüfung erfolgt in der Funktion.
    : `{\n${inArgs.map((a, i) => `${ind(depth + 3)}${a.name}${i >= firstDefault ? "?" : ""}: ${a.type} | null`).join("\n")}\n${ind(depth + 2)}}`;

  let ret;
  if (outCols.length > 0) {
    ret = `{\n${outCols.map((c) => `${ind(depth + 3)}${c.name}: ${c.type}`).join("\n")}\n${ind(depth + 2)}}[]`;
  } else if (f.ret_relation) {
    ret = `Database["public"]["Tables"]["${f.ret_relation}"]["Row"]${f.returns_set ? "[]" : ""}`;
  } else {
    ret = tsType(f.ret_is_array ? f.ret_elem_udt : f.ret_udt, f.ret_is_array) + (f.returns_set ? "[]" : "");
  }
  return `${ind(depth)}${f.name}: {\n${ind(depth + 1)}Args: ${args}\n${ind(depth + 1)}Returns: ${ret}\n${ind(depth)}}`;
}

const tablesOut = tables.filter((t) => t.kind === "r").map((t) => renderTable(t, 3)).join("\n");
const viewsOut = tables.filter((t) => t.kind === "v").map((t) => renderTable(t, 3)).join("\n");
const fnOut = functions.map((f) => renderFunction(f, 3)).join("\n");

const out = `// AUTOMATISCH ERZEUGT – nicht von Hand bearbeiten.
// Quelle: supabase/migrations (erzeugt mit \`npm run db:types\`).
// Format kompatibel zu \`supabase gen types typescript\`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13"
  }
  public: {
    Tables: {
${tablesOut}
    }
    Views: ${viewsOut ? `{\n${viewsOut}\n    }` : "{\n      [_ in never]: never\n    }"}
    Functions: {
${fnOut}
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type DbFunctions = PublicSchema["Functions"]
`;

writeFileSync(outFile, out, "utf8");
await db.close();
console.log(`Typen geschrieben: ${outFile} (${tables.length} Tabellen/Views, ${functions.length} Funktionen)`);
