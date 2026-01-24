export type OwnerSession = {
  token: string;
  refreshToken?: string;
  tenant: {
    key: string;
    name: string;
  };
};

export type PendingBooking = {
  customerId: string;
  serviceName?: string;
  servicePrice?: number;
  serviceCurrency?: string;
  slotLabel?: string;
};

export type Appointment = {
  id: string;
  service_name?: string;
  slot_label?: string;
  start_iso?: string;
};

export type CalendarRule = {
  dayOfWeek: number;
  start: string;
  end: string;
  capacity?: number | null;
};

export type CalendarBlock = {
  startISO: string;
  endISO: string;
  reason?: string | null;
};

export type OwnerCalendar = {
  timezone: string;
  capacity: number;
  lookaheadDays: number;
  rules: CalendarRule[];
  blocks: CalendarBlock[];
};

export type AvailabilitySlot = {
  startISO: string;
  endISO: string;
  displayLabel: string;
  buttonLabel: string;
  timezone?: string;
};

export type CustomerRecord = {
  id: string;
  displayName?: string;
  phone?: string;
  appointmentCount?: number;
  lastBooking?: string;
};

export type AnalyticsSummary = {
  totalAppointments: number;
  last30Appointments: number;
  projectedRevenue: number;
  upcomingBookings: number;
};

export type ServiceRecord = {
  id: string;
  name: string;
  price?: number;
  currency?: string;
  minMinutes?: number;
  maxMinutes?: number;
  description?: string;
};
