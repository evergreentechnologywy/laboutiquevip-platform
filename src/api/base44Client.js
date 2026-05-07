const TOKEN_KEY = 'auth_token';

const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
};
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/**
 * @typedef {Error & {
 *   status?: number,
 *   data?: any,
 * }} ApiError
 */

/**
 * @param {string} path
 * @param {{ method?: string, body?: any, auth?: boolean }} [options]
 */
async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    /** @type {ApiError} */
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function queryEntity(entity, where = {}, sort, limit) {
  const params = new URLSearchParams();
  params.set('where', JSON.stringify(where || {}));
  if (sort) params.set('sort', sort);
  if (limit) params.set('limit', String(limit));
  return api(`/api/entities/${entity}?${params.toString()}`, { auth: true });
}

function createEntityClient(entity) {
  return {
    filter: (where, sort, limit) => queryEntity(entity, where, sort, limit),
    list: (sort, limit) => queryEntity(entity, {}, sort, limit),
    create: (data) => api(`/api/entities/${entity}`, { method: 'POST', body: data, auth: true }),
    update: (id, data) => api(`/api/entities/${entity}/${id}`, { method: 'PATCH', body: data, auth: true }),
  };
}

export const base44 = {
  auth: {
    hasToken: () => Boolean(getToken()),
    me: async () => api('/api/auth/me', { auth: true }),
    login: async (email, password) => {
      const out = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      setToken(out.token);
      return out.user;
    },
    register: async (email, password, full_name) => {
      const out = await api('/api/auth/register', { method: 'POST', body: { email, password, full_name } });
      setToken(out.token);
      return out.user;
    },
    logout: async (url) => {
      try { await api('/api/auth/logout', { method: 'POST', auth: true }); } catch {}
      clearToken();
      if (url) window.location.href = url;
    },
    redirectToLogin: (nextUrl) => {
      const params = new URLSearchParams();
      if (nextUrl) params.set('next', nextUrl);
      window.location.href = `/login${params.toString() ? `?${params.toString()}` : ''}`;
    },
    redirectToRegister: (nextUrl) => {
      const params = new URLSearchParams();
      if (nextUrl) params.set('next', nextUrl);
      window.location.href = `/register${params.toString() ? `?${params.toString()}` : ''}`;
    },
  },
  entities: {
    Provider: createEntityClient('Provider'),
    Booking: createEntityClient('Booking'),
    Message: createEntityClient('Message'),
    Review: createEntityClient('Review'),
    Verification: createEntityClient('Verification'),
    Query: {},
  },
  orders: {
    create: (data) => api('/api/v1/orders', { method: 'POST', body: data, auth: true }),
    list: () => api('/api/v1/orders', { auth: true }),
  },
  ai: {
    assistant: (data) => api('/api/v1/ai/assistant', { method: 'POST', body: data, auth: true }),
    applyTourDraft: (data) => api('/api/v1/ai/actions/tour-draft', { method: 'POST', body: data, auth: true }),
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        return api('/api/upload', {
          method: 'POST',
          body: { filename: file.name, contentType: file.type, data },
          auth: true,
        });
      },
    },
  },
  appLogs: {
    logUserInApp: async () => ({ ok: true }),
  },
};
