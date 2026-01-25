import { Appointment } from "../types";

interface Props {
  items: Appointment[];
  onCancel?: (appointmentId: string) => void;
  cancellingId?: string | null;
}

export function AppointmentsList({ items, onCancel, cancellingId }: Props) {
  return (
    <section>
      <header className="section-header">
        <h3>Recent approvals</h3>
      </header>
      {!items.length && <div className="empty">No recent appointments</div>}
      <ul className={`card-list ${items.length ? "scrollable" : ""}`}>
        {items.map((appt) => (
          <li key={appt.id}>
            <div>
              <strong>{appt.service_name || "Service"}</strong>
              <div className="muted">{appt.slot_label || appt.start_iso || ""}</div>
            </div>
            {onCancel ? (
              <button
                className="ghost danger"
                onClick={() => onCancel(appt.id)}
                disabled={cancellingId === appt.id}
              >
                {cancellingId === appt.id ? "Cancelling…" : "Cancel"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
