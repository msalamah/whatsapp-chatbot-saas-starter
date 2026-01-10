import { CustomerRecord } from "../types";

interface Props {
  items: CustomerRecord[];
  onSelect: (id: string) => void;
  title?: string;
  onViewAll?: () => void;
  scrollable?: boolean;
}

export function CustomerList({ items, onSelect, title = "Customers", onViewAll, scrollable = false }: Props) {
  return (
    <section>
      <header className="section-header">
        <div className="section-header-stack">
          <h3>{title}</h3>
          <span className="muted">{items.length}</span>
        </div>
        {onViewAll && (
          <button className="ghost" onClick={onViewAll}>
            Open page
          </button>
        )}
      </header>
      {!items.length && <div className="empty">No customers yet</div>}
      <ul className={`card-list ${scrollable && items.length ? "scrollable" : ""}`}>
        {items.map((customer) => (
          <li key={customer.id}>
            <div>
              <strong>{customer.displayName || customer.id}</strong>
              {customer.phone && <div className="muted">{customer.phone}</div>}
              <div className="muted">Bookings: {customer.appointmentCount ?? 0}</div>
              {customer.lastBooking && <div className="muted">Last: {new Date(customer.lastBooking).toLocaleString()}</div>}
            </div>
            <div className="actions">
              <button onClick={() => onSelect(customer.id)}>View</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
