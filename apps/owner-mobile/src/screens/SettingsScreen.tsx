import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View, Platform, Modal } from "react-native";
import React, { useEffect, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
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
  const { session, calendar, refreshCalendar, saveCalendar, logout, profile, fetchProfile, updateProfile, confirmPhoneChange } = useOwner();
  const [draft, setDraft] = useState<OwnerCalendar>(calendar || defaultCalendar());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockPicker, setBlockPicker] = useState<{ index: number; field: "startISO" | "endISO"; value: Date } | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    businessName: "",
    ownerName: "",
    email: "",
    phone: "",
    timezone: ""
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [phoneVerification, setPhoneVerification] = useState<{ phone: string; expiresAt?: string } | null>(null);
  const [phoneCode, setPhoneCode] = useState("");

  useEffect(() => {
    setDraft(calendar || defaultCalendar());
  }, [calendar]);

  useEffect(() => {
    if (profile || profileLoading || !fetchProfile) return;
    (async () => {
      setProfileLoading(true);
      try {
        await fetchProfile();
      } catch {
        // handled via form error on save
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [profile, profileLoading, fetchProfile]);

  useEffect(() => {
    if (!profile) return;
    setProfileDraft({
      businessName: profile.tenant?.name || "",
      ownerName: profile.owner?.name || "",
      email: profile.owner?.email || "",
      phone: profile.owner?.phone || "",
      timezone: profile.tenant?.timezone || ""
    });
  }, [profile]);

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

  const formatDateTimeLabel = (value: string, placeholder: string) => {
    if (!value) return placeholder;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return placeholder;
    return date.toLocaleString();
  };

  const openBlockPicker = (index: number, field: "startISO" | "endISO") => {
    const value = draft.blocks[index]?.[field] || "";
    const parsed = value ? new Date(value) : new Date();
    setBlockPicker({ index, field, value: Number.isNaN(parsed.getTime()) ? new Date() : parsed });
  };

  const handleBlockPickerChange = (event: { type?: string }, date?: Date) => {
    if (event?.type === "dismissed") {
      setBlockPicker(null);
      return;
    }
    if (!date || !blockPicker) return;
    updateBlock(blockPicker.index, { [blockPicker.field]: date.toISOString() });
    if (Platform.OS !== "ios") {
      setBlockPicker(null);
    } else {
      setBlockPicker({ ...blockPicker, value: date });
    }
  };

  const removeBlock = (idx: number) =>
    setDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((_, i) => i !== idx)
    }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const invalidBlock = draft.blocks.find((block) => {
      if (!block.startISO || !block.endISO) return false;
      const start = new Date(block.startISO);
      const end = new Date(block.endISO);
      return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start;
    });
    if (invalidBlock) {
      setSaving(false);
      setError("Blocked times must have an end after the start.");
      return;
    }
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

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileError(null);
    setProfileNotice(null);
    try {
      const emailValue = profileDraft.email.trim();
      const phoneValue = profileDraft.phone.trim();
      const result = await updateProfile({
        businessName: profileDraft.businessName.trim() || undefined,
        ownerName: profileDraft.ownerName.trim() || undefined,
        email: emailValue ? emailValue : null,
        phone: phoneValue || undefined,
        timezone: profileDraft.timezone.trim() || undefined
      });
      if (result.status === "phone_verification_required") {
        setPhoneVerification({ phone: result.phone || phoneValue, expiresAt: result.expiresAt });
        setProfileNotice("Verify the new phone number to finish updating.");
      } else {
        setPhoneVerification(null);
        setProfileNotice("Profile updated.");
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleConfirmPhone = async () => {
    if (!phoneVerification) return;
    if (!phoneCode.trim()) {
      setProfileError("Enter the verification code.");
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      await confirmPhoneChange(phoneVerification.phone, phoneCode.trim());
      setProfileNotice("Phone number updated.");
      setPhoneVerification(null);
      setPhoneCode("");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to verify phone");
    } finally {
      setProfileSaving(false);
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
              <Text style={styles.formLabel}>Start</Text>
              <TouchableOpacity style={styles.pickerInput} onPress={() => openBlockPicker(idx, "startISO")}>
                <Text style={styles.pickerText}>{formatDateTimeLabel(block.startISO, "Select start time")}</Text>
              </TouchableOpacity>
              <Text style={styles.formLabel}>End</Text>
              <TouchableOpacity style={styles.pickerInput} onPress={() => openBlockPicker(idx, "endISO")}>
                <Text style={styles.pickerText}>{formatDateTimeLabel(block.endISO, "Select end time")}</Text>
              </TouchableOpacity>
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
          <View style={styles.settingsHeaderRow}>
            <Text style={styles.settingsTitle}>Profile</Text>
            <TouchableOpacity onPress={handleProfileSave} disabled={profileSaving || profileLoading}>
              {profileSaving ? <ActivityIndicator /> : <Text style={styles.settingsSave}>Save</Text>}
            </TouchableOpacity>
          </View>
          {profileNotice && <Text style={styles.notice}>{profileNotice}</Text>}
          {profileError && <Text style={styles.error}>{profileError}</Text>}
          <Text style={styles.formLabel}>Business name</Text>
          <TextInput
            style={styles.input}
            value={profileDraft.businessName}
            onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, businessName: value }))}
            placeholder="Business name"
          />
          <Text style={styles.formLabel}>Owner name</Text>
          <TextInput
            style={styles.input}
            value={profileDraft.ownerName}
            onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, ownerName: value }))}
            placeholder="Owner name"
          />
          <Text style={styles.formLabel}>Email</Text>
          <TextInput
            style={styles.input}
            value={profileDraft.email}
            onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, email: value }))}
            placeholder="Email (optional)"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={styles.formLabel}>Phone</Text>
          <TextInput
            style={styles.input}
            value={profileDraft.phone}
            onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, phone: value }))}
            placeholder="Include country code"
            keyboardType="phone-pad"
          />
          <Text style={styles.formLabel}>Timezone</Text>
          <TextInput
            style={styles.input}
            value={profileDraft.timezone}
            onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, timezone: value }))}
            placeholder="Timezone (e.g. America/New_York)"
            autoCapitalize="none"
          />
          {phoneVerification ? (
            <View style={styles.ruleCard}>
              <Text style={styles.formLabel}>Verification code</Text>
              <TextInput
                style={styles.input}
                value={phoneCode}
                onChangeText={setPhoneCode}
                placeholder="Enter code"
                keyboardType="number-pad"
              />
              {phoneVerification.expiresAt ? (
                <Text style={styles.helperText}>Code expires soon.</Text>
              ) : null}
              <TouchableOpacity style={styles.primaryButton} onPress={handleConfirmPhone} disabled={profileSaving}>
                {profileSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Verify phone</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>Account</Text>
          <Text style={styles.muted}>{session?.tenant?.name || "Tenant"} · {session?.tenant?.key || ""}</Text>
          <TouchableOpacity style={[styles.primaryButton, { marginTop: 12 }]} onPress={logout}>
            <Text style={styles.primaryButtonText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <Modal transparent visible={blockPicker !== null} animationType="fade" onRequestClose={() => setBlockPicker(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBlockPicker(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>Select time</Text>
              <TouchableOpacity onPress={() => setBlockPicker(null)}>
                <Text style={styles.viewSheetClose}>Close</Text>
              </TouchableOpacity>
            </View>
            {blockPicker && (
              <DateTimePicker
                value={blockPicker.value}
                mode="datetime"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleBlockPickerChange}
              />
            )}
            {Platform.OS === "ios" ? (
              <TouchableOpacity style={[styles.primaryButton, { marginTop: 12 }]} onPress={() => setBlockPicker(null)}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
