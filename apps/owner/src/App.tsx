import { useEffect, useState } from "react";
import {
  requestOwnerOtp,
  verifyOwnerOtp,
  registerOwner,
  refreshOwnerSession,
  setRefreshHandler,
  fetchPending,
  fetchAppointments,
  resolvePending,
  fetchCustomers,
  fetchServices,
  upsertService,
  deleteService,
  fetchCustomerDetail,
  downloadCsv,
  fetchAnalytics,
  fetchCalendarSettings,
  saveCalendarSettings,
  fetchOwnerProfile,
  updateOwnerProfile,
  confirmOwnerPhoneChange
} from "./api";
import { OwnerAuthForm } from "./components/OwnerAuthForm";
import { PendingList } from "./components/PendingList";
import { AppointmentsList } from "./components/AppointmentsList";
import { CustomerList } from "./components/CustomerList";
import { ServiceList } from "./components/ServiceList";
import { CustomerDetailCard } from "./components/CustomerDetail";
import { AnalyticsCards } from "./components/AnalyticsCards";
import { CalendarBoard } from "./components/CalendarBoard";
import {
  PendingBooking,
  Appointment,
  TenantInfo,
  CustomerRecord,
  ServiceRecord,
  ServiceFormState,
  CustomerDetail,
  AnalyticsSummary,
  OwnerCalendar,
  OwnerProfile
} from "./types";
import { CalendarSettings } from "./components/CalendarSettings";

const TOKEN_KEY = "ownerPortalToken";
const REFRESH_KEY = "ownerPortalRefreshToken";
const TENANT_NAME_KEY = "ownerPortalTenantName";
const TENANT_KEY_KEY = "ownerPortalTenantKey";
const CALENDAR_LINK_KEY = "ownerPortalCalendar";
const APPOINTMENT_LIMIT = 50;
const CUSTOMER_LIMIT = 100;

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_KEY));
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
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [calendar, setCalendar] = useState<OwnerCalendar | null>(null);
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    businessName: "",
    ownerName: "",
    email: "",
    phone: "",
    timezone: ""
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [phoneVerification, setPhoneVerification] = useState<{ phone: string; expiresAt?: string } | null>(null);
  const [phoneCode, setPhoneCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [appointmentRange, setAppointmentRange] = useState<"all" | "upcoming" | "past">("upcoming");
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [showCustomersPage, setShowCustomersPage] = useState(false);

  const isLoggedIn = Boolean(token && tenant);

  useEffect(() => {
    if (!token) return;
    refreshData(token);
  }, [token, customerQuery, appointmentRange]);

  useEffect(() => {
    setRefreshHandler(async () => {
      if (!refreshToken) return null;
      try {
        const res = await refreshOwnerSession(refreshToken);
        applySession(res);
        return res.token;
      } catch {
        return null;
      }
    });
    return () => setRefreshHandler(null);
  }, [refreshToken]);

  useEffect(() => {
    if (!profile) return;
    setProfileDraft({
      businessName: profile.tenant?.name || "",
      ownerName: profile.owner?.name || "",
      email: profile.owner?.email || "",
      phone: profile.owner?.phone || "",
      timezone: profile.tenant?.timezone || ""
    });
  }, [profile]);

  function applySession(res: { token: string; refreshToken?: string; tenant: TenantInfo }) {
    localStorage.setItem(TOKEN_KEY, res.token);
    if (res.refreshToken) {
      localStorage.setItem(REFRESH_KEY, res.refreshToken);
      setRefreshToken(res.refreshToken);
    }
    localStorage.setItem(TENANT_NAME_KEY, res.tenant.name);
    localStorage.setItem(TENANT_KEY_KEY, res.tenant.key);
    if (res.tenant.calendarLink) {
      localStorage.setItem(CALENDAR_LINK_KEY, res.tenant.calendarLink);
    } else {
      localStorage.removeItem(CALENDAR_LINK_KEY);
    }
    setToken(res.token);
    setTenant(res.tenant);
  }

  async function refreshData(forceToken = token) {
    if (!forceToken) return;
    setLoading(true);
    try {
      const [pendingData, appointmentData, customersData, servicesData, analyticsData, calendarData, profileData] = await Promise.all([
        fetchPending(forceToken),
        fetchAppointments(forceToken, { limit: APPOINTMENT_LIMIT, range: appointmentRange }),
        fetchCustomers(forceToken, { limit: CUSTOMER_LIMIT, query: customerQuery }),
        fetchServices(forceToken),
        fetchAnalytics(forceToken),
        fetchCalendarSettings(forceToken),
        fetchOwnerProfile(forceToken)
      ]);
      setPending(pendingData);
      setAppointments(appointmentData);
      setCustomers(customersData);
      setServices(servicesData);
      setAnalytics(analyticsData);
      setCalendar(calendarData);
      setProfile(profileData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh data");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestOtp(phone: string, tenantKey?: string): Promise<{ tenantKey?: string; tenants?: Array<{ key: string; name: string }> }> {
    setLoading(true);
    setError(null);
    try {
      const res = await requestOwnerOtp(phone, tenantKey);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
      return {};
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(phone: string, tenantKey: string, code: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await verifyOwnerOtp(phone, tenantKey, code);
      applySession(res);
      await refreshData(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(payload: {
    displayName: string;
    ownerName: string;
    phone: string;
    email?: string;
    timezone?: string;
    services?: Array<{
      name: string;
      minMinutes: number;
      maxMinutes: number;
      price?: number;
      currency?: string;
    }>;
  }): Promise<{ tenantKey: string }> {
    setLoading(true);
    setError(null);
    try {
      const res = await registerOwner(payload);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      return { tenantKey: "" };
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

  async function handleSaveCalendar(nextCalendar: OwnerCalendar) {
    if (!token) return;
    setCalendarSaving(true);
    try {
      const saved = await saveCalendarSettings(token, nextCalendar);
      setCalendar(saved);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save calendar");
    } finally {
      setCalendarSaving(false);
    }
  }

  async function handleProfileSave() {
    if (!token) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileNotice(null);
    try {
      const emailValue = profileDraft.email.trim();
      const phoneValue = profileDraft.phone.trim();
      const result = await updateOwnerProfile(token, {
        businessName: profileDraft.businessName.trim() || undefined,
        ownerName: profileDraft.ownerName.trim() || undefined,
        email: emailValue ? emailValue : null,
        phone: phoneValue || undefined,
        timezone: profileDraft.timezone.trim() || undefined
      });
      if (result.status === "phone_verification_required") {
        setPhoneVerification({ phone: result.phone || phoneValue, expiresAt: result.expiresAt });
        setProfileNotice("Verify the new phone number to finish updating.");
      } else {
        setPhoneVerification(null);
        setProfileNotice("Profile updated.");
      }
      if (result.profile) {
        setProfile(result.profile);
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleConfirmPhone() {
    if (!token || !phoneVerification) return;
    if (!phoneCode.trim()) {
      setProfileError("Enter the verification code.");
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const result = await confirmOwnerPhoneChange(token, phoneVerification.phone, phoneCode.trim());
      if (result.profile) {
        setProfile(result.profile);
      }
      setProfileNotice("Phone number updated.");
      setPhoneVerification(null);
      setPhoneCode("");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to verify phone");
    } finally {
      setProfileSaving(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(TENANT_KEY_KEY);
    localStorage.removeItem(TENANT_NAME_KEY);
    localStorage.removeItem(CALENDAR_LINK_KEY);
    setToken(null);
    setRefreshToken(null);
    setTenant(null);
    setPending([]);
    setAppointments([]);
    setCustomers([]);
    setServices([]);
    setCustomerDetail(null);
    setProfile(null);
  }

  if (!isLoggedIn) {
    return (
      <main className="owner-page owner-login">
        <OwnerAuthForm
          loading={loading}
          error={error}
          onRequestOtp={handleRequestOtp}
          onVerifyOtp={handleVerifyOtp}
          onRegister={handleRegister}
        />
      </main>
    );
  }

  return (
    <main className="owner-page">
      <div className="owner-shell">
        <header className="owner-header">
          <div>
            <p className="eyebrow">Manage your WhatsApp bookings</p>
            <h2>{tenant?.name}</h2>
          </div>
          <div className="action-row">
            {tenant?.calendarLink && (
              <button onClick={() => window.open(tenant.calendarLink!, "_blank")}>
                Open Calendar
              </button>
            )}
            <button className="ghost" onClick={() => token && downloadCsv("/owner/exports/customers", token)}>Export customers</button>
            <button className="ghost" onClick={() => token && downloadCsv("/owner/exports/appointments", token)}>Export appointments</button>
            <button className="ghost" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <section className="controls">
          <div className="control">
            <label className="muted">Search customers</label>
            <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Name or phone" />
          </div>
          <div className="control">
            <label className="muted">Appointments</label>
            <select value={appointmentRange} onChange={(e) => setAppointmentRange(e.target.value as "all" | "upcoming" | "past")}>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
              <option value="all">All</option>
            </select>
          </div>
        </section>

        {error && <p className="error">{error}</p>}

        <section className="section-card">
          <AnalyticsCards analytics={analytics} />
        </section>

        <section className="section-card">
          <h3 style={{ marginTop: 0 }}>Calendar</h3>
          <CalendarBoard timezone={calendar?.timezone || "UTC"} appointments={appointments} pending={pending} rules={calendar?.rules || []} />
        </section>

        <section className="grid-two">
          <div className="section-card">
            <PendingList
              items={pending}
              onApprove={(id) => handleResolve(id, "approve")}
              onReject={(id) => handleResolve(id, "reject")}
              refreshing={loading}
            />
          </div>
          <div className="section-card">
            <AppointmentsList items={appointments} />
          </div>
        </section>

        <section className="section-card">
          <CustomerList
            items={customers}
            onSelect={handleViewCustomer}
            scrollable
            onViewAll={() => setShowCustomersPage(true)}
          />
        </section>

        <section className="section-card">
          <ServiceList items={services} onSave={handleSaveService} onDelete={handleDeleteService} busy={loading} />
        </section>

        <section className="section-card">
          <CalendarSettings calendar={calendar} saving={calendarSaving} onSave={handleSaveCalendar} />
        </section>

        <section className="section-card">
          <div className="section-header">
            <div>
              <h3>Profile</h3>
              <p className="muted">Update business and contact details.</p>
            </div>
            <button onClick={handleProfileSave} disabled={profileSaving}>
              {profileSaving ? "Saving…" : "Save"}
            </button>
          </div>
          {profileNotice && <p className="notice">{profileNotice}</p>}
          {profileError && <p className="error">{profileError}</p>}
          <div className="profile-grid">
            <div className="profile-row">
              <label>Business name</label>
              <input
                value={profileDraft.businessName}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, businessName: e.target.value }))}
                placeholder="Business name"
              />
            </div>
            <div className="profile-row">
              <label>Owner name</label>
              <input
                value={profileDraft.ownerName}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, ownerName: e.target.value }))}
                placeholder="Owner name"
              />
            </div>
            <div className="profile-row">
              <label>Email</label>
              <input
                value={profileDraft.email}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email (optional)"
                type="email"
              />
            </div>
            <div className="profile-row">
              <label>Phone</label>
              <input
                value={profileDraft.phone}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Include country code"
                type="tel"
              />
            </div>
            <div className="profile-row">
              <label>Timezone</label>
              <input
                value={profileDraft.timezone}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, timezone: e.target.value }))}
                placeholder="Timezone (e.g. America/New_York)"
              />
            </div>
          </div>
          {phoneVerification ? (
            <div className="profile-verify">
              <div>
                <label>Verification code</label>
                <input
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  placeholder="Enter code"
                  inputMode="numeric"
                />
              </div>
              <button className="secondary" onClick={handleConfirmPhone} disabled={profileSaving}>
                {profileSaving ? "Verifying…" : "Verify phone"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
      {customerDetail && <CustomerDetailCard detail={customerDetail} onClose={() => setCustomerDetail(null)} />}
      {showCustomersPage && (
        <div className="customers-overlay">
          <div className="customers-panel section-card">
            <div className="section-header">
              <div>
                <h3>Customers</h3>
                <p className="muted">Browse your entire roster and open profiles.</p>
              </div>
              <button className="ghost" onClick={() => setShowCustomersPage(false)}>
                Close
              </button>
            </div>
            <div className="customers-panel-body">
              <CustomerList
                items={customers}
                onSelect={(id) => {
                  handleViewCustomer(id);
                  setShowCustomersPage(false);
                }}
                title="All customers"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
