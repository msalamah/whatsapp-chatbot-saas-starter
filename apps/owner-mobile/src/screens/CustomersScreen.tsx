import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList
} from "react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useOwner } from "../state/ownerContext";
import { styles } from "../styles";
import { Appointment, CustomerRecord } from "../types";

export function CustomersScreen() {
  const { customers, customersHasMore, fetchCustomers, fetchCustomerDetail, openBooking } = useOwner();
  const HISTORY_PAGE_SIZE = 10;
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CustomerRecord[]>(customers);
  const [hasMore, setHasMore] = useState(customersHasMore);
  const [offset, setOffset] = useState(customers.length);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<CustomerRecord | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRange, setHistoryRange] = useState<"30d" | "90d" | "all">("30d");
  const [historyItems, setHistoryItems] = useState<Appointment[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    setItems(customers);
    setHasMore(customersHasMore);
    setOffset(customers.length);
  }, [customers, customersHasMore]);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const { customers: list, hasMore: nextMore } = await fetchCustomers(query.trim(), 0);
      setItems(list);
      setHasMore(nextMore);
      setOffset(list.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search customers");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { customers: list, hasMore: nextMore } = await fetchCustomers(query.trim(), offset);
      setItems((prev) => [...prev, ...list]);
      setHasMore(nextMore);
      setOffset((prev) => prev + list.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const openDetail = async (customerId: string) => {
    setDetailVisible(true);
    setDetailLoading(true);
    setHistoryOpen(false);
    setHistoryRange("30d");
    setHistoryItems([]);
    setHistoryHasMore(false);
    setSelectedCustomerId(customerId);
    try {
      const data = await fetchCustomerDetail(customerId, { limit: HISTORY_PAGE_SIZE, range: "30d" });
      setDetailCustomer(data.customer);
      setHistoryItems(data.appointments || []);
      setHistoryHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshHistory = async (rangeValue: "30d" | "90d" | "all") => {
    if (!selectedCustomerId) return;
    setHistoryLoading(true);
    try {
      const data = await fetchCustomerDetail(selectedCustomerId, { limit: HISTORY_PAGE_SIZE, offset: 0, range: rangeValue });
      setDetailCustomer(data.customer);
      setHistoryItems(data.appointments || []);
      setHistoryHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadMoreHistory = async () => {
    if (!selectedCustomerId) return;
    setHistoryLoading(true);
    try {
      const data = await fetchCustomerDetail(selectedCustomerId, {
        limit: HISTORY_PAGE_SIZE,
        offset: historyItems.length,
        range: historyRange
      });
      setDetailCustomer(data.customer);
      setHistoryItems((prev) => [...prev, ...(data.appointments || [])]);
      setHistoryHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRangeChange = async (rangeValue: "30d" | "90d" | "all") => {
    setHistoryRange(rangeValue);
    await refreshHistory(rangeValue);
  };

  const totalAppointments = useMemo(() => detailCustomer?.appointmentCount || 0, [detailCustomer]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customers</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color="#64748b" />
          <TextInput
            placeholder="Search customers"
            value={query}
            onChangeText={setQuery}
            style={[styles.input, styles.searchInput, styles.searchBareInput]}
          />
          <TouchableOpacity onPress={handleSearch} disabled={loading}>
            <Text style={styles.ghostButtonText}>{loading ? "..." : "Go"}</Text>
          </TouchableOpacity>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        {loading && <ActivityIndicator color="#0ea5e9" />}
      </View>

      <FlatList
        data={items}
        contentContainerStyle={styles.section}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openDetail(item.id)} style={styles.card}>
            <Text style={styles.cardTitle}>{item.displayName || item.id}</Text>
            {item.phone && <Text style={styles.cardSubtitle}>{item.phone}</Text>}
            <Text style={styles.cardSubtitle}>
              {item.appointmentCount || 0} bookings · last {item.lastBooking ? new Date(item.lastBooking).toLocaleDateString() : "n/a"}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.muted}>No customers found.</Text> : null}
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity style={styles.ghostButton} onPress={handleLoadMore} disabled={loadingMore}>
              <Text style={styles.ghostButtonText}>{loadingMore ? "Loading…" : "Load more"}</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <Modal transparent visible={detailVisible} animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>Customer details</Text>
              <TouchableOpacity onPress={() => setDetailVisible(false)}>
                <Text style={styles.ghostButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {detailLoading ? (
                <ActivityIndicator color="#0ea5e9" />
              ) : detailCustomer ? (
                <>
                  <Text style={styles.cardTitle}>{detailCustomer.displayName || detailCustomer.id}</Text>
                  {detailCustomer.phone && <Text style={styles.cardSubtitle}>{detailCustomer.phone}</Text>}
                  {detailCustomer.email && <Text style={styles.cardSubtitle}>{detailCustomer.email}</Text>}
                  <Text style={styles.cardSubtitle}>{totalAppointments} total appointments</Text>
                  <TouchableOpacity style={[styles.primaryButton, styles.historyButton]} onPress={() => setHistoryOpen((prev) => !prev)}>
                    <Text style={styles.primaryButtonText}>{historyOpen ? "Hide history" : "Booking history"}</Text>
                  </TouchableOpacity>
                  {historyOpen && (
                    <>
                      <View style={styles.pillGroup}>
                        {([
                          { label: "30d", value: "30d" },
                          { label: "90d", value: "90d" },
                          { label: "All", value: "all" }
                        ] as const).map((entry) => (
                          <TouchableOpacity
                            key={entry.value}
                            style={[styles.pillButton, historyRange === entry.value && styles.pillButtonActive]}
                            onPress={() => handleRangeChange(entry.value)}
                          >
                            <Text style={[styles.pillLabel, historyRange === entry.value && styles.pillLabelActive]}>{entry.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {historyLoading ? <ActivityIndicator color="#0ea5e9" /> : null}
                      {!historyLoading && historyItems.length === 0 && <Text style={styles.muted}>No bookings yet.</Text>}
                      {historyItems.map((appt) => (
                        <View key={appt.id} style={styles.historyItem}>
                          <Text style={styles.cardTitle}>{appt.service_name || "Service"}</Text>
                          <Text style={styles.cardSubtitle}>{appt.slot_label || appt.start_iso || "Scheduled"}</Text>
                        </View>
                      ))}
                      {historyHasMore && (
                        <TouchableOpacity style={styles.ghostButton} onPress={loadMoreHistory} disabled={historyLoading}>
                          <Text style={styles.ghostButtonText}>Load more</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </>
              ) : (
                <Text style={styles.muted}>No details available.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <TouchableOpacity style={styles.fab} onPress={() => openBooking()}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Booking</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
