type QueryParams = Record<string, string>;

interface PostgrestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  returnRepresentation?: boolean;
}

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';

export const postgrestRequest = async <T = unknown>(
  path: string,
  params: QueryParams = {},
  options: PostgrestOptions = {}
): Promise<T> => {
  const url = new URL(path, POSTGREST_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const headers: HeadersInit = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.returnRepresentation) headers['Prefer'] = 'return=representation';

  const response = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

