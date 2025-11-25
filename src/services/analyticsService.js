import { query } from "../db/client.js";

export async function getOwnerAnalytics(tenantKey) {
  const [appointmentsRes, revenueRes, capacityRes] = await Promise.all([
    query(
      `SELECT COUNT(*) FILTER (WHERE start_iso::timestamptz >= now() - INTERVAL '30 days') AS last_30,
              COUNT(*) AS total
       FROM appointments
       WHERE tenant_key = $1`,
      [tenantKey]
    ),
    query(
      `SELECT SUM(service_price) AS revenue
       FROM pending_bookings
       WHERE tenant_key = $1`,
      [tenantKey]
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE start_iso::timestamptz >= now()) AS upcoming
       FROM appointments
       WHERE tenant_key = $1`,
      [tenantKey]
    )
  ]);

  return {
    totalAppointments: Number(appointmentsRes.rows[0]?.total || 0),
    last30Appointments: Number(appointmentsRes.rows[0]?.last_30 || 0),
    projectedRevenue: Number(revenueRes.rows[0]?.revenue || 0),
    upcomingBookings: Number(capacityRes.rows[0]?.upcoming || 0)
  };
}
