import { AuditEvent } from "../types";

interface Props {
  events: AuditEvent[];
}

function formatTime(iso: string) {
  try {
    const date = new Date(iso);
    return date.toLocaleString();
  } catch {
    return iso;
  }
}

export function ActivityFeed({ events }: Props) {
  if (!events.length) {
    return (
      <div className="empty-state">
        <h3>No admin activity yet</h3>
        <p>Actions performed in the admin portal will appear here.</p>
      </div>
    );
  }

  return (
    <ul className="activity-feed">
      {events.map((event, index) => (
        <li key={`${event.timestamp}-${index}`}>
          <div className="activity-meta">
            <span className="actor">
              {event.actor}
              <span className="role">{event.role}</span>
            </span>
            <time>{formatTime(event.timestamp)}</time>
          </div>
          <div className="activity-body">
            <strong>{event.action.replace("tenant.", "")}</strong>
            {event.tenantKey && <span className="tenant-key">{event.tenantKey}</span>}
          </div>
          {event.details && (
            <pre className="activity-details">
              {JSON.stringify(event.details, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}
