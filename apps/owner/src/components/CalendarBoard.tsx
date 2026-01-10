import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { Calendar as BigCalendar, Views, luxonLocalizer } from "react-big-calendar";
import type { View } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Appointment, CalendarRule, PendingBooking } from "../types";

const localizer = luxonLocalizer(DateTime);

interface Props {
  timezone: string;
  appointments: Appointment[];
  pending: PendingBooking[];
  rules?: CalendarRule[];
}

interface TimelineEvent {
  id: string;
  title: string;
  start: DateTime;
  end: DateTime;
  type: "appointment" | "pending";
}

export function CalendarBoard({ timezone, appointments, pending, rules = [] }: Props) {
  const [view, setView] = useState<View>(Views.WEEK);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const timelineEvents = useMemo(() => {
    const convert = (
      startISO: string | undefined,
      endISO: string | undefined,
      title: string,
      type: "appointment" | "pending"
    ): TimelineEvent | null => {
      if (!startISO) return null;
      const startRaw = DateTime.fromISO(startISO);
      if (!startRaw.isValid) return null;
      const endRaw = endISO ? DateTime.fromISO(endISO) : startRaw.plus({ minutes: 30 });
      const start = startRaw.setZone(timezone);
      const end = endRaw.isValid ? endRaw.setZone(timezone) : start.plus({ minutes: 30 });
      if (!end.isValid) return null;
      return { id: `${type}-${startISO}-${title}`, title, start, end, type };
    };
    const appts =
      appointments
        ?.map((appt) => {
          const startISO = appt.start_iso ?? (appt as { startISO?: string }).startISO;
          const endISO = appt.end_iso ?? (appt as { endISO?: string }).endISO;
          return convert(startISO, endISO, appt.service_name || "Appointment", "appointment");
        })
        .filter(Boolean) || [];
    const pendings =
      pending
        ?.map((req) => convert(req.startISO, req.endISO, req.serviceName || req.slotLabel || "Pending request", "pending"))
        .filter(Boolean) || [];
    return [...appts, ...pendings] as TimelineEvent[];
  }, [appointments, pending, timezone]);

  const calendarEvents = useMemo(
    () =>
      timelineEvents.map((entry) => ({
        id: entry.id,
        title: entry.title,
        start: entry.start.setZone(DateTime.local().zoneName, { keepLocalTime: true }).toJSDate(),
        end: entry.end.setZone(DateTime.local().zoneName, { keepLocalTime: true }).toJSDate(),
        resource: entry
      })),
    [timelineEvents]
  );

  const timeWindow = useMemo(() => {
    const hours: number[] = [];
    timelineEvents.forEach((event) => {
      hours.push(event.start.hour + event.start.minute / 60);
      hours.push(event.end.hour + event.end.minute / 60);
    });
    rules.forEach((rule) => {
      const [startH, startM] = rule.start.split(":").map(Number);
      const [endH, endM] = rule.end.split(":").map(Number);
      if (!Number.isNaN(startH)) hours.push(startH + (startM || 0) / 60);
      if (!Number.isNaN(endH)) hours.push(endH + (endM || 0) / 60);
    });
    let min = Math.floor(Math.min(...hours, 6));
    let max = Math.ceil(Math.max(...hours, 20));
    if (!Number.isFinite(min)) min = 6;
    if (!Number.isFinite(max)) max = 20;
    min = Math.max(0, Math.min(22, min));
    max = Math.max(min + 2, Math.min(24, max));
    return { startHour: min, endHour: max };
  }, [timelineEvents, rules]);

  const minTime = useMemo(() => {
    const d = new Date();
    d.setHours(timeWindow.startHour, 0, 0, 0);
    return d;
  }, [timeWindow.startHour]);

  const maxTime = useMemo(() => {
    const d = new Date();
    d.setHours(timeWindow.endHour, 0, 0, 0);
    return d;
  }, [timeWindow.endHour]);

  const eventPropGetter = (event: { resource?: TimelineEvent }) => {
    const type = event.resource?.type === "pending" ? "pending" : "booked";
    return { className: type };
  };

  return (
    <div className="calendar-preview">
      <BigCalendar
        localizer={localizer}
        events={calendarEvents}
        min={minTime}
        max={maxTime}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={(next) => setView(next)}
        date={currentDate}
        onNavigate={(date) => setCurrentDate(date)}
        components={{
          toolbar: (props) => (
            <div className="calendar-toolbar">
              <div className="calendar-range">
                <button type="button" className="ghost" onClick={() => props.onNavigate("PREV")}>
                  ←
                </button>
                <span>{props.label}</span>
                <button type="button" className="ghost" onClick={() => props.onNavigate("NEXT")}>
                  →
                </button>
                <span className="timezone-chip">{timezone}</span>
              </div>
              <div className="calendar-view-toggle">
                {[Views.DAY, Views.WEEK, Views.MONTH].map((mode) => (
                  <button key={mode} type="button" className={`ghost ${props.view === mode ? "active" : ""}`} onClick={() => props.onView(mode)}>
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )
        }}
        eventPropGetter={eventPropGetter}
        style={{ height: 600 }}
        onSelectEvent={(event) => setSelectedEvent(event.resource || null)}
      />
      {selectedEvent && (
        <div className="calendar-event-detail">
          <div>
            <strong>{selectedEvent.title}</strong>
            <p className="muted">
              {selectedEvent.start.toFormat("ccc, LLL d · HH:mm")} – {selectedEvent.end.toFormat("HH:mm")} ({selectedEvent.type})
            </p>
          </div>
          <button className="ghost" onClick={() => setSelectedEvent(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
