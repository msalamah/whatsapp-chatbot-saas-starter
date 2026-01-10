import { useEffect, useMemo, useState } from "react";
import type { FC } from "react";
import { DateTime } from "luxon";
import { Calendar as BigCalendar, Views, ToolbarProps, View, luxonLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { AdminCredentials, AppointmentRecord, CalendarBlock, CalendarRule, InternalCalendar, PendingBooking } from "../types";
import { fetchCalendarConfig, updateCalendarConfig } from "../api";

const localizer = luxonLocalizer(DateTime);

interface Props {
  credentials: AdminCredentials | null;
  tenantKey: string | null;
  tenantName?: string;
  notify: (notification: { type: "success" | "error"; message: string }) => void;
  appointments: AppointmentRecord[];
  pending: PendingBooking[];
}

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const quickTimezones = ["America/New_York", "Europe/London", "Asia/Jerusalem", "UTC"];

const emptyCalendar = (): InternalCalendar => ({
  timezone: "UTC",
  capacity: 1,
  lookaheadDays: 30,
  rules: [],
  blocks: []
});

const defaultRule = (): CalendarRule => ({
  dayOfWeek: 1,
  start: "09:00",
  end: "17:00",
  capacity: null
});

const defaultBlock = (): CalendarBlock => ({
  startISO: "",
  endISO: "",
  reason: ""
});

function toLocalInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

interface TimelineEvent {
  id: string;
  title: string;
  start: DateTime;
  end: DateTime;
  type: "appointment" | "pending";
}

export function CalendarEditor({ credentials, tenantKey, tenantName, notify, appointments, pending }: Props) {
  const [calendar, setCalendar] = useState<InternalCalendar>(emptyCalendar);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [calendarView, setCalendarView] = useState<View>(Views.WEEK);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!credentials || !tenantKey) {
      setCalendar(emptyCalendar());
      setDirty(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchCalendarConfig(credentials, tenantKey)
      .then((config) => {
        setCalendar({
          timezone: config.timezone || "UTC",
          capacity: config.capacity || 1,
          lookaheadDays: config.lookaheadDays || 30,
          rules: config.rules || [],
          blocks: config.blocks || []
        });
        setDirty(false);
      })
      .catch((err) => notify({ type: "error", message: err instanceof Error ? err.message : "Failed to load calendar" }))
      .finally(() => setLoading(false));
  }, [credentials, tenantKey, notify]);

  const disabled = !credentials || !tenantKey;
  const timezone = calendar.timezone || "UTC";

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

    const apptEvents =
      (appointments || [])
        .map((appt) => convert(appt.start_iso, appt.end_iso || appt.start_iso, appt.slot_label || appt.service_name || "Appointment", "appointment"))
        .filter(Boolean) || [];
    const pendingEvents =
      (pending || [])
        .map((req) => convert(req.startISO, req.endISO || req.startISO, req.slotLabel || req.serviceName || "Pending request", "pending"))
        .filter(Boolean) || [];
    return [...apptEvents, ...pendingEvents] as TimelineEvent[];
  }, [appointments, pending, timezone]);

  interface CalendarEventRecord {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource: TimelineEvent;
  }

  const calendarEvents: CalendarEventRecord[] = useMemo(
    () =>
      timelineEvents.map((entry): CalendarEventRecord => ({
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
    (calendar.rules || []).forEach((rule) => {
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
  }, [timelineEvents, calendar.rules]);

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
    if (event.resource?.type === "pending") {
      return { className: "rbc-event pending" };
    }
    return { className: "rbc-event booked" };
  };

  const headline = useMemo(() => {
    if (!tenantKey) return "Internal calendar";
    return `Internal calendar · ${tenantName || tenantKey}`;
  }, [tenantKey, tenantName]);

  const handleSave = async () => {
    if (!credentials || !tenantKey) return;
    setSaving(true);
    try {
      const payload = {
        timezone: calendar.timezone,
        capacity: Number(calendar.capacity) || 1,
        lookaheadDays: Number(calendar.lookaheadDays) || 30,
        rules: calendar.rules.map((rule) => ({
          ...rule,
          capacity: rule.capacity == null ? null : Number(rule.capacity)
        })),
        blocks: calendar.blocks
      };
      const saved = await updateCalendarConfig(credentials, tenantKey, payload);
      setCalendar(saved);
      setDirty(false);
      notify({ type: "success", message: "Calendar saved" });
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : "Failed to save calendar" });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof InternalCalendar, value: string | number) => {
    setCalendar((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const updateRule = (index: number, patch: Partial<CalendarRule>) => {
    setCalendar((prev) => {
      const rules = prev.rules.slice();
      rules[index] = { ...rules[index], ...patch };
      return { ...prev, rules };
    });
    setDirty(true);
  };

  const updateBlock = (index: number, patch: Partial<CalendarBlock>) => {
    setCalendar((prev) => {
      const blocks = prev.blocks.slice();
      blocks[index] = { ...blocks[index], ...patch };
      return { ...prev, blocks };
    });
    setDirty(true);
  };

  const addRule = () => {
    setCalendar((prev) => ({ ...prev, rules: [...prev.rules, defaultRule()] }));
    setDirty(true);
  };

  const removeRule = (index: number) => {
    setCalendar((prev) => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }));
    setDirty(true);
  };

  const addBlock = () => {
    setCalendar((prev) => ({ ...prev, blocks: [...prev.blocks, defaultBlock()] }));
    setDirty(true);
  };

  const removeBlock = (index: number) => {
    setCalendar((prev) => ({ ...prev, blocks: prev.blocks.filter((_, i) => i !== index) }));
    setDirty(true);
  };

  const handleSelectEvent = (event: { resource?: TimelineEvent }) => {
    if (event.resource) {
      setSelectedEvent(event.resource);
    }
  };

  const CustomToolbar: FC<ToolbarProps<CalendarEventRecord, object>> = (props) => (
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
          <button
            key={mode}
            type="button"
            className={`ghost ${props.view === mode ? "active" : ""}`}
            onClick={() => props.onView(mode)}
          >
            {mode.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="panel">
      <div className="status-bar">
        <h2>{headline}</h2>
        <div className="status-flags">
          {dirty && !loading && <span className="muted">Unsaved changes</span>}
          {loading && <span>Loading…</span>}
        </div>
      </div>
      {!tenantKey ? (
        <p className="muted">Select a tenant to configure their booking calendar, capacity, and blackout dates.</p>
      ) : (
        <div className="form-grid">
          <div className="form-grid two-col">
            <div className="form-field">
              <label>Timezone</label>
              <div className="timezone-input">
                <input value={calendar.timezone} disabled={disabled} onChange={(e) => updateField("timezone", e.target.value)} />
                <div className="timezone-pills">
                  {quickTimezones.map((tz) => (
                    <button
                      key={tz}
                      type="button"
                      className={`ghost ${timezone === tz ? "active" : ""}`}
                      disabled={disabled}
                      onClick={() => updateField("timezone", tz)}
                    >
                      {tz}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="form-grid two-col compact-grid">
              <div className="form-field">
                <label>Lookahead days</label>
                <input
                  type="number"
                  min={1}
                  disabled={disabled}
                  value={calendar.lookaheadDays}
                  onChange={(e) => updateField("lookaheadDays", Number(e.target.value))}
                />
              </div>
              <div className="form-field">
                <label>Max concurrent services</label>
                <input
                  type="number"
                  min={1}
                  disabled={disabled}
                  value={calendar.capacity}
                  onChange={(e) => updateField("capacity", Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="form-field">
            <label>Weekly working hours</label>
            <p className="muted">Define the recurring windows customers can book. Leave capacity blank to inherit the default above.</p>
            {calendar.rules.length === 0 && <p className="muted">No hours configured yet.</p>}
            <div className="calendar-list">
              {calendar.rules.map((rule, idx) => (
                <div key={idx} className="panel nested-light" style={{ padding: "0.75rem", gap: "0.75rem" }}>
                  <div className="form-grid two-col">
                    <div className="form-field">
                      <label>Day</label>
                      <select value={rule.dayOfWeek} disabled={disabled} onChange={(e) => updateRule(idx, { dayOfWeek: Number(e.target.value) })}>
                        {dayLabels.map((label, value) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-grid two-col">
                      <div className="form-field">
                        <label>Start</label>
                        <input type="time" value={rule.start} disabled={disabled} onChange={(e) => updateRule(idx, { start: e.target.value })} />
                      </div>
                      <div className="form-field">
                        <label>End</label>
                        <input type="time" value={rule.end} disabled={disabled} onChange={(e) => updateRule(idx, { end: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="form-grid two-col">
                    <div className="form-field">
                      <label>Capacity override</label>
                      <input
                        type="number"
                        min={1}
                        placeholder="Use default"
                        value={rule.capacity ?? ""}
                        disabled={disabled}
                        onChange={(e) => updateRule(idx, { capacity: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                    <div className="form-field" style={{ justifyContent: "flex-end" }}>
                      <button type="button" className="danger" disabled={disabled} onClick={() => removeRule(idx)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" disabled={disabled} onClick={addRule}>
              Add working hour
            </button>
          </div>

          <div className="form-field">
            <label>Blackout blocks</label>
            <p className="muted">Create one-off closures for holidays, training, or repairs.</p>
            {calendar.blocks.length === 0 && <p className="muted">No blocks configured.</p>}
            <div className="calendar-list">
              {calendar.blocks.map((block, idx) => (
                <div key={idx} className="panel nested-light" style={{ padding: "0.75rem", gap: "0.75rem" }}>
                  <div className="form-grid two-col">
                    <div className="form-field">
                      <label>Start</label>
                      <input
                        type="datetime-local"
                        value={toLocalInput(block.startISO)}
                        disabled={disabled}
                        onChange={(e) => updateBlock(idx, { startISO: fromLocalInput(e.target.value) })}
                      />
                    </div>
                    <div className="form-field">
                      <label>End</label>
                      <input
                        type="datetime-local"
                        value={toLocalInput(block.endISO)}
                        disabled={disabled}
                        onChange={(e) => updateBlock(idx, { endISO: fromLocalInput(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="form-grid two-col">
                    <div className="form-field">
                      <label>Reason</label>
                      <input value={block.reason || ""} disabled={disabled} onChange={(e) => updateBlock(idx, { reason: e.target.value })} />
                    </div>
                    <div className="form-field" style={{ justifyContent: "flex-end" }}>
                      <button type="button" className="danger" disabled={disabled} onClick={() => removeBlock(idx)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" disabled={disabled} onClick={addBlock}>
              Add block
            </button>
          </div>

          <div className="form-field" style={{ justifyContent: "flex-end" }}>
            <button type="button" onClick={handleSave} disabled={disabled || saving || loading || !dirty}>
              {saving ? "Saving…" : "Save calendar"}
            </button>
          </div>

          <div className="calendar-preview">
            <BigCalendar<CalendarEventRecord>
              localizer={localizer}
              events={calendarEvents}
              min={minTime}
              max={maxTime}
              startAccessor={(event) => event.start}
              endAccessor={(event) => event.end}
              view={calendarView}
              onView={(next) => setCalendarView(next)}
              date={currentDate}
              onNavigate={(date) => setCurrentDate(date)}
              components={{ toolbar: CustomToolbar }}
              eventPropGetter={eventPropGetter}
              style={{ height: 600 }}
              onSelectEvent={handleSelectEvent}
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
        </div>
      )}
    </section>
  );
}
