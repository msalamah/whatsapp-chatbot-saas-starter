import { PendingBooking } from "../types";

interface Props {
  tenantName?: string;
  bookings: PendingBooking[];
  loading: boolean;
  onRefresh: () => void;
  onApprove: (customerId: string) => void;
  onReject: (customerId: string) => void;
}

export function PendingApprovals({ tenantName, bookings, loading, onRefresh, onApprove, onReject }: Props) {
  return (
    <div className="panel">
      <div className="status-bar">
        <div>
          <h2 style={{ margin: 0 }}>Pending approvals</h2>
          {tenantName && <span>{tenantName}</span>}
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      </div>
      {loading && <div>Loading…</div>}
      {!loading && !bookings.length && <div className="empty-state">No pending bookings</div>}
      {!loading && bookings.length > 0 && (
        <ul className="pending-list">
          {bookings.map((booking) => (
            <li key={booking.customerId}>
              <div className="pending-body">
                <div>
                  <strong>{booking.serviceName || "Service"}</strong>
                  <div className="muted">{booking.slotLabel || "Pending slot"}</div>
                  <div className="muted">Customer: {booking.customerId}</div>
                </div>
                <div className="actions-row">
                  <button type="button" onClick={() => onApprove(booking.customerId)}>
                    Approve
                  </button>
                  <button type="button" className="danger" onClick={() => onReject(booking.customerId)}>
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
