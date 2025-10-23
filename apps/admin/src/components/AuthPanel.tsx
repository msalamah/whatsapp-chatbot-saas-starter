import { useEffect, useState } from "react";
import { AdminCredentials } from "../types";

interface Props {
  initialBaseUrl: string;
  onConnect: (creds: AdminCredentials) => void;
  onDisconnect: () => void;
  connected: boolean;
}

export function AuthPanel({ initialBaseUrl, onConnect, onDisconnect, connected }: Props) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [token, setToken] = useState("");

  useEffect(() => {
    setBaseUrl(initialBaseUrl);
  }, [initialBaseUrl]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    onConnect({ baseUrl: baseUrl.trim(), token: token.trim() });
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
