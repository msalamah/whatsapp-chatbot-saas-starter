import { useEffect, useState } from "react";
import {
  loginOwner,
  fetchPending,
  fetchAppointments,
  resolvePending,
  fetchCustomers,
  fetchServices,
  upsertService,
  deleteService,
  fetchCustomerDetail
} from "./api";
import { LoginForm } from "./components/LoginForm";
import { PendingList } from "./components/PendingList";
import { AppointmentsList } from "./components/AppointmentsList";
import { CustomerList } from "./components/CustomerList";
import { ServiceList } from "./components/ServiceList";
import { CustomerDetailCard } from "./components/CustomerDetail";
import { PendingBooking, Appointment, TenantInfo, CustomerRecord, ServiceRecord, ServiceFormState, CustomerDetail } from "./types";

const TOKEN_KEY = "ownerPortalToken";
const TENANT_NAME_KEY = "ownerPortalTenantName";
const TENANT_KEY_KEY = "ownerPortalTenantKey";
const CALENDAR_LINK_KEY = "ownerPortalCalendar";
const APPOINTMENT_LIMIT = 50;
const CUSTOMER_LIMIT = 100;

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
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [appointmentRange, setAppointmentRange] = useState<"all" | "upcoming" | "past">("upcoming");

  const isLoggedIn = Boolean(token && tenant);

  useEffect(() => {
    if (!token) return;
    refreshData(token);
  }, [token, customerQuery, appointmentRange]);

  async function refreshData(forceToken = token) {
    if (!forceToken) return;
    setLoading(true);
    try {
      const [pendingData, appointmentData, customersData, servicesData] = await Promise.all([
        fetchPending(forceToken),
        fetchAppointments(forceToken, { limit: APPOINTMENT_LIMIT, range: appointmentRange }),
        fetchCustomers(forceToken, { limit: CUSTOMER_LIMIT, query: customerQuery }),
        fetchServices(forceToken)
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

  async function handleSaveService(service: ServiceFormState) {
    if (!token) return;
    setLoading(true);
    try {
      const updated = await upsertService(token, service);
      setServices(updated.services);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save service");
    } finally {
      setLoading(false);
    }
  }

  async function handleViewCustomer(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      const detail = await fetchCustomerDetail(token, id);
      setCustomerDetail({ ...detail.customer, appointments: detail.appointments });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteService(serviceId: string) {
    if (!token) return;
    setLoading(true);
    try {
      const updated = await deleteService(token, serviceId);
      setServices(updated.services);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete service");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_KEY_KEY);
    localStorage.removeItem(TENANT_NAME_KEY);
    localStorage.removeItem(CALENDAR_LINK_KEY);
    setToken(null);
    setTenant(null);
    setPending([]);
    setAppointments([]);
    setCustomers([]);
    setServices([]);
    setCustomerDetail(null);
  }

  if (!isLoggedIn) {
    return (
      <main className="app-container">
        <LoginForm onLogin={handleLogin} loading={loading} error={error} />
      </main>
    );
  }

  return (
    <main className="app-container">
      <div className="owner-card">
        <header className="portal-header">
          <div>
            <h2>{tenant?.name}</h2>
            <p className="muted">Manage your WhatsApp bookings</p>
          </div>
          <div className="header-actions">
            {tenant?.calendarLink && (
              <button onClick={() => window.open(tenant.calendarLink!, "_blank")}>
                Open Calendar
              </button>
            )}
            <button className="ghost" onClick={handleLogout}>Logout</button>
          </div>
        </header>
        <div className="filter-bar">
          <label>
            Search customers
            <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Name or phone" />
          </label>
          <label>
            Appointments
            <select value={appointmentRange} onChange={(e) => setAppointmentRange(e.target.value as "all" | "upcoming" | "past")}>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <PendingList
          items={pending}
          onApprove={(id) => handleResolve(id, "approve")}
          onReject={(id) => handleResolve(id, "reject")}
          refreshing={loading}
        />
        <AppointmentsList items={appointments} />
        <CustomerList items={customers} onSelect={handleViewCustomer} />
        <ServiceList items={services} onSave={handleSaveService} onDelete={handleDeleteService} busy={loading} />
      </div>
      {customerDetail && <CustomerDetailCard detail={customerDetail} onClose={() => setCustomerDetail(null)} />}
    </main>
  );
}
