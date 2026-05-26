import { getAuthToken } from '@/lib/auth';
import type { Question } from '@/types';

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';

export interface QuestionInput {
  question: string;
  order_index: number;
}

const QUESTION_COLUMNS = 'id, question, order_index, created_at';

interface FetchOpts {
  method?: string;
  body?: unknown;
  returnRepresentation?: boolean;
}

const questionsFetch = async <T>(
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

export const listQuestions = (): Promise<Question[]> =>
  questionsFetch<Question[]>('questions', {
    select: QUESTION_COLUMNS,
    order: 'order_index.asc',
  });

export const createQuestion = async (input: QuestionInput): Promise<Question> => {
  const rows = await questionsFetch<Question[]>(
    'questions',
    {},
    { method: 'POST', body: [input], returnRepresentation: true },
  );
  return rows[0];
};

export const updateQuestion = async (
  id: number,
  patch: Partial<QuestionInput>,
): Promise<Question> => {
  const rows = await questionsFetch<Question[]>(
    'questions',
    { id: `eq.${id}` },
    { method: 'PATCH', body: patch, returnRepresentation: true },
  );
  return rows[0];
};

export const deleteQuestion = async (id: number): Promise<void> => {
  await questionsFetch<void>('questions', { id: `eq.${id}` }, { method: 'DELETE' });
};
