import { ActivityIndicator, Modal, RefreshControl, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Calendar as MonthCalendar, WeekCalendar, CalendarProvider } from "react-native-calendars";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useOwner } from "../state/ownerContext";
import { styles } from "../styles";
import { Appointment } from "../types";

export function CalendarScreen() {
  const { fetchAppointmentsByRange, pending, openBooking } = useOwner();
  const [view, setView] = useState<"day" | "week" | "month">("month");
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const parseDateString = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString(new Date()));
  const [viewPickerVisible, setViewPickerVisible] = useState(false);

  const loadAppointments = useCallback(async (showSpinner = true) => {
    if (!fetchAppointmentsByRange) return;
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const data = await fetchAppointmentsByRange("all");
      setItems(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [fetchAppointmentsByRange]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const startOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay(); // 0 (Sun) - 6 (Sat)
    const diff = d.getDate() - day; // start Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const endOfWeek = (date: Date) => {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  const normalizeEnd = (start: Date, end?: Date) => {
    if (end && !Number.isNaN(end.getTime())) return end;
    const fallback = new Date(start);
    fallback.setMinutes(fallback.getMinutes() + 45);
    return fallback;
  };

  type CalendarEventType = {
    id: string;
    title: string;
    start: Date;
    end: Date;
    slot?: string;
    type: "appointment" | "pending";
  };

  const timelineEvents: CalendarEventType[] = useMemo(() => {
    const parsed: CalendarEventType[] = [];
    items.forEach((appt) => {
      if (!appt.start_iso) return;
      const start = new Date(appt.start_iso);
      if (Number.isNaN(start.getTime())) return;
      parsed.push({
        id: `appt-${appt.id}`,
        title: appt.service_name || "Appointment",
        start,
        end: normalizeEnd(start),
        slot: appt.slot_label,
        type: "appointment"
      });
    });
    pending.forEach((req) => {
      const iso = (req as { startISO?: string }).startISO;
      if (!iso) return;
      const start = new Date(iso);
      if (Number.isNaN(start.getTime())) return;
      parsed.push({
        id: `pending-${req.customerId}-${iso}`,
        title: req.serviceName || "Pending request",
        start,
        end: normalizeEnd(start),
        slot: req.slotLabel,
        type: "pending"
      });
    });
    return parsed;
  }, [items, pending]);

  const marks = useMemo(() => {
    const dots: Record<string, { dots: { color: string }[]; marked?: boolean }> = {};
    timelineEvents.forEach((evt) => {
      const key = toLocalDateString(evt.start);
      if (!dots[key]) dots[key] = { dots: [] };
      const color = evt.type === "pending" ? "#f87171" : "#0ea5e9";
      dots[key].dots.push({ color });
      dots[key].marked = true;
    });
    return dots;
  }, [timelineEvents]);

  const timelineDate = useMemo(() => {
    const base = parseDateString(selectedDate);
    if (view === "week") return startOfWeek(base);
    return base;
  }, [selectedDate, view]);

  const label = useMemo(() => {
    if (view === "day") {
      return timelineDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    }
    if (view === "week") {
      const start = timelineDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const end = endOfWeek(timelineDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `${start} – ${end}`;
    }
    return timelineDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [selectedDate, timelineDate, view]);

  const formatTime = (date: Date) => date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const handleDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
  };

  const goToPreviousRange = () => {
    const base = timelineDate;
    const date = new Date(base);
    if (view === "month") {
      date.setMonth(date.getMonth() - 1);
    } else if (view === "week") {
      date.setDate(date.getDate() - 7);
    } else {
      date.setDate(date.getDate() - 1);
    }
    setSelectedDate(toLocalDateString(date));
  };

  const goToNextRange = () => {
    const base = timelineDate;
    const date = new Date(base);
    if (view === "month") {
      date.setMonth(date.getMonth() + 1);
    } else if (view === "week") {
      date.setDate(date.getDate() + 7);
    } else {
      date.setDate(date.getDate() + 1);
    }
    setSelectedDate(toLocalDateString(date));
  };

  const weekDays = useMemo(() => {
    const start = startOfWeek(timelineDate);
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [timelineDate]);

  const eventsForSelectedDate = useMemo(() => {
    return timelineEvents
      .filter((evt) => toLocalDateString(evt.start) === selectedDate)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [timelineEvents, selectedDate]);

  const eventsByWeekDay = useMemo(() => {
    const map: Record<string, CalendarEventType[]> = {};
    weekDays.forEach((d) => {
      const key = toLocalDateString(d);
      map[key] = [];
    });
    timelineEvents.forEach((evt) => {
      const key = toLocalDateString(new Date(evt.start));
      if (map[key]) {
        map[key].push(evt);
      }
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => a.start.getTime() - b.start.getTime());
    });
    return map;
  }, [timelineEvents, weekDays]);

  const weekHours = useMemo(() => Array.from({ length: 24 }).map((_, i) => i), []);

  useEffect(() => {
    if (view === "week") {
      setSelectedDate(toLocalDateString(startOfWeek(parseDateString(selectedDate))));
    }
  }, [selectedDate, view]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.section, styles.calendarScreen]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadAppointments(false);
              setRefreshing(false);
            }}
            tintColor="#0ea5e9"
          />
        }
      >
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Calendar</Text>
          <Text style={styles.timezoneChip}>Local time</Text>
        </View>
        <View style={styles.calendarToolbar}>
          <View style={styles.calendarNav}>
            {view !== "month" ? (
              <TouchableOpacity style={styles.ghostButtonSmall} onPress={goToPreviousRange}>
                <Text style={styles.ghostButtonText}>←</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 44 }} />
            )}
            <TouchableOpacity style={styles.viewPicker} onPress={() => setViewPickerVisible(true)}>
              <Text style={styles.calendarLabel}>{label}</Text>
              <Text style={styles.viewPickerText}>{view.toUpperCase()}</Text>
            </TouchableOpacity>
            {view !== "month" ? (
              <TouchableOpacity style={styles.ghostButtonSmall} onPress={goToNextRange}>
                <Text style={styles.ghostButtonText}>→</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 44 }} />
            )}
          </View>
        </View>

        {loading && !timelineEvents.length ? <ActivityIndicator color="#0ea5e9" /> : null}
        {error && <Text style={styles.error}>{error}</Text>}
        {!loading && !timelineEvents.length ? <Text style={styles.muted}>No events in this view.</Text> : null}

        {view === "month" ? (
          <View style={styles.calendarWrapper}>
            <MonthCalendar
              current={selectedDate}
              onDayPress={(day) => {
                handleDayPress(day);
                setView("day");
              }}
              onMonthChange={(month) => {
                const next = new Date(month.year, month.month - 1, 1);
                setSelectedDate(toLocalDateString(next));
              }}
              markedDates={{
                ...marks,
                [selectedDate]: { ...(marks[selectedDate] || {}), selected: true, selectedColor: "#0ea5e9", selectedTextColor: "#fff" }
              }}
              markingType="multi-dot"
              firstDay={1}
              hideExtraDays={false}
              renderArrow={(direction) => <Text style={styles.calendarArrow}>{direction === "left" ? "←" : "→"}</Text>}
              theme={{
                todayTextColor: "#0ea5e9",
                selectedDayBackgroundColor: "#0ea5e9",
                selectedDayTextColor: "#fff",
                arrowColor: "#0ea5e9",
                dotColor: "#0ea5e9"
              }}
            />
          </View>
        ) : (
          <CalendarProvider date={selectedDate}>
            <View style={[styles.calendarWrapper, styles.weekCalendarContainer]}>
              <WeekCalendar
                key={`week-${selectedDate}`}
                current={selectedDate}
                onDayPress={(day) => {
                  setSelectedDate(day.dateString);
                  setView("day");
                }}
                firstDay={0}
                style={styles.weekCalendar}
                markedDates={{
                  ...marks,
                  [selectedDate]: { ...(marks[selectedDate] || {}), selected: true, selectedColor: "#0ea5e9", selectedTextColor: "#fff" }
                }}
                allowShadow={false}
                style={{ borderBottomWidth: 0 }}
              />
            </View>
            {view === "day" ? (
              <View style={[styles.calendarWrapper, styles.weekGrid]}>
                <View style={styles.dayGridHeader}>
                  <Text style={styles.sectionSubtitle}>
                    {new Date(selectedDate).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                  </Text>
                </View>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.weekGridScrollContent}
                >
                  {weekHours.map((hour) => {
                    const hourEvents = eventsForSelectedDate.filter((evt) => new Date(evt.start).getHours() === hour);
                    return (
                      <View key={hour} style={styles.weekRow}>
                        <View style={styles.weekTimeCol}>
                          <Text style={styles.weekTimeText}>{`${hour.toString().padStart(2, "0")}:00`}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.dayCell}
                          activeOpacity={0.7}
                          onPress={() => openBooking(new Date(`${selectedDate}T${hour.toString().padStart(2, "0")}:00:00`))}
                        >
                          {hourEvents.length === 0 ? null : (
                            hourEvents.map((event) => (
                              <View
                                key={event.id}
                                style={[
                                  styles.weekEvent,
                                  { marginVertical: 2 },
                                  event.type === "pending"
                                    ? { borderColor: "#f87171", backgroundColor: "rgba(248,113,113,0.12)" }
                                    : { borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,0.12)" }
                                ]}
                              >
                                <Text style={[styles.calendarEventTitle, { fontSize: 12 }]} numberOfLines={1} ellipsizeMode="tail">
                                  {event.title}
                                </Text>
                                <Text style={[styles.calendarEventMeta, { fontSize: 11 }]} numberOfLines={1} ellipsizeMode="tail">
                                  {formatTime(new Date(event.start))} – {formatTime(new Date(event.end))} {event.slot ? `· ${event.slot}` : ""}
                                </Text>
                              </View>
                            ))
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <View style={[styles.calendarWrapper, styles.weekGrid]}>
                <View style={styles.weekGridHeader}>
                  <View style={styles.weekTimeCol} />
                  {weekDays.map((d) => (
                    <View key={d.toISOString()} style={styles.weekDayColHeader}>
                      <Text style={styles.weekDayName}>{d.toLocaleDateString(undefined, { weekday: "short" })}</Text>
                      <Text style={styles.weekDayDate}>{d.getDate()}</Text>
                    </View>
                  ))}
                </View>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.weekGridScrollContent}
                >
                  {weekHours.map((hour) => (
                    <View key={hour} style={styles.weekRow}>
                      <View style={styles.weekTimeCol}>
                        <Text style={styles.weekTimeText}>{`${hour.toString().padStart(2, "0")}:00`}</Text>
                      </View>
                      {weekDays.map((d, idx) => {
                        const key = toLocalDateString(d);
                        const events = eventsByWeekDay[key] || [];
                        const hourEvents = events.filter((evt) => new Date(evt.start).getHours() === hour);
                        return (
                          <TouchableOpacity
                            key={key + hour}
                            style={[styles.weekCell, idx < weekDays.length - 1 && styles.weekCellDivider]}
                            activeOpacity={0.7}
                            onPress={() => openBooking(new Date(`${key}T${hour.toString().padStart(2, "0")}:00:00`))}
                          >
                            {hourEvents.map((event) => (
                              <View
                                key={event.id}
                                style={[
                                  styles.weekEvent,
                                  event.type === "pending"
                                    ? { borderColor: "#f87171", backgroundColor: "rgba(248,113,113,0.12)" }
                                    : { borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,0.12)" }
                                ]}
                              >
                                <Text style={[styles.calendarEventTitle, { fontSize: 12 }]} numberOfLines={1} ellipsizeMode="tail">
                                  {event.title}
                                </Text>
                                <Text style={[styles.calendarEventMeta, { fontSize: 11 }]} numberOfLines={1} ellipsizeMode="tail">
                                  {formatTime(new Date(event.start))} – {formatTime(new Date(event.end))}
                                </Text>
                              </View>
                            ))}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </CalendarProvider>
        )}
        <Modal transparent visible={viewPickerVisible} animationType="fade" onRequestClose={() => setViewPickerVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setViewPickerVisible(false)}>
            <View style={styles.viewSheet}>
              <View style={styles.viewSheetHeader}>
                <Text style={styles.viewSheetTitle}>Choose view</Text>
                <TouchableOpacity onPress={() => setViewPickerVisible(false)}>
                  <Text style={styles.viewSheetClose}>Close</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.viewSheetSubtitle}>Jump between day, week, or month layouts.</Text>
              {([
                { mode: "day", label: "Day view", hint: "Focus on a single day" },
                { mode: "week", label: "Week view", hint: "See the full week timeline" },
                { mode: "month", label: "Month view", hint: "Overview for the month" }
              ] as const).map(({ mode, label, hint }) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.viewOptionRow, view === mode && styles.viewOptionRowSelected]}
                  onPress={() => {
                    setView(mode);
                    setViewPickerVisible(false);
                  }}
                  activeOpacity={0.9}
                >
                  <View style={styles.viewOptionCopy}>
                    <Text style={[styles.viewOptionText, view === mode && styles.viewOptionTextSelected]}>{label}</Text>
                    <Text style={styles.viewOptionHint}>{hint}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => openBooking()}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Booking</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
