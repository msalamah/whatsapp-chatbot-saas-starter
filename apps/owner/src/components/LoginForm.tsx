import { FormEvent, useState } from "react";

interface Props {
  onLogin: (tenantKey: string, ownerToken: string) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export function LoginForm({ onLogin, loading = false, error = null }: Props) {
  const [tenantKey, setTenantKey] = useState("");
  const [ownerToken, setOwnerToken] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!tenantKey.trim() || !ownerToken.trim()) return;
    await onLogin(tenantKey.trim(), ownerToken.trim());
  };

  return (
    <form className="owner-card" onSubmit={handleSubmit}>
      <h2>Owner Login</h2>
      <input value={tenantKey} onChange={(e) => setTenantKey(e.target.value)} placeholder="Tenant key" />
      <input value={ownerToken} onChange={(e) => setOwnerToken(e.target.value)} placeholder="Owner portal token" type="password" />
      <button type="submit" disabled={loading}>{loading ? "Connecting…" : "Connect"}</button>
      {error && <p className="error">{error}</p>}
      <p className="muted">Ask your platform admin for your tenant key + owner token.</p>
    </form>
  );
}
