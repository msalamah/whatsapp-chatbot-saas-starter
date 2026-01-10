export interface TenantSummary {
  key: string;
  displayName: string;
  calendar?: { timezone?: string };
}

export interface Service {
  id: string;
  name: string;
  minMinutes?: number;
  maxMinutes?: number;
  price?: number;
  currency?: string;
  description?: string;
}

export interface Slot {
  startISO: string;
  endISO: string;
  displayLabel: string;
  buttonLabel: string;
  timezone?: string;
}
