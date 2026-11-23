import { randomBytes } from "node:crypto";
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

const ROLE = "agroai_app";
const password = process.env.AGROAI_APP_PASSWORD || randomBytes(18).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 24);

const adminUrl = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
const admin = new Pool({ connectionString: adminUrl });
const client = await admin.connect();
try {
  const exists = await client.query("select 1 from pg_roles where rolname = $1", [ROLE]);
  if (exists.rows.length === 0) {
    await client.query(`create role ${ROLE} login password '${password}'`);
    console.log(`created role ${ROLE}`);
  } else {
    await client.query(`alter role ${ROLE} login password '${password}'`);
    console.log(`updated role ${ROLE} password`);
  }

  await client.query(`alter role ${ROLE} nobypassrls`);
  await client.query(`grant usage on schema public to ${ROLE}`);
  await client.query(`grant select, insert, update, delete on all tables in schema public to ${ROLE}`);
  await client.query(`grant usage, select on all sequences in schema public to ${ROLE}`);
  await client.query(`grant execute on function public.app_farmer_id(), public.app_claim_ids(), public.app_is_service() to ${ROLE}`);
  await client.query(
    `grant execute on function public.auth_find_farmer(text), public.auth_find_farmer_by_id(integer), public.auth_farm_claimable(integer), public.auth_camera_farmer(text) to ${ROLE}`,
  );
  console.log("grants applied");
} finally {
  client.release();
  await admin.end();
}

// Build the app connection string from the pooled URL.
const appParsed = new URL(env.DATABASE_URL ?? adminUrl);
appParsed.username = ROLE;
appParsed.password = password;
const appUrl = appParsed.toString();
console.log("\nAPP_DATABASE_URL=" + appUrl);

// ---------------------------------------------------------------------------
// Isolation test: connect as the restricted role and verify scopes.
// ---------------------------------------------------------------------------
const app = new Pool({ connectionString: appUrl });
const c = await app.connect();
// One transaction, rolled back at the end: the scope settings stay local.
await c.query("begin");
const setScope = async (farmerId, claimIds, service) => {
  await c.query("select set_config('app.farmer_id', $1, true)", [farmerId ? String(farmerId) : ""]);
  await c.query("select set_config('app.claim_ids', $1, true)", [claimIds && claimIds.length ? claimIds.join(",") : ""]);
  await c.query("select set_config('app.service', $1, true)", [service ? "on" : ""]);
};

try {
  const who = await c.query("select current_user, (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls");
  console.log("\nconnected as:", who.rows[0]);

  // No scope: everything denied.
  await setScope(null, [], false);
  const none = await c.query("select count(*)::int as n from farmlands");
  console.log("no scope -> farmlands visible:", none.rows[0].n, "(expect 0)");

  // Farmer 4's scope: sees own fields only.
  await setScope(4, [], false);
  const own = await c.query("select id, name from farmlands order by id");
  console.log("farmer 4 -> farmlands:", own.rows);

  const others = await c.query("select count(*)::int as n from farmlands where farmer_id <> 4");
  console.log("farmer 4 -> rows not owned by 4:", others.rows[0].n, "(expect 0)");

  const crops = await c.query("select id, crop_name from crops order by id");
  console.log("farmer 4 -> crops:", crops.rows.map((r) => r.crop_name));

  const farmers = await c.query("select id, name from farmers order by id");
  console.log("farmer 4 -> farmers visible:", farmers.rows, "(expect only id 4)");

  // Farmer 10 only sees their own field.
  await setScope(10, [], false);
  const f10 = await c.query("select id, name from farmlands order by id");
  console.log("farmer 10 -> farmlands:", f10.rows, "(expect farm 3 only)");

  // Anonymous claim scope can read only its own draft.
  await setScope(null, [24], false);
  const draft = await c.query("select id, name, farmer_id from farmlands order by id");
  console.log("claim [24] -> farmlands:", draft.rows, "(expect farm 24 only)");

  // Definier helpers work before a scope exists.
  await setScope(null, [], false);
  const found = await c.query("select id, name from auth_find_farmer('Sumesh Pradhan')");
  console.log("auth_find_farmer -> ", found.rows);
  const camera = await c.query("select auth_camera_farmer('nope') as fid");
  console.log("auth_camera_farmer(unknown) ->", camera.rows[0].fid, "(expect null)");

  // Service scope spans farmers.
  await setScope(null, [], true);
  const svc = await c.query("select count(*)::int as n from farmlands");
  console.log("service scope -> farmlands:", svc.rows[0].n, "(expect all)");
} finally {
  await c.query("rollback");
  c.release();
  await app.end();
}
