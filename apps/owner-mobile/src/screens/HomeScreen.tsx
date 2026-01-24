import { ActivityIndicator, FlatList, RefreshControl, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useOwner } from "../state/ownerContext";
import { styles } from "../styles";

function AnalyticsCard({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.analyticsCard}>
      <Text style={styles.analyticsValue}>{value}</Text>
      <Text style={styles.analyticsLabel}>{label}</Text>
    </View>
  );
}

export function HomeScreen() {
  const { session, analytics, pending, appointments, loading, error, actionCustomer, refresh, resolveBooking, priceFormatter, logout, openBooking } =
    useOwner();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#0ea5e9" />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Managing</Text>
            <Text style={styles.title}>{session.tenant.name}</Text>
          </View>
          <TouchableOpacity style={styles.ghostButton} onPress={logout}>
            <Text style={styles.ghostButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Analytics</Text>
          {analytics ? (
            <View style={styles.analyticsGrid}>
              <AnalyticsCard label="Total bookings" value={analytics.totalAppointments} />
              <AnalyticsCard label="Last 30 days" value={analytics.last30Appointments} />
              <AnalyticsCard label="Upcoming" value={analytics.upcomingBookings} />
              <AnalyticsCard label="Projected revenue" value={`$${analytics.projectedRevenue.toFixed(2)}`} />
            </View>
          ) : (
            <Text style={styles.muted}>No analytics yet</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Pending approvals</Text>
            <TouchableOpacity style={styles.ghostButtonSmall} onPress={refresh}>
              <Text style={styles.ghostButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
          {loading && !pending.length ? <ActivityIndicator color="#0ea5e9" /> : null}
          {!pending.length && !loading ? <Text style={styles.muted}>No pending bookings right now.</Text> : null}
          <FlatList
            data={pending}
            keyExtractor={(item) => item.customerId}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.serviceName || "Service"}</Text>
                {item.slotLabel && <Text style={styles.cardSubtitle}>{item.slotLabel}</Text>}
                {priceFormatter(item) ? <Text style={styles.cardPrice}>{priceFormatter(item)}</Text> : null}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.approve]}
                    onPress={() => resolveBooking(item.customerId, "approve")}
                    disabled={actionCustomer === item.customerId}
                  >
                    <Text style={styles.actionButtonText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.reject]}
                    onPress={() => resolveBooking(item.customerId, "reject")}
                    disabled={actionCustomer === item.customerId}
                  >
                    <Text style={styles.actionButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming appointments</Text>
          {!appointments.length ? (
            <Text style={styles.muted}>No upcoming appointments scheduled.</Text>
          ) : (
            appointments.map((appt) => (
              <View key={appt.id} style={styles.card}>
                <Text style={styles.cardTitle}>{appt.service_name || "Service"}</Text>
                <Text style={styles.cardSubtitle}>{appt.slot_label || appt.start_iso || "Scheduled"}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => openBooking()}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Booking</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
