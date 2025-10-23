import { useEffect, useMemo, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { TenantTable } from "./components/TenantTable";
import { TenantEditor } from "./components/TenantEditor";
import { AdminCredentials, Tenant, TenantPayload } from "./types";
import { createTenant, fetchTenants, patchTenant, removeTenant, rotateToken } from "./api";

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
    if (parsed?.baseUrl && parsed?.token) return parsed;
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

  const connected = Boolean(credentials);

  const notify = (value: Notification) => {
    setNotification(value);
    setTimeout(() => setNotification(null), 3200);
  };

  useEffect(() => {
    if (!credentials) {
      setTenants([]);
      setSelectedTenant(null);
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

  const handleCreate = async (payload: TenantPayload) => {
    if (!credentials) return;
    setLoading(true);
    try {
      await createTenant(credentials, payload);
      notify({ type: "success", message: `Created ${payload.displayName}` });
      refresh();
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
    } catch (err) {
      notify({ type: "error", message: extractError(err) });
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
        />
      </main>
    </div>
  );
}

function extractError(err: unknown): string {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message);
      if (typeof parsed?.error === "string") return parsed.error;
    } catch {
      //
    }
    return err.message;
  }
  return "Something went wrong";
}
