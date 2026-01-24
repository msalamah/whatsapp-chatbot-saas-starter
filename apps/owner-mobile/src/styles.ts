import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f5f7fb"
  },
  scroll: {
    flex: 1
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 12
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#0f172a"
  },
  eyebrow: {
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontSize: 12
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 14,
    backgroundColor: "#fff"
  },
  pickerInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  pickerText: {
    color: "#0f172a",
    fontWeight: "600"
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  countryButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  countryButtonText: {
    fontWeight: "600",
    color: "#0f172a"
  },
  phoneInput: {
    flex: 1
  },
  primaryButton: {
    backgroundColor: "#0ea5e9",
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  fullWidthButton: {
    width: "100%"
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16
  },
  helperText: {
    fontSize: 13,
    color: "#475569"
  },
  notice: {
    fontSize: 13,
    color: "#0f766e",
    backgroundColor: "rgba(13, 148, 136, 0.1)",
    padding: 10,
    borderRadius: 10
  },
  secondaryButton: {
    borderRadius: 12,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff"
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontWeight: "600",
    fontSize: 14
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: 6
  },
  linkButtonText: {
    color: "#0ea5e9",
    fontWeight: "600",
    fontSize: 14
  },
  tenantPicker: {
    gap: 8
  },
  tenantOption: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    backgroundColor: "#fff"
  },
  tenantOptionTitle: {
    fontWeight: "600",
    color: "#0f172a"
  },
  tenantOptionSubtitle: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  searchRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  searchInput: {
    flex: 1
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  searchBareInput: {
    borderWidth: 0,
    paddingHorizontal: 0,
    height: 40
  },
  timezoneChip: {
    backgroundColor: "rgba(14, 165, 233, 0.12)",
    color: "#0ea5e9",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: "700"
  },
  ghostButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  ghostButtonSmall: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  ghostButtonText: {
    color: "#0f172a",
    fontWeight: "600"
  },
  tabBadge: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  tabBadgeActive: {
    backgroundColor: "rgba(14, 165, 233, 0.12)",
    borderColor: "rgba(14, 165, 233, 0.4)"
  },
  calendarToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 4
  },
  calendarNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  calendarLabel: {
    fontWeight: "700",
    color: "#0f172a"
  },
  viewPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignSelf: "flex-start"
  },
  viewPickerText: {
    color: "#0ea5e9",
    fontWeight: "700"
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a"
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a"
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  muted: {
    color: "#64748b"
  },
  error: {
    color: "#ef4444"
  },
  analyticsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  analyticsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    minWidth: 140
  },
  analyticsValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a"
  },
  analyticsLabel: {
    color: "#64748b",
    marginTop: 4
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a"
  },
  cardSubtitle: {
    color: "#475569",
    marginTop: 4
  },
  cardPrice: {
    color: "#0ea5e9",
    fontWeight: "600",
    marginTop: 4
  },
  cardActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12
  },
  actionButton: {
    flex: 1,
    borderRadius: 999,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "700"
  },
  approve: {
    backgroundColor: "#16a34a"
  },
  reject: {
    backgroundColor: "#f97316"
  },
  primaryAction: {
    backgroundColor: "#0ea5e9"
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    backgroundColor: "#0ea5e9",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  fabText: {
    color: "#fff",
    fontWeight: "700"
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    width: "100%",
    maxHeight: "85%"
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  modalContent: {
    paddingVertical: 12,
    gap: 8
  },
  countryOption: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    backgroundColor: "#f8fafc"
  },
  countryOptionTitle: {
    fontWeight: "600",
    color: "#0f172a"
  },
  countryOptionSubtitle: {
    color: "#64748b",
    fontSize: 12
  },
  viewSheet: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    width: "100%",
    maxWidth: 320
  },
  viewSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  viewSheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a"
  },
  viewSheetClose: {
    color: "#0ea5e9",
    fontWeight: "700"
  },
  viewSheetSubtitle: {
    color: "#64748b",
    marginVertical: 8
  },
  viewOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10
  },
  viewOptionRowSelected: {
    borderColor: "#0ea5e9",
    backgroundColor: "rgba(14, 165, 233, 0.1)"
  },
  viewOptionCopy: {
    gap: 2
  },
  viewOptionText: {
    fontWeight: "700",
    color: "#0f172a"
  },
  viewOptionTextSelected: {
    color: "#0ea5e9"
  },
  viewOptionHint: {
    color: "#64748b",
    fontSize: 12
  },
  calendarWrapper: {
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  calendarScreen: {
    paddingBottom: 100
  },
  weekCalendarContainer: {
    padding: 0,
    overflow: "hidden"
  },
  weekCalendar: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden"
  },
  weekGrid: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: "hidden"
  },
  weekGridHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#f8fafc"
  },
  weekGridScrollContent: {
    paddingBottom: 24
  },
  weekTimeCol: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0"
  },
  weekDayColHeader: {
    flex: 1,
    padding: 6,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0"
  },
  weekDayName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f172a"
  },
  weekDayDate: {
    fontSize: 12,
    color: "#64748b"
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    height: 60,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0"
  },
  weekTimeText: {
    color: "#94a3b8",
    fontSize: 12
  },
  weekCell: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "stretch"
  },
  dayCell: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 4,
    justifyContent: "center"
  },
  weekCellDivider: {
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0"
  },
  weekEvent: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxHeight: 44,
    overflow: "hidden"
  },
  calendarEventTitle: {
    fontWeight: "700"
  },
  calendarEventMeta: {
    color: "#64748b"
  },
  calendarArrow: {
    fontWeight: "700",
    color: "#0f172a"
  },
  dayGridHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#f8fafc"
  },
  dayGridDots: {
    flexDirection: "row",
    gap: 2
  },
  dayGridDot: {
    width: 4,
    height: 4,
    borderRadius: 2
  },
  formLabel: {
    color: "#475569",
    fontWeight: "600",
    marginTop: 12
  },
  formRow: {
    flexDirection: "row",
    gap: 12
  },
  formColumn: {
    flex: 1
  },
  textArea: {
    height: 90,
    textAlignVertical: "top"
  },
  pillGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8
  },
  pillButton: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff"
  },
  pillButtonActive: {
    backgroundColor: "#0ea5e9",
    borderColor: "#0ea5e9"
  },
  pillLabel: {
    color: "#0f172a",
    fontWeight: "600"
  },
  pillLabelActive: {
    color: "#fff"
  },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 10
  },
  modalContentRow: {
    gap: 8
  },
  settingsContainer: {
    paddingBottom: 100
  },
  serviceContent: {
    paddingBottom: 100
  },
  settingsCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10
  },
  settingsTitle: {
    fontWeight: "700",
    fontSize: 16,
    color: "#0f172a"
  },
  settingsSubtitle: {
    fontWeight: "700",
    color: "#0f172a"
  },
  settingsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  settingsSave: {
    color: "#0ea5e9",
    fontWeight: "700"
  },
  settingsRow: {
    gap: 6
  },
  settingsAdd: {
    color: "#0ea5e9",
    fontWeight: "700"
  },
  settingsRemove: {
    color: "#ef4444",
    fontWeight: "700",
    marginTop: 10
  },
  ruleCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  ruleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  ruleInput: {
    flex: 1
  },
  dayChip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  dayChipText: {
    fontWeight: "700",
    color: "#0f172a"
  },
  historyButton: {
    marginTop: 12
  },
  historyItem: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingVertical: 10
  }
});
