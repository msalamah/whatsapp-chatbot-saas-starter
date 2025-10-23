import { useEffect, useState } from "react";
import { AdminCredentials } from "../types";

interface Props {
  initialBaseUrl: string;
  initialActor: string;
  initialRole: string;
  onConnect: (creds: AdminCredentials) => void;
  onDisconnect: () => void;
  connected: boolean;
}

export function AuthPanel({ initialBaseUrl, initialActor, initialRole, onConnect, onDisconnect, connected }: Props) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [token, setToken] = useState("");
  const [actor, setActor] = useState(initialActor || "owner");
  const [role, setRole] = useState(initialRole || "owner");

  useEffect(() => {
    setBaseUrl(initialBaseUrl);
    setActor(initialActor || "owner");
    setRole(initialRole || "owner");
  }, [initialBaseUrl, initialActor, initialRole]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim() || !actor.trim()) return;
    onConnect({ baseUrl: baseUrl.trim(), token: token.trim(), actor: actor.trim(), role: role.trim() || "owner" });
    setToken("");
  };

  return (
    <form className="auth-controls" onSubmit={handleSubmit}>
      <input
        type="url"
        required
        placeholder="API base URL"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        disabled={connected}
      />
      <input
        type="text"
        required
        placeholder="Display name"
        value={actor}
        onChange={(e) => setActor(e.target.value)}
        disabled={connected}
      />
      <select value={role} onChange={(e) => setRole(e.target.value)} disabled={connected}>
        <option value="owner">Owner</option>
        <option value="operator">Operator</option>
        <option value="viewer">Viewer</option>
      </select>
      {!connected && (
        <input
          type="password"
          required
          placeholder="Admin bearer token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      )}
      {connected ? (
        <button type="button" className="danger" onClick={onDisconnect}>
          Disconnect
        </button>
      ) : (
        <button type="submit">Connect</button>
      )}
    </form>
  );
}
