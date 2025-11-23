import { Pool } from "pg";
import { newDb } from "pg-mem";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const DATABASE_URL = process.env.DATABASE_URL || "postgres://chatbot:chatbot@localhost:5432/chatbot";

let pool;

if (DATABASE_URL === "memory") {
  const db = newDb();
  const adapter = db.adapters.createPg();
  pool = new adapter.Pool();
} else {
  pool = new Pool({ connectionString: DATABASE_URL });
}

export async function query(text, params) {
  return pool.query(text, params);
}

export async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS tenants (
      key text PRIMARY KEY,
      display_name text NOT NULL,
      waba_token text DEFAULT '' NOT NULL,
      phone_number_id text,
      graph_version text DEFAULT 'v20.0',
      calendar jsonb NOT NULL DEFAULT '{}'::jsonb,
      owner_portal_token text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_portal_token text");

  await query(`
    CREATE TABLE IF NOT EXISTS services (
      tenant_key text REFERENCES tenants(key) ON DELETE CASCADE,
      id text NOT NULL,
      name text NOT NULL,
      min_minutes integer,
      max_minutes integer,
      price numeric,
      currency text,
      description text,
      keywords jsonb,
      PRIMARY KEY (tenant_key, id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS customers (
      id text PRIMARY KEY,
      tenant_key text REFERENCES tenants(key) ON DELETE SET NULL,
      display_name text,
      phone text,
      language text,
      metadata jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS pending_bookings (
      customer_id text PRIMARY KEY,
      tenant_key text REFERENCES tenants(key) ON DELETE CASCADE,
      event_id text,
      start_iso text,
      end_iso text,
      slot_label text,
      time_zone text,
      service_id text,
      service_name text,
      service_price numeric,
      service_currency text,
      service_description text,
      duration_minutes integer,
      data jsonb,
      updated_at timestamptz DEFAULT now()
    );
  `);

  await seedDefaultTenants();
}

async function seedDefaultTenants() {
  const countRes = await query("SELECT COUNT(*) FROM tenants");
  const count = Number(countRes.rows[0]?.count || 0);
  if (count > 0) return;
  const defaultPath = path.resolve("src/tenants/tenants.json");
  if (!fs.existsSync(defaultPath)) return;
  const raw = fs.readFileSync(defaultPath, "utf-8");
  const tenants = JSON.parse(raw || "{}");
  for (const [key, tenant] of Object.entries(tenants)) {
    const calendar = tenant.calendar || {};
    await query(
      `INSERT INTO tenants (key, display_name, waba_token, phone_number_id, graph_version, calendar, owner_portal_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (key) DO NOTHING`,
      [
        key,
        tenant.displayName,
        tenant.wabaToken || "",
        tenant.phoneNumberId || "",
        tenant.graphVersion || "v20.0",
        JSON.stringify(calendar),
        tenant.ownerToken || uuid()
      ]
    );
    const services = tenant.services || [];
    for (const svc of services) {
      await query(
        `INSERT INTO services (tenant_key, id, name, min_minutes, max_minutes, price, currency, description, keywords)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (tenant_key, id) DO NOTHING`,
        [
          key,
          svc.id,
          svc.name,
          svc.minMinutes,
          svc.maxMinutes,
          svc.price,
          svc.currency,
          svc.description,
          JSON.stringify(svc.keywords || [])
        ]
      );
    }
  }
}
