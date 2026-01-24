import { createContext, useContext } from "react";
import {
  AnalyticsSummary,
  Appointment,
  CustomerRecord,
  OwnerCalendar,
  OwnerProfile,
  OwnerSession,
  PendingBooking,
  ServiceRecord
} from "../types";

export type OwnerContextValue = {
  session: OwnerSession;
  jwt: string;
  analytics: AnalyticsSummary | null;
  pending: PendingBooking[];
  appointments: Appointment[];
  customers: CustomerRecord[];
  customersHasMore: boolean;
  loading: boolean;
  error: string | null;
  actionCustomer: string | null;
  refresh: () => Promise<void>;
  resolveBooking: (customerId: string, action: "approve" | "reject") => Promise<void>;
  logout: () => Promise<void>;
  priceFormatter: (booking: PendingBooking) => string;
  fetchAppointmentsByRange: (range: "upcoming" | "past" | "all") => Promise<Appointment[]>;
  fetchCustomers: (query?: string, offset?: number) => Promise<{ customers: CustomerRecord[]; hasMore: boolean }>;
  fetchCustomerDetail: (customerId: string, options?: { limit?: number; offset?: number; range?: string }) => Promise<{
    customer: CustomerRecord;
    appointments: Appointment[];
    hasMore?: boolean;
  }>;
  services: ServiceRecord[];
  fetchServices: () => Promise<ServiceRecord[]>;
  saveService: (service: Partial<ServiceRecord>) => Promise<ServiceRecord[]>;
  deleteService: (serviceId: string) => Promise<ServiceRecord[]>;
  calendar: OwnerCalendar | null;
  refreshCalendar: () => Promise<OwnerCalendar | null>;
  saveCalendar: (cal: OwnerCalendar) => Promise<OwnerCalendar | null>;
  profile: OwnerProfile | null;
  fetchProfile: () => Promise<OwnerProfile | null>;
  updateProfile: (payload: {
    ownerName?: string;
    email?: string | null;
    phone?: string;
    businessName?: string;
    timezone?: string;
  }) => Promise<{ status: string; profile: OwnerProfile; phone?: string; expiresAt?: string }>;
  confirmPhoneChange: (phone: string, code: string) => Promise<{ status: string; profile: OwnerProfile }>;
  createBooking: (payload: {
    customerName: string;
    customerPhone: string;
    serviceId?: string;
    startISO: string;
    endISO: string;
    notes?: string;
  }) => Promise<void>;
  openBooking: (start?: Date) => void;
};

export const OwnerContext = createContext<OwnerContextValue | undefined>(undefined);

export function useOwner() {
  const ctx = useContext(OwnerContext);
  if (!ctx) throw new Error("Owner context missing");
  return ctx;
}
