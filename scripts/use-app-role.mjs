import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

const ROLE = "agroai_app";
const envPath = new URL("../.env.local", import.meta.url);
const raw = readFileSync(envPath, "utf8");

function parse(contents) {
  return Object.fromEntries(
    contents
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
}

const env = parse(raw);
const password = process.env.AGROAI_APP_PASSWORD || randomBytes(18).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 24);

const admin = new Pool({ connectionString: env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL });
const a = await admin.connect();
try {
  await a.query(`alter role ${ROLE} login password '${password}'`);
  console.log("rotated app role password");
} finally {
  a.release();
  await admin.end();
}

const appParsed = new URL(env.DATABASE_URL);
appParsed.username = ROLE;
appParsed.password = password;
const appUrl = appParsed.toString();

// Replace only the DATABASE_URL= line, keeping the rest of the file intact.
const updated = raw.replace(
  /^DATABASE_URL=.*$/m,
  `DATABASE_URL="${appUrl}"`,
);
writeFileSync(envPath, updated);
console.log("updated .env.local DATABASE_URL to use role:", ROLE);
console.log("host:", appParsed.host.replace(/^[^.]+/, "***"));
