import "react-native-gesture-handler";
import "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Calendar as MonthCalendar } from "react-native-calendars";
import {
  apiRequest,
  requestOwnerOtp,
  verifyOwnerOtp,
  registerOwner,
  refreshOwnerSession,
  setRefreshHandler
} from "./src/services/api";
import { styles } from "./src/styles";
import { HomeScreen } from "./src/screens/HomeScreen";
import { CalendarScreen } from "./src/screens/CalendarScreen";
import { CustomersScreen } from "./src/screens/CustomersScreen";
import { ServicesScreen } from "./src/screens/ServicesScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import {
  AnalyticsSummary,
  Appointment,
  AvailabilitySlot,
  CustomerRecord,
  OwnerCalendar,
  OwnerSession,
  PendingBooking,
  ServiceRecord
} from "./src/types";
import { OwnerContext } from "./src/state/ownerContext";

const Tab = createBottomTabNavigator();

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

type PhoneCountry = {
  code: string;
  name: string;
  dial: string;
};

const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "US", name: "United States", dial: "+1" },
  { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "IL", name: "Israel", dial: "+972" },
  { code: "AE", name: "United Arab Emirates", dial: "+971" },
  { code: "SA", name: "Saudi Arabia", dial: "+966" },
  { code: "DE", name: "Germany", dial: "+49" },
  { code: "FR", name: "France", dial: "+33" },
  { code: "IN", name: "India", dial: "+91" }
];
const DEFAULT_COUNTRY = PHONE_COUNTRIES[0];

const formatE164 = (country: PhoneCountry, input: string) => {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }
  return digits ? `${country.dial}${digits}` : "";
};

const isValidE164 = (value: string) => /^\+\d{7,15}$/.test(value);

const splitPhone = (value: string) => {
  const match = PHONE_COUNTRIES.find((country) => value.startsWith(country.dial));
  if (!match) {
    return { country: DEFAULT_COUNTRY, local: value.replace(/^\+/, "") };
  }
  return { country: match, local: value.slice(match.dial.length) };
};

const STORAGE_KEY = "owner-mobile-session";
const PHONE_KEY = "owner-mobile-phone";
const REFRESH_KEY = "owner-mobile-refresh";
const DEVICE_TOKEN_KEY = "owner-mobile-device-token";
const COUNTRY_KEY = "owner-mobile-country";
const CUSTOMER_PAGE_SIZE = 25;
 


export default function App() {
  const [registerMode, setRegisterMode] = useState(false);
  const [registerBusinessName, setRegisterBusinessName] = useState("");
  const [registerOwnerName, setRegisterOwnerName] = useState("");
  const [registerPhoneLocal, setRegisterPhoneLocal] = useState("");
  const [registerCountry, setRegisterCountry] = useState<PhoneCountry>(DEFAULT_COUNTRY);
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerTimezone, setRegisterTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });
  const [registerServices, setRegisterServices] = useState<RegisterServiceDraft[]>([]);
  const [loginPhoneLocal, setLoginPhoneLocal] = useState("");
  const [loginCountry, setLoginCountry] = useState<PhoneCountry>(DEFAULT_COUNTRY);
  const [otpPhone, setOtpPhone] = useState("");
  const [loginTenantKey, setLoginTenantKey] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpTenantKey, setOtpTenantKey] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [countryPicker, setCountryPicker] = useState<"login" | "register" | null>(null);
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
    (async () => {
      try {
        const storedCountry = await SecureStore.getItemAsync(COUNTRY_KEY);
        const match = storedCountry ? PHONE_COUNTRIES.find((country) => country.code === storedCountry) : null;
        if (match) {
          setLoginCountry(match);
          setRegisterCountry(match);
        }
        const storedPhone = await SecureStore.getItemAsync(PHONE_KEY);
        if (storedPhone) {
          const parsed = splitPhone(storedPhone);
          setLoginPhoneLocal(parsed.local);
          setOtpPhone(storedPhone);
          if (!match) {
            setLoginCountry(parsed.country);
            setRegisterCountry(parsed.country);
          }
        }
      } catch {
        // best-effort restore
      }
    })();
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

  const registerPushToken = useCallback(async () => {
    if (!jwt) return;
    try {
      const stored = await SecureStore.getItemAsync(DEVICE_TOKEN_KEY);
      const Notifications = await import("expo-notifications").catch(() => null);
      if (!Notifications) return;
      const settings = await Notifications.getPermissionsAsync();
      if (settings.status !== "granted") {
        const next = await Notifications.requestPermissionsAsync();
        if (next.status !== "granted") return;
      }
      const tokenResult = await Notifications.getExpoPushTokenAsync();
      const token = tokenResult?.data;
      if (!token || token === stored) return;
      await apiRequest("/owner/devices", {
        method: "POST",
        body: JSON.stringify({ token, platform: Platform.OS })
      }, jwt);
      await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, token);
    } catch {
      // best-effort registration
    }
  }, [jwt]);

  const refreshSession = useCallback(async () => {
    if (!refreshToken) return null;
    try {
      const { response, data } = await refreshOwnerSession(refreshToken);
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

  useEffect(() => {
    if (jwt) registerPushToken();
  }, [jwt, registerPushToken]);

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
    setOtpPhone("");
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
    setRegisterPhoneLocal("");
    setRegisterEmail("");
    setRegisterServices([]);
    setError(null);
    setAuthNotice(null);
  };

  const handleCountrySelect = async (target: "login" | "register", country: PhoneCountry) => {
    if (target === "login") {
      setLoginCountry(country);
    } else {
      setRegisterCountry(country);
    }
    setCountryPicker(null);
    try {
      await SecureStore.setItemAsync(COUNTRY_KEY, country.code);
    } catch {
      // best-effort persistence
    }
  };

  const requestOtp = async (targetTenantKey?: string) => {
    const phone = formatE164(loginCountry, loginPhoneLocal);
    const resolvedTenantKey = (targetTenantKey || loginTenantKey || "").trim();
    if (!phone) {
      setError("Phone number is required");
      return;
    }
    if (!isValidE164(phone)) {
      setError("Enter a valid phone number with country code.");
      return;
    }
    setLoading(true);
    setError(null);
    setAuthNotice(null);
    setTenantOptions([]);
    try {
      const { response, data } = await requestOwnerOtp(phone, resolvedTenantKey || undefined);
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
      setOtpPhone(phone);
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
    const phone = otpPhone || formatE164(loginCountry, loginPhoneLocal);
    const tenantKey = otpTenantKey.trim();
    const code = otpCode.trim();
    if (!phone) {
      setError("Phone number is required");
      return;
    }
    if (!isValidE164(phone)) {
      setError("Enter a valid phone number with country code.");
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
      const { response, data } = await verifyOwnerOtp(phone, tenantKey, code);
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
    const phone = formatE164(registerCountry, registerPhoneLocal);
    if (!registerBusinessName.trim() || !registerOwnerName.trim() || !phone) {
      setError("Business name, owner name, and phone are required");
      return;
    }
    if (!isValidE164(phone)) {
      setError("Enter a valid phone number with country code.");
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
      const { response, data } = await registerOwner({
        displayName: registerBusinessName.trim(),
        ownerName: registerOwnerName.trim(),
        phone,
        email: registerEmail.trim() || undefined,
        timezone: registerTimezone.trim() || undefined,
        services: services.length ? services : undefined
      });
      if (!response.ok) {
        const message = typeof data === "string"
          ? data
          : mapAuthError(data?.error?.code, data?.error?.message || response.statusText);
        throw new Error(message);
      }
      setLoginPhoneLocal(registerPhoneLocal.trim());
      setLoginCountry(registerCountry);
      setLoginTenantKey(data?.tenantKey || "");
      setOtpSent(true);
      setOtpTenantKey(data?.tenantKey || "");
      setOtpExpiresAt(data?.expiresAt || null);
      setOtpCooldown(30);
      setOtpPhone(phone);
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
    await SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
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

  const fetchCustomers = useCallback(async (query = "", offset = 0) => {
    if (!jwt) return { customers: [], hasMore: false };
    const params = new URLSearchParams();
    params.set("limit", String(CUSTOMER_PAGE_SIZE));
    if (query) params.set("q", query);
    if (offset) params.set("offset", String(offset));
    const path = `/owner/customers?${params.toString()}`;
    const data = await apiRequest<{ customers: CustomerRecord[]; hasMore?: boolean }>(path, {}, jwt);
    return {
      customers: data.customers || [],
      hasMore: Boolean(data.hasMore)
    };
  }, [jwt]);

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
              <View style={styles.phoneRow}>
                <TouchableOpacity style={styles.countryButton} onPress={() => setCountryPicker("login")}>
                  <Text style={styles.countryButtonText}>{loginCountry.code} {loginCountry.dial}</Text>
                </TouchableOpacity>
                <TextInput
                  placeholder="Phone number"
                  autoCapitalize="none"
                  keyboardType="phone-pad"
                  style={[styles.input, styles.phoneInput]}
                  value={loginPhoneLocal}
                  onChangeText={setLoginPhoneLocal}
                />
              </View>
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
              <View style={styles.phoneRow}>
                <TouchableOpacity style={styles.countryButton} onPress={() => setCountryPicker("register")}>
                  <Text style={styles.countryButtonText}>{registerCountry.code} {registerCountry.dial}</Text>
                </TouchableOpacity>
                <TextInput
                  placeholder="Phone number"
                  autoCapitalize="none"
                  keyboardType="phone-pad"
                  style={[styles.input, styles.phoneInput]}
                  value={registerPhoneLocal}
                  onChangeText={setRegisterPhoneLocal}
                />
              </View>
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
              <Text style={styles.helperText}>Code sent to {otpPhone || formatE164(loginCountry, loginPhoneLocal)}</Text>
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
          <Modal
            transparent
            visible={countryPicker !== null}
            animationType="fade"
            onRequestClose={() => setCountryPicker(null)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.sectionTitle}>Select country</Text>
                  <TouchableOpacity onPress={() => setCountryPicker(null)}>
                    <Text style={styles.ghostButtonText}>Close</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={styles.modalContent}>
                  {PHONE_COUNTRIES.map((country) => (
                    <TouchableOpacity
                      key={country.code}
                      style={styles.countryOption}
                      onPress={() => handleCountrySelect(countryPicker || "login", country)}
                    >
                      <Text style={styles.countryOptionTitle}>{country.name}</Text>
                      <Text style={styles.countryOptionSubtitle}>{country.dial}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
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
