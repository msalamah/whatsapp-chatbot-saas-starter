import { FormEvent, useEffect, useState } from "react";

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

interface Props {
  loading?: boolean;
  error?: string | null;
  onRequestOtp: (phone: string, tenantKey?: string) => Promise<{ tenantKey?: string; tenants?: TenantOption[] }>;
  onVerifyOtp: (phone: string, tenantKey: string, code: string) => Promise<void>;
  onRegister: (payload: {
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
  }) => Promise<{ tenantKey: string }>;
}

export function OwnerAuthForm({ loading = false, error = null, onRequestOtp, onVerifyOtp, onRegister }: Props) {
  const [loginPhone, setLoginPhone] = useState("");
  const [loginTenantKey, setLoginTenantKey] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpTenantKey, setOtpTenantKey] = useState("");
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
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

  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => setCooldown((value) => (value > 0 ? value - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const requestOtp = async (tenantKey?: string) => {
    const phone = loginPhone.trim();
    if (!phone.startsWith("+")) {
      setNotice("Include country code (e.g., +1...)");
      return;
    }
    const result = await onRequestOtp(phone, tenantKey || loginTenantKey.trim());
    if (result.tenants?.length) {
      setTenantOptions(result.tenants);
      return;
    }
    const resolvedTenantKey = result.tenantKey || tenantKey || loginTenantKey.trim();
    if (!resolvedTenantKey) return;
    setOtpSent(true);
    setOtpTenantKey(resolvedTenantKey);
    setLoginTenantKey(resolvedTenantKey);
    setOtpCode("");
    setCooldown(30);
    setNotice("Code sent. Check your phone.");
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    await onVerifyOtp(loginPhone.trim(), otpTenantKey.trim(), otpCode.trim());
  };

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    if (!registerPhone.trim().startsWith("+")) {
      setNotice("Include country code (e.g., +1...)");
      return;
    }
    setNotice(null);
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
          currency: svc.currency.trim() || "USD"
        };
      });
    const result = await onRegister({
      displayName: registerBusinessName.trim(),
      ownerName: registerOwnerName.trim(),
      phone: registerPhone.trim(),
      email: registerEmail.trim() || undefined,
      timezone: registerTimezone.trim() || undefined,
      services: services.length ? services : undefined
    });
    if (!result.tenantKey) return;
    setLoginPhone(registerPhone.trim());
    setLoginTenantKey(result.tenantKey);
    setOtpSent(true);
    setOtpTenantKey(result.tenantKey);
    setRegisterMode(false);
    setRegisterBusinessName("");
    setRegisterOwnerName("");
    setRegisterPhone("");
    setRegisterEmail("");
    setRegisterServices([]);
    setCooldown(30);
    setNotice("Account created. Verify the code we just sent.");
  };

  return (
    <div className="owner-card">
      <h2>Owner access</h2>
      {!otpSent && !registerMode ? (
        <form className="auth-stack" onSubmit={(event) => { event.preventDefault(); requestOtp(); }}>
          <input value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} placeholder="Phone number" type="tel" />
          <input value={loginTenantKey} onChange={(e) => setLoginTenantKey(e.target.value)} placeholder="Tenant key (optional)" />
          {tenantOptions.length > 0 && (
            <div className="tenant-picker">
              <p className="muted">Choose your business</p>
              {tenantOptions.map((tenant) => (
                <button
                  key={tenant.key}
                  type="button"
                  className="tenant-option"
                  onClick={() => requestOtp(tenant.key)}
                  disabled={loading}
                >
                  <span className="tenant-title">{tenant.name}</span>
                  <span className="tenant-subtitle">{tenant.key}</span>
                </button>
              ))}
            </div>
          )}
          <button type="submit" disabled={loading || !loginPhone.trim()}>
            {loading ? "Sending…" : "Send code"}
          </button>
          {notice && <p className="notice">{notice}</p>}
          {error && <p className="error">{error}</p>}
          <p className="muted">We will text you a verification code.</p>
          <button type="button" className="link-button" onClick={() => setRegisterMode(true)} disabled={loading}>
            Create account
          </button>
        </form>
      ) : null}

      {!otpSent && registerMode ? (
        <form className="auth-stack" onSubmit={handleRegister}>
          <h3>Create account</h3>
          <input value={registerBusinessName} onChange={(e) => setRegisterBusinessName(e.target.value)} placeholder="Business name" />
          <input value={registerOwnerName} onChange={(e) => setRegisterOwnerName(e.target.value)} placeholder="Owner name" />
          <input value={registerPhone} onChange={(e) => setRegisterPhone(e.target.value)} placeholder="Phone number" type="tel" />
          <input value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} placeholder="Email (optional)" type="email" />
          <input value={registerTimezone} onChange={(e) => setRegisterTimezone(e.target.value)} placeholder="Timezone (e.g. America/New_York)" />
          <div className="divider" />
          <h4>Services (optional)</h4>
          {registerServices.map((service, idx) => (
            <div key={`service-${idx}`} className="service-card">
              <input
                value={service.name}
                onChange={(e) => {
                  const next = [...registerServices];
                  next[idx] = { ...next[idx], name: e.target.value };
                  setRegisterServices(next);
                }}
                placeholder="Service name"
              />
              <div className="form-row">
                <input
                  value={service.durationMinutes}
                  onChange={(e) => {
                    const next = [...registerServices];
                    next[idx] = { ...next[idx], durationMinutes: e.target.value };
                    setRegisterServices(next);
                  }}
                  placeholder="Duration (min)"
                />
                <input
                  value={service.price}
                  onChange={(e) => {
                    const next = [...registerServices];
                    next[idx] = { ...next[idx], price: e.target.value };
                    setRegisterServices(next);
                  }}
                  placeholder="Price"
                />
              </div>
              <input
                value={service.currency}
                onChange={(e) => {
                  const next = [...registerServices];
                  next[idx] = { ...next[idx], currency: e.target.value };
                  setRegisterServices(next);
                }}
                placeholder="Currency"
              />
              <button
                type="button"
                className="ghost"
                onClick={() => setRegisterServices(registerServices.filter((_, i) => i !== idx))}
              >
                Remove service
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => setRegisterServices((prev) => [...prev, { name: "", durationMinutes: "45", price: "", currency: "USD" }])}
          >
            Add service
          </button>
          {notice && <p className="notice">{notice}</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>
          <button type="button" className="link-button" onClick={() => setRegisterMode(false)} disabled={loading}>
            Back to login
          </button>
        </form>
      ) : null}

      {otpSent ? (
        <form className="auth-stack" onSubmit={handleVerify}>
          <h3>Verify code</h3>
          <p className="muted">Code sent to {loginPhone}</p>
          <p className="muted">Tenant: {otpTenantKey}</p>
          <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="Verification code" inputMode="numeric" />
          {notice && <p className="notice">{notice}</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || !otpCode.trim()}>
            {loading ? "Verifying…" : "Verify"}
          </button>
          <button type="button" className="secondary" onClick={() => requestOtp(otpTenantKey)} disabled={loading || cooldown > 0}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
          <button type="button" className="link-button" onClick={() => setOtpSent(false)} disabled={loading}>
            Edit phone
          </button>
        </form>
      ) : null}
    </div>
  );
}
