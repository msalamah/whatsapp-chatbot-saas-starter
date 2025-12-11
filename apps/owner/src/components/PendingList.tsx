import { PendingBooking } from "../types";

interface Props {
  items: PendingBooking[];
  onApprove: (customerId: string) => void;
  onReject: (customerId: string) => void;
  refreshing?: boolean;
}

export function PendingList({ items, onApprove, onReject, refreshing = false }: Props) {
  return (
    <section>
      <header className="section-header">
        <h3>Pending approvals</h3>
        <span className="muted">{items.length} request{items.length === 1 ? "" : "s"}</span>
      </header>
      {refreshing && <div className="muted">Refreshing…</div>}
      {!items.length && <div className="empty">No pending bookings.</div>}
      <ul className={`card-list ${items.length ? "scrollable" : ""}`}>
        {items.map((pending) => (
          <li key={pending.customerId}>
            <div>
              <strong>{pending.serviceName || "Service"}</strong>
              <div className="muted">{pending.slotLabel || "Pending slot"}</div>
            </div>
            <div className="actions">
              <button onClick={() => onApprove(pending.customerId)}>Approve</button>
              <button className="danger" onClick={() => onReject(pending.customerId)}>Reject</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
