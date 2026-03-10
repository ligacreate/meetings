import { useState } from 'react';
import { Plus, Trash2, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { postgrestRequest } from '@/lib/postgrest';
import { motion, AnimatePresence } from 'framer-motion';

interface QuestionsAdminProps {
  questions: string[];
  onQuestionsChange: (questions: string[]) => void;
}

const QuestionsAdmin = ({ questions, onQuestionsChange }: QuestionsAdminProps) => {
  const [newQuestion, setNewQuestion] = useState('');
  const [bulkQuestions, setBulkQuestions] = useState('');
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;

    try {
      setLoading(true);
      await postgrestRequest('questions', {}, {
        method: 'POST',
        body: [{
          question: newQuestion.trim(),
          order_index: questions.length
        }]
      });

      onQuestionsChange([...questions, newQuestion.trim()]);
      setNewQuestion('');
      toast({ title: "Успешно", description: "Вопрос добавлен" });
    } catch (error) {
      console.error('Error adding question:', error);
      toast({ title: "Ошибка", description: "Не удалось добавить вопрос", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkQuestions.trim()) return;

    const questionsList = bulkQuestions
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    if (questionsList.length === 0) return;

    try {
      setLoading(true);
      const questionsToInsert = questionsList.map((q, index) => ({
        question: q,
        order_index: questions.length + index
      }));

      await postgrestRequest('questions', {}, {
        method: 'POST',
        body: questionsToInsert
      });

      onQuestionsChange([...questions, ...questionsList]);
      setBulkQuestions('');
      setShowBulkAdd(false);
      toast({ title: "Успешно", description: `Добавлено вопросов: ${questionsList.length}` });
    } catch (error) {
      console.error('Error adding questions:', error);
      toast({ title: "Ошибка", description: "Не удалось добавить вопросы", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (index: number) => {
    const questionText = questions[index];
    try {
      setLoading(true);
      await postgrestRequest('questions', { question: `eq.${questionText}` }, { method: 'DELETE' });
      onQuestionsChange(questions.filter((_, i) => i !== index));
      toast({ title: "Успешно", description: "Вопрос удален" });
    } catch (error) {
      console.error('Error deleting question:', error);
      toast({ title: "Ошибка", description: "Не удалось удалить вопрос", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <form onSubmit={handleAdd} className="flex gap-3 flex-1">
          <Input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Новый вопрос для рефлексии..."
            className="rounded-2xl bg-background border-input text-foreground focus:ring-primary transition-all h-12"
            disabled={loading}
          />
          <Button type="submit" disabled={!newQuestion.trim() || loading} className="rounded-2xl w-12 h-12 p-0 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-5 h-5" />
          </Button>
        </form>
        <Button
          onClick={() => setShowBulkAdd(!showBulkAdd)}
          variant="outline"
          className="rounded-2xl w-12 h-12 p-0 bg-transparent border-input text-muted-foreground hover:text-foreground hover:bg-secondary"
          disabled={loading}
        >
          <ListPlus className="w-5 h-5" />
        </Button>
      </div>

      <AnimatePresence>
        {showBulkAdd && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleBulkAdd}
            className="space-y-4 p-6 clean-card overflow-hidden"
          >
            <label className="text-sm font-medium text-muted-foreground">Добавить несколько вопросов (каждый с новой строки):</label>
            <Textarea
              value={bulkQuestions}
              onChange={(e) => setBulkQuestions(e.target.value)}
              placeholder="Вопрос 1&#10;Вопрос 2&#10;Вопрос 3..."
              className="min-h-[150px] rounded-2xl bg-background border-input text-foreground resize-none focus:ring-primary"
              disabled={loading}
            />
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowBulkAdd(false); setBulkQuestions(''); }}
                className="rounded-xl border-input text-muted-foreground hover:text-foreground hover:bg-secondary"
                disabled={loading}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={!bulkQuestions.trim() || loading} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                Добавить всё
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        <AnimatePresence mode='popLayout'>
          {questions.map((question, index) => (
            <motion.div
              key={`${index}-${question}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              layout
              className="clean-card rounded-2xl p-4 flex items-center justify-between gap-4 group hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-muted-foreground font-mono text-xs">
                  {index + 1}
                </div>
                <p className="text-foreground font-medium">{question}</p>
              </div>
              <Button
                onClick={() => handleDelete(index)}
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                disabled={loading}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default QuestionsAdmin;
