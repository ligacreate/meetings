const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://auth.skrebeyko.ru';
const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';
const TOKEN_KEY = 'garden_auth_token';

const ALLOWED_ADMIN_IDS: ReadonlySet<string> = new Set(
  String(import.meta.env.VITE_MEETINGS_ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export interface Profile {
  id: string;
  email?: string;
  name?: string;
  role: string;
}

export interface AuthError extends Error {
  status?: number;
}

export const getAuthToken = (): string => localStorage.getItem(TOKEN_KEY) || '';

export const setAuthToken = (token: string | null): void => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export const extractSubFromToken = (token: string): string | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return payload.sub || null;
  } catch {
    return null;
  }
};

export const isAllowedAdminId = (id: string | null | undefined): boolean =>
  !!id && ALLOWED_ADMIN_IDS.has(id);

const authFetch = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const url = new URL(path, AUTH_URL);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url.toString(), { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(
      (data as { error?: string }).error || `Ошибка запроса (${response.status})`,
    ) as AuthError;
    err.status = response.status;
    throw err;
  }
  return data as T;
};

export const login = async (email: string, password: string): Promise<{ userId: string }> => {
  const data = await authFetch<{ token: string; user: { id: string } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  setAuthToken(data.token);
  return { userId: data.user.id };
};

export const getCurrentProfile = async (): Promise<Profile | null> => {
  const token = getAuthToken();
  if (!token) return null;
  const sub = extractSubFromToken(token);
  if (!sub) return null;

  const url = new URL('profiles', POSTGREST_URL);
  url.searchParams.set('id', `eq.${sub}`);
  url.searchParams.set('select', 'id,email,name,role');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (response.status === 401) {
    setAuthToken(null);
    return null;
  }
  if (!response.ok) {
    const err = new Error(`PostgREST profile fetch failed (${response.status})`) as AuthError;
    err.status = response.status;
    throw err;
  }
  const rows = (await response.json()) as Profile[];
  return rows[0] || null;
};

export const logout = (): void => setAuthToken(null);
