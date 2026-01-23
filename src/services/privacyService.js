import { query } from "../db/client.js";
import { logger } from "../utils/logger.js";

export async function deleteCustomerData({ tenantKey, customerId, actor = "owner" }) {
  if (!tenantKey || !customerId) {
    throw new Error("tenantKey and customerId are required");
  }
  await query("DELETE FROM messages WHERE tenant_key = $1 AND customer_id = $2", [tenantKey, customerId]);
  await query("DELETE FROM conversations WHERE tenant_key = $1 AND customer_id = $2", [tenantKey, customerId]);
  await query("DELETE FROM pending_bookings WHERE tenant_key = $1 AND customer_id = $2", [tenantKey, customerId]);
  await query("DELETE FROM appointments WHERE tenant_key = $1 AND customer_id = $2", [tenantKey, customerId]);
  const res = await query("DELETE FROM customers WHERE tenant_key = $1 AND id = $2", [tenantKey, customerId]);
  logger.info("customer.delete", "privacy", { tenantKey, customerId, actor, deleted: res.rowCount || 0 });
  return { deleted: res.rowCount || 0 };
}
