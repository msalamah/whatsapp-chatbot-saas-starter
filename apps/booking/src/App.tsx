import { useEffect, useMemo, useState } from "react";
import { fetchAvailability, fetchServices, fetchTenant, submitBooking, requestOtp, verifyOtp } from "./api";
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
  const [step, setStep] = useState<"service" | "slot" | "details">("service");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [otp, setOtp] = useState("");
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [otpStatus, setOtpStatus] = useState<string | null>(null);
  const [otpChannel, setOtpChannel] = useState<"phone" | "email">("phone");

  const timezone = tenant?.calendar?.timezone || "UTC";
  const serviceOptions = useMemo(() => services.map((s) => ({ value: s.id, label: s.name })), [services]);
  const selectedServiceObj = useMemo(() => services.find((s) => s.id === selectedService) || null, [services, selectedService]);
  const stepOrder: Array<{ id: typeof step; label: string }> = [
    { id: "service", label: "Service" },
    { id: "slot", label: "Time" },
    { id: "details", label: "Details" }
  ];
  const currentStepIndex = stepOrder.findIndex((s) => s.id === step);

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

  async function handleSubmit() {
    if (!selectedService || !selectedSlot) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (!otpToken) {
        setError("Please verify the OTP code first");
        setLoading(false);
        return;
      }
      await submitBooking(tenantKey, {
        serviceId: selectedService,
        startISO: selectedSlot.startISO,
        endISO: selectedSlot.endISO,
        name: form.name,
        email: form.email,
        phone: form.phone,
        otpToken
      });
      setSuccess(`Request submitted for ${selectedSlot.displayLabel}. We will confirm shortly.`);
      setStep("service");
      setSelectedSlot(null);
      setOtp("");
      setOtpToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit booking");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    const contact = otpChannel === "phone" ? form.phone : form.email;
    if (!contact) {
      setError("Enter phone or email to get a code");
      return;
    }
    setError(null);
    setOtpStatus(null);
    try {
      await requestOtp(tenantKey, contact, otpChannel);
      setOtpStatus("Code sent. Check your phone/email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    }
  }

  async function handleVerifyOtp() {
    const contact = otpChannel === "phone" ? form.phone : form.email;
    if (!contact || !otp.trim()) {
      setError("Enter code and contact");
      return;
    }
    setError(null);
    try {
      const token = await verifyOtp(tenantKey, contact, otp.trim());
      setOtpToken(token);
      setOtpStatus("Verified ✔");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code invalid");
      setOtpToken(null);
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
        <ol className="stepper">
          {stepOrder.map((entry, idx) => (
            <li key={entry.id} className={idx < currentStepIndex ? "done" : idx === currentStepIndex ? "active" : ""}>
              <span className="bubble">{idx + 1}</span>
              {entry.label}
            </li>
          ))}
        </ol>
      </header>

      <section className="panel">
        <div className="section-head">
          <h2>Select service</h2>
          {step !== "service" && (
            <button className="ghost" onClick={() => { setStep("service"); setSelectedSlot(null); }}>
              Change
            </button>
          )}
        </div>
        <div className="form-field">
          <select value={selectedService} onChange={(e) => { setSelectedService(e.target.value); setStep("service"); }}>
            <option value="">Choose service</option>
            {serviceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {selectedServiceObj && <p className="muted">{selectedServiceObj.description || formatPrice(selectedServiceObj)}</p>}
        </div>
        <button className="primary" disabled={!selectedService} onClick={() => setStep("slot")}>
          Continue to times
        </button>
      </section>

      {step !== "service" && (
        <section className="panel">
          <div className="section-head">
            <h2>Select a time</h2>
            {step === "details" && (
              <button className="ghost" onClick={() => { setStep("slot"); setSelectedSlot(null); }}>
                Choose another time
              </button>
            )}
          </div>
          {error && step === "slot" && <p className="error">{error}</p>}
          {!slots.length && !loading && <div className="empty">No slots available.</div>}
          <div className="slot-grid">
            {slots.map((slot) => (
              <button
                key={slot.startISO}
                className={`slot ${selectedSlot?.startISO === slot.startISO ? "active" : ""}`}
                onClick={() => { setSelectedSlot(slot); setStep("details"); }}
                disabled={loading}
              >
                <strong>{slot.buttonLabel}</strong>
                <span className="muted">{slot.displayLabel}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "details" && selectedSlot && (
        <section className="panel">
          <div className="section-head">
            <h2>Your details</h2>
          </div>
          <div className="summary">
            <div>
              <span className="muted">Service</span>
              <strong>{selectedServiceObj?.name}</strong>
            </div>
            <div>
              <span className="muted">Time</span>
              <strong>{selectedSlot.displayLabel}</strong>
            </div>
          </div>
          {error && step === "details" && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}
          <div className="form-grid two-col">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="otp-row">
            <div className="channel-select">
              <label>
                <input type="radio" checked={otpChannel === "phone"} onChange={() => setOtpChannel("phone")} /> Phone
              </label>
              <label>
                <input type="radio" checked={otpChannel === "email"} onChange={() => setOtpChannel("email")} /> Email
              </label>
            </div>
            <input placeholder="Enter 6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} />
            <button type="button" className="ghost" onClick={handleSendOtp} disabled={loading}>
              Send code
            </button>
            <button type="button" className="primary" onClick={handleVerifyOtp} disabled={loading}>
              Verify
            </button>
          </div>
          {otpStatus && <span className="muted">{otpStatus}</span>}
          <button className="primary" disabled={loading} onClick={handleSubmit}>Request booking</button>
        </section>
      )}
    </main>
  );
}
