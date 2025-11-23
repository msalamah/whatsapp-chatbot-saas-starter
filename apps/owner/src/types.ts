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

export interface CustomerRecord {
  id: string;
  displayName?: string;
  phone?: string;
  language?: string;
  updatedAt?: string;
  appointmentCount?: number;
  lastBooking?: string;
}

export interface ServiceRecord {
  id: string;
  name: string;
  price?: number;
  currency?: string;
  minMinutes?: number;
  maxMinutes?: number;
  description?: string;
}

export interface ServiceFormState {
  id?: string;
  name: string;
  minMinutes: number;
  maxMinutes: number;
  price: number;
  currency: string;
  description: string;
}
