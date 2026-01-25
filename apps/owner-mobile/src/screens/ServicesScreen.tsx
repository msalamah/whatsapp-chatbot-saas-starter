import { ActivityIndicator, Modal, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Controller, useForm } from "react-hook-form";
import { useOwner } from "../state/ownerContext";
import { styles } from "../styles";
import { ServiceRecord } from "../types";

const EMPTY_SERVICE: ServiceRecord = {
  id: "",
  name: "",
  price: 0,
  currency: "USD",
  minMinutes: 30,
  maxMinutes: 45,
  description: ""
};

export function ServicesScreen() {
  const { services, fetchServices, saveService, deleteService, openBooking } = useOwner();
  const [busy, setBusy] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeService, setActiveService] = useState<ServiceRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ defaultValues: EMPTY_SERVICE });

  useEffect(() => {
    if (!services.length) {
      (async () => {
        try {
          await fetchServices();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load services");
        }
      })();
    }
  }, [services.length, fetchServices]);

  const openModal = (service?: ServiceRecord) => {
    setActiveService(service || null);
    form.reset(service || EMPTY_SERVICE);
    setShowModal(true);
  };

  const handleDelete = async (serviceId: string) => {
    setBusy(true);
    try {
      await deleteService(serviceId);
      setError(null);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (values: ServiceRecord) => {
    setBusy(true);
    try {
      await saveService({
        ...values,
        id: activeService?.id || values.id
      });
      setError(null);
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save service");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.section, styles.serviceContent]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Service catalog</Text>
          <TouchableOpacity style={styles.ghostButtonSmall} onPress={() => openModal()} disabled={busy}>
            <Text style={styles.ghostButtonText}>Add service</Text>
          </TouchableOpacity>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        {!services.length && <Text style={styles.muted}>No services configured.</Text>}
        {services.map((service) => (
          <View key={service.id} style={styles.card}>
            <Text style={styles.cardTitle}>{service.name}</Text>
            <Text style={styles.cardSubtitle}>
              {service.currency || "USD"} {service.price || 0} · {service.minMinutes || 0}-{service.maxMinutes || 0} min
            </Text>
            {service.description ? <Text style={styles.cardSubtitle}>{service.description}</Text> : null}
            <View style={styles.cardActions}>
              <TouchableOpacity style={[styles.actionButton, styles.primaryAction]} onPress={() => openModal(service)}>
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.reject]} onPress={() => handleDelete(service.id)}>
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => openBooking()}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Booking</Text>
      </TouchableOpacity>

      {showModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>Service</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.ghostButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.formLabel}>Name</Text>
              <Controller
                control={form.control}
                name="name"
                render={({ field: { onChange, value } }) => (
                  <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder="Service name" />
                )}
              />
              <Text style={styles.formLabel}>Price</Text>
              <Controller
                control={form.control}
                name="price"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(value ?? "")}
                    onChangeText={(text) => onChange(Number(text) || 0)}
                  />
                )}
              />
              <Text style={styles.formLabel}>Currency</Text>
              <Controller
                control={form.control}
                name="currency"
                render={({ field: { onChange, value } }) => (
                  <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder="Currency (e.g., USD)" />
                )}
              />
              <View style={styles.formRow}>
                <View style={styles.formColumn}>
                  <Text style={styles.formLabel}>Min minutes</Text>
                  <Controller
                    control={form.control}
                    name="minMinutes"
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(value ?? "")}
                        onChangeText={(text) => onChange(Number(text) || 0)}
                      />
                    )}
                  />
                </View>
                <View style={styles.formColumn}>
                  <Text style={styles.formLabel}>Max minutes</Text>
                  <Controller
                    control={form.control}
                    name="maxMinutes"
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(value ?? "")}
                        onChangeText={(text) => onChange(Number(text) || 0)}
                      />
                    )}
                  />
                </View>
              </View>
              <Text style={styles.formLabel}>Description</Text>
              <Controller
                control={form.control}
                name="description"
                render={({ field: { onChange, value } }) => (
                  <TextInput style={[styles.input, styles.textArea]} multiline value={value} onChangeText={onChange} />
                )}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={form.handleSubmit(onSubmit)} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
