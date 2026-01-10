import { CustomerDetail } from "../types";

interface Props {
  detail: CustomerDetail;
  onClose: () => void;
}

export function CustomerDetailCard({ detail, onClose }: Props) {
  return (
    <div className="detail-card">
      <header className="section-header">
        <h3>{detail.displayName || detail.id}</h3>
        <button className="ghost" onClick={onClose}>Close</button>
      </header>
      {detail.phone && <div className="muted">Phone: {detail.phone}</div>}
      {detail.language && <div className="muted">Language: {detail.language}</div>}
      <div className="muted">Bookings: {detail.appointmentCount ?? 0}</div>
      {detail.lastBooking && <div className="muted">Last booking: {new Date(detail.lastBooking).toLocaleString()}</div>}
      {detail.metadata && (
        <pre className="metadata-block">{JSON.stringify(detail.metadata, null, 2)}</pre>
      )}
      <h4 style={{ marginTop: "1rem" }}>Recent appointments</h4>
      {!detail.appointments?.length && <div className="empty">No appointments yet</div>}
      <ul className="card-list">
        {detail.appointments?.map((appt) => (
          <li key={appt.id}>
            <div>
              <strong>{appt.service_name || "Service"}</strong>
              <div className="muted">{appt.slot_label || appt.start_iso || ""}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
