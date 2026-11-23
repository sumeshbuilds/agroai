import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      const key = l.slice(0, i).trim();
      let value = l.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return [key, value];
    }),
);

const sqlText = readFileSync(new URL("../sql/row-level-security.sql", import.meta.url), "utf8");
const pool = new Pool({ connectionString: env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query(sqlText);
  console.log("RLS policies applied.");

  const { rows } = await client.query(
    "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename",
  );
  console.table(rows);

  const policies = await client.query(
    "select tablename, policyname from pg_policies where schemaname = 'public' order by tablename",
  );
  console.table(policies.rows);
} finally {
  client.release();
  await pool.end();
}
