import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import React, { useEffect, useState } from "react";
import { useOwner } from "../state/ownerContext";
import { styles } from "../styles";
import { CalendarBlock, CalendarRule, OwnerCalendar } from "../types";

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const defaultCalendar = (): OwnerCalendar => ({
  timezone: "UTC",
  capacity: 1,
  lookaheadDays: 30,
  rules: [],
  blocks: []
});

export function SettingsScreen() {
  const { session, calendar, refreshCalendar, saveCalendar, logout } = useOwner();
  const [draft, setDraft] = useState<OwnerCalendar>(calendar || defaultCalendar());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(calendar || defaultCalendar());
  }, [calendar]);

  useEffect(() => {
    if (!calendar) {
      (async () => {
        setLoading(true);
        try {
          await refreshCalendar();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load calendar");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [calendar, refreshCalendar]);

  const updateField = (field: keyof OwnerCalendar, value: any) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updateRule = (idx: number, patch: Partial<CalendarRule>) => {
    setDraft((prev) => {
      const rules = prev.rules.slice();
      rules[idx] = { ...rules[idx], ...patch };
      return { ...prev, rules };
    });
  };

  const addRule = () =>
    setDraft((prev) => ({
      ...prev,
      rules: [...prev.rules, { dayOfWeek: 1, start: "09:00", end: "17:00", capacity: null }]
    }));

  const removeRule = (idx: number) =>
    setDraft((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== idx)
    }));

  const addBlock = () =>
    setDraft((prev) => ({
      ...prev,
      blocks: [...prev.blocks, { startISO: "", endISO: "", reason: "" }]
    }));

  const updateBlock = (idx: number, patch: Partial<CalendarBlock>) => {
    setDraft((prev) => {
      const blocks = prev.blocks.slice();
      blocks[idx] = { ...blocks[idx], ...patch };
      return { ...prev, blocks };
    });
  };

  const removeBlock = (idx: number) =>
    setDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((_, i) => i !== idx)
    }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveCalendar({
        ...draft,
        capacity: Number(draft.capacity) || 1,
        lookaheadDays: Number(draft.lookaheadDays) || 30,
        rules: draft.rules.map((r) => ({
          dayOfWeek: Number(r.dayOfWeek) || 0,
          start: r.start,
          end: r.end,
          capacity: r.capacity == null || r.capacity === "" ? null : Number(r.capacity)
        })),
        blocks: draft.blocks.filter((b) => b.startISO && b.endISO)
      });
      Alert.alert("Saved", "Calendar settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.section, styles.settingsContainer]}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <Text style={styles.muted}>Manage calendar and account.</Text>

        <View style={styles.settingsCard}>
          <View style={styles.settingsHeaderRow}>
            <Text style={styles.settingsTitle}>Calendar settings</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving || loading}>
              {saving ? <ActivityIndicator /> : <Text style={styles.settingsSave}>Save</Text>}
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color="#0ea5e9" /> : null}
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.settingsRow}>
            <Text style={styles.formLabel}>Timezone</Text>
            <TextInput
              style={styles.input}
              value={draft.timezone}
              onChangeText={(t) => updateField("timezone", t)}
              placeholder="e.g. America/New_York"
            />
          </View>
          <View style={styles.settingsRow}>
            <Text style={styles.formLabel}>Lookahead days</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(draft.lookaheadDays)}
              onChangeText={(t) => updateField("lookaheadDays", Number(t) || 0)}
            />
          </View>
          <View style={styles.settingsRow}>
            <Text style={styles.formLabel}>Max concurrent services</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(draft.capacity)}
              onChangeText={(t) => updateField("capacity", Number(t) || 1)}
            />
          </View>

          <View style={styles.divider} />
          <View style={styles.settingsHeaderRow}>
            <Text style={styles.settingsSubtitle}>Weekly working hours</Text>
            <TouchableOpacity onPress={addRule}>
              <Text style={styles.settingsAdd}>Add</Text>
            </TouchableOpacity>
          </View>
          {draft.rules.length === 0 && <Text style={styles.muted}>No working hours yet.</Text>}
          {draft.rules.map((rule, idx) => (
            <View key={`rule-${idx}`} style={styles.ruleCard}>
              <View style={styles.ruleRow}>
                <Text style={styles.formLabel}>Day</Text>
                <TouchableOpacity
                  style={styles.dayChip}
                  onPress={() => updateRule(idx, { dayOfWeek: (rule.dayOfWeek + 1) % 7 })}
                >
                  <Text style={styles.dayChipText}>{dayLabels[rule.dayOfWeek % 7]}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.ruleRow}>
                <Text style={styles.formLabel}>Start</Text>
                <TextInput
                  style={[styles.input, styles.ruleInput]}
                  value={rule.start}
                  onChangeText={(t) => updateRule(idx, { start: t })}
                  placeholder="09:00"
                />
              </View>
              <View style={styles.ruleRow}>
                <Text style={styles.formLabel}>End</Text>
                <TextInput
                  style={[styles.input, styles.ruleInput]}
                  value={rule.end}
                  onChangeText={(t) => updateRule(idx, { end: t })}
                  placeholder="17:00"
                />
              </View>
              <View style={styles.ruleRow}>
                <Text style={styles.formLabel}>Capacity</Text>
                <TextInput
                  style={[styles.input, styles.ruleInput]}
                  keyboardType="numeric"
                  value={rule.capacity == null ? "" : String(rule.capacity)}
                  onChangeText={(t) => updateRule(idx, { capacity: t === "" ? null : Number(t) || 1 })}
                  placeholder="Optional"
                />
              </View>
              <TouchableOpacity onPress={() => removeRule(idx)}>
                <Text style={styles.settingsRemove}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.divider} />
          <View style={styles.settingsHeaderRow}>
            <Text style={styles.settingsSubtitle}>Blocked times</Text>
            <TouchableOpacity onPress={addBlock}>
              <Text style={styles.settingsAdd}>Add</Text>
            </TouchableOpacity>
          </View>
          {draft.blocks.length === 0 && <Text style={styles.muted}>No blocked times.</Text>}
          {draft.blocks.map((block, idx) => (
            <View key={`block-${idx}`} style={styles.ruleCard}>
              <Text style={styles.formLabel}>Start (ISO)</Text>
              <TextInput
                style={styles.input}
                value={block.startISO}
                onChangeText={(t) => updateBlock(idx, { startISO: t })}
                placeholder="2025-01-01T09:00:00Z"
              />
              <Text style={styles.formLabel}>End (ISO)</Text>
              <TextInput
                style={styles.input}
                value={block.endISO}
                onChangeText={(t) => updateBlock(idx, { endISO: t })}
                placeholder="2025-01-01T12:00:00Z"
              />
              <Text style={styles.formLabel}>Reason</Text>
              <TextInput
                style={styles.input}
                value={block.reason || ""}
                onChangeText={(t) => updateBlock(idx, { reason: t })}
                placeholder="Optional"
              />
              <TouchableOpacity onPress={() => removeBlock(idx)}>
                <Text style={styles.settingsRemove}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>Account</Text>
          <Text style={styles.muted}>{session?.tenant?.name || "Tenant"} · {session?.tenant?.key || ""}</Text>
          <TouchableOpacity style={[styles.primaryButton, { marginTop: 12 }]} onPress={logout}>
            <Text style={styles.primaryButtonText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
