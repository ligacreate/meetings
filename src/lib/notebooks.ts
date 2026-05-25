import { getAuthToken } from '@/lib/auth';
import type { Notebook } from '@/types';

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';

export interface NotebookInput {
  title: string;
  description: string;
  price: string;
  image_url: string;
  pdf_url: string;
}

const NOTEBOOK_COLUMNS = 'id, title, description, price, image_url, pdf_url, created_at';

interface FetchOpts {
  method?: string;
  body?: unknown;
  returnRepresentation?: boolean;
}

const notebooksFetch = async <T>(
  path: string,
  params: Record<string, string> = {},
  opts: FetchOpts = {},
): Promise<T> => {
  const url = new URL(path, POSTGREST_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.returnRepresentation) headers.Prefer = 'return=representation';

  const response = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || parsed.error || text;
    } catch {
      // keep raw text
    }
    const err = new Error(message || `Запрос упал (${response.status})`) as Error & {
      status: number;
    };
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

export const listNotebooks = (): Promise<Notebook[]> =>
  notebooksFetch<Notebook[]>('notebooks', {
    select: NOTEBOOK_COLUMNS,
    order: 'created_at.desc',
  });

export const createNotebook = async (input: NotebookInput): Promise<Notebook> => {
  const rows = await notebooksFetch<Notebook[]>(
    'notebooks',
    {},
    { method: 'POST', body: [input], returnRepresentation: true },
  );
  return rows[0];
};

export const updateNotebook = async (
  id: number,
  patch: Partial<NotebookInput>,
): Promise<Notebook> => {
  const rows = await notebooksFetch<Notebook[]>(
    'notebooks',
    { id: `eq.${id}` },
    { method: 'PATCH', body: patch, returnRepresentation: true },
  );
  return rows[0];
};

export const deleteNotebook = async (id: number): Promise<void> => {
  await notebooksFetch<void>('notebooks', { id: `eq.${id}` }, { method: 'DELETE' });
};
