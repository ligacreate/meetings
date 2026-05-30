import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  createNotebook,
  deleteNotebook,
  listNotebooks,
  updateNotebook,
  type NotebookInput,
} from '@/lib/notebooks';
import { uploadNotebookImage } from '@/lib/imageUpload';
import type { Notebook } from '@/types';
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

type Mode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; item: Notebook };

const EMPTY_FORM: NotebookInput = {
  title: '',
  description: '',
  price: '',
  image_url: '',
  pdf_url: '',
};

const isValidUrl = (s: string): boolean => {
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const validateForm = (
  f: NotebookInput,
): Partial<Record<keyof NotebookInput, string>> => {
  const errors: Partial<Record<keyof NotebookInput, string>> = {};
  if (f.title.trim().length < 3) errors.title = 'Минимум 3 символа';
  if (f.description.trim().length < 10) errors.description = 'Минимум 10 символов';
  if (!isValidUrl(f.image_url)) errors.image_url = 'Введите корректный URL (https://…)';
  if (!isValidUrl(f.pdf_url)) errors.pdf_url = 'Введите корректный URL покупки';
  return errors;
};

const errMsg = (err: unknown): string =>
  err instanceof Error ? err.message : 'Неизвестная ошибка';

const inputToForm = (n: Notebook): NotebookInput => ({
  title: n.title || '',
  description: n.description || '',
  price: n.price || '',
  image_url: n.image_url || '',
  pdf_url: n.pdf_url || '',
});

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

const NotebooksAdminTab = () => {
  const [items, setItems] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [form, setForm] = useState<NotebookInput>(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { toast } = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      setItems(await listNotebooks());
    } catch (err) {
      toast({
        title: 'Не удалось загрузить блокноты',
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

  const setField = <K extends keyof NotebookInput>(k: K, v: NotebookInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const errors = validateForm(form);
  const isValid = Object.values(errors).every((e) => !e);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setMode({ kind: 'create' });
  };

  const openEdit = (item: Notebook) => {
    setForm(inputToForm(item));
    setMode({ kind: 'edit', item });
  };

  const cancelForm = () => {
    setMode({ kind: 'list' });
    setForm(EMPTY_FORM);
    setUploadError(null);
  };

  const handleFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadNotebookImage(file);
      setField('image_url', url);
    } catch (err) {
      setUploadError(errMsg(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || mode.kind === 'list') return;
    setBusy(true);
    try {
      if (mode.kind === 'create') {
        await createNotebook(form);
        toast({ title: 'Блокнот добавлен' });
      } else {
        await updateNotebook(mode.item.id, form);
        toast({ title: 'Блокнот сохранён' });
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
      await deleteNotebook(deletingId);
      toast({ title: 'Блокнот удалён' });
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
          {mode.kind === 'create' ? 'Новый блокнот' : `Редактируем «${mode.item.title}»`}
        </h2>

        <Field label="Название *" error={errors.title}>
          <Input
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            disabled={busy}
            maxLength={200}
          />
        </Field>

        <Field label="Описание *" error={errors.description}>
          <Textarea
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            disabled={busy}
            rows={3}
          />
        </Field>

        <Field label="Цена (необязательно, например: 1 200 ₽)" error={errors.price}>
          <Input
            value={form.price}
            onChange={(e) => setField('price', e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="Картинка блокнота *" error={errors.image_url}>
          <div className="space-y-2">
            <input
              type="file"
              accept="image/*"
              disabled={busy || uploading}
              onChange={handleFilePick}
              className="block text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            />
            {uploading && (
              <div className="text-xs text-slate-500">Загружаем картинку в хранилище…</div>
            )}
            {uploadError && <div className="text-xs text-red-600">{uploadError}</div>}
            <Input
              type="url"
              value={form.image_url}
              onChange={(e) => setField('image_url', e.target.value)}
              disabled={busy || uploading}
              placeholder="…или вставьте URL вручную (https://…)"
            />
            {form.image_url && (
              <img
                src={form.image_url}
                alt="Предпросмотр"
                className="w-24 h-32 object-cover rounded border bg-muted"
              />
            )}
          </div>
        </Field>

        <Field label="URL покупки *" error={errors.pdf_url}>
          <Input
            type="url"
            value={form.pdf_url}
            onChange={(e) => setField('pdf_url', e.target.value)}
            disabled={busy}
            placeholder="https://izdatelstvo.skrebeyko.ru/..."
          />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" disabled={busy || uploading || !isValid}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button type="button" variant="ghost" onClick={cancelForm} disabled={busy || uploading}>
            Отмена
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Блокноты ({items.length})</h2>
        <Button onClick={openCreate} size="sm">
          + Добавить
        </Button>
      </div>

      {loading && <div className="text-sm text-slate-500">Загружаем…</div>}
      {!loading && items.length === 0 && (
        <div className="text-sm text-slate-500">Пока нет блокнотов.</div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex gap-3 p-3 border rounded-lg">
            <div className="w-16 h-20 shrink-0 bg-muted rounded overflow-hidden">
              {item.image_url ? (
                <img src={item.image_url} alt="" className="w-full h-full object-cover" />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{item.title}</div>
              <div className="text-sm text-muted-foreground line-clamp-2">{item.description}</div>
              {item.price && <div className="text-sm mt-1">{item.price}</div>}
              {item.pdf_url && (
                <a
                  href={item.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 underline"
                >
                  URL
                </a>
              )}
            </div>
            <div className="flex flex-col gap-1">
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

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && !busy && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить блокнот?</AlertDialogTitle>
            <AlertDialogDescription>
              «{items.find((i) => i.id === deletingId)?.title}» исчезнет с публичной страницы.
              Действие необратимо.
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

export default NotebooksAdminTab;
