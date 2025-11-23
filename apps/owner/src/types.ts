export interface TenantInfo {
  key: string;
  name: string;
  calendarLink?: string | null;
}

export interface PendingBooking {
  customerId: string;
  serviceName?: string;
  slotLabel?: string;
}

export interface Appointment {
  id: string;
  service_name?: string;
  slot_label?: string;
  start_iso?: string;
}

export interface OwnerCredentials {
  token: string;
  tenant: TenantInfo;
}
