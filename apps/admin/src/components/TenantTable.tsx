import { Tenant } from "../types";

interface Props {
  tenants: Tenant[];
  onSelect: (tenant: Tenant) => void;
  onDelete: (tenant: Tenant) => void;
  selectedKey?: string | null;
}

export function TenantTable({ tenants, onSelect, onDelete, selectedKey }: Props) {
  if (!tenants.length) {
    return (
      <div className="empty-state">
        <h3>No tenants yet</h3>
        <p>Add your first business using the form on the right.</p>
      </div>
    );
  }

  return (
    <table className="tenants-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Phone</th>
          <th>Timezone</th>
          <th className="no-wrap">Services</th>
          <th>Token</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {tenants.map((tenant) => (
          <tr
            key={tenant.key}
            style={{
              background: tenant.key === selectedKey ? "rgba(56, 189, 248, 0.15)" : undefined
            }}
          >
            <td>
              <strong>{tenant.displayName}</strong>
              <div className="muted">{tenant.key}</div>
            </td>
            <td>{tenant.phoneNumberId || "—"}</td>
            <td>{tenant.calendar?.timezone || "—"}</td>
            <td>{tenant.services?.length ?? 0}</td>
            <td>{tenant.wabaTokenPreview || "not set"}</td>
            <td>
              <div className="actions-row">
                <button type="button" onClick={() => onSelect(tenant)}>
                  Inspect
                </button>
                {tenant.key !== "default" && (
                  <button type="button" className="danger" onClick={() => onDelete(tenant)}>
                    Delete
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
