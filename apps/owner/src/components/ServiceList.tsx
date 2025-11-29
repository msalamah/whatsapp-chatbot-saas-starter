import { FormEvent, useState } from "react";
import { ServiceFormState, ServiceRecord } from "../types";

interface Props {
  items: ServiceRecord[];
  busy?: boolean;
  onSave: (service: ServiceFormState) => void;
  onDelete: (serviceId: string) => void;
}

const emptyForm: ServiceFormState = {
  name: "",
  price: 0,
  currency: "USD",
  minMinutes: 30,
  maxMinutes: 45,
  description: ""
};

function toFormState(service: ServiceRecord): ServiceFormState {
  return {
    id: service.id,
    name: service.name,
    price: service.price ?? 0,
    currency: service.currency || "USD",
    minMinutes: service.minMinutes ?? 30,
    maxMinutes: service.maxMinutes ?? service.minMinutes ?? 45,
    description: service.description || ""
  };
}

export function ServiceList({ items, busy = false, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<ServiceFormState | null>(null);

  const startEditing = (service?: ServiceRecord) => {
    setEditing(service ? toFormState(service) : { ...emptyForm, id: undefined });
  };

  const handleChange = (field: keyof ServiceFormState, value: string) => {
    setEditing((prev) => prev ? { ...prev, [field]: field.includes("Minutes") || field === "price" ? Number(value) : value } : prev);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    onSave(editing);
    setEditing(null);
  };

  return (
    <section>
      <header className="section-header">
        <h3>Service catalog</h3>
        <button onClick={() => startEditing()} disabled={busy}>Add service</button>
      </header>
      {!items.length && <div className="empty">No services configured</div>}
      <ul className="card-list">
        {items.map((service) => (
          <li key={service.id}>
            <div>
              <strong>{service.name}</strong>
              <div className="muted">
                {service.currency || "USD"} {service.price ?? 0}
                {" · "}
                {(service.minMinutes || service.maxMinutes) ? `${service.minMinutes}-${service.maxMinutes} min` : ""}
              </div>
              {service.description && <div className="muted">{service.description}</div>}
            </div>
            <div className="actions">
              <button onClick={() => startEditing(service)}>Edit</button>
              <button className="danger" onClick={() => onDelete(service.id)} disabled={busy}>Delete</button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <form className="owner-card" onSubmit={handleSubmit}>
          <h4>{editing.id ? "Edit service" : "New service"}</h4>
          <input value={editing.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Name" required />
          <input type="number" value={editing.price} onChange={(e) => handleChange("price", e.target.value)} placeholder="Price" min={0} />
          <input value={editing.currency} onChange={(e) => handleChange("currency", e.target.value)} placeholder="Currency" />
          <div className="two-col">
            <input type="number" value={editing.minMinutes} onChange={(e) => handleChange("minMinutes", e.target.value)} placeholder="Min minutes" min={5} />
            <input type="number" value={editing.maxMinutes} onChange={(e) => handleChange("maxMinutes", e.target.value)} placeholder="Max minutes" min={editing.minMinutes} />
          </div>
          <textarea value={editing.description} onChange={(e) => handleChange("description", e.target.value)} placeholder="Description" />
          <div className="actions">
            <button type="submit" disabled={busy}>{editing.id ? "Save" : "Create"}</button>
            <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
