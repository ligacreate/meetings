import { useState } from 'react';
import { Plus, Trash2, BookOpen, Upload, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/imageUtils';
import { postgrestRequest } from '@/lib/postgrest';
import { Notebook } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

interface NotebooksAdminProps {
  notebooks: Notebook[];
  onNotebooksChange: (notebooks: Notebook[]) => void;
}

const NotebooksAdmin = ({ notebooks, onNotebooksChange }: NotebooksAdminProps) => {
  const [showForm, setShowForm] = useState(false);
  const [editingNotebook, setEditingNotebook] = useState<Notebook | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [newNotebook, setNewNotebook] = useState({
    title: '',
    description: '',
    imageUrl: null as string | null,
    pdfUrl: ''
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedImage = await compressImage(file);
        setNewNotebook({ ...newNotebook, imageUrl: compressedImage });
      } catch (error) {
        console.error('Error compressing image:', error);
        toast({ title: "Ошибка", description: "Не удалось обработать изображение", variant: "destructive" });
      }
    }
  };

  const removeImage = () => {
    setNewNotebook({ ...newNotebook, imageUrl: null });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);

      if (editingNotebook) {
        await postgrestRequest('notebooks', { id: `eq.${editingNotebook.id}` }, {
          method: 'PATCH',
          body: {
            title: newNotebook.title,
            description: newNotebook.description,
            image_url: newNotebook.imageUrl,
            pdf_url: newNotebook.pdfUrl
          },
          returnRepresentation: true
        });

        const updated = notebooks.map(nb => nb.id === editingNotebook.id ? {
          ...editingNotebook,
          title: newNotebook.title,
          description: newNotebook.description,
          image_url: newNotebook.imageUrl,
          pdf_url: newNotebook.pdfUrl
        } : nb);
        onNotebooksChange(updated);
        toast({ title: "Успешно", description: "Блокнот обновлен" });
      } else {
        const data = await postgrestRequest<Notebook[]>('notebooks', {}, {
          method: 'POST',
          body: [{
            title: newNotebook.title,
            description: newNotebook.description,
            image_url: newNotebook.imageUrl,
            pdf_url: newNotebook.pdfUrl
          }],
          returnRepresentation: true
        });
        if (data && data[0]) {
          onNotebooksChange([...notebooks, data[0]]);
        }
        toast({ title: "Успешно", description: "Блокнот создан" });
      }

      setNewNotebook({ title: '', description: '', imageUrl: null, pdfUrl: '' });
      setEditingNotebook(null);
      setShowForm(false);
    } catch (error) {
      console.error('Error saving notebook:', error);
      toast({ title: "Ошибка", description: "Не удалось сохранить блокнот", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (notebook: Notebook) => {
    setEditingNotebook(notebook);
    setNewNotebook({
      title: notebook.title,
      description: notebook.description || '',
      imageUrl: notebook.image_url,
      pdfUrl: notebook.pdf_url || ''
    });
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingNotebook(null);
    setNewNotebook({ title: '', description: '', imageUrl: null, pdfUrl: '' });
    setShowForm(false);
  };

  const handleDelete = async (id: number) => {
    try {
      setLoading(true);
      await postgrestRequest('notebooks', { id: `eq.${id}` }, { method: 'DELETE' });
      onNotebooksChange(notebooks.filter(n => n.id !== id));
      toast({ title: "Успешно", description: "Блокнот удален" });
    } catch (error) {
      console.error('Error deleting notebook:', error);
      toast({ title: "Ошибка", description: "Не удалось удалить блокнот", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {!showForm ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Button onClick={() => setShowForm(true)} className="w-full h-12 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" disabled={loading}>
              <Plus className="w-5 h-5 mr-2" />
              Добавить блокнот
            </Button>
          </motion.div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onSubmit={handleSubmit}
            className="clean-card p-6 md:p-8 space-y-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-semibold text-foreground">{editingNotebook ? 'Редактировать блокнот' : 'Новый блокнот'}</h3>
              <button type="button" onClick={handleCancelEdit} className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Название</Label>
              <Input
                value={newNotebook.title}
                onChange={(e) => setNewNotebook({ ...newNotebook, title: e.target.value })}
                required
                disabled={loading}
                className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Описание</Label>
              <Input
                value={newNotebook.description}
                onChange={(e) => setNewNotebook({ ...newNotebook, description: e.target.value })}
                placeholder="Краткое описание блокнота"
                disabled={loading}
                className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Ссылка на PDF</Label>
              <Input
                type="url"
                value={newNotebook.pdfUrl}
                onChange={(e) => setNewNotebook({ ...newNotebook, pdfUrl: e.target.value })}
                placeholder="https://example.com/notebook.pdf"
                disabled={loading}
                className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Фото блокнота</Label>
              {newNotebook.imageUrl ? (
                <div className="relative rounded-2xl overflow-hidden group">
                  <img src={newNotebook.imageUrl} alt="Preview" className="w-full h-48 object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  <button
                    type="button"
                    onClick={removeImage}
                    disabled={loading}
                    className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-destructive rounded-full text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-48 border border-dashed border-border rounded-2xl cursor-pointer hover:bg-secondary/50 transition-colors group">
                  <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground">Загрузить фото</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={loading}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" className="flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading}>
                {editingNotebook ? 'Сохранить' : 'Создать'}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AnimatePresence>
          {notebooks.map((notebook, index) => (
            <motion.div
              key={notebook.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="clean-card rounded-3xl p-5 flex flex-col justify-between group hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground">
                  {notebook.image_url ? (
                    <img src={notebook.image_url} alt="" className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    <BookOpen className="w-6 h-6" />
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(notebook)}
                    className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
                    disabled={loading}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(notebook.id)}
                    className="p-2 hover:bg-destructive/10 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                    disabled={loading}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-1.5 line-clamp-1">{notebook.title}</h4>
                {notebook.description && <p className="text-sm text-muted-foreground line-clamp-2">{notebook.description}</p>}
                {notebook.pdf_url && <a href={notebook.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary mt-2 inline-block hover:underline">Открыть PDF →</a>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default NotebooksAdmin;
