export interface ServiceDefinition {
  id: string;
  name: string;
  minMinutes: number;
  maxMinutes: number;
  price: number;
  currency: string;
  description: string;
  keywords: string[];
}

export interface CalendarConfig {
  enabled: boolean;
  timezone: string;
  calendarId: string;
  slotDurationMinutes: number;
  workingHours: Array<{
    day: number;
    start: string;
    end: string;
  }>;
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

export interface InternalCalendar {
  timezone: string;
  capacity: number;
  lookaheadDays: number;
  rules: CalendarRule[];
  blocks: CalendarBlock[];
}

export interface Tenant {
  key: string;
  displayName: string;
  phoneNumberId: string;
  graphVersion: string;
  calendar: CalendarConfig;
  services: ServiceDefinition[];
  wabaTokenPreview?: string | null;
  wabaToken?: string;
}

export interface TenantPayload {
  displayName: string;
  phoneNumberId: string;
  graphVersion?: string;
  wabaToken?: string;
  calendar?: Partial<CalendarConfig>;
  services?: Array<Partial<ServiceDefinition>>;
}

export interface AdminCredentials {
  baseUrl: string;
  token: string;
  actor: string;
  role: string;
}

export interface AuditEvent {
  timestamp: string;
  action: string;
  actor: string;
  role: string;
  tenantKey?: string;
  details?: Record<string, unknown>;
}

export interface PendingBooking {
  customerId: string;
  tenantKey: string;
  slotLabel?: string;
  serviceName?: string;
  servicePrice?: number;
  serviceCurrency?: string;
  updatedAt?: string;
  startISO?: string;
  endISO?: string;
  timeZone?: string;
}

export interface AppointmentRecord {
  id: string;
  service_name?: string;
  slot_label?: string;
  start_iso?: string;
  end_iso?: string;
  customer_id?: string;
}
