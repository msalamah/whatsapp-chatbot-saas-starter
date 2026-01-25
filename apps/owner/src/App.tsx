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
  confirmOwnerPhoneChange,
  createManualBooking
  , cancelBookingsInRange
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
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
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
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingName, setBookingName] = useState("");
  const [bookingPhone, setBookingPhone] = useState("");
  const [bookingServiceId, setBookingServiceId] = useState("");
  const [bookingStart, setBookingStart] = useState("");
  const [bookingEnd, setBookingEnd] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [webPushStatus, setWebPushStatus] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [rangeStartISO, setRangeStartISO] = useState("");
  const [rangeEndISO, setRangeEndISO] = useState("");
  const [rangeReason, setRangeReason] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [rangeNotice, setRangeNotice] = useState<string | null>(null);
  const [rangeSaving, setRangeSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [appointmentRange, setAppointmentRange] = useState<"all" | "upcoming" | "past">("upcoming");
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [showCustomersPage, setShowCustomersPage] = useState(false);

  const isLoggedIn = Boolean(token && tenant);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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

  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function registerWebPush() {
    if (!token) return;
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!publicKey) {
      setWebPushStatus("Web push is not configured.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setWebPushStatus("Push notifications are not supported in this browser.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setWebPushStatus("Enable notifications to receive booking alerts.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }
      await fetch(`${import.meta.env.VITE_API_BASE_URL || window.location.origin}/owner/devices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ subscription })
      });
      setWebPushStatus("Web push enabled.");
    } catch (err) {
      setWebPushStatus(err instanceof Error ? err.message : "Failed to enable web push.");
    }
  }

  function toLocalInput(value: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 16);
  }

  function fromLocalInput(value: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString();
  }

  function openBookingModal() {
    const now = new Date();
    const end = new Date(now);
    end.setMinutes(end.getMinutes() + 60);
    setBookingStart(now.toISOString());
    setBookingEnd(end.toISOString());
    setBookingServiceId(services[0]?.id || "");
    setBookingError(null);
    setBookingOpen(true);
  }

  async function handleSaveBooking() {
    if (!token) return;
    if (!bookingStart || !bookingEnd || !bookingPhone.trim()) {
      setBookingError("Start, end, and customer phone are required.");
      return;
    }
    const start = new Date(bookingStart);
    const end = new Date(bookingEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setBookingError("End time must be after start time.");
      return;
    }
    setBookingSaving(true);
    setBookingError(null);
    try {
      await createManualBooking(token, {
        customerName: bookingName.trim() || undefined,
        customerPhone: bookingPhone.trim(),
        serviceId: bookingServiceId || undefined,
        startISO: bookingStart,
        endISO: bookingEnd,
        notes: bookingNotes.trim() || undefined
      });
      setBookingOpen(false);
      setBookingName("");
      setBookingPhone("");
      setBookingNotes("");
      await refreshData(token);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setBookingSaving(false);
    }
  }

  async function handleCancelBooking(appointmentId: string) {
    if (!token) return;
    const ok = window.confirm("Cancel this booking and notify the customer?");
    if (!ok) return;
    setCancellingId(appointmentId);
    try {
      await fetch(`${import.meta.env.VITE_API_BASE_URL || window.location.origin}/owner/appointments/${appointmentId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      });
      await refreshData(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel booking");
    } finally {
      setCancellingId(null);
    }
  }

  async function handleCancelRange() {
    if (!token) return;
    if (!rangeStartISO || !rangeEndISO) {
      setRangeError("Start and end are required.");
      return;
    }
    const start = new Date(rangeStartISO);
    const end = new Date(rangeEndISO);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setRangeError("End time must be after start time.");
      return;
    }
    const ok = window.confirm("Cancel all bookings in this range and notify customers?");
    if (!ok) return;
    setRangeSaving(true);
    setRangeError(null);
    setRangeNotice(null);
    try {
      const result = await cancelBookingsInRange(token, {
        startISO: rangeStartISO,
        endISO: rangeEndISO,
        reason: rangeReason.trim() || undefined
      });
      setRangeNotice(`Cancelled ${result.cancelledCount || 0} bookings.`);
      await refreshData(token);
    } catch (err) {
      setRangeError(err instanceof Error ? err.message : "Failed to cancel bookings");
    } finally {
      setRangeSaving(false);
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
        {isOffline && <div className="top-banner warn">You appear offline. Check your connection.</div>}
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
      {isOffline && <div className="top-banner warn">You appear offline. Some actions may fail.</div>}
      {error && <div className="top-banner error">{error}</div>}
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
            <button onClick={openBookingModal}>Add booking</button>
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
            <AppointmentsList items={appointments} onCancel={handleCancelBooking} cancellingId={cancellingId} />
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
              <h3>Cancel bookings range</h3>
              <p className="muted">Cancel all bookings in a date/time range.</p>
            </div>
            <button onClick={handleCancelRange} disabled={rangeSaving}>
              {rangeSaving ? "Cancelling…" : "Cancel range"}
            </button>
          </div>
          {rangeNotice && <p className="notice">{rangeNotice}</p>}
          {rangeError && <p className="error">{rangeError}</p>}
          <div className="profile-grid">
            <div className="profile-row">
              <label>Start</label>
              <input
                type="datetime-local"
                value={toLocalInput(rangeStartISO)}
                onChange={(e) => setRangeStartISO(fromLocalInput(e.target.value))}
              />
            </div>
            <div className="profile-row">
              <label>End</label>
              <input
                type="datetime-local"
                value={toLocalInput(rangeEndISO)}
                onChange={(e) => setRangeEndISO(fromLocalInput(e.target.value))}
              />
            </div>
            <div className="profile-row">
              <label>Reason</label>
              <input
                value={rangeReason}
                onChange={(e) => setRangeReason(e.target.value)}
                placeholder="Optional reason"
              />
            </div>
          </div>
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
          {webPushStatus && <p className="muted">{webPushStatus}</p>}
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
          <div className="profile-actions">
            <button className="secondary" onClick={registerWebPush} disabled={profileSaving}>
              Enable web notifications
            </button>
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
      {bookingOpen && (
        <div className="customers-overlay">
          <div className="booking-panel section-card">
            <div className="section-header">
              <div>
                <h3>Add booking</h3>
                <p className="muted">Create a manual appointment.</p>
              </div>
              <button className="ghost" onClick={() => setBookingOpen(false)}>Close</button>
            </div>
            {bookingError && <p className="error">{bookingError}</p>}
            <div className="profile-grid">
              <div className="profile-row">
                <label>Customer name</label>
                <input value={bookingName} onChange={(e) => setBookingName(e.target.value)} placeholder="Customer name" />
              </div>
              <div className="profile-row">
                <label>Customer phone</label>
                <input value={bookingPhone} onChange={(e) => setBookingPhone(e.target.value)} placeholder="Phone number" type="tel" />
              </div>
              <div className="profile-row">
                <label>Service</label>
                <select value={bookingServiceId} onChange={(e) => setBookingServiceId(e.target.value)}>
                  <option value="">Select service</option>
                  {services.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="profile-row">
                <label>Start</label>
                <input
                  type="datetime-local"
                  value={toLocalInput(bookingStart)}
                  onChange={(e) => setBookingStart(fromLocalInput(e.target.value))}
                />
              </div>
              <div className="profile-row">
                <label>End</label>
                <input
                  type="datetime-local"
                  value={toLocalInput(bookingEnd)}
                  onChange={(e) => setBookingEnd(fromLocalInput(e.target.value))}
                />
              </div>
            </div>
            <div className="profile-row" style={{ marginTop: "0.75rem" }}>
              <label>Notes</label>
              <textarea
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                placeholder="Optional notes"
                rows={3}
              />
            </div>
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              A confirmation message will be sent to the customer.
            </p>
            <div className="booking-actions">
              <button onClick={handleSaveBooking} disabled={bookingSaving}>
                {bookingSaving ? "Saving…" : "Save booking"}
              </button>
            </div>
          </div>
        </div>
      )}
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
