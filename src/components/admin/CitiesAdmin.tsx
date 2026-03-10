import { useState } from 'react';
import { Plus, Trash2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { postgrestRequest } from '@/lib/postgrest';
import { motion, AnimatePresence } from 'framer-motion';

interface CitiesAdminProps {
  cities: string[];
  onCitiesChange: (cities: string[]) => void;
}

const CitiesAdmin = ({ cities, onCitiesChange }: CitiesAdminProps) => {
  const [newCity, setNewCity] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCity.trim()) return;

    if (cities.includes(newCity.trim())) {
      toast({ title: "Ошибка", description: "Этот город уже существует", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      await postgrestRequest('cities', {}, { method: 'POST', body: [{ name: newCity.trim() }] });

      onCitiesChange([...cities, newCity.trim()]);
      setNewCity('');
      toast({ title: "Успешно", description: "Город добавлен" });
    } catch (error) {
      console.error('Error adding city:', error);
      toast({ title: "Ошибка", description: "Не удалось добавить город", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (city: string) => {
    if (city === 'Все') return;
    try {
      setLoading(true);
      await postgrestRequest('cities', { name: `eq.${city}` }, { method: 'DELETE' });
      onCitiesChange(cities.filter(c => c !== city));
      toast({ title: "Успешно", description: "Город удален" });
    } catch (error) {
      console.error('Error deleting city:', error);
      toast({ title: "Ошибка", description: "Не удалось удалить город", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="flex gap-3">
        <Input
          value={newCity}
          onChange={(e) => setNewCity(e.target.value)}
          placeholder="Название города..."
          className="rounded-2xl bg-background border-input text-foreground focus:ring-primary transition-all h-12"
          disabled={loading}
        />
        <Button type="submit" disabled={!newCity.trim() || loading} className="rounded-2xl w-12 h-12 p-0 bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-5 h-5" />
        </Button>
      </form>

      <div className="flex flex-wrap gap-3">
        <AnimatePresence mode='popLayout'>
          {cities.map((city) => (
            <motion.div
              key={city}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              layout
              className="clean-card rounded-full px-5 py-3 flex items-center gap-3 group hover:shadow-md transition-all"
            >
              <span className="text-foreground font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                {city}
              </span>
              {city !== 'Все' && (
                <button
                  onClick={() => handleDelete(city)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1 -mr-2 rounded-full hover:bg-destructive/10"
                  disabled={loading}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CitiesAdmin;
