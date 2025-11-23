import { CustomerRecord } from "../types";

interface Props {
  items: CustomerRecord[];
}

export function CustomerList({ items }: Props) {
  return (
    <section>
      <header className="section-header">
        <h3>Recent customers</h3>
        <span className="muted">{items.length}</span>
      </header>
      {!items.length && <div className="empty">No customers yet</div>}
      <ul className="card-list">
        {items.map((customer) => (
          <li key={customer.id}>
            <div>
              <strong>{customer.displayName || customer.id}</strong>
              {customer.phone && <div className="muted">{customer.phone}</div>}
              <div className="muted">Bookings: {customer.appointmentCount ?? 0}</div>
              {customer.lastBooking && <div className="muted">Last: {new Date(customer.lastBooking).toLocaleString()}</div>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
