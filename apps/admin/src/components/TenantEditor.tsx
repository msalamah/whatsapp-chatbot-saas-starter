import { useEffect, useMemo, useState } from "react";
import { Tenant, TenantPayload } from "../types";

interface Props {
  selected: Tenant | null;
  onCreate: (payload: TenantPayload) => Promise<void>;
  onUpdate: (key: string, payload: TenantPayload) => Promise<void>;
  onRotate: (key: string, token: string) => Promise<void>;
}

interface ServiceDraft {
  id: string;
  name: string;
  minMinutes: string;
  maxMinutes: string;
  price: string;
  currency: string;
  description: string;
  keywords: string;
}

interface FormState {
  displayName: string;
  phoneNumberId: string;
  graphVersion: string;
  wabaToken: string;
  calendarEnabled: boolean;
  timezone: string;
  slotDurationMinutes: string;
  services: ServiceDraft[];
}

const defaultService = (): ServiceDraft => ({
  id: "haircut",
  name: "Haircut",
  minMinutes: "45",
  maxMinutes: "45",
  price: "45",
  currency: "USD",
  description: "",
  keywords: "haircut,cut,trim"
});

const emptyState = (): FormState => ({
  displayName: "",
  phoneNumberId: "",
  graphVersion: "v20.0",
  wabaToken: "",
  calendarEnabled: false,
  timezone: "America/New_York",
  slotDurationMinutes: "45",
  services: [defaultService()]
});

function mapTenantToForm(tenant: Tenant): FormState {
  return {
    displayName: tenant.displayName || "",
    phoneNumberId: tenant.phoneNumberId || "",
    graphVersion: tenant.graphVersion || "v20.0",
    wabaToken: "",
    calendarEnabled: Boolean(tenant.calendar?.enabled),
    timezone: tenant.calendar?.timezone || "UTC",
    slotDurationMinutes: String(tenant.calendar?.slotDurationMinutes ?? 45),
    services: (tenant.services || []).map((svc) => ({
      id: svc.id,
      name: svc.name,
      minMinutes: String(svc.minMinutes),
      maxMinutes: String(svc.maxMinutes),
      price: String(svc.price),
      currency: svc.currency,
      description: svc.description,
      keywords: svc.keywords?.join(", ") || ""
    }))
  };
}

function serviceDraftToPayload(service: ServiceDraft) {
  return {
    id: service.id.trim(),
    name: service.name.trim(),
    minMinutes: Number(service.minMinutes || 0),
    maxMinutes: Number(service.maxMinutes || service.minMinutes || 0),
    price: Number(service.price || 0),
    currency: service.currency.trim() || "USD",
    description: service.description.trim(),
    keywords: service.keywords
      .split(",")
      .map((kw) => kw.trim())
      .filter(Boolean)
  };
}

function formToPayload(form: FormState): TenantPayload {
  const services = form.services.map(serviceDraftToPayload);
  return {
    displayName: form.displayName.trim(),
    phoneNumberId: form.phoneNumberId.trim(),
    graphVersion: form.graphVersion.trim(),
    wabaToken: form.wabaToken.trim() || undefined,
    calendar: {
      enabled: form.calendarEnabled,
      timezone: form.timezone.trim(),
      slotDurationMinutes: Number(form.slotDurationMinutes || 45)
    },
    services
  };
}

export function TenantEditor({ selected, onCreate, onUpdate, onRotate }: Props) {
  const [form, setForm] = useState<FormState>(emptyState);
  const [rotationToken, setRotationToken] = useState("");
  const isUpdate = Boolean(selected);

  useEffect(() => {
    if (selected) {
      setForm(mapTenantToForm(selected));
    } else {
      setForm(emptyState());
    }
    setRotationToken("");
  }, [selected]);

  const headline = useMemo(() => (isUpdate ? "Tenant details" : "Add new tenant"), [isUpdate]);

  const handleChange = (field: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleServiceChange = (index: number, field: keyof ServiceDraft, value: string) => {
    setForm((prev) => {
      const services = prev.services.slice();
      services[index] = { ...services[index], [field]: value };
      return { ...prev, services };
    });
  };

  const addService = () => {
    setForm((prev) => ({
      ...prev,
      services: [...prev.services, { ...defaultService(), id: `service-${prev.services.length + 1}` }]
    }));
  };

  const removeService = (index: number) => {
    setForm((prev) => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = formToPayload(form);
    if (!payload.displayName || !payload.phoneNumberId) {
      return;
    }
    if (isUpdate && selected) {
      await onUpdate(selected.key, payload);
    } else {
      await onCreate(payload);
      setForm(emptyState());
    }
  };

  const handleRotate = async () => {
    if (!selected || !rotationToken.trim()) return;
    await onRotate(selected.key, rotationToken.trim());
    setRotationToken("");
  };

  return (
    <div className="panel">
      <div className="status-bar">
        <h2>{headline}</h2>
        {isUpdate ? (
          <span className="badge">Editing {selected?.key}</span>
        ) : (
          <span className="badge">New business</span>
        )}
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-grid two-col">
          <div className="form-field">
            <label>Display name</label>
            <input
              required
              value={form.displayName}
              onChange={(e) => handleChange("displayName", e.target.value)}
              placeholder="Salon name"
            />
          </div>
          <div className="form-field">
            <label>Graph version</label>
            <input
              value={form.graphVersion}
              onChange={(e) => handleChange("graphVersion", e.target.value)}
            />
          </div>
        </div>

        <div className="form-grid two-col">
          <div className="form-field">
            <label>Phone number ID</label>
            <input
              required
              value={form.phoneNumberId}
              onChange={(e) => handleChange("phoneNumberId", e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>WhatsApp token</label>
            <input
              type="password"
              placeholder={isUpdate ? "Leave blank to keep current" : "Required"}
              value={form.wabaToken}
              onChange={(e) => handleChange("wabaToken", e.target.value)}
            />
          </div>
        </div>

        <div className="form-grid two-col">
          <div className="form-field">
            <label>Timezone</label>
            <input
              value={form.timezone}
              onChange={(e) => handleChange("timezone", e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>Slot duration (minutes)</label>
            <input
              type="number"
              min={10}
              value={form.slotDurationMinutes}
              onChange={(e) => handleChange("slotDurationMinutes", e.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label>
            <input
              type="checkbox"
              checked={form.calendarEnabled}
              onChange={(e) => handleChange("calendarEnabled", e.target.checked)}
            />{" "}
            Google Calendar sync enabled
          </label>
        </div>

        <div className="form-field">
          <label>Services</label>
          <div className="form-grid">
            {form.services.map((service, idx) => (
              <div key={idx} className="panel" style={{ padding: "1rem" }}>
                <div className="form-grid two-col">
                  <div className="form-field">
                    <label>ID</label>
                    <input
                      value={service.id}
                      onChange={(e) => handleServiceChange(idx, "id", e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Name</label>
                    <input
                      value={service.name}
                      onChange={(e) => handleServiceChange(idx, "name", e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-grid two-col">
                  <div className="form-field">
                    <label>Min minutes</label>
                    <input
                      type="number"
                      value={service.minMinutes}
                      onChange={(e) => handleServiceChange(idx, "minMinutes", e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Max minutes</label>
                    <input
                      type="number"
                      value={service.maxMinutes}
                      onChange={(e) => handleServiceChange(idx, "maxMinutes", e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-grid two-col">
                  <div className="form-field">
                    <label>Price</label>
                    <input
                      type="number"
                      value={service.price}
                      onChange={(e) => handleServiceChange(idx, "price", e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Currency</label>
                    <input
                      value={service.currency}
                      onChange={(e) => handleServiceChange(idx, "currency", e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-field">
                  <label>Description</label>
                  <textarea
                    value={service.description}
                    onChange={(e) => handleServiceChange(idx, "description", e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Keywords</label>
                  <input
                    placeholder="Comma separated"
                    value={service.keywords}
                    onChange={(e) => handleServiceChange(idx, "keywords", e.target.value)}
                  />
                </div>
                {form.services.length > 1 && (
                  <button type="button" className="danger" onClick={() => removeService(idx)}>
                    Remove service
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addService}>
            Add service
          </button>
        </div>

        <button type="submit">{isUpdate ? "Save changes" : "Create tenant"}</button>
      </form>

      {isUpdate && selected && (
        <div className="panel" style={{ background: "rgba(8, 47, 73, 0.6)", border: "1px solid rgba(14, 165, 233, 0.2)" }}>
          <div className="form-grid two-col">
            <div className="form-field">
              <label>Rotate WhatsApp token</label>
              <input
                type="password"
                placeholder="New access token"
                value={rotationToken}
                onChange={(e) => setRotationToken(e.target.value)}
              />
            </div>
            <div className="form-field" style={{ justifyContent: "flex-end" }}>
              <button type="button" onClick={handleRotate} disabled={!rotationToken.trim()}>
                Rotate token
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
