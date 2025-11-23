import { ServiceRecord } from "../types";

interface Props {
  items: ServiceRecord[];
}

export function ServiceList({ items }: Props) {
  return (
    <section>
      <header className="section-header">
        <h3>Service catalog</h3>
        <span className="muted">{items.length} services</span>
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
                {service.minMinutes || service.maxMinutes ? `${service.minMinutes}-${service.maxMinutes} min` : ""}
              </div>
              {service.description && <div className="muted">{service.description}</div>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
