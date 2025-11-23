import { getTenantByKey } from "../tenants/tenantManager.js";
import { getPendingBooking, deletePendingBooking } from "./pendingBookingStore.js";
import { confirmEvent, cancelEvent } from "./calendarService.js";
import { sendText } from "./whatsappService.js";
import { createAppointment } from "./appointmentStore.js";

function buildApprovedMessage(pending) {
  if (pending.serviceName) {
    return `Approved ✅ ${pending.serviceName} on ${pending.slotLabel}.`;
  }
  return `Approved ✅ See you on ${pending.slotLabel}.`;
}

function buildRejectedMessage(pending) {
  if (pending.serviceName) {
    return `${pending.serviceName} on ${pending.slotLabel} is now open again.`;
  }
  return `${pending.slotLabel || "your booking"} is now open again.`;
}

export async function approvePendingBooking({ tenantKey, customerId }) {
  const pending = await getPendingBooking(customerId);
  if (!pending || pending.tenantKey !== tenantKey) {
    throw new Error("Pending booking not found");
  }
  const tenant = await getTenantByKey(tenantKey);
  if (!tenant) throw new Error("Tenant not found");
  if (pending.eventId) {
    await confirmEvent(tenant, pending.eventId);
  }
  await sendText(tenant.key, customerId, buildApprovedMessage(pending));
  await deletePendingBooking(customerId);
  await createAppointment({
    tenantKey,
    customerId,
    serviceId: pending.serviceId,
    serviceName: pending.serviceName,
    startISO: pending.startISO,
    endISO: pending.endISO,
    slotLabel: pending.slotLabel
  });
  return pending;
}

export async function rejectPendingBooking({ tenantKey, customerId }) {
  const pending = await getPendingBooking(customerId);
  if (!pending || pending.tenantKey !== tenantKey) {
    throw new Error("Pending booking not found");
  }
  const tenant = await getTenantByKey(tenantKey);
  if (!tenant) throw new Error("Tenant not found");
  if (pending.eventId) {
    await cancelEvent(tenant, pending.eventId);
  }
  await sendText(tenant.key, customerId, buildRejectedMessage(pending));
  await deletePendingBooking(customerId);
  return pending;
}
