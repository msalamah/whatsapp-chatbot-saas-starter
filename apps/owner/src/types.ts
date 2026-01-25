export interface TenantInfo {
  key: string;
  name: string;
  calendarLink?: string | null;
}

export interface CalendarRule {
  id?: string;
  dayOfWeek: number;
  start: string;
  end: string;
  capacity?: number | null;
}

export interface CalendarBlock {
  id?: string;
  startISO: string;
  endISO: string;
  reason?: string;
}

export interface OwnerCalendar {
  timezone: string;
  capacity: number;
  lookaheadDays: number;
  rules: CalendarRule[];
  blocks: CalendarBlock[];
}

export interface PendingBooking {
  customerId: string;
  serviceName?: string;
  slotLabel?: string;
  startISO?: string;
  endISO?: string;
  timeZone?: string;
}

export interface Appointment {
  id: string;
  service_name?: string;
  slot_label?: string;
  start_iso?: string;
  end_iso?: string;
  status?: string;
}

export interface OwnerCredentials {
  token: string;
  refreshToken?: string;
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

export interface CustomerDetail extends CustomerRecord {
  metadata?: Record<string, unknown> | null;
  appointments?: Appointment[];
}

export interface AnalyticsSummary {
  totalAppointments: number;
  last30Appointments: number;
  projectedRevenue: number;
  upcomingBookings: number;
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

export interface OwnerProfile {
  owner: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  tenant: {
    key: string;
    name: string;
    timezone: string;
  };
}
