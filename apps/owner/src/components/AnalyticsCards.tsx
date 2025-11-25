import { AnalyticsSummary } from "../types";

interface Props {
  analytics: AnalyticsSummary | null;
}

const cards = [
  { key: "totalAppointments", label: "All-time bookings" },
  { key: "last30Appointments", label: "Bookings (30d)" },
  { key: "upcomingBookings", label: "Upcoming" },
  { key: "projectedRevenue", label: "Projected revenue" }
] as const;

export function AnalyticsCards({ analytics }: Props) {
  if (!analytics) return null;
  return (
    <section className="analytics-grid">
      {cards.map((card) => (
        <div key={card.key} className="analytics-card">
          <span className="muted">{card.label}</span>
          <strong>
            {card.key === "projectedRevenue" ? `$${(analytics[card.key] as number).toFixed(2)}` : analytics[card.key]}
          </strong>
        </div>
      ))}
    </section>
  );
}
