import { useEffect, useState } from "react";
import { loginOwner, fetchPending, fetchAppointments, resolvePending, fetchCustomers, fetchServices, upsertService, deleteService } from "./api";
import { LoginForm } from "./components/LoginForm";
import { PendingList } from "./components/PendingList";
import { AppointmentsList } from "./components/AppointmentsList";
import { CustomerList } from "./components/CustomerList";
import { ServiceList } from "./components/ServiceList";
import { PendingBooking, Appointment, TenantInfo, CustomerRecord, ServiceRecord, ServiceFormState } from "./types";

const TOKEN_KEY = "ownerPortalToken";
const TENANT_NAME_KEY = "ownerPortalTenantName";
const TENANT_KEY_KEY = "ownerPortalTenantKey";
const CALENDAR_LINK_KEY = "ownerPortalCalendar";

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [tenant, setTenant] = useState<TenantInfo | null>(() => {
    const name = localStorage.getItem(TENANT_NAME_KEY);
    const key = localStorage.getItem(TENANT_KEY_KEY);
    const calendarLink = localStorage.getItem(CALENDAR_LINK_KEY);
    return key && name ? { key, name, calendarLink } : null;
  });
  const [pending, setPending] = useState<PendingBooking[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerLimit, setCustomerLimit] = useState(50);
  const [appointmentLimit, setAppointmentLimit] = useState(50);

  const isLoggedIn = Boolean(token && tenant);

  useEffect(() => {
    if (!token) return;
    refreshData();
  }, [token, customerQuery, customerLimit, appointmentLimit]);

  async function handleLogin(tenantKey: string, ownerToken: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await loginOwner(tenantKey, ownerToken);
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(TENANT_NAME_KEY, res.tenant.name);
      localStorage.setItem(TENANT_KEY_KEY, tenantKey);
      if (res.tenant.calendarLink) {
        localStorage.setItem(CALENDAR_LINK_KEY, res.tenant.calendarLink);
      } else {
        localStorage.removeItem(CALENDAR_LINK_KEY);
      }
      setToken(res.token);
      setTenant(res.tenant);
      await refreshData(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function refreshData(forcedToken = token) {
    if (!forcedToken) return;
    setLoading(true);
    try {
      const [pendingData, appointmentData, customersData, servicesData] = await Promise.all([
        fetchPending(forcedToken),
        fetchAppointments(forcedToken, { limit: appointmentLimit }),
        fetchCustomers(forcedToken, { limit: customerLimit, query: customerQuery }),
        fetchServices(forcedToken)
      ]);
      setPending(pendingData);
      setAppointments(appointmentData);
      setCustomers(customersData);
      setServices(servicesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh data");
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(customerId: string, action: "approve" | "reject") {
    if (!token) return;
    setLoading(true);
    try {
      await resolvePending(token, customerId, action);
      await refreshData(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update booking");
    } finally {
      setLoading(false);
    }
  }
***TION"></textarea>
*** End Patch
