import { v4 as uuidv4 } from "uuid";
import { query } from "../db/client.js";

export async function upsertOwner({ phone, email = null, displayName = null }) {
  if (!phone) throw new Error("phone is required");
  const res = await query(
    `INSERT INTO owners (id, phone, email, display_name, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (phone) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, owners.email),
       display_name = COALESCE(EXCLUDED.display_name, owners.display_name),
       updated_at = now()
     RETURNING *`,
    [uuidv4(), phone, email, displayName]
  );
  return res.rows[0];
}

export async function findOwnerByPhone(phone) {
  const res = await query("SELECT * FROM owners WHERE phone = $1", [phone]);
  return res.rows[0] || null;
}

export async function findOwnerById(ownerId) {
  if (!ownerId) throw new Error("ownerId is required");
  const res = await query("SELECT * FROM owners WHERE id = $1", [ownerId]);
  return res.rows[0] || null;
}

export async function updateOwnerById({ ownerId, phone, email, displayName }) {
  if (!ownerId) throw new Error("ownerId is required");
  const fields = [];
  const values = [];
  let idx = 1;
  if (phone !== undefined) {
    fields.push(`phone = $${idx++}`);
    values.push(phone);
  }
  if (email !== undefined) {
    fields.push(`email = $${idx++}`);
    values.push(email);
  }
  if (displayName !== undefined) {
    fields.push(`display_name = $${idx++}`);
    values.push(displayName);
  }
  if (!fields.length) {
    return findOwnerById(ownerId);
  }
  values.push(ownerId);
  const res = await query(
    `UPDATE owners SET ${fields.join(", ")}, updated_at = now()
     WHERE id = $${idx}
     RETURNING *`,
    values
  );
  return res.rows[0] || null;
}

export async function linkOwnerToTenant({ ownerId, tenantKey, role = "owner" }) {
  if (!ownerId || !tenantKey) throw new Error("ownerId and tenantKey are required");
  await query(
    `INSERT INTO owner_tenants (owner_id, tenant_key, role)
     VALUES ($1,$2,$3)
     ON CONFLICT (owner_id, tenant_key) DO UPDATE SET role = EXCLUDED.role`,
    [ownerId, tenantKey, role]
  );
}

export async function getOwnerTenantLink({ phone, tenantKey }) {
  const res = await query(
    `SELECT ot.owner_id, ot.role, o.phone, o.display_name
     FROM owner_tenants ot
     JOIN owners o ON o.id = ot.owner_id
     WHERE o.phone = $1 AND ot.tenant_key = $2
     LIMIT 1`,
    [phone, tenantKey]
  );
  return res.rows[0] || null;
}

export async function listTenantsForPhone(phone) {
  const res = await query(
    `SELECT t.key, t.display_name
     FROM owner_tenants ot
     JOIN owners o ON o.id = ot.owner_id
     JOIN tenants t ON t.key = ot.tenant_key
     WHERE o.phone = $1
     ORDER BY t.display_name ASC
    `,
    [phone]
  );
  return res.rows.map((row) => ({
    key: row.key,
    name: row.display_name
  }));
}
