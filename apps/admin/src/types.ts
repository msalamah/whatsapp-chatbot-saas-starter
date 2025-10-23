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
}
