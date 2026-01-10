import { Appointment } from "../types";

interface Props {
  items: Appointment[];
}

export function AppointmentsList({ items }: Props) {
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
          </li>
        ))}
      </ul>
    </section>
  );
}
