import "react-native-gesture-handler";
import "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Controller, useForm } from "react-hook-form";
import { Calendar as MonthCalendar, WeekCalendar, CalendarProvider, LocaleConfig } from "react-native-calendars";

const Tab = createBottomTabNavigator();
const CUSTOMER_PAGE_SIZE = 25;
const EMPTY_SERVICE: ServiceRecord = {
  id: "",
  name: "",
  price: 0,
  currency: "USD",
  minMinutes: 30,
  maxMinutes: 45,
  description: ""
};

type OwnerSession = {
  token: string;
  refreshToken?: string;
  tenant: {
    key: string;
    name: string;
  };
};

type PendingBooking = {
  customerId: string;
  serviceName?: string;
  servicePrice?: number;
  serviceCurrency?: string;
  slotLabel?: string;
};

type Appointment = {
  id: string;
  service_name?: string;
  slot_label?: string;
  start_iso?: string;
};

type CalendarRule = {
  dayOfWeek: number;
  start: string;
  end: string;
  capacity?: number | null;
};

type CalendarBlock = {
  startISO: string;
  endISO: string;
  reason?: string | null;
};

type OwnerCalendar = {
  timezone: string;
  capacity: number;
  lookaheadDays: number;
  rules: CalendarRule[];
  blocks: CalendarBlock[];
};

type AvailabilitySlot = {
  startISO: string;
  endISO: string;
  displayLabel: string;
  buttonLabel: string;
  timezone?: string;
};

type CustomerRecord = {
  id: string;
  displayName?: string;
  phone?: string;
  appointmentCount?: number;
  lastBooking?: string;
};

type AnalyticsSummary = {
  totalAppointments: number;
  last30Appointments: number;
  projectedRevenue: number;
  upcomingBookings: number;
};

type TenantOption = {
  key: string;
  name: string;
};

type RegisterServiceDraft = {
  name: string;
  durationMinutes: string;
  price: string;
  currency: string;
};

const STORAGE_KEY = "owner-mobile-session";
const PHONE_KEY = "owner-mobile-phone";
const REFRESH_KEY = "owner-mobile-refresh";
const API_BASE =
  (process.env.EXPO_PUBLIC_API_BASE_URL as string | undefined) ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  "http://localhost:3000";

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  return requestWithRetry<T>(path, options, token, true);
}

let refreshHandler: (() => Promise<string | null>) | null = null;
function setRefreshHandler(handler: (() => Promise<string | null>) | null) {
  refreshHandler = handler;
}

async function requestWithRetry<T>(path: string, options: RequestInit, token?: string, allowRefresh = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token && allowRefresh && refreshHandler) {
      const nextToken = await refreshHandler();
      if (nextToken) {
        return requestWithRetry<T>(path, options, nextToken, false);
      }
    }
    const message = typeof data === "string" ? data : data?.error?.message || data?.error || response.statusText;
    throw new Error(message);
  }

  return data as T;
}

type ServiceRecord = {
  id: string;
  name: string;
  price?: number;
  currency?: string;
  minMinutes?: number;
  maxMinutes?: number;
  description?: string;
};

type OwnerContextValue = {
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

const OwnerContext = createContext<OwnerContextValue | undefined>(undefined);
function useOwner() {
  const ctx = useContext(OwnerContext);
  if (!ctx) throw new Error("Owner context missing");
  return ctx;
}

export default function App() {
  const [registerMode, setRegisterMode] = useState(false);
  const [registerBusinessName, setRegisterBusinessName] = useState("");
  const [registerOwnerName, setRegisterOwnerName] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerTimezone, setRegisterTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });
  const [registerServices, setRegisterServices] = useState<RegisterServiceDraft[]>([]);
  const [loginPhone, setLoginPhone] = useState("");
  const [loginTenantKey, setLoginTenantKey] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpTenantKey, setOtpTenantKey] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingBooking[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [customersHasMore, setCustomersHasMore] = useState(false);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [calendar, setCalendar] = useState<OwnerCalendar | null>(null);
  const [bookingVisible, setBookingVisible] = useState(false);
  const [bookingName, setBookingName] = useState("");
  const [bookingPhone, setBookingPhone] = useState("");
  const [bookingServiceId, setBookingServiceId] = useState<string | undefined>(undefined);
  const [bookingStartISO, setBookingStartISO] = useState("");
  const [bookingEndISO, setBookingEndISO] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingSaving, setBookingSaving] = useState(false);
  const [availFrom, setAvailFrom] = useState(() => new Date().toISOString());
  const [availTo, setAvailTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  });
  const [availSlots, setAvailSlots] = useState<AvailabilitySlot[]>([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [availPicker, setAvailPicker] = useState<"from" | "to" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionCustomer, setActionCustomer] = useState<string | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const parsed: OwnerSession = JSON.parse(stored);
          setSession(parsed);
          setJwt(parsed.token);
        }
      })
      .catch(() => undefined);
    SecureStore.getItemAsync(REFRESH_KEY)
      .then((stored) => {
        if (stored) setRefreshToken(stored);
      })
      .catch(() => undefined);
    SecureStore.getItemAsync(PHONE_KEY)
      .then((stored) => {
        if (stored) setLoginPhone(stored);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!otpCooldown) return;
    const timer = setInterval(() => {
      setOtpCooldown((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (!jwt) {
      setPending([]);
      setAnalytics(null);
      setAppointments([]);
      return;
    }
    fetchData();
  }, [jwt]);

  const refreshSession = useCallback(async () => {
    if (!refreshToken) return null;
    try {
      const response = await fetch(`${API_BASE}/owner/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken })
      });
      const text = await response.text();
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!response.ok) {
        return null;
      }
      const credentials = data as OwnerSession;
      setSession(credentials);
      setJwt(credentials.token);
      if (credentials.refreshToken) {
        setRefreshToken(credentials.refreshToken);
        await SecureStore.setItemAsync(REFRESH_KEY, credentials.refreshToken);
      }
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(credentials));
      return credentials.token;
    } catch {
      return null;
    }
  }, [refreshToken]);

  useEffect(() => {
    setRefreshHandler(refreshSession);
    return () => setRefreshHandler(null);
  }, [refreshSession]);

  const fetchData = async () => {
    if (!jwt) return;
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, analyticsRes, appointmentsRes, customersRes, servicesRes, calendarRes] = await Promise.all([
        apiRequest<{ pending: PendingBooking[] }>("/owner/pending", {}, jwt),
        apiRequest<{ analytics: AnalyticsSummary }>("/owner/analytics", {}, jwt),
        apiRequest<{ appointments: Appointment[] }>("/owner/appointments?limit=10&range=upcoming", {}, jwt),
        apiRequest<{ customers: CustomerRecord[]; hasMore?: boolean }>("/owner/customers?limit=25", {}, jwt),
        apiRequest<{ services: ServiceRecord[] }>("/owner/services", {}, jwt),
        apiRequest<{ calendar: OwnerCalendar }>("/owner/calendar", {}, jwt)
      ]);
      setPending(pendingRes.pending || []);
      setAnalytics(analyticsRes.analytics || null);
      setAppointments(appointmentsRes.appointments || []);
      setCustomers(customersRes.customers || []);
      setCustomersHasMore(Boolean(customersRes.hasMore));
      setServices(servicesRes.services || []);
      setCalendar(calendarRes.calendar || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const resetLoginState = () => {
    setOtpSent(false);
    setOtpCode("");
    setOtpTenantKey("");
    setOtpExpiresAt(null);
    setOtpCooldown(0);
    setTenantOptions([]);
    setError(null);
    setAuthNotice(null);
  };

  const mapAuthError = (code: string | undefined, fallback: string) => {
    switch (code) {
      case "RATE_LIMITED":
        return "Too many requests. Please wait and try again.";
      case "PHONE_INVALID":
        return "Enter a valid phone number with country code.";
      case "TENANT_SELECTION_REQUIRED":
        return "Choose your business to continue.";
      case "OWNER_NOT_FOUND":
        return "We couldn't find that phone number. Please register first.";
      case "OWNER_NOT_LINKED":
        return "This phone is not linked to the selected tenant.";
      case "OTP_SEND_FAILED":
        return "We couldn't send the code. Try again shortly.";
      case "OTP_NOT_FOUND":
      case "OTP_EXPIRED":
        return "That code expired. Request a new one.";
      case "OTP_LOCKED":
        return "Too many attempts. Please wait before trying again.";
      case "OTP_USED":
        return "That code was already used. Request a new one.";
      case "OTP_CODE_REQUIRED":
        return "Enter the verification code.";
      case "TENANT_KEY_REQUIRED":
        return "Tenant key is required.";
      case "PHONE_ALREADY_REGISTERED":
        return "This phone is already registered. Try logging in.";
      case "REGISTER_REQUIRED_FIELDS":
        return "Business name, owner name, and phone are required.";
      case "REGISTER_FAILED":
        return "Registration failed. Please try again.";
      default:
        return fallback;
    }
  };

  const resetRegisterState = () => {
    setRegisterBusinessName("");
    setRegisterOwnerName("");
    setRegisterPhone("");
    setRegisterEmail("");
    setRegisterServices([]);
    setError(null);
    setAuthNotice(null);
  };

  const requestOtp = async (targetTenantKey?: string) => {
    const phone = loginPhone.trim();
    const resolvedTenantKey = (targetTenantKey || loginTenantKey || "").trim();
    if (!phone) {
      setError("Phone number is required");
      return;
    }
    if (!phone.startsWith("+")) {
      setError("Include country code (e.g., +1...)");
      return;
    }
    setLoading(true);
    setError(null);
    setAuthNotice(null);
    setTenantOptions([]);
    try {
      const response = await fetch(`${API_BASE}/owner/auth/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          ...(resolvedTenantKey ? { tenantKey: resolvedTenantKey } : {})
        })
      });
      const text = await response.text();
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!response.ok) {
        if (response.status === 409 && data?.tenants) {
          setTenantOptions(data.tenants);
          setError(mapAuthError(data?.error?.code, "Select your business"));
          return;
        }
        const message = typeof data === "string"
          ? data
          : mapAuthError(data?.error?.code, data?.error?.message || response.statusText);
        throw new Error(message);
      }
      setOtpSent(true);
      setOtpTenantKey(data?.tenantKey || resolvedTenantKey);
      setLoginTenantKey(data?.tenantKey || resolvedTenantKey);
      setOtpExpiresAt(data?.expiresAt || null);
      setOtpCode("");
      setOtpCooldown(30);
      setAuthNotice("Code sent. Check your phone.");
      await SecureStore.setItemAsync(PHONE_KEY, phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const phone = loginPhone.trim();
    const tenantKey = otpTenantKey.trim();
    const code = otpCode.trim();
    if (!phone) {
      setError("Phone number is required");
      return;
    }
    if (!tenantKey) {
      setError("Tenant key is required");
      return;
    }
    if (!code) {
      setError("Enter the verification code");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/owner/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, tenantKey, code })
      });
      const text = await response.text();
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!response.ok) {
        const message = typeof data === "string"
          ? data
          : mapAuthError(data?.error?.code, data?.error?.message || response.statusText);
        throw new Error(message);
      }
      const credentials = data as OwnerSession;
      setSession(credentials);
      setJwt(credentials.token);
      if (credentials.refreshToken) {
        setRefreshToken(credentials.refreshToken);
        await SecureStore.setItemAsync(REFRESH_KEY, credentials.refreshToken);
      }
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(credentials));
      resetLoginState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const phone = registerPhone.trim();
    if (!registerBusinessName.trim() || !registerOwnerName.trim() || !phone) {
      setError("Business name, owner name, and phone are required");
      return;
    }
    if (!phone.startsWith("+")) {
      setError("Include country code (e.g., +1...)");
      return;
    }
    setLoading(true);
    setError(null);
    setAuthNotice(null);
    try {
      const services = registerServices
        .filter((svc) => svc.name.trim())
        .map((svc) => {
          const duration = Number(svc.durationMinutes) || 30;
          const price = Number(svc.price) || 0;
          return {
            name: svc.name.trim(),
            minMinutes: duration,
            maxMinutes: duration,
            price,
            currency: svc.currency.trim() || "USD",
            description: ""
          };
        });
      const response = await fetch(`${API_BASE}/owner/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: registerBusinessName.trim(),
          ownerName: registerOwnerName.trim(),
          phone,
          email: registerEmail.trim() || undefined,
          timezone: registerTimezone.trim() || undefined,
          services: services.length ? services : undefined
        })
      });
      const text = await response.text();
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!response.ok) {
        const message = typeof data === "string"
          ? data
          : mapAuthError(data?.error?.code, data?.error?.message || response.statusText);
        throw new Error(message);
      }
      setLoginPhone(phone);
      setLoginTenantKey(data?.tenantKey || "");
      setOtpSent(true);
      setOtpTenantKey(data?.tenantKey || "");
      setOtpExpiresAt(data?.expiresAt || null);
      setOtpCooldown(30);
      await SecureStore.setItemAsync(PHONE_KEY, phone);
      setAuthNotice("Account created. Verify the code we just sent.");
      setRegisterMode(false);
      resetRegisterState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    setSession(null);
    setJwt(null);
    setRefreshToken(null);
    setPending([]);
    setAnalytics(null);
    setAppointments([]);
    setCustomers([]);
    setServices([]);
  };

  const handleResolve = async (customerId: string, action: "approve" | "reject") => {
    if (!jwt) return;
    setActionCustomer(customerId);
    setError(null);
    try {
      await apiRequest(`/owner/pending/${customerId}/${action}`, { method: "POST" }, jwt);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionCustomer(null);
    }
  };

  const priceFormatter = useMemo(() => {
    return (booking: PendingBooking) => {
      if (booking.servicePrice == null) return "";
      const currency = booking.serviceCurrency || "USD";
      return `${currency} ${booking.servicePrice}`;
    };
  }, []);

  const fetchAppointmentsByRange = async (range: "upcoming" | "past" | "all") => {
    if (!jwt) return [];
    const data = await apiRequest<{ appointments: Appointment[] }>(
      `/owner/appointments?limit=50&range=${range}`,
      {},
      jwt
    );
    return data.appointments || [];
  };

  const fetchCustomerDetail = async (customerId: string, options: { limit?: number; offset?: number; range?: string } = {}) => {
    if (!jwt) throw new Error("Not authenticated");
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.offset) params.set("offset", String(options.offset));
    if (options.range) params.set("range", options.range);
    const path = params.size ? `/owner/customers/${customerId}?${params.toString()}` : `/owner/customers/${customerId}`;
    const data = await apiRequest<{ customer: CustomerRecord; appointments: Appointment[]; hasMore?: boolean }>(
      path,
      {},
      jwt
    );
    return data;
  };

  const fetchServicesList = useCallback(async () => {
    if (!jwt) return [];
    const data = await apiRequest<{ services: ServiceRecord[] }>("/owner/services", {}, jwt);
    setServices(data.services || []);
    return data.services || [];
  }, [jwt]);

  const refreshCalendar = useCallback(async () => {
    if (!jwt) return null;
    const data = await apiRequest<{ calendar: OwnerCalendar }>("/owner/calendar", {}, jwt);
    setCalendar(data.calendar || null);
    return data.calendar || null;
  }, [jwt]);

  const saveCalendar = useCallback(
    async (next: OwnerCalendar) => {
      if (!jwt) return null;
      const data = await apiRequest<{ calendar: OwnerCalendar }>(
        "/owner/calendar",
        { method: "PUT", body: JSON.stringify(next) },
        jwt
      );
      setCalendar(data.calendar || null);
      return data.calendar || null;
    },
    [jwt]
  );

  const createBooking = useCallback(
    async (payload: { customerName: string; customerPhone: string; serviceId?: string; startISO: string; endISO: string; notes?: string }) => {
      if (!jwt) return;
      await apiRequest("/owner/appointments/manual", { method: "POST", body: JSON.stringify(payload) }, jwt);
      await fetchData();
    },
    [jwt]
  );

  const openBooking = (start?: Date) => {
    const base = start || new Date();
    const startISO = base.toISOString();
    const end = new Date(base);
    end.setMinutes(end.getMinutes() + 60);
    setBookingStartISO(startISO);
    setBookingEndISO(end.toISOString());
    setBookingServiceId(services[0]?.id);
    const rangeStart = base.toISOString();
    const rangeEndDate = new Date(base);
    rangeEndDate.setDate(rangeEndDate.getDate() + 7);
    setAvailFrom(rangeStart);
    setAvailTo(rangeEndDate.toISOString());
    setAvailSlots([]);
    setBookingVisible(true);
  };

  const handleSaveBooking = async () => {
    if (!bookingStartISO || !bookingEndISO || !bookingPhone) {
      Alert.alert("Missing info", "Please fill start, end, and customer phone.");
      return;
    }
    setBookingSaving(true);
    try {
      await createBooking({
        customerName: bookingName,
        customerPhone: bookingPhone,
        serviceId: bookingServiceId,
        startISO: bookingStartISO,
        endISO: bookingEndISO,
        notes: bookingNotes
      });
      setBookingVisible(false);
      setBookingName("");
      setBookingPhone("");
      setBookingNotes("");
    } catch (err) {
      Alert.alert("Failed", err instanceof Error ? err.message : "Could not save booking");
    } finally {
      setBookingSaving(false);
    }
  };

  const fetchAvailability = useCallback(async () => {
    if (!session?.tenant?.key) return;
    setAvailLoading(true);
    try {
      const params = new URLSearchParams();
      if (bookingServiceId) params.set("serviceId", bookingServiceId);
      if (availFrom) params.set("from", availFrom);
      if (availTo) params.set("to", availTo);
      params.set("limit", "20");
      const data = await apiRequest<{ slots: AvailabilitySlot[] }>(
        `/public/tenants/${session.tenant.key}/availability?${params.toString()}`,
        {},
        undefined
      );
      setAvailSlots(data.slots || []);
    } catch (err) {
      Alert.alert("Availability error", err instanceof Error ? err.message : "Could not load slots");
    } finally {
      setAvailLoading(false);
    }
  }, [availFrom, availTo, bookingServiceId, session?.tenant?.key]);

  const saveService = useCallback(
    async (service: Partial<ServiceRecord>) => {
      if (!jwt) return services;
      if (!service.name) throw new Error("Name is required");
      const payload: Record<string, any> = {
        name: service.name,
        price: Number(service.price) || 0,
        currency: service.currency || "USD",
        minMinutes: Number(service.minMinutes) || 30,
        maxMinutes: Number(service.maxMinutes) || Number(service.minMinutes) || 45,
        description: service.description || ""
      };
      if (service.id) payload.id = service.id;
      const data = await apiRequest<{ services: ServiceRecord[] }>(
        "/owner/services",
        { method: "POST", body: JSON.stringify(payload) },
        jwt
      );
      setServices(data.services || []);
      return data.services || [];
    },
    [jwt, services]
  );

  const deleteService = useCallback(
    async (serviceId: string) => {
      if (!jwt) return services;
      const data = await apiRequest<{ services: ServiceRecord[] }>(`/owner/services/${serviceId}`, { method: "DELETE" }, jwt);
      setServices(data.services || []);
      return data.services || [];
    },
    [jwt, services]
  );

  if (!session || !jwt) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.container}>
          <Text style={styles.title}>Owner login</Text>
          {!otpSent && !registerMode ? (
            <>
              <TextInput
                placeholder="Phone number"
                autoCapitalize="none"
                keyboardType="phone-pad"
                style={styles.input}
                value={loginPhone}
                onChangeText={setLoginPhone}
              />
              <TextInput
                placeholder="Tenant key (optional)"
                autoCapitalize="none"
                style={styles.input}
                value={loginTenantKey}
                onChangeText={setLoginTenantKey}
              />
              {tenantOptions.length > 0 && (
                <View style={styles.tenantPicker}>
                  <Text style={styles.helperText}>Choose your business</Text>
                  {tenantOptions.map((tenant) => (
                    <TouchableOpacity
                      key={tenant.key}
                      style={styles.tenantOption}
                      onPress={() => requestOtp(tenant.key)}
                      disabled={loading}
                    >
                      <Text style={styles.tenantOptionTitle}>{tenant.name}</Text>
                      <Text style={styles.tenantOptionSubtitle}>{tenant.key}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {authNotice && <Text style={styles.notice}>{authNotice}</Text>}
              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity style={styles.primaryButton} onPress={() => requestOtp()} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send code</Text>}
              </TouchableOpacity>
              <Text style={styles.helperText}>We will text you a verification code.</Text>
              <TouchableOpacity style={styles.linkButton} onPress={() => { resetLoginState(); setRegisterMode(true); }} disabled={loading}>
                <Text style={styles.linkButtonText}>Create account</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {!otpSent && registerMode ? (
            <>
              <Text style={styles.sectionTitle}>Create account</Text>
              <TextInput
                placeholder="Business name"
                autoCapitalize="words"
                style={styles.input}
                value={registerBusinessName}
                onChangeText={setRegisterBusinessName}
              />
              <TextInput
                placeholder="Owner name"
                autoCapitalize="words"
                style={styles.input}
                value={registerOwnerName}
                onChangeText={setRegisterOwnerName}
              />
              <TextInput
                placeholder="Phone number"
                autoCapitalize="none"
                keyboardType="phone-pad"
                style={styles.input}
                value={registerPhone}
                onChangeText={setRegisterPhone}
              />
              <TextInput
                placeholder="Email (optional)"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
                value={registerEmail}
                onChangeText={setRegisterEmail}
              />
              <TextInput
                placeholder="Timezone (e.g. America/New_York)"
                autoCapitalize="none"
                style={styles.input}
                value={registerTimezone}
                onChangeText={setRegisterTimezone}
              />
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Services (optional)</Text>
              {registerServices.map((svc, idx) => (
                <View key={`svc-${idx}`} style={styles.card}>
                  <TextInput
                    placeholder="Service name"
                    autoCapitalize="words"
                    style={styles.input}
                    value={svc.name}
                    onChangeText={(value) => {
                      const next = [...registerServices];
                      next[idx] = { ...next[idx], name: value };
                      setRegisterServices(next);
                    }}
                  />
                  <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                      <Text style={styles.formLabel}>Duration (min)</Text>
                      <TextInput
                        placeholder="45"
                        keyboardType="numeric"
                        style={styles.input}
                        value={svc.durationMinutes}
                        onChangeText={(value) => {
                          const next = [...registerServices];
                          next[idx] = { ...next[idx], durationMinutes: value };
                          setRegisterServices(next);
                        }}
                      />
                    </View>
                    <View style={styles.formColumn}>
                      <Text style={styles.formLabel}>Price</Text>
                      <TextInput
                        placeholder="0"
                        keyboardType="numeric"
                        style={styles.input}
                        value={svc.price}
                        onChangeText={(value) => {
                          const next = [...registerServices];
                          next[idx] = { ...next[idx], price: value };
                          setRegisterServices(next);
                        }}
                      />
                    </View>
                  </View>
                  <Text style={styles.formLabel}>Currency</Text>
                  <TextInput
                    placeholder="USD"
                    autoCapitalize="characters"
                    style={styles.input}
                    value={svc.currency}
                    onChangeText={(value) => {
                      const next = [...registerServices];
                      next[idx] = { ...next[idx], currency: value };
                      setRegisterServices(next);
                    }}
                  />
                  <TouchableOpacity
                    style={styles.ghostButtonSmall}
                    onPress={() => {
                      const next = registerServices.filter((_, i) => i !== idx);
                      setRegisterServices(next);
                    }}
                  >
                    <Text style={styles.ghostButtonText}>Remove service</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setRegisterServices((prev) => [...prev, { name: "", durationMinutes: "45", price: "", currency: "USD" }])}
                disabled={loading}
              >
                <Text style={styles.secondaryButtonText}>Add service</Text>
              </TouchableOpacity>
              {authNotice && <Text style={styles.notice}>{authNotice}</Text>}
              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create account</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkButton} onPress={() => { resetRegisterState(); setRegisterMode(false); }} disabled={loading}>
                <Text style={styles.linkButtonText}>Back to login</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {otpSent ? (
            <>
              {authNotice && <Text style={styles.notice}>{authNotice}</Text>}
              <Text style={styles.helperText}>Code sent to {loginPhone}</Text>
              <Text style={styles.helperText}>Tenant: {otpTenantKey}</Text>
              <TextInput
                placeholder="Verification code"
                keyboardType="number-pad"
                style={styles.input}
                value={otpCode}
                onChangeText={setOtpCode}
              />
              {otpExpiresAt && <Text style={styles.helperText}>Code expires soon.</Text>}
              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity style={styles.primaryButton} onPress={handleVerifyOtp} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Verify</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => requestOtp(otpTenantKey)}
                disabled={loading || otpCooldown > 0}
              >
                <Text style={styles.secondaryButtonText}>
                  {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend code"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkButton} onPress={resetLoginState} disabled={loading}>
                <Text style={styles.linkButtonText}>Edit phone</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <OwnerContext.Provider
      value={{
        session,
        jwt,
        analytics,
        pending,
        appointments,
        customers,
        customersHasMore,
        services,
        loading,
        error,
        actionCustomer,
        refresh: fetchData,
        resolveBooking: handleResolve,
        logout: handleLogout,
        priceFormatter,
        fetchAppointmentsByRange,
        fetchCustomers,
        fetchCustomerDetail,
        fetchServices: fetchServicesList,
        saveService,
        deleteService,
        calendar,
        refreshCalendar,
        saveCalendar,
        createBooking,
        openBooking
      }}
    >
      <NavigationContainer>
        <StatusBar style="dark" />
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: {
              height: 70,
              paddingHorizontal: 20,
              paddingBottom: 12,
              paddingTop: 12
            },
            tabBarIcon: ({ focused }) => {
              let icon: "home" | "home-outline" | "calendar" | "calendar-outline" | "people" | "people-outline" | "briefcase" | "briefcase-outline" | "settings" | "settings-outline";
              switch (route.name) {
                case "Home":
                  icon = focused ? "home" : "home-outline";
                  break;
                case "Calendar":
                  icon = focused ? "calendar" : "calendar-outline";
                  break;
                case "Customers":
                  icon = focused ? "people" : "people-outline";
                  break;
                case "Services":
                  icon = focused ? "briefcase" : "briefcase-outline";
                  break;
                case "Settings":
                default:
                  icon = focused ? "settings" : "settings-outline";
                  break;
              }
              return (
                <View style={[styles.tabBadge, focused && styles.tabBadgeActive]}>
                  <Ionicons name={icon} size={22} color={focused ? "#0ea5e9" : "#94a3b8"} />
                </View>
              );
            }
          })}
        >
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Calendar" component={CalendarScreen} />
          <Tab.Screen name="Customers" component={CustomersScreen} />
          <Tab.Screen name="Services" component={ServicesScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
      <Modal transparent visible={bookingVisible} animationType="slide" onRequestClose={() => setBookingVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBookingVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>Add booking</Text>
              <TouchableOpacity onPress={() => setBookingVisible(false)}>
                <Text style={styles.viewSheetClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.formLabel}>Customer name</Text>
              <TextInput style={styles.input} value={bookingName} onChangeText={setBookingName} placeholder="Customer name" />
              <Text style={styles.formLabel}>Customer phone</Text>
              <TextInput
                style={styles.input}
                value={bookingPhone}
                onChangeText={setBookingPhone}
                placeholder="Phone (used as customer id)"
              />
              <Text style={styles.formLabel}>Service</Text>
              <View style={styles.pillGroup}>
                {services.map((svc) => (
                  <TouchableOpacity
                    key={svc.id}
                    style={[styles.pillButton, bookingServiceId === svc.id && styles.pillButtonActive]}
                    onPress={() => setBookingServiceId(svc.id)}
                  >
                    <Text style={[styles.pillLabel, bookingServiceId === svc.id && styles.pillLabelActive]}>{svc.name}</Text>
                  </TouchableOpacity>
                ))}
                {services.length === 0 && <Text style={styles.muted}>No services loaded.</Text>}
              </View>
              <Text style={styles.formLabel}>Start (ISO)</Text>
              <TextInput
                style={styles.input}
                value={bookingStartISO}
                onChangeText={setBookingStartISO}
                placeholder="2025-01-01T09:00:00Z"
              />
              <Text style={styles.formLabel}>End (ISO)</Text>
              <TextInput
                style={styles.input}
                value={bookingEndISO}
                onChangeText={setBookingEndISO}
                placeholder="2025-01-01T10:00:00Z"
              />
              <View style={styles.divider} />
              <Text style={styles.settingsSubtitle}>Find availability</Text>
              <Text style={styles.formLabel}>From</Text>
              <TouchableOpacity style={styles.input} onPress={() => setAvailPicker("from")}>
                <Text style={styles.pillLabel}>{new Date(availFrom).toDateString()}</Text>
              </TouchableOpacity>
              <Text style={styles.formLabel}>To</Text>
              <TouchableOpacity style={styles.input} onPress={() => setAvailPicker("to")}>
                <Text style={styles.pillLabel}>{new Date(availTo).toDateString()}</Text>
              </TouchableOpacity>
              {availPicker && (
                <View style={styles.calendarWrapper}>
                  <MonthCalendar
                    current={availPicker === "from" ? availFrom.slice(0, 10) : availTo.slice(0, 10)}
                    onDayPress={(day) => {
                      const base = new Date(day.dateString);
                      base.setHours(0, 0, 0, 0);
                      const iso = base.toISOString();
                      if (availPicker === "from") {
                        setAvailFrom(iso);
                      } else {
                        setAvailTo(iso);
                      }
                      setAvailPicker(null);
                    }}
                    markedDates={{}}
                    firstDay={0}
                    hideExtraDays
                  />
                </View>
              )}
              <TouchableOpacity style={[styles.primaryButton, { marginTop: 10 }]} onPress={fetchAvailability} disabled={availLoading}>
                {availLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Find slots</Text>}
              </TouchableOpacity>
              <View style={styles.pillGroup}>
                {availSlots.map((slot) => (
                  <TouchableOpacity
                    key={slot.startISO}
                    style={[
                      styles.pillButton,
                      bookingStartISO === slot.startISO && bookingEndISO === slot.endISO && styles.pillButtonActive
                    ]}
                    onPress={() => {
                      setBookingStartISO(slot.startISO);
                      setBookingEndISO(slot.endISO);
                    }}
                  >
                    <Text
                      style={[
                        styles.pillLabel,
                        bookingStartISO === slot.startISO && bookingEndISO === slot.endISO && styles.pillLabelActive
                      ]}
                    >
                      {slot.buttonLabel || slot.displayLabel}
                    </Text>
                  </TouchableOpacity>
                ))}
                {!availSlots.length && !availLoading && <Text style={styles.muted}>No slots yet. Adjust range and search.</Text>}
              </View>
              <Text style={styles.formLabel}>Notes</Text>
              <TextInput style={[styles.input, styles.textArea]} multiline value={bookingNotes} onChangeText={setBookingNotes} />

              <TouchableOpacity style={[styles.primaryButton, { marginTop: 16 }]} onPress={handleSaveBooking} disabled={bookingSaving}>
                {bookingSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save booking</Text>}
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </OwnerContext.Provider>
  );
}

function HomeScreen() {
  const { session, analytics, pending, appointments, loading, error, actionCustomer, refresh, resolveBooking, priceFormatter, logout, openBooking } =
    useOwner();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#0ea5e9" />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Managing</Text>
            <Text style={styles.title}>{session.tenant.name}</Text>
          </View>
          <TouchableOpacity style={styles.ghostButton} onPress={logout}>
            <Text style={styles.ghostButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Analytics</Text>
          {analytics ? (
            <View style={styles.analyticsGrid}>
              <AnalyticsCard label="Total bookings" value={analytics.totalAppointments} />
              <AnalyticsCard label="Last 30 days" value={analytics.last30Appointments} />
              <AnalyticsCard label="Upcoming" value={analytics.upcomingBookings} />
              <AnalyticsCard label="Projected revenue" value={`$${analytics.projectedRevenue.toFixed(2)}`} />
            </View>
          ) : (
            <Text style={styles.muted}>No analytics yet</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Pending approvals</Text>
            <TouchableOpacity style={styles.ghostButtonSmall} onPress={refresh}>
              <Text style={styles.ghostButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
          {loading && !pending.length ? <ActivityIndicator color="#0ea5e9" /> : null}
          {!pending.length && !loading ? <Text style={styles.muted}>No pending bookings right now.</Text> : null}
          <FlatList
            data={pending}
            keyExtractor={(item) => item.customerId}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.serviceName || "Service"}</Text>
                {item.slotLabel && <Text style={styles.cardSubtitle}>{item.slotLabel}</Text>}
                {priceFormatter(item) ? <Text style={styles.cardPrice}>{priceFormatter(item)}</Text> : null}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.approve]}
                    onPress={() => resolveBooking(item.customerId, "approve")}
                    disabled={actionCustomer === item.customerId}
                  >
                    <Text style={styles.actionButtonText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.reject]}
                    onPress={() => resolveBooking(item.customerId, "reject")}
                    disabled={actionCustomer === item.customerId}
                  >
                    <Text style={styles.actionButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming appointments</Text>
          {!appointments.length ? (
            <Text style={styles.muted}>No upcoming appointments scheduled.</Text>
          ) : (
            appointments.map((appt) => (
              <View key={appt.id} style={styles.card}>
                <Text style={styles.cardTitle}>{appt.service_name || "Service"}</Text>
                <Text style={styles.cardSubtitle}>{appt.slot_label || appt.start_iso || "Scheduled"}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => openBooking()}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Booking</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function CalendarScreen() {
  const { fetchAppointmentsByRange, pending, openBooking } = useOwner();
  const [view, setView] = useState<"day" | "week" | "month">("month");
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const parseDateString = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString(new Date()));
  const [viewPickerVisible, setViewPickerVisible] = useState(false);

  const loadAppointments = useCallback(async (showSpinner = true) => {
    if (!fetchAppointmentsByRange) return;
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const data = await fetchAppointmentsByRange("all");
      setItems(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [fetchAppointmentsByRange]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const startOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay(); // 0 (Sun) - 6 (Sat)
    const diff = d.getDate() - day; // start Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const endOfWeek = (date: Date) => {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  const normalizeEnd = (start: Date, end?: Date) => {
    if (end && !Number.isNaN(end.getTime())) return end;
    const fallback = new Date(start);
    fallback.setMinutes(fallback.getMinutes() + 45);
    return fallback;
  };

  type CalendarEventType = {
    id: string;
    title: string;
    start: Date;
    end: Date;
    slot?: string;
    type: "appointment" | "pending";
  };

  const timelineEvents: CalendarEventType[] = useMemo(() => {
    const parsed: CalendarEventType[] = [];
    items.forEach((appt) => {
      if (!appt.start_iso) return;
      const start = new Date(appt.start_iso);
      if (Number.isNaN(start.getTime())) return;
      parsed.push({
        id: `appt-${appt.id}`,
        title: appt.service_name || "Appointment",
        start,
        end: normalizeEnd(start),
        slot: appt.slot_label,
        type: "appointment"
      });
    });
    pending.forEach((req) => {
      const iso = (req as { startISO?: string }).startISO;
      if (!iso) return;
      const start = new Date(iso);
      if (Number.isNaN(start.getTime())) return;
      parsed.push({
        id: `pending-${req.customerId}-${iso}`,
        title: req.serviceName || "Pending request",
        start,
        end: normalizeEnd(start),
        slot: req.slotLabel,
        type: "pending"
      });
    });
    return parsed;
  }, [items, pending]);

  const marks = useMemo(() => {
    const dots: Record<string, { dots: { color: string }[]; marked?: boolean }> = {};
    timelineEvents.forEach((evt) => {
      const key = toLocalDateString(evt.start);
      if (!dots[key]) dots[key] = { dots: [] };
      const color = evt.type === "pending" ? "#f87171" : "#0ea5e9";
      dots[key].dots.push({ color });
      dots[key].marked = true;
    });
    return dots;
  }, [timelineEvents]);

  const timelineDate = useMemo(() => {
    const base = parseDateString(selectedDate);
    if (view === "week") return startOfWeek(base);
    return base;
  }, [selectedDate, view]);

  const label = useMemo(() => {
    if (view === "day") {
      return timelineDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    }
    if (view === "week") {
      const start = timelineDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const end = endOfWeek(timelineDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `${start} – ${end}`;
    }
    return timelineDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [selectedDate, timelineDate, view]);

  const formatTime = (date: Date) => date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const handleDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
  };

  const goToPreviousRange = () => {
    const base = timelineDate;
    const date = new Date(base);
    if (view === "month") {
      date.setMonth(date.getMonth() - 1);
    } else if (view === "week") {
      date.setDate(date.getDate() - 7);
    } else {
      date.setDate(date.getDate() - 1);
    }
    setSelectedDate(toLocalDateString(date));
  };

  const goToNextRange = () => {
    const base = timelineDate;
    const date = new Date(base);
    if (view === "month") {
      date.setMonth(date.getMonth() + 1);
    } else if (view === "week") {
      date.setDate(date.getDate() + 7);
    } else {
      date.setDate(date.getDate() + 1);
    }
    setSelectedDate(toLocalDateString(date));
  };

  const weekDays = useMemo(() => {
    const start = startOfWeek(timelineDate);
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [timelineDate]);

  const eventsForSelectedDate = useMemo(() => {
    return timelineEvents
      .filter((evt) => toLocalDateString(evt.start) === selectedDate)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [timelineEvents, selectedDate]);

  const eventsByWeekDay = useMemo(() => {
    const map: Record<string, CalendarEventType[]> = {};
    weekDays.forEach((d) => {
      const key = toLocalDateString(d);
      map[key] = [];
    });
    timelineEvents.forEach((evt) => {
      const key = toLocalDateString(new Date(evt.start));
      if (map[key]) {
        map[key].push(evt);
      }
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => a.start.getTime() - b.start.getTime());
    });
    return map;
  }, [timelineEvents, weekDays]);

  const weekHours = useMemo(() => Array.from({ length: 24 }).map((_, i) => i), []);

  useEffect(() => {
    // keep selected date normalized when view switches
    if (view === "week") {
      setSelectedDate(toLocalDateString(startOfWeek(parseDateString(selectedDate))));
    }
  }, [selectedDate, view]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.section, styles.calendarScreen]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadAppointments(false);
              setRefreshing(false);
            }}
            tintColor="#0ea5e9"
          />
        }
      >
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Calendar</Text>
          <Text style={styles.timezoneChip}>Local time</Text>
        </View>
        <View style={styles.calendarToolbar}>
          <View style={styles.calendarNav}>
            {view !== "month" ? (
              <TouchableOpacity style={styles.ghostButtonSmall} onPress={goToPreviousRange}>
                <Text style={styles.ghostButtonText}>←</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 44 }} />
            )}
            <TouchableOpacity style={styles.viewPicker} onPress={() => setViewPickerVisible(true)}>
              <Text style={styles.calendarLabel}>{label}</Text>
              <Text style={styles.viewPickerText}>{view.toUpperCase()}</Text>
            </TouchableOpacity>
            {view !== "month" ? (
              <TouchableOpacity style={styles.ghostButtonSmall} onPress={goToNextRange}>
                <Text style={styles.ghostButtonText}>→</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 44 }} />
            )}
          </View>
        </View>

        {loading && !timelineEvents.length ? <ActivityIndicator color="#0ea5e9" /> : null}
        {error && <Text style={styles.error}>{error}</Text>}
        {!loading && !timelineEvents.length ? <Text style={styles.muted}>No events in this view.</Text> : null}

        {view === "month" ? (
          <View style={styles.calendarWrapper}>
            <MonthCalendar
              current={selectedDate}
              onDayPress={(day) => {
                handleDayPress(day);
                setView("day");
              }}
              onMonthChange={(month) => {
                const next = new Date(month.year, month.month - 1, 1);
                setSelectedDate(toLocalDateString(next));
              }}
              markedDates={{
                ...marks,
                [selectedDate]: { ...(marks[selectedDate] || {}), selected: true, selectedColor: "#0ea5e9", selectedTextColor: "#fff" }
              }}
              markingType="multi-dot"
              firstDay={1}
              hideExtraDays={false}
              renderArrow={(direction) => <Text style={styles.calendarArrow}>{direction === "left" ? "←" : "→"}</Text>}
              theme={{
                todayTextColor: "#0ea5e9",
                selectedDayBackgroundColor: "#0ea5e9",
                selectedDayTextColor: "#fff",
                arrowColor: "#0ea5e9",
                dotColor: "#0ea5e9"
              }}
            />
          </View>
        ) : (
          <CalendarProvider date={selectedDate}>
            <View style={[styles.calendarWrapper, styles.weekCalendarContainer]}>
              <WeekCalendar
                key={`week-${selectedDate}`}
                current={selectedDate}
                onDayPress={(day) => {
                  setSelectedDate(day.dateString);
                  setView("day");
                }}
                firstDay={0}
                style={styles.weekCalendar}
                markedDates={{
                  ...marks,
                  [selectedDate]: { ...(marks[selectedDate] || {}), selected: true, selectedColor: "#0ea5e9", selectedTextColor: "#fff" }
                }}
                allowShadow={false}
                style={{ borderBottomWidth: 0 }}
              />
            </View>
            {view === "day" ? (
              <View style={[styles.calendarWrapper, styles.weekGrid]}>
                <View style={styles.dayGridHeader}>
                  <Text style={styles.sectionSubtitle}>
                    {new Date(selectedDate).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                  </Text>
                </View>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.weekGridScrollContent}
                >
                  {weekHours.map((hour) => {
                    const hourEvents = eventsForSelectedDate.filter((evt) => new Date(evt.start).getHours() === hour);
                    return (
                      <View key={hour} style={styles.weekRow}>
                        <View style={styles.weekTimeCol}>
                          <Text style={styles.weekTimeText}>{`${hour.toString().padStart(2, "0")}:00`}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.dayCell}
                          activeOpacity={0.7}
                            onPress={() => openBooking(new Date(`${selectedDate}T${hour.toString().padStart(2, "0")}:00:00`))}
                        >
                          {hourEvents.length === 0 ? null : (
                            hourEvents.map((event) => (
                              <View
                                key={event.id}
                                style={[
                                  styles.weekEvent,
                                  { marginVertical: 2 },
                                  event.type === "pending"
                                    ? { borderColor: "#f87171", backgroundColor: "rgba(248,113,113,0.12)" }
                                    : { borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,0.12)" }
                                ]}
                              >
                                <Text style={[styles.calendarEventTitle, { fontSize: 12 }]} numberOfLines={1} ellipsizeMode="tail">
                                  {event.title}
                                </Text>
                                <Text style={[styles.calendarEventMeta, { fontSize: 11 }]} numberOfLines={1} ellipsizeMode="tail">
                                  {formatTime(new Date(event.start))} – {formatTime(new Date(event.end))} {event.slot ? `· ${event.slot}` : ""}
                                </Text>
                              </View>
                            ))
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <View style={[styles.calendarWrapper, styles.weekGrid]}>
                <View style={styles.weekGridHeader}>
                  <View style={styles.weekTimeCol} />
                  {weekDays.map((d) => (
                    <View key={d.toISOString()} style={styles.weekDayColHeader}>
                      <Text style={styles.weekDayName}>{d.toLocaleDateString(undefined, { weekday: "short" })}</Text>
                      <Text style={styles.weekDayDate}>{d.getDate()}</Text>
                    </View>
                  ))}
                </View>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.weekGridScrollContent}
                >
                  {weekHours.map((hour) => (
                    <View key={hour} style={styles.weekRow}>
                      <View style={styles.weekTimeCol}>
                        <Text style={styles.weekTimeText}>{`${hour.toString().padStart(2, "0")}:00`}</Text>
                      </View>
                      {weekDays.map((d, idx) => {
                        const key = toLocalDateString(d);
                        const events = eventsByWeekDay[key] || [];
                        const hourEvents = events.filter((evt) => new Date(evt.start).getHours() === hour);
                        return (
                          <TouchableOpacity
                            key={key + hour}
                            style={[styles.weekCell, idx < weekDays.length - 1 && styles.weekCellDivider]}
                            activeOpacity={0.7}
                            onPress={() => openBooking(new Date(`${key}T${hour.toString().padStart(2, "0")}:00:00`))}
                          >
                            {hourEvents.map((event) => (
                              <View
                                key={event.id}
                                style={[
                                  styles.weekEvent,
                                  event.type === "pending"
                                    ? { borderColor: "#f87171", backgroundColor: "rgba(248,113,113,0.12)" }
                                    : { borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,0.12)" }
                                ]}
                              >
                                <Text style={[styles.calendarEventTitle, { fontSize: 12 }]} numberOfLines={1} ellipsizeMode="tail">
                                  {event.title}
                                </Text>
                                <Text style={[styles.calendarEventMeta, { fontSize: 11 }]} numberOfLines={1} ellipsizeMode="tail">
                                  {formatTime(new Date(event.start))} – {formatTime(new Date(event.end))}
                                </Text>
                              </View>
                            ))}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </CalendarProvider>
        )}
        <Modal transparent visible={viewPickerVisible} animationType="fade" onRequestClose={() => setViewPickerVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setViewPickerVisible(false)}>
            <View style={styles.viewSheet}>
              <View style={styles.viewSheetHeader}>
                <Text style={styles.viewSheetTitle}>Choose view</Text>
                <TouchableOpacity onPress={() => setViewPickerVisible(false)}>
                  <Text style={styles.viewSheetClose}>Close</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.viewSheetSubtitle}>Jump between day, week, or month layouts.</Text>
              {([
                { mode: "day", label: "Day view", hint: "Focus on a single day" },
                { mode: "week", label: "Week view", hint: "See the full week timeline" },
                { mode: "month", label: "Month view", hint: "Overview for the month" }
              ] as const).map(({ mode, label, hint }) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.viewOptionRow, view === mode && styles.viewOptionRowSelected]}
                  onPress={() => {
                    setView(mode);
                    setViewPickerVisible(false);
                  }}
                  activeOpacity={0.9}
                >
                  <View style={styles.viewOptionCopy}>
                    <Text style={[styles.viewOptionText, view === mode && styles.viewOptionTextSelected]}>{label}</Text>
                    <Text style={styles.viewOptionHint}>{hint}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => openBooking()}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Booking</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function CustomersScreen() {
  const { customers, customersHasMore, fetchCustomers, fetchCustomerDetail, openBooking } = useOwner();
  const HISTORY_PAGE_SIZE = 10;
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CustomerRecord[]>(customers);
  const [hasMore, setHasMore] = useState(customersHasMore);
  const [offset, setOffset] = useState(customers.length);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<CustomerRecord | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRange, setHistoryRange] = useState<"30d" | "90d" | "all">("30d");
  const [historyItems, setHistoryItems] = useState<Appointment[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    setItems(customers);
    setHasMore(customersHasMore);
    setOffset(customers.length);
  }, [customers, customersHasMore]);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const { customers: list, hasMore: nextMore } = await fetchCustomers(query.trim(), 0);
      setItems(list);
      setHasMore(nextMore);
      setOffset(list.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search customers");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { customers: list, hasMore: nextMore } = await fetchCustomers(query.trim(), offset);
      setItems((prev) => [...prev, ...list]);
      setHasMore(nextMore);
      setOffset((prev) => prev + list.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const openDetail = async (customerId: string) => {
    setDetailVisible(true);
    setDetailLoading(true);
    setHistoryOpen(false);
    setHistoryRange("30d");
    setHistoryItems([]);
    setHistoryHasMore(false);
    setSelectedCustomerId(customerId);
    try {
      const data = await fetchCustomerDetail(customerId, { limit: HISTORY_PAGE_SIZE, range: "30d" });
      setDetailCustomer(data.customer);
      setHistoryItems(data.appointments || []);
      setHistoryHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshHistory = async (rangeValue: "30d" | "90d" | "all") => {
    if (!selectedCustomerId) return;
    setHistoryLoading(true);
    try {
      const data = await fetchCustomerDetail(selectedCustomerId, { limit: HISTORY_PAGE_SIZE, offset: 0, range: rangeValue });
      setDetailCustomer(data.customer);
      setHistoryItems(data.appointments || []);
      setHistoryHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadMoreHistory = async () => {
    if (!selectedCustomerId) return;
    setHistoryLoading(true);
    try {
      const data = await fetchCustomerDetail(selectedCustomerId, {
        limit: HISTORY_PAGE_SIZE,
        offset: historyItems.length,
        range: historyRange
      });
      setDetailCustomer(data.customer);
      setHistoryItems((prev) => [...prev, ...(data.appointments || [])]);
      setHistoryHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRangeChange = async (rangeValue: "30d" | "90d" | "all") => {
    setHistoryRange(rangeValue);
    setHistoryItems([]);
    await refreshHistory(rangeValue);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customers</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#94a3b8" />
          <TextInput
            placeholder="Search name or phone"
            style={[styles.input, styles.searchInput, styles.searchBareInput]}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            blurOnSubmit
          />
        </View>
        {loading && <ActivityIndicator color="#0ea5e9" />}
        {error && <Text style={styles.error}>{error}</Text>}
        <FlatList
          data={items}
          keyExtractor={(customer) => customer.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => openDetail(item.id)} style={styles.card}>
              <Text style={styles.cardTitle}>{item.displayName || item.id}</Text>
              {item.phone && <Text style={styles.cardSubtitle}>{item.phone}</Text>}
              <Text style={styles.cardSubtitle}>
                Bookings: {item.appointmentCount ?? 0} · Last:{" "}
                {item.lastBooking ? new Date(item.lastBooking).toLocaleString() : "N/A"}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={!loading ? <Text style={styles.muted}>No customers found.</Text> : null}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#0ea5e9" /> : null}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.6}
        />
      </View>
      <Modal visible={detailVisible} animationType="slide" onRequestClose={() => setDetailVisible(false)} transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>Customer details</Text>
              <TouchableOpacity onPress={() => setDetailVisible(false)}>
                <Text style={styles.ghostButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {detailLoading && <ActivityIndicator color="#0ea5e9" />}
              {!detailLoading && detailCustomer && (
                <View style={{ gap: 8 }}>
                  <Text style={styles.cardTitle}>{detailCustomer.displayName || detailCustomer.id}</Text>
                  {detailCustomer.phone && <Text style={styles.cardSubtitle}>{detailCustomer.phone}</Text>}
                  {detailCustomer.email && <Text style={styles.cardSubtitle}>{detailCustomer.email}</Text>}
                  <Text style={styles.cardSubtitle}>
                    Bookings: {detailCustomer.appointmentCount ?? 0} · Last:{" "}
                    {detailCustomer.lastBooking ? new Date(detailCustomer.lastBooking).toLocaleString() : "N/A"}
                  </Text>
                  <TouchableOpacity
                    style={[styles.primaryButton, styles.historyButton]}
                    onPress={() => setHistoryOpen((prev) => !prev)}
                  >
                    <Text style={styles.primaryButtonText}>{historyOpen ? "Hide history" : "Booking history"}</Text>
                  </TouchableOpacity>
                  {historyOpen && (
                    <View style={{ gap: 8 }}>
                      <View style={styles.pillGroup}>
                        {(["30d", "90d", "all"] as const).map((rangeValue) => (
                          <TouchableOpacity
                            key={rangeValue}
                            style={[styles.pillButton, historyRange === rangeValue && styles.pillButtonActive]}
                            onPress={() => handleRangeChange(rangeValue)}
                          >
                            <Text style={[styles.pillLabel, historyRange === rangeValue && styles.pillLabelActive]}>
                              {rangeValue === "30d" ? "30 days" : rangeValue === "90d" ? "90 days" : "All"}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {historyLoading && <ActivityIndicator color="#0ea5e9" />}
                      {!historyLoading && historyItems.length === 0 && <Text style={styles.muted}>No bookings yet.</Text>}
                      {historyItems.map((appt) => (
                        <View key={appt.id} style={styles.historyItem}>
                          <Text style={styles.cardTitle}>{appt.service_name || "Service"}</Text>
                          <Text style={styles.cardSubtitle}>{appt.slot_label || appt.start_iso || "Scheduled"}</Text>
                        </View>
                      ))}
                      {historyHasMore && (
                        <TouchableOpacity style={styles.ghostButton} onPress={loadMoreHistory} disabled={historyLoading}>
                          <Text style={styles.ghostButtonText}>Load more</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <TouchableOpacity style={styles.fab} onPress={() => openBooking()}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Booking</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function ServicesScreen() {
  const { services, fetchServices, saveService, deleteService, openBooking } = useOwner();
  const { control, handleSubmit, reset } = useForm<ServiceRecord>({ defaultValues: EMPTY_SERVICE });
  const [modalVisible, setModalVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const openModal = (service?: ServiceRecord) => {
    reset(service || EMPTY_SERVICE);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    reset(EMPTY_SERVICE);
  };

  const onSubmit = handleSubmit(async (values) => {
    setBusy(true);
    try {
      await saveService(values);
      closeModal();
      await fetchServices();
    } catch (err) {
      Alert.alert("Save failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  });

  const handleDelete = async (serviceId: string) => {
    Alert.alert("Delete service", "Are you sure you want to delete this service?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteService(serviceId);
            await fetchServices();
          } catch (err) {
            Alert.alert("Delete failed", err instanceof Error ? err.message : "Unknown error");
          }
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.section, styles.serviceContent]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await fetchServices();
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor="#0ea5e9"
          />
        }
      >
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Service catalog</Text>
          <TouchableOpacity style={styles.ghostButtonSmall} onPress={() => openModal()} disabled={busy}>
            <Text style={styles.ghostButtonText}>Add service</Text>
          </TouchableOpacity>
        </View>
        {!services.length && <Text style={styles.muted}>No services configured.</Text>}
        {services.map((service) => (
          <View key={service.id} style={styles.card}>
            <Text style={styles.cardTitle}>{service.name}</Text>
            <Text style={styles.cardSubtitle}>
              {(service.currency || "USD")} {service.price ?? 0} ·{" "}
              {(service.minMinutes || service.maxMinutes) ? `${service.minMinutes}-${service.maxMinutes} min` : "Custom duration"}
            </Text>
            {service.description ? <Text style={styles.cardSubtitle}>{service.description}</Text> : null}
            <View style={styles.cardActions}>
              <TouchableOpacity style={[styles.actionButton, styles.primaryAction]} onPress={() => openModal(service)}>
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.reject]} onPress={() => handleDelete(service.id)}>
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => openBooking()}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Booking</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)} transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>Service</Text>
              <TouchableOpacity onPress={closeModal}>
                <Text style={styles.ghostButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.formLabel}>Name</Text>
              <Controller
                control={control}
                name="name"
                rules={{ required: "Name is required" }}
                render={({ field: { onChange, value } }) => (
                  <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder="Service name" />
                )}
              />
              <Text style={styles.formLabel}>Price</Text>
              <Controller
                control={control}
                name="price"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(value ?? "")}
                    onChangeText={(text) => onChange(Number(text))}
                    placeholder="Price"
                  />
                )}
              />
              <Text style={styles.formLabel}>Currency</Text>
              <Controller
                control={control}
                name="currency"
                render={({ field: { onChange, value } }) => (
                  <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder="Currency (e.g., USD)" />
                )}
              />
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Min minutes</Text>
                  <Controller
                    control={control}
                    name="minMinutes"
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(value ?? "")}
                        onChangeText={(text) => onChange(Number(text))}
                        placeholder="30"
                      />
                    )}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Max minutes</Text>
                  <Controller
                    control={control}
                    name="maxMinutes"
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(value ?? "")}
                        onChangeText={(text) => onChange(Number(text))}
                        placeholder="45"
                      />
                    )}
                  />
                </View>
              </View>
              <Text style={styles.formLabel}>Description</Text>
              <Controller
                control={control}
                name="description"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    multiline
                    value={value || ""}
                    onChangeText={onChange}
                    placeholder="Description"
                  />
                )}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={onSubmit} disabled={busy}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const defaultCalendar = (): OwnerCalendar => ({
  timezone: "UTC",
  capacity: 1,
  lookaheadDays: 30,
  rules: [],
  blocks: []
});

function SettingsScreen() {
  const { session, calendar, refreshCalendar, saveCalendar, logout } = useOwner();
  const [draft, setDraft] = useState<OwnerCalendar>(calendar || defaultCalendar());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(calendar || defaultCalendar());
  }, [calendar]);

  useEffect(() => {
    if (!calendar) {
      (async () => {
        setLoading(true);
        try {
          await refreshCalendar();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load calendar");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [calendar, refreshCalendar]);

  const updateField = (field: keyof OwnerCalendar, value: any) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updateRule = (idx: number, patch: Partial<CalendarRule>) => {
    setDraft((prev) => {
      const rules = prev.rules.slice();
      rules[idx] = { ...rules[idx], ...patch };
      return { ...prev, rules };
    });
  };

  const addRule = () =>
    setDraft((prev) => ({
      ...prev,
      rules: [...prev.rules, { dayOfWeek: 1, start: "09:00", end: "17:00", capacity: null }]
    }));

  const removeRule = (idx: number) =>
    setDraft((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== idx)
    }));

  const addBlock = () =>
    setDraft((prev) => ({
      ...prev,
      blocks: [...prev.blocks, { startISO: "", endISO: "", reason: "" }]
    }));

  const updateBlock = (idx: number, patch: Partial<CalendarBlock>) => {
    setDraft((prev) => {
      const blocks = prev.blocks.slice();
      blocks[idx] = { ...blocks[idx], ...patch };
      return { ...prev, blocks };
    });
  };

  const removeBlock = (idx: number) =>
    setDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((_, i) => i !== idx)
    }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveCalendar({
        ...draft,
        capacity: Number(draft.capacity) || 1,
        lookaheadDays: Number(draft.lookaheadDays) || 30,
        rules: draft.rules.map((r) => ({
          dayOfWeek: Number(r.dayOfWeek) || 0,
          start: r.start,
          end: r.end,
          capacity: r.capacity == null || r.capacity === "" ? null : Number(r.capacity)
        })),
        blocks: draft.blocks.filter((b) => b.startISO && b.endISO)
      });
      Alert.alert("Saved", "Calendar settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.section, styles.settingsContainer]}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <Text style={styles.muted}>Manage calendar and account.</Text>

        <View style={styles.settingsCard}>
          <View style={styles.settingsHeaderRow}>
            <Text style={styles.settingsTitle}>Calendar settings</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving || loading}>
              {saving ? <ActivityIndicator /> : <Text style={styles.settingsSave}>Save</Text>}
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color="#0ea5e9" /> : null}
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.settingsRow}>
            <Text style={styles.formLabel}>Timezone</Text>
            <TextInput
              style={styles.input}
              value={draft.timezone}
              onChangeText={(t) => updateField("timezone", t)}
              placeholder="e.g. America/New_York"
            />
          </View>
          <View style={styles.settingsRow}>
            <Text style={styles.formLabel}>Lookahead days</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(draft.lookaheadDays)}
              onChangeText={(t) => updateField("lookaheadDays", Number(t) || 0)}
            />
          </View>
          <View style={styles.settingsRow}>
            <Text style={styles.formLabel}>Max concurrent services</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(draft.capacity)}
              onChangeText={(t) => updateField("capacity", Number(t) || 1)}
            />
          </View>

          <View style={styles.divider} />
          <View style={styles.settingsHeaderRow}>
            <Text style={styles.settingsSubtitle}>Weekly working hours</Text>
            <TouchableOpacity onPress={addRule}>
              <Text style={styles.settingsAdd}>Add</Text>
            </TouchableOpacity>
          </View>
          {draft.rules.length === 0 && <Text style={styles.muted}>No working hours yet.</Text>}
          {draft.rules.map((rule, idx) => (
            <View key={`rule-${idx}`} style={styles.ruleCard}>
              <View style={styles.ruleRow}>
                <Text style={styles.formLabel}>Day</Text>
                <TouchableOpacity
                  style={styles.dayChip}
                  onPress={() => updateRule(idx, { dayOfWeek: (rule.dayOfWeek + 1) % 7 })}
                >
                  <Text style={styles.dayChipText}>{dayLabels[rule.dayOfWeek % 7]}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.ruleRow}>
                <Text style={styles.formLabel}>Start</Text>
                <TextInput
                  style={[styles.input, styles.ruleInput]}
                  value={rule.start}
                  onChangeText={(t) => updateRule(idx, { start: t })}
                  placeholder="09:00"
                />
              </View>
              <View style={styles.ruleRow}>
                <Text style={styles.formLabel}>End</Text>
                <TextInput
                  style={[styles.input, styles.ruleInput]}
                  value={rule.end}
                  onChangeText={(t) => updateRule(idx, { end: t })}
                  placeholder="17:00"
                />
              </View>
              <View style={styles.ruleRow}>
                <Text style={styles.formLabel}>Capacity</Text>
                <TextInput
                  style={[styles.input, styles.ruleInput]}
                  keyboardType="numeric"
                  value={rule.capacity == null ? "" : String(rule.capacity)}
                  onChangeText={(t) => updateRule(idx, { capacity: t === "" ? null : Number(t) || 1 })}
                  placeholder="Optional"
                />
              </View>
              <TouchableOpacity onPress={() => removeRule(idx)}>
                <Text style={styles.settingsRemove}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.divider} />
          <View style={styles.settingsHeaderRow}>
            <Text style={styles.settingsSubtitle}>Blocked times</Text>
            <TouchableOpacity onPress={addBlock}>
              <Text style={styles.settingsAdd}>Add</Text>
            </TouchableOpacity>
          </View>
          {draft.blocks.length === 0 && <Text style={styles.muted}>No blocked times.</Text>}
          {draft.blocks.map((block, idx) => (
            <View key={`block-${idx}`} style={styles.ruleCard}>
              <Text style={styles.formLabel}>Start (ISO)</Text>
              <TextInput
                style={styles.input}
                value={block.startISO}
                onChangeText={(t) => updateBlock(idx, { startISO: t })}
                placeholder="2025-01-01T09:00:00Z"
              />
              <Text style={styles.formLabel}>End (ISO)</Text>
              <TextInput
                style={styles.input}
                value={block.endISO}
                onChangeText={(t) => updateBlock(idx, { endISO: t })}
                placeholder="2025-01-01T12:00:00Z"
              />
              <Text style={styles.formLabel}>Reason</Text>
              <TextInput
                style={styles.input}
                value={block.reason || ""}
                onChangeText={(t) => updateBlock(idx, { reason: t })}
                placeholder="Optional"
              />
              <TouchableOpacity onPress={() => removeBlock(idx)}>
                <Text style={styles.settingsRemove}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>Account</Text>
          <Text style={styles.muted}>{session?.tenant?.name || "Tenant"} · {session?.tenant?.key || ""}</Text>
          <TouchableOpacity style={[styles.primaryButton, { marginTop: 12 }]} onPress={logout}>
            <Text style={styles.primaryButtonText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AnalyticsCard({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.analyticsCard}>
      <Text style={styles.analyticsValue}>{value}</Text>
      <Text style={styles.analyticsLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f5f7fb"
  },
  scroll: {
    flex: 1
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 12
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#0f172a"
  },
  eyebrow: {
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontSize: 12
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 14,
    backgroundColor: "#fff"
  },
  primaryButton: {
    backgroundColor: "#0ea5e9",
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  fullWidthButton: {
    width: "100%"
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16
  },
  helperText: {
    fontSize: 13,
    color: "#475569"
  },
  notice: {
    fontSize: 13,
    color: "#0f766e",
    backgroundColor: "rgba(13, 148, 136, 0.1)",
    padding: 10,
    borderRadius: 10
  },
  secondaryButton: {
    borderRadius: 12,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff"
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontWeight: "600",
    fontSize: 14
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: 6
  },
  linkButtonText: {
    color: "#0ea5e9",
    fontWeight: "600",
    fontSize: 14
  },
  tenantPicker: {
    gap: 8
  },
  tenantOption: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    backgroundColor: "#fff"
  },
  tenantOptionTitle: {
    fontWeight: "600",
    color: "#0f172a"
  },
  tenantOptionSubtitle: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  searchRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  searchInput: {
    flex: 1
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  searchBareInput: {
    borderWidth: 0,
    paddingHorizontal: 0,
    height: 40
  },
  timezoneChip: {
    backgroundColor: "rgba(14, 165, 233, 0.12)",
    color: "#0ea5e9",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: "700"
  },
  ghostButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  ghostButtonSmall: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  ghostButtonText: {
    color: "#0f172a",
    fontWeight: "600"
  },
  calendarToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 4
  },
  calendarNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  calendarLabel: {
    fontWeight: "700",
    color: "#0f172a"
  },
  viewPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignSelf: "flex-start"
  },
  viewPickerText: {
    color: "#0ea5e9",
    fontWeight: "700"
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12
  },
  calendarScreen: {
    flex: 1,
    paddingBottom: 12
  },
  serviceContent: {
    paddingBottom: 140
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0f172a"
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  pillGroup: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginVertical: 8
  },
  pillButton: {
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  pillButtonActive: {
    backgroundColor: "rgba(14, 165, 233, 0.12)",
    borderColor: "#0ea5e9"
  },
  pillLabel: {
    color: "#475569"
  },
  pillLabelActive: {
    color: "#0ea5e9",
    fontWeight: "600"
  },
  calendarDayCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    marginTop: 10,
    gap: 10
  },
  calendarDayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  calendarEvent: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc"
  },
  calendarEventTitle: {
    fontWeight: "700",
    color: "#0f172a"
  },
  calendarEventMeta: {
    color: "#64748b",
    marginTop: 2
  },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 10
  },
  calendarArrow: {
    fontSize: 18,
    color: "#0ea5e9"
  },
  calendarWrapper: {
    marginTop: 10,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    width: "100%"
  },
  weekCalendarContainer: {
    minHeight: 90
  },
  weekCalendar: {
    height: 90,
    paddingVertical: 6,
    paddingHorizontal: 8
  },
  timelineWrapper: {
    minHeight: 600,
    marginTop: 12,
    padding: 12
  },
  weekGrid: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 12
  },
  weekGridScrollContent: {
    paddingBottom: 120
  },
  weekGridHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8
  },
  weekTimeCol: {
    width: 64,
    paddingRight: 8
  },
  weekDayColHeader: {
    flex: 1,
    alignItems: "center"
  },
  weekDayName: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600"
  },
  weekDayDate: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a"
  },
  weekDayWrapper: {
    width: 48,
    alignItems: "center",
    paddingVertical: 4,
    marginHorizontal: 6,
    minHeight: 64,
    justifyContent: "center"
  },
  weekDayNameTop: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
    marginBottom: 4
  },
  weekDayNumber: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 18
  },
  weekDayNumberSelected: {
    color: "#fff"
  },
  weekDayNumberPill: {
    minWidth: 32,
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center"
  },
  weekDayNumberPillSelected: {
    backgroundColor: "#0ea5e9"
  },
  weekDayDisabled: {
    color: "#cbd5e1"
  },
  weekDotsRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 4
  },
  weekDot: {
    width: 4,
    height: 4,
    borderRadius: 2
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    height: 60,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0"
  },
  weekTimeText: {
    color: "#94a3b8",
    fontSize: 12
  },
  weekCell: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "stretch"
  },
  dayCell: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 4,
    justifyContent: "center"
  },
  weekCellDivider: {
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0"
  },
  weekEvent: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxHeight: 44,
    overflow: "hidden"
  },
  formLabel: {
    color: "#475569",
    fontWeight: "600",
    marginTop: 12
  },
  formRow: {
    flexDirection: "row",
    gap: 12
  },
  formColumn: {
    flex: 1
  },
  textArea: {
    height: 90,
    textAlignVertical: "top"
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a"
  },
  cardSubtitle: {
    color: "#475569",
    marginTop: 4
  },
  cardPrice: {
    color: "#0ea5e9",
    fontWeight: "600",
    marginTop: 4
  },
  cardActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12
  },
  actionButton: {
    flex: 1,
    borderRadius: 999,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryAction: {
    backgroundColor: "#0ea5e9"
  },
  approve: {
    backgroundColor: "#22c55e"
  },
  reject: {
    backgroundColor: "#ef4444"
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "600"
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0ea5e9",
    borderRadius: 999,
    paddingHorizontal: 18,
    height: 54,
    shadowColor: "#0ea5e9",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5
  },
  fabText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  },
  analyticsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  analyticsCard: {
    flexBasis: "48%",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16
  },
  analyticsValue: {
    fontSize: 20,
    fontWeight: "600",
    color: "#0f172a"
  },
  analyticsLabel: {
    marginTop: 4,
    color: "#475569"
  },
  muted: {
    color: "#94a3b8"
  },
  error: {
    color: "#ef4444",
    marginHorizontal: 20,
    marginBottom: 8
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  placeholderText: {
    color: "#64748b",
    fontSize: 16
  },
  tabBadge: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "transparent"
  },
  tabBadgeActive: {
    backgroundColor: "rgba(14, 165, 233, 0.08)"
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "80%"
  },
  modalContent: {
    paddingBottom: 40
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  viewModal: {
    backgroundColor: "#fff",
    margin: 20,
    borderRadius: 16,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5
  },
  viewSheet: {
    width: "100%",
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8
  },
  viewSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 4
  },
  viewSheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a"
  },
  viewSheetClose: {
    fontSize: 14,
    color: "#0ea5e9",
    fontWeight: "700"
  },
  viewSheetSubtitle: {
    fontSize: 13,
    color: "#475569",
    marginTop: 2,
    marginBottom: 10,
    paddingHorizontal: 4
  },
  viewOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8
  },
  viewOptionRowSelected: {
    backgroundColor: "rgba(14, 165, 233, 0.08)"
  },
  viewOptionCopy: {
    flex: 1
  },
  viewOptionText: {
    fontWeight: "700",
    color: "#0f172a",
    fontSize: 15
  },
  viewOptionTextSelected: {
    color: "#0ea5e9"
  },
  viewOptionHint: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2
  },
  historyButton: {
    height: 44,
    marginTop: 8
  },
  historyItem: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginTop: 6
  },
  settingsContainer: {
    gap: 12
  },
  settingsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    gap: 10
  },
  settingsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a"
  },
  settingsSubtitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a"
  },
  settingsSave: {
    color: "#0ea5e9",
    fontWeight: "700"
  },
  settingsAdd: {
    color: "#0ea5e9",
    fontWeight: "700"
  },
  settingsRemove: {
    color: "#be123c",
    fontWeight: "600",
    marginTop: 8
  },
  settingsRow: {
    marginTop: 6
  },
  ruleCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    backgroundColor: "#f8fafc",
    gap: 6
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  ruleInput: {
    flex: 1,
    height: 44
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e2e8f0"
  },
  dayChipText: {
    fontWeight: "700",
    color: "#0f172a"
  }
});
  const fetchCustomers = async (queryText = "", offset = 0, limit = CUSTOMER_PAGE_SIZE) => {
    if (!jwt) return { customers: [], hasMore: false };
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (queryText.trim()) params.set("q", queryText.trim());
    if (offset) params.set("offset", String(offset));
    const data = await apiRequest<{ customers: CustomerRecord[]; hasMore?: boolean }>(
      `/owner/customers?${params.toString()}`,
      {},
      jwt
    );
    return {
      customers: data.customers || [],
      hasMore: Boolean(data.hasMore)
    };
  };
