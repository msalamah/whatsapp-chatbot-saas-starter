import { useEffect, useMemo, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { TenantTable } from "./components/TenantTable";
import { TenantEditor } from "./components/TenantEditor";
import { ActivityFeed } from "./components/ActivityFeed";
import { PendingApprovals } from "./components/PendingApprovals";
import { AdminCredentials, AuditEvent, PendingBooking, Tenant, TenantPayload } from "./types";
import { approvePending, createTenant, fetchActivity, fetchPendingBookings, fetchTenants, patchTenant, rejectPending, removeTenant, rotateOwnerToken, rotateToken } from "./api";

interface Notification {
  type: "success" | "error";
  message: string;
}

const STORAGE_KEY = "adminPortalCredentials";

function loadStoredCredentials(): AdminCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.baseUrl && parsed?.token) {
      return {
        baseUrl: parsed.baseUrl,
        token: parsed.token,
        actor: parsed.actor || "owner",
        role: parsed.role || "owner"
      };
    }
    return null;
  } catch {
    return null;
  }
}

function persistCredentials(creds: AdminCredentials | null) {
  if (!creds) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  }
}

export default function App() {
  const [credentials, setCredentials] = useState<AdminCredentials | null>(() => loadStoredCredentials());
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [showSensitive, setShowSensitive] = useState(false);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [pendingBookings, setPendingBookings] = useState<PendingBooking[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const connected = Boolean(credentials);

  const notify = (value: Notification) => {
    setNotification(value);
    setTimeout(() => setNotification(null), 3200);
  };

  useEffect(() => {
    if (!credentials) {
      setTenants([]);
      setSelectedTenant(null);
      setActivity([]);
      setPendingBookings([]);
      return;
    }
    setLoading(true);
    fetchTenants(credentials, showSensitive)
      .then((list) => {
        setTenants(list);
        if (selectedTenant) {
          const next = list.find((t) => t.key === selectedTenant.key) || null;
          setSelectedTenant(next);
        }
      })
      .catch((err) => {
        notify({ type: "error", message: extractError(err) });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials, showSensitive]);

  useEffect(() => {
    if (!credentials) return;
    refreshActivity(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials]);

  useEffect(() => {
    if (!credentials || !selectedTenant) {
      setPendingBookings([]);
      return;
    }
    loadPending(selectedTenant.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials, selectedTenant]);

  const handleConnect = (creds: AdminCredentials) => {
    setCredentials(creds);
    persistCredentials(creds);
  };

  const handleDisconnect = () => {
    setCredentials(null);
    persistCredentials(null);
    notify({ type: "success", message: "Disconnected admin session" });
  };

  const refresh = () => {
    if (!credentials) return;
    setLoading(true);
    fetchTenants(credentials, showSensitive)
      .then((list) => {
        setTenants(list);
        if (selectedTenant) {
          setSelectedTenant(list.find((t) => t.key === selectedTenant.key) || null);
        }
        notify({ type: "success", message: "Refreshed tenants" });
      })
      .catch((err) => notify({ type: "error", message: extractError(err) }))
      .finally(() => setLoading(false));
  };

  const refreshActivity = (showToast = true) => {
    if (!credentials) return;
    setActivityLoading(true);
    fetchActivity(credentials, 50)
      .then((events) => {
        setActivity(events);
        if (showToast) notify({ type: "success", message: "Audit log updated" });
      })
      .catch((err) => notify({ type: "error", message: extractError(err) }))
      .finally(() => setActivityLoading(false));
  };

  const loadPending = (tenantKey: string) => {
    if (!credentials) return;
    setPendingLoading(true);
    fetchPendingBookings(credentials, tenantKey)
      .then((list) => setPendingBookings(list))
      .catch((err) => notify({ type: "error", message: extractError(err) }))
      .finally(() => setPendingLoading(false));
  };

  const handleCreate = async (payload: TenantPayload) => {
    if (!credentials) return;
    setLoading(true);
    try {
      await createTenant(credentials, payload);
      notify({ type: "success", message: `Created ${payload.displayName}` });
      refresh();
      refreshActivity(false);
    } catch (err) {
      notify({ type: "error", message: extractError(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (key: string, payload: TenantPayload) => {
    if (!credentials) return;
    setLoading(true);
    try {
      await patchTenant(credentials, key, payload);
      notify({ type: "success", message: `Updated ${key}` });
      refresh();
      refreshActivity(false);
    } catch (err) {
      notify({ type: "error", message: extractError(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleRotate = async (key: string, token: string) => {
    if (!credentials) return;
    setLoading(true);
    try {
      await rotateToken(credentials, key, token);
      notify({ type: "success", message: `Rotated token for ${key}` });
      refresh();
      refreshActivity(false);
    } catch (err) {
      notify({ type: "error", message: extractError(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleRotateOwner = async (key: string) => {
    if (!credentials) return "";
    setLoading(true);
    try {
      const res = await rotateOwnerToken(credentials, key);
      const token = res?.ownerToken || "";
      notify({ type: "success", message: token ? `Rotated owner token for ${key}` : "Owner token rotation failed" });
      refresh();
      refreshActivity(false);
      return token;
    } catch (err) {
      notify({ type: "error", message: extractError(err) });
      return "";
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tenant: Tenant) => {
    if (!credentials) return;
    if (!window.confirm(`Delete tenant "${tenant.displayName}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await removeTenant(credentials, tenant.key);
      notify({ type: "success", message: `Deleted ${tenant.key}` });
      setSelectedTenant((current) => (current?.key === tenant.key ? null : current));
      refresh();
      refreshActivity(false);
    } catch (err) {
      notify({ type: "error", message: extractError(err) });
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    if (!tenants.length) return "No tenants";
    return `${tenants.length} tenant${tenants.length === 1 ? "" : "s"}`;
  }, [tenants]);

  const handleApprovePending = async (customerId: string) => {
    if (!credentials || !selectedTenant) return;
    setPendingLoading(true);
    try {
      await approvePending(credentials, selectedTenant.key, customerId);
      notify({ type: "success", message: "Booking approved" });
      loadPending(selectedTenant.key);
      refreshActivity(false);
    } catch (err) {
      notify({ type: "error", message: extractError(err) });
    } finally {
      setPendingLoading(false);
    }
  };

  const handleRejectPending = async (customerId: string) => {
    if (!credentials || !selectedTenant) return;
    setPendingLoading(true);
    try {
      await rejectPending(credentials, selectedTenant.key, customerId);
      notify({ type: "success", message: "Booking rejected" });
      loadPending(selectedTenant.key);
      refreshActivity(false);
    } catch (err) {
      notify({ type: "error", message: extractError(err) });
    } finally {
      setPendingLoading(false);
    }
  };

  return (
    <div className="app-shell">
      {notification && (
        <div className={`notification ${notification.type === "error" ? "error" : ""}`}>
          {notification.message}
        </div>
      )}
      <header className="app-header">
        <div className="brand">
          <h1>Salon Admin</h1>
          <span>Manage WhatsApp tenants, services, and automation tokens</span>
        </div>
        <AuthPanel
          initialBaseUrl={credentials?.baseUrl || "http://localhost:3000"}
          initialActor={credentials?.actor || "owner"}
          initialRole={credentials?.role || "owner"}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          connected={connected}
        />
      </header>
      <main className="main">
        <section className="panel">
          <div className="status-bar">
            <div>
              <strong>{summary}</strong>
              {loading && <span style={{ marginLeft: "0.75rem" }}>Loading…</span>}
            </div>
            <div className="actions-row">
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <input
                  type="checkbox"
                  checked={showSensitive}
                  onChange={(e) => setShowSensitive(e.target.checked)}
                  disabled={!connected}
                />
                Show raw tokens
              </label>
              <button type="button" onClick={refresh} disabled={!connected || loading}>
                Refresh
              </button>
              <button type="button" onClick={() => refreshActivity()} disabled={!connected || activityLoading}>
                Activity
              </button>
            </div>
          </div>
          <TenantTable
            tenants={tenants}
            selectedKey={selectedTenant?.key}
            onSelect={(tenant) => setSelectedTenant(tenant)}
            onDelete={handleDelete}
          />
        </section>
        <TenantEditor
          selected={selectedTenant}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onRotate={handleRotate}
          onRotateOwner={handleRotateOwner}
        />
        {selectedTenant && (
          <PendingApprovals
            tenantName={selectedTenant.displayName}
            bookings={pendingBookings}
            loading={pendingLoading}
            onRefresh={() => loadPending(selectedTenant.key)}
            onApprove={handleApprovePending}
            onReject={handleRejectPending}
          />
        )}
        <section className="panel activity-panel">
          <div className="status-bar">
            <h2>Audit trail</h2>
            {activityLoading && <span>Updating…</span>}
          </div>
          <ActivityFeed events={activity} />
        </section>
      </main>
    </div>
  );
}

function extractError(err: unknown): string {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message);
      if (typeof parsed?.error === "string") return parsed.error;
      if (Array.isArray(parsed?.details) && parsed.details.length) {
        const first = parsed.details[0];
        if (typeof first === "string") return first;
        if (first?.message) return first.message;
      }
    } catch {
      //
    }
    return err.message;
  }
  return "Something went wrong";
}
