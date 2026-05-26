import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  createQuestion,
  deleteQuestion,
  listQuestions,
  updateQuestion,
  type QuestionInput,
} from '@/lib/questions';
import type { Question } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 25;

type Mode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; item: Question };

const EMPTY_FORM: QuestionInput = {
  question: '',
  order_index: 0,
};

const validateForm = (
  f: QuestionInput,
): Partial<Record<keyof QuestionInput, string>> => {
  const errors: Partial<Record<keyof QuestionInput, string>> = {};
  if (f.question.trim().length < 10) errors.question = 'Минимум 10 символов';
  if (!Number.isInteger(f.order_index) || f.order_index < 0) {
    errors.order_index = 'Целое число ≥ 0';
  }
  return errors;
};

const errMsg = (err: unknown): string =>
  err instanceof Error ? err.message : 'Неизвестная ошибка';

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    {children}
    {error && <div className="text-xs text-red-600">{error}</div>}
  </div>
);

const QuestionsAdminTab = () => {
  const [items, setItems] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [form, setForm] = useState<QuestionInput>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      setItems(await listQuestions());
    } catch (err) {
      toast({
        title: 'Не удалось загрузить вопросы',
        description: errMsg(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.question.toLowerCase().includes(q));
  }, [items, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const setField = <K extends keyof QuestionInput>(k: K, v: QuestionInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const errors = validateForm(form);
  const isValid = Object.values(errors).every((e) => !e);

  const openCreate = () => {
    const maxOrder = items.reduce((m, it) => Math.max(m, it.order_index), -1);
    setForm({ question: '', order_index: maxOrder + 1 });
    setMode({ kind: 'create' });
  };

  const openEdit = (item: Question) => {
    setForm({ question: item.question, order_index: item.order_index });
    setMode({ kind: 'edit', item });
  };

  const cancelForm = () => {
    setMode({ kind: 'list' });
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || mode.kind === 'list') return;
    setBusy(true);
    try {
      if (mode.kind === 'create') {
        await createQuestion(form);
        toast({ title: 'Вопрос добавлен' });
      } else {
        await updateQuestion(mode.item.id, form);
        toast({ title: 'Вопрос сохранён' });
      }
      cancelForm();
      await reload();
    } catch (err) {
      toast({
        title: 'Не удалось сохранить',
        description: errMsg(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (deletingId === null) return;
    setBusy(true);
    try {
      await deleteQuestion(deletingId);
      toast({ title: 'Вопрос удалён' });
      setDeletingId(null);
      await reload();
    } catch (err) {
      toast({
        title: 'Не удалось удалить',
        description: errMsg(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (mode.kind !== 'list') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4 mt-4">
        <h2 className="text-lg font-medium">
          {mode.kind === 'create' ? 'Новый вопрос' : `Редактируем вопрос #${mode.item.id}`}
        </h2>

        <Field label="Текст вопроса *" error={errors.question}>
          <Textarea
            value={form.question}
            onChange={(e) => setField('question', e.target.value)}
            disabled={busy}
            rows={4}
          />
        </Field>

        <Field label="Порядок (order_index) *" error={errors.order_index}>
          <Input
            type="number"
            min={0}
            step={1}
            value={form.order_index}
            onChange={(e) => setField('order_index', Number(e.target.value))}
            disabled={busy}
          />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !isValid}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button type="button" variant="ghost" onClick={cancelForm} disabled={busy}>
            Отмена
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <h2 className="text-lg font-medium">Вопросы ({items.length})</h2>
        <div className="flex gap-2">
          <Input
            placeholder="Поиск по тексту…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-full sm:w-64"
          />
          <Button onClick={openCreate} size="sm">
            + Добавить
          </Button>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">Загружаем…</div>}
      {!loading && filtered.length === 0 && (
        <div className="text-sm text-slate-500">
          {search ? 'Ничего не найдено.' : 'Пока нет вопросов.'}
        </div>
      )}

      <div className="space-y-2">
        {pageItems.map((item) => (
          <div key={item.id} className="flex gap-3 p-3 border rounded-lg items-start">
            <div className="text-xs font-mono text-muted-foreground pt-0.5 shrink-0 w-12">
              #{item.order_index}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm line-clamp-2">{item.question}</div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Button size="sm" variant="outline" onClick={() => openEdit(item)} disabled={busy}>
                Редактировать
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeletingId(item.id)}
                disabled={busy}
              >
                Удалить
              </Button>
            </div>
          </div>
        ))}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0 || busy}
          >
            ←
          </Button>
          <div className="text-sm text-muted-foreground">
            Страница {safePage + 1} из {pageCount}
            {filtered.length !== items.length && ` (найдено ${filtered.length})`}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1 || busy}
          >
            →
          </Button>
        </div>
      )}

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && !busy && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить вопрос?</AlertDialogTitle>
            <AlertDialogDescription>
              «{(items.find((i) => i.id === deletingId)?.question || '').slice(0, 80)}
              {(items.find((i) => i.id === deletingId)?.question || '').length > 80 ? '…' : ''}»
              исчезнет навсегда. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={handleDelete}>
              {busy ? 'Удаляем…' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuestionsAdminTab;
