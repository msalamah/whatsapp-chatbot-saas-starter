import { useEffect, useMemo, useState } from "react";
import { fetchAvailability, fetchServices, fetchTenant, submitBooking } from "./api";
import { Service, Slot, TenantSummary } from "./types";

const DEFAULT_TENANT_KEY = new URLSearchParams(window.location.search).get("tenant") || "default";

function formatPrice(service: Service) {
  if (service.price == null) return "";
  const currency = service.currency || "USD";
  return `${currency} ${service.price}`;
}

export default function App() {
  const [tenantKey, setTenantKey] = useState(DEFAULT_TENANT_KEY);
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<string>("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [success, setSuccess] = useState<string | null>(null);

  const timezone = tenant?.calendar?.timezone || "UTC";
  const serviceOptions = useMemo(() => services.map((s) => ({ value: s.id, label: s.name })), [services]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const t = await fetchTenant(tenantKey);
        setTenant(t);
        const svc = await fetchServices(tenantKey);
        setServices(svc);
        if (svc.length) {
          setSelectedService((prev) => prev || svc[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tenant");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantKey]);

  useEffect(() => {
    async function loadSlots() {
      if (!selectedService) return;
      setLoading(true);
      setError(null);
      try {
        const s = await fetchAvailability(tenantKey, selectedService);
        setSlots(s);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load availability");
      } finally {
        setLoading(false);
      }
    }
    loadSlots();
  }, [tenantKey, selectedService]);

  async function handleSubmit(slot: Slot) {
    if (!selectedService) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await submitBooking(tenantKey, {
        serviceId: selectedService,
        startISO: slot.startISO,
        endISO: slot.endISO,
        name: form.name,
        email: form.email,
        phone: form.phone
      });
      setSuccess(`Request submitted for ${slot.displayLabel}. We will confirm shortly.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit booking");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="booking-shell">
      <header className="booking-header">
        <div>
          <p className="eyebrow">Book with</p>
          <h1>{tenant?.displayName || "Booking"}</h1>
          <p className="muted">Timezone: {timezone}</p>
        </div>
      </header>

      <section className="panel">
        <div className="form-grid two-col">
          <div className="form-field">
            <label>Service</label>
            <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)}>
              {serviceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {selectedService && (
              <p className="muted">{formatPrice(services.find((s) => s.id === selectedService) || {})}</p>
            )}
          </div>
          <div className="form-field">
            <label>Your details</label>
            <div className="form-grid two-col">
              <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Available slots</h2>
          {loading && <span className="muted">Loading…</span>}
        </div>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
        {!slots.length && !loading && <div className="empty">No slots available.</div>}
        <div className="slot-grid">
          {slots.map((slot) => (
            <button key={slot.startISO} className="slot" onClick={() => handleSubmit(slot)} disabled={loading}>
              <strong>{slot.buttonLabel}</strong>
              <span className="muted">{slot.displayLabel}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
