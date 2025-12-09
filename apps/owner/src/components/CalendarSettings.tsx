import { useEffect, useMemo, useState } from "react";
import { CalendarBlock, CalendarRule, OwnerCalendar } from "../types";

interface Props {
  calendar: OwnerCalendar | null;
  saving: boolean;
  onSave: (calendar: OwnerCalendar) => Promise<void>;
}

const defaultCalendar = (): OwnerCalendar => ({
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

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

export function CalendarSettings({ calendar, saving, onSave }: Props) {
  const [draft, setDraft] = useState<OwnerCalendar>(defaultCalendar);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (calendar) {
      setDraft(calendar);
    } else {
      setDraft(defaultCalendar());
    }
    setDirty(false);
  }, [calendar]);

  const disableActions = saving || !calendar;

  const updateField = (field: keyof OwnerCalendar, value: string | number) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const updateRule = (index: number, patch: Partial<CalendarRule>) => {
    setDraft((prev) => {
      const rules = prev.rules.slice();
      rules[index] = { ...rules[index], ...patch };
      return { ...prev, rules };
    });
    setDirty(true);
  };

  const updateBlock = (index: number, patch: Partial<CalendarBlock>) => {
    setDraft((prev) => {
      const blocks = prev.blocks.slice();
      blocks[index] = { ...blocks[index], ...patch };
      return { ...prev, blocks };
    });
    setDirty(true);
  };

  const addRule = () => {
    setDraft((prev) => ({ ...prev, rules: [...prev.rules, defaultRule()] }));
    setDirty(true);
  };

  const removeRule = (index: number) => {
    setDraft((prev) => ({ ...prev, rules: prev.rules.filter((_, idx) => idx !== index) }));
    setDirty(true);
  };

  const addBlock = () => {
    setDraft((prev) => ({ ...prev, blocks: [...prev.blocks, defaultBlock()] }));
    setDirty(true);
  };

  const removeBlock = (index: number) => {
    setDraft((prev) => ({ ...prev, blocks: prev.blocks.filter((_, idx) => idx !== index) }));
    setDirty(true);
  };

  const normalized = useMemo(() => {
    return {
      timezone: draft.timezone || "UTC",
      capacity: Number(draft.capacity) || 1,
      lookaheadDays: Number(draft.lookaheadDays) || 30,
      rules: draft.rules.map((rule) => ({
        dayOfWeek: Number(rule.dayOfWeek) || 0,
        start: rule.start,
        end: rule.end,
        capacity: rule.capacity == null ? null : Number(rule.capacity)
      })),
      blocks: draft.blocks
        .filter((block) => block.startISO && block.endISO)
        .map((block) => ({
          startISO: block.startISO,
          endISO: block.endISO,
          reason: block.reason || ""
        }))
    };
  }, [draft]);

  const handleSave = async () => {
    await onSave(normalized);
    setDirty(false);
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h3>Working hours & availability</h3>
          <p className="muted">Control when customers can book and block out days you are unavailable.</p>
        </div>
        <button disabled={disableActions || !dirty} onClick={handleSave}>
          {saving ? "Saving…" : "Save calendar"}
        </button>
      </div>

      {!calendar && <p className="muted">Calendar will appear after loading…</p>}

      {calendar && (
        <div className="calendar-grid">
          <div className="calendar-field">
            <label>Timezone</label>
            <input value={draft.timezone} onChange={(e) => updateField("timezone", e.target.value)} disabled={saving} />
          </div>
          <div className="calendar-field">
            <label>Lookahead days</label>
            <input
              type="number"
              min={1}
              value={draft.lookaheadDays}
              onChange={(e) => updateField("lookaheadDays", Number(e.target.value))}
              disabled={saving}
            />
          </div>
          <div className="calendar-field">
            <label>Max concurrent services</label>
            <input type="number" min={1} value={draft.capacity} onChange={(e) => updateField("capacity", Number(e.target.value))} disabled={saving} />
          </div>
        </div>
      )}

      {calendar && (
        <>
          <div className="calendar-section">
            <div className="section-header">
              <h4>Weekly working hours</h4>
              <button className="ghost" onClick={addRule} disabled={saving}>
                Add working hour
              </button>
            </div>
            {draft.rules.length === 0 && <p className="empty">No working hours yet.</p>}
            <div className="calendar-stack">
              {draft.rules.map((rule, idx) => (
                <div key={`rule-${idx}`} className="calendar-card">
                  <div className="calendar-row">
                    <label>Day</label>
                    <select value={rule.dayOfWeek} onChange={(e) => updateRule(idx, { dayOfWeek: Number(e.target.value) })} disabled={saving}>
                      {dayLabels.map((label, value) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="calendar-row">
                    <label>Start</label>
                    <input type="time" value={rule.start} onChange={(e) => updateRule(idx, { start: e.target.value })} disabled={saving} />
                  </div>
                  <div className="calendar-row">
                    <label>End</label>
                    <input type="time" value={rule.end} onChange={(e) => updateRule(idx, { end: e.target.value })} disabled={saving} />
                  </div>
                  <div className="calendar-row">
                    <label>Capacity override</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="Use default"
                      value={rule.capacity ?? ""}
                      onChange={(e) => updateRule(idx, { capacity: e.target.value ? Number(e.target.value) : null })}
                      disabled={saving}
                    />
                  </div>
                  <div className="calendar-row">
                    <button className="ghost danger" onClick={() => removeRule(idx)} disabled={saving}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="calendar-section">
            <div className="section-header">
              <h4>Blackout blocks</h4>
              <button className="ghost" onClick={addBlock} disabled={saving}>
                Add block
              </button>
            </div>
            {draft.blocks.length === 0 && <p className="empty">No blocks scheduled.</p>}
            <div className="calendar-stack">
              {draft.blocks.map((block, idx) => (
                <div key={`block-${idx}`} className="calendar-card">
                  <div className="calendar-row">
                    <label>Start</label>
                    <input
                      type="datetime-local"
                      value={toLocalInput(block.startISO)}
                      onChange={(e) => updateBlock(idx, { startISO: fromLocalInput(e.target.value) })}
                      disabled={saving}
                    />
                  </div>
                  <div className="calendar-row">
                    <label>End</label>
                    <input
                      type="datetime-local"
                      value={toLocalInput(block.endISO)}
                      onChange={(e) => updateBlock(idx, { endISO: fromLocalInput(e.target.value) })}
                      disabled={saving}
                    />
                  </div>
                  <div className="calendar-row">
                    <label>Reason</label>
                    <input value={block.reason || ""} onChange={(e) => updateBlock(idx, { reason: e.target.value })} disabled={saving} />
                  </div>
                  <div className="calendar-row">
                    <button className="ghost danger" onClick={() => removeBlock(idx)} disabled={saving}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
