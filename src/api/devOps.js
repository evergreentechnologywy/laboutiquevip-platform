const TOKEN_KEY = 'auth_token';

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function devApi(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function fetchSystemStatus() {
  return devApi('/api/v1/system/status');
}

export async function fetchDevImportStatus() {
  return devApi('/api/v1/dev/import/status');
}

export async function triggerDevImport({ source, mode = 'pilot' }) {
  return devApi('/api/v1/dev/import/trigger', {
    method: 'POST',
    body: { source, mode },
  });
}

export async function setDevMaintenance(mode) {
  return devApi('/api/v1/dev/maintenance', {
    method: 'POST',
    body: { mode },
  });
}

export async function fetchDevImportLogs(source = 'eros') {
  return devApi(`/api/v1/dev/import/logs?source=${encodeURIComponent(source)}`);
}

export async function fetchAdminReports(status = 'open') {
  return devApi(`/api/admin/reports?status=${encodeURIComponent(status)}&limit=25`);
}

export async function fetchAdminStats() {
  return devApi('/api/admin/stats');
}
