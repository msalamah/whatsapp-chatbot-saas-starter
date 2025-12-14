import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

const STORAGE_KEY = "owner-mobile-session";
const API_BASE =
  (process.env.EXPO_PUBLIC_API_BASE_URL as string | undefined) ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  "http://localhost:3000";

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
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
    const message = typeof data === "string" ? data : data?.error || response.statusText;
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
};

const OwnerContext = createContext<OwnerContextValue | undefined>(undefined);
function useOwner() {
  const ctx = useContext(OwnerContext);
  if (!ctx) throw new Error("Owner context missing");
  return ctx;
}

export default function App() {
  const [tenantKey, setTenantKey] = useState("");
  const [ownerToken, setOwnerToken] = useState("");
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingBooking[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [customersHasMore, setCustomersHasMore] = useState(false);
  const [services, setServices] = useState<ServiceRecord[]>([]);
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
  }, []);

  useEffect(() => {
    if (!jwt) {
      setPending([]);
      setAnalytics(null);
      setAppointments([]);
      return;
    }
    fetchData();
  }, [jwt]);

  const fetchData = async () => {
    if (!jwt) return;
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, analyticsRes, appointmentsRes, customersRes, servicesRes] = await Promise.all([
        apiRequest<{ pending: PendingBooking[] }>("/owner/pending", {}, jwt),
        apiRequest<{ analytics: AnalyticsSummary }>("/owner/analytics", {}, jwt),
        apiRequest<{ appointments: Appointment[] }>("/owner/appointments?limit=10&range=upcoming", {}, jwt),
        apiRequest<{ customers: CustomerRecord[]; hasMore?: boolean }>("/owner/customers?limit=25", {}, jwt),
        apiRequest<{ services: ServiceRecord[] }>("/owner/services", {}, jwt)
      ]);
      setPending(pendingRes.pending || []);
      setAnalytics(analyticsRes.analytics || null);
      setAppointments(appointmentsRes.appointments || []);
      setCustomers(customersRes.customers || []);
      setCustomersHasMore(Boolean(customersRes.hasMore));
      setServices(servicesRes.services || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!tenantKey.trim() || !ownerToken.trim()) {
      setError("Tenant key and owner token are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const credentials = await apiRequest<OwnerSession>("/owner/login", {
        method: "POST",
        body: JSON.stringify({ tenantKey: tenantKey.trim(), token: ownerToken.trim() })
      });
      setSession(credentials);
      setJwt(credentials.token);
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(credentials));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    setSession(null);
    setJwt(null);
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
          <TextInput
            placeholder="Tenant key"
            autoCapitalize="none"
            style={styles.input}
            value={tenantKey}
            onChangeText={setTenantKey}
          />
          <TextInput
            placeholder="Owner token"
            autoCapitalize="none"
            secureTextEntry
            style={styles.input}
            value={ownerToken}
            onChangeText={setOwnerToken}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
          </TouchableOpacity>
          <Text style={styles.helperText}>Enter the tenant key + owner token provided in the admin portal.</Text>
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
        deleteService
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
    </OwnerContext.Provider>
  );
}

function HomeScreen() {
  const { session, analytics, pending, appointments, loading, error, actionCustomer, refresh, resolveBooking, priceFormatter, logout } =
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
    </SafeAreaView>
  );
}

function CalendarScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Calendar view coming soon.</Text>
      </View>
    </SafeAreaView>
  );
}

function CustomersScreen() {
  const { customers, customersHasMore, fetchCustomers, fetchCustomerDetail } = useOwner();
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
        <View style={styles.searchRow}>
          <TextInput
            placeholder="Search name or phone"
            style={[styles.input, styles.searchInput]}
            value={query}
            onChangeText={setQuery}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleSearch} disabled={loading}>
            <Text style={styles.primaryButtonText}>Search</Text>
          </TouchableOpacity>
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
    </SafeAreaView>
  );
}

function ServicesScreen() {
  const { services, fetchServices, saveService, deleteService } = useOwner();
  const { control, handleSubmit, reset } = useForm<ServiceRecord>({ defaultValues: EMPTY_SERVICE });
  const [modalVisible, setModalVisible] = useState(false);
  const [busy, setBusy] = useState(false);

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
      <ScrollView style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Service catalog</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={styles.ghostButtonSmall} onPress={() => fetchServices()}>
              <Text style={styles.ghostButtonText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={() => openModal()} disabled={busy}>
              <Text style={styles.primaryButtonText}>Add service</Text>
            </TouchableOpacity>
          </View>
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
              <TouchableOpacity style={[styles.actionButton, styles.approve]} onPress={() => openModal(service)}>
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.reject]} onPress={() => handleDelete(service.id)}>
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

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

function SettingsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Settings & notifications coming soon.</Text>
      </View>
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
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16
  },
  helperText: {
    fontSize: 13,
    color: "#475569"
  },
  searchRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  searchInput: {
    flex: 1
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
  section: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12
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
  formLabel: {
    color: "#475569",
    fontWeight: "600",
    marginTop: 12
  },
  formRow: {
    flexDirection: "row",
    gap: 12
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
