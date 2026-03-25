import { useState } from 'react';
import { Plus, Trash2, Upload, X, Pencil, Calendar, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/imageUtils';
import { postgrestRequest } from '@/lib/postgrest';
import { Event } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { resolveCityTimeZone, normalizeEventTimeLabel } from '@/lib/dateUtils';

interface EventsAdminProps {
  events: Event[];
  cities: string[];
  onEventsChange: (events: Event[]) => void;
  onCitiesChange: (cities: string[]) => void;
}

interface EditableEventCardProps {
  event: Event;
  index: number;
  editingEvent: Event | null;
  onEdit: (event: Event) => void;
  onDelete: (id: number) => void;
  loading: boolean;
  showDebug: boolean;
}

const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  return dateStr.trim();
};

const parseEventDate = (dateStr: string): Date | null => {
  const normalized = normalizeDate(dateStr);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatEventDate = (dateStr: string): string => {
  const normalized = normalizeDate(dateStr);
  return normalized ? normalized.split('-').reverse().join('.') : dateStr;
};

const EditableEventCard = ({ event, index, editingEvent, onEdit, onDelete, loading, showDebug }: EditableEventCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.05 }}
    className={`
      clean-card rounded-2xl p-4 flex gap-4 items-start group hover:shadow-md transition-all
      ${editingEvent?.id === event.id ? 'border-primary ring-1 ring-primary' : ''}
    `}
  >
    <div className="w-16 h-16 rounded-xl flex-shrink-0 bg-secondary overflow-hidden relative">
      {event.image_url ? (
        <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
          <Calendar className="w-6 h-6" />
        </div>
      )}
    </div>

    <div className="flex-1 min-w-0">
      <h4 className="font-semibold text-foreground truncate">{event.title}</h4>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatEventDate(event.date)}</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {normalizeEventTimeLabel(event.time)}</span>
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.city}</span>
      </div>
      {showDebug && (
        <div className="mt-2 text-[11px] text-muted-foreground/80">
          id: {event.id}
          {event.garden_id ? `, garden_id: ${event.garden_id}` : ''}
          {typeof event.image_focus_x === 'number' || typeof event.image_focus_y === 'number'
            ? `, focus: ${event.image_focus_x ?? 50}/${event.image_focus_y ?? 50}`
            : ''}
        </div>
      )}
    </div>

    <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => onEdit(event)}
        className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
        disabled={loading}
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        onClick={() => onDelete(event.id)}
        className="p-2 hover:bg-destructive/10 rounded-full text-muted-foreground hover:text-destructive transition-colors"
        disabled={loading}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  </motion.div>
);

const EventsAdmin = ({ events, cities, onEventsChange, onCitiesChange }: EventsAdminProps) => {
  const defaultCity = cities.filter(c => c !== 'Все')[0] || 'Москва';
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const showDebug = (() => {
    if (typeof window === 'undefined') return false;
    const w = window as { __events_debug?: boolean };
    if (w.__events_debug === true) return true;
    try {
      if (window.localStorage.getItem('events_debug') === '1') return true;
    } catch {
      // ignore storage errors
    }
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('events_debug') === '1') return true;
    } catch {
      // ignore URL errors
    }
    return false;
  })();

  const [newEvent, setNewEvent] = useState({
    title: '',
    date: '',
    time: '',
    city: defaultCity,
    customCity: '',
    sourceTimezone: resolveCityTimeZone(defaultCity, 'Europe/Moscow') || 'Europe/Moscow',
    category: 'Встреча',
    customCategory: '',
    description: '',
    location: '',
    speaker: 'Команда',
    registrationLink: '',
    price: '',
    imageUrl: null as string | null,
    imageFocusX: 50,
    imageFocusY: 50
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedImage = await compressImage(file);
        setNewEvent({ ...newEvent, imageUrl: compressedImage, imageFocusX: 50, imageFocusY: 50 });
      } catch (error) {
        console.error('Error compressing image:', error);
        toast({
          title: "Ошибка",
          description: "Не удалось обработать изображение",
          variant: "destructive",
        });
      }
    }
  };

  const removeImage = () => {
      setNewEvent({ ...newEvent, imageUrl: null, imageFocusX: 50, imageFocusY: 50 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = newEvent.category === 'Другое' ? newEvent.customCategory : newEvent.category;
    const finalCity = newEvent.city === 'Другой' ? newEvent.customCity : newEvent.city;
    const finalSourceTimezone = (newEvent.sourceTimezone || '').trim() || resolveCityTimeZone(finalCity, null);

    if (!finalSourceTimezone) {
      toast({
        title: "Укажите часовой пояс",
        description: "Для нового города укажите IANA timezone, например Asia/Novosibirsk",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // If it's a new custom city, add it to cities table and local state
      if (finalCity && !cities.includes(finalCity)) {
        try {
          await postgrestRequest('cities', {}, {
            method: 'POST',
            body: [{ name: finalCity }]
          });
          onCitiesChange([...cities, finalCity]);
        } catch (cityError) {
          const message = cityError instanceof Error ? cityError.message : String(cityError);
          if (!message.toLowerCase().includes('duplicate')) {
            throw cityError;
          }
        }
      }

      if (editingEvent) {
        const normalizeImageUrl = (value?: string | null) => value ?? null;
        const isImageChanged = normalizeImageUrl(newEvent.imageUrl) !== normalizeImageUrl(editingEvent.image_url);
        const nextFocusX = isImageChanged ? 50 : newEvent.imageFocusX;
        const nextFocusY = isImageChanged ? 50 : newEvent.imageFocusY;

        // Update existing event
        await postgrestRequest('events', { id: `eq.${editingEvent.id}` }, {
          method: 'PATCH',
          body: {
            title: newEvent.title,
            date: newEvent.date,
            time: newEvent.time,
            city: finalCity,
            source_timezone: finalSourceTimezone,
            category: finalCategory,
            description: newEvent.description,
            location: newEvent.location,
            speaker: newEvent.speaker,
            registration_link: newEvent.registrationLink,
            price: newEvent.price,
            image_url: newEvent.imageUrl,
            image_focus_x: nextFocusX,
            image_focus_y: nextFocusY,
            image_gradient: editingEvent.image_gradient
          },
          returnRepresentation: true
        });

        if (editingEvent.garden_id) {
          try {
            const meetingPatch: Record<string, unknown> = {
              image_focus_x: nextFocusX,
              image_focus_y: nextFocusY
            };
            if (newEvent.imageUrl === null) {
              meetingPatch.cover_image = null;
            } else if (typeof newEvent.imageUrl === 'string') {
              meetingPatch.cover_image = newEvent.imageUrl;
            }
            await postgrestRequest('meetings', { id: `eq.${editingEvent.garden_id}` }, {
              method: 'PATCH',
              body: meetingPatch
            });
          } catch (syncError) {
            console.warn('Meeting sync after event update failed', syncError);
          }
        }

        const updated = events.map(ev => ev.id === editingEvent.id ? {
          ...editingEvent,
          title: newEvent.title,
          date: newEvent.date,
          time: newEvent.time,
          city: finalCity,
          source_timezone: finalSourceTimezone,
          category: finalCategory,
          description: newEvent.description,
          location: newEvent.location,
          speaker: newEvent.speaker,
          registration_link: newEvent.registrationLink,
          price: newEvent.price,
          image_url: newEvent.imageUrl,
          image_focus_x: nextFocusX,
          image_focus_y: nextFocusY
        } : ev);
        onEventsChange(updated);

        toast({ title: "Успешно", description: "Событие обновлено" });
      } else {
        // Create new event
        const data = await postgrestRequest<Event[]>('events', {}, {
          method: 'POST',
          body: [{
            title: newEvent.title,
            date: newEvent.date,
            time: newEvent.time,
            city: finalCity,
            source_timezone: finalSourceTimezone,
            category: finalCategory,
            description: newEvent.description,
            location: newEvent.location,
            speaker: newEvent.speaker,
            registration_link: newEvent.registrationLink,
            price: newEvent.price,
            image_url: newEvent.imageUrl,
            image_focus_x: newEvent.imageFocusX,
            image_focus_y: newEvent.imageFocusY,
            image_gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          }],
          returnRepresentation: true
        });

        if (data && data[0]) {
          onEventsChange([...events, data[0]]);
        }
        toast({ title: "Успешно", description: "Событие создано" });
      }

      setNewEvent({
        title: '',
        date: '',
        time: '',
        city: defaultCity,
        customCity: '',
        sourceTimezone: resolveCityTimeZone(defaultCity, 'Europe/Moscow') || 'Europe/Moscow',
        category: 'Встреча',
        customCategory: '',
        description: '',
        location: '',
        speaker: 'Команда',
        registrationLink: '',
        price: '',
        imageUrl: null,
        imageFocusX: 50,
        imageFocusY: 50
      });
      setEditingEvent(null);
      setShowForm(false);
    } catch (error) {
      console.error('Error saving event:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить событие",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (event: Event) => {
    try {
      setEditingEvent(event);
      const isCustomCity = !cities.includes(event.city) && event.city !== 'Все';
      setNewEvent({
        title: event.title,
        date: normalizeDate(event.date),
        time: event.time,
        city: isCustomCity ? 'Другой' : event.city,
        customCity: isCustomCity ? event.city : '',
        sourceTimezone: event.source_timezone || resolveCityTimeZone(event.city, 'Europe/Moscow') || 'Europe/Moscow',
        category: event.category,
        customCategory: '',
        description: event.description,
        location: event.location,
        speaker: event.speaker,
        registrationLink: event.registration_link || '',
        price: event.price || '',
        imageUrl: event.image_url,
        imageFocusX: event.image_focus_x ?? 50,
        imageFocusY: event.image_focus_y ?? 50
      });
      setShowForm(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Error in handleEdit:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingEvent(null);
    setNewEvent({
      title: '',
      date: '',
      time: '',
      city: defaultCity,
      customCity: '',
      sourceTimezone: resolveCityTimeZone(defaultCity, 'Europe/Moscow') || 'Europe/Moscow',
      category: 'Встреча',
      customCategory: '',
      description: '',
      location: '',
      speaker: 'Команда',
      registrationLink: '',
      price: '',
      imageUrl: null,
      imageFocusX: 50,
      imageFocusY: 50
    });
    setShowForm(false);
  };

  const handleDelete = async (id: number) => {
    try {
      setLoading(true);
      await postgrestRequest('events', { id: `eq.${id}` }, { method: 'DELETE' });
      onEventsChange(events.filter(e => e.id !== id));
      toast({ title: "Успешно", description: "Событие удалено" });
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({ title: "Ошибка", description: "Не удалось удалить событие", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Filter active vs archived events
  const { activeEvents, archivedEvents, activeCountThisMonth } = (() => {
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Sort logic
    const sortByDate = (a: Event, b: Event) => {
      const aDate = parseEventDate(a.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDate = parseEventDate(b.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    };
    const sortByDateDesc = (a: Event, b: Event) => {
      const aDate = parseEventDate(a.date)?.getTime() ?? Number.MIN_SAFE_INTEGER;
      const bDate = parseEventDate(b.date)?.getTime() ?? Number.MIN_SAFE_INTEGER;
      return bDate - aDate;
    };

    const active = events.filter(e => {
      const d = parseEventDate(e.date);
      if (!d) return false;
      d.setHours(0, 0, 0, 0);
      return d >= startOfCurrentMonth;
    }).sort(sortByDate);

    const archived = events.filter(e => {
      const d = parseEventDate(e.date);
      if (!d) return false;
      d.setHours(0, 0, 0, 0);
      return d < startOfCurrentMonth;
    }).sort(sortByDateDesc);

    // Count this month's meetings
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const count = events.filter(e => {
      const d = parseEventDate(e.date);
      if (!d) return false;
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    return { activeEvents: active, archivedEvents: archived, activeCountThisMonth: count };
  })();

  return (
    <div className="space-y-6">
      {/* Stats Dashboard */}
      <div className="clean-card p-6 bg-primary text-primary-foreground shadow-lg shadow-primary/20">
        <h3 className="text-lg font-semibold mb-1 opacity-90">Встречи в этом месяце</h3>
        <div className="text-4xl font-bold">{activeCountThisMonth}</div>
        <p className="text-sm opacity-70 mt-1">запланировано</p>
      </div>
      <AnimatePresence>
        {!showForm ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Button onClick={() => setShowForm(true)} className="w-full h-12 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" disabled={loading}>
              <Plus className="w-5 h-5 mr-2" />
              Добавить событие
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
              <h3 className="font-display text-xl font-semibold text-foreground">{editingEvent ? 'Редактировать событие' : 'Новое событие'}</h3>
              <button type="button" onClick={handleCancelEdit} className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Название</Label>
              <Input
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                required
                disabled={loading}
                className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
                placeholder="Название события"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Дата</Label>
                <Input
                  type="date"
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                  required
                  disabled={loading}
                  className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Время</Label>
                <Input
                  type="time"
                  value={newEvent.time}
                  onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                  required
                  disabled={loading}
                  className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Город</Label>
                <Select
                  value={newEvent.city}
                  onValueChange={(value) => setNewEvent({
                    ...newEvent,
                    city: value,
                    sourceTimezone: value === 'Другой'
                      ? newEvent.sourceTimezone
                      : (resolveCityTimeZone(value, newEvent.sourceTimezone || 'Europe/Moscow') || newEvent.sourceTimezone || 'Europe/Moscow')
                  })}
                  disabled={loading}
                >
                  <SelectTrigger className="rounded-xl bg-background border-input text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-foreground">
                    {cities.filter(c => c !== 'Все').map((city) => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                    <SelectItem value="Другой">Другой (ввести свой)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Категория</Label>
                <Select value={newEvent.category} onValueChange={(value) => setNewEvent({ ...newEvent, category: value })} disabled={loading}>
                  <SelectTrigger className="rounded-xl bg-background border-input text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-foreground">
                    <SelectItem value="Встреча">Встреча</SelectItem>
                    <SelectItem value="Презентация">Презентация</SelectItem>
                    <SelectItem value="Обучение">Обучение</SelectItem>
                    <SelectItem value="Другое">Другое (ввести свой)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newEvent.city === 'Другой' && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Название города</Label>
                <Input
                  value={newEvent.customCity}
                  onChange={(e) => setNewEvent({ ...newEvent, customCity: e.target.value })}
                  placeholder="Например: Санкт-Петербург"
                  required
                  disabled={loading}
                  className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-muted-foreground">Часовой пояс (IANA)</Label>
              <Input
                value={newEvent.sourceTimezone}
                onChange={(e) => setNewEvent({ ...newEvent, sourceTimezone: e.target.value })}
                required
                disabled={loading}
                className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
                placeholder="Например: Asia/Novosibirsk"
              />
            </div>

            {newEvent.category === 'Другое' && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Тип события</Label>
                <Input
                  value={newEvent.customCategory}
                  onChange={(e) => setNewEvent({ ...newEvent, customCategory: e.target.value })}
                  placeholder="Например: Вебинар, Конференция"
                  required
                  disabled={loading}
                  className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-muted-foreground">Место</Label>
              <Input
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                disabled={loading}
                className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
                placeholder="Адрес или ссылка"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Спикер</Label>
              <Input
                value={newEvent.speaker}
                onChange={(e) => setNewEvent({ ...newEvent, speaker: e.target.value })}
                required
                disabled={loading}
                className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
                placeholder="Имя спикера"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Описание</Label>
              <Textarea
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                required
                disabled={loading}
                className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all resize-none"
                rows={3}
                placeholder="О чем будет событие..."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Ссылка (опционально)</Label>
              <Input
                type="url"
                value={newEvent.registrationLink}
                onChange={(e) => setNewEvent({ ...newEvent, registrationLink: e.target.value })}
                disabled={loading}
                className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all"
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Стоимость</Label>
              <div className="flex flex-col gap-3">
                <Select
                  value={(() => {
                    const p = newEvent.price?.toLowerCase() || '';
                    if (p.includes('бесплатно')) return 'free';
                    if (p.includes('донат')) return 'donate';
                    return 'fixed';
                  })()}
                  onValueChange={(value) => {
                    let newPrice = '';
                    if (value === 'free') newPrice = 'Бесплатно';
                    else if (value === 'donate') newPrice = 'Донат';
                    else newPrice = ''; // Reset for fixed input
                    setNewEvent({ ...newEvent, price: newPrice });
                  }}
                  disabled={loading}
                >
                  <SelectTrigger className="rounded-xl bg-background border-input text-foreground">
                    <SelectValue placeholder="Выберите тип оплаты" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-foreground">
                    <SelectItem value="fixed">Платное</SelectItem>
                    <SelectItem value="free">Бесплатно</SelectItem>
                    <SelectItem value="donate">Донат</SelectItem>
                  </SelectContent>
                </Select>

                {(!newEvent.price || (!newEvent.price.toLowerCase().includes('бесплатно') && !newEvent.price.toLowerCase().includes('донат'))) && (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={parseInt(newEvent.price?.replace(/[^\d]/g, '') || '0') || ''}
                      onChange={(e) => {
                        const amount = e.target.value;
                        const isEuro = newEvent.price?.includes('€');
                        setNewEvent({ ...newEvent, price: `${amount} ${isEuro ? '€' : '₽'}` });
                      }}
                      placeholder="Сумма"
                      disabled={loading}
                      className="rounded-xl bg-background border-input text-foreground focus:ring-primary transition-all flex-1"
                    />
                    <Select
                      value={newEvent.price?.includes('€') ? 'EUR' : 'RUB'}
                      onValueChange={(value) => {
                        const amount = parseInt(newEvent.price?.replace(/[^\d]/g, '') || '0') || 0;
                        setNewEvent({ ...newEvent, price: `${amount} ${value === 'EUR' ? '€' : '₽'}` });
                      }}
                      disabled={loading}
                    >
                      <SelectTrigger className="w-[100px] rounded-xl bg-background border-input text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border text-foreground">
                        <SelectItem value="RUB">RUB ₽</SelectItem>
                        <SelectItem value="EUR">EUR €</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Фото события</Label>
              {newEvent.imageUrl ? (
                <div className="space-y-4">
                  <div className="relative rounded-2xl overflow-hidden group">
                    <img src={newEvent.imageUrl} alt="Preview" className="w-full h-48 object-cover opacity-80 group-hover:opacity-100 transition-opacity" style={{ objectPosition: `${newEvent.imageFocusX}% ${newEvent.imageFocusY}%` }} />
                    <button
                      type="button"
                      onClick={removeImage}
                      disabled={loading}
                      className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-destructive rounded-full text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="bg-secondary/40 border border-border rounded-2xl p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Компьютер (16:9)</div>
                        <div className="w-full rounded-xl overflow-hidden bg-background" style={{ aspectRatio: '16 / 9' }}>
                          <img
                            src={newEvent.imageUrl}
                            alt="Desktop preview"
                            className="w-full h-full object-cover"
                            style={{ objectPosition: `${newEvent.imageFocusX}% ${newEvent.imageFocusY}%` }}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Телефон (1:1)</div>
                        <div className="w-full rounded-xl overflow-hidden bg-background" style={{ aspectRatio: '1 / 1' }}>
                          <img
                            src={newEvent.imageUrl}
                            alt="Mobile preview"
                            className="w-full h-full object-cover"
                            style={{ objectPosition: `${newEvent.imageFocusX}% ${newEvent.imageFocusY}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Смещение по горизонтали: {newEvent.imageFocusX}%</div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={newEvent.imageFocusX}
                          onChange={(e) => setNewEvent({ ...newEvent, imageFocusX: parseInt(e.target.value, 10) })}
                          className="w-full"
                          disabled={loading}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Смещение по вертикали: {newEvent.imageFocusY}%</div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={newEvent.imageFocusY}
                          onChange={(e) => setNewEvent({ ...newEvent, imageFocusY: parseInt(e.target.value, 10) })}
                          className="w-full"
                          disabled={loading}
                        />
                      </div>
                    </div>
                  </div>
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
                {editingEvent ? 'Сохранить изменения' : 'Создать событие'}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="space-y-8">
        {/* Active Events */}
        <div className="space-y-4">
          <h3 className="font-display text-lg font-semibold text-foreground">Предстоящие события</h3>
          {activeEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-secondary/30 rounded-2xl border border-dashed border-border">
              <p>Нет запланированных событий</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {activeEvents.map((event, index) => (
                <EditableEventCard
                  key={event.id}
                  event={event}
                  index={index}
                  editingEvent={editingEvent}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  loading={loading}
                  showDebug={showDebug}
                />
              ))}
            </div>
          )}
        </div>

        {/* Archived Events */}
        {archivedEvents.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-border/50">
            <h3 className="font-display text-lg font-semibold text-muted-foreground flex items-center gap-2">
              <span>Архив событий</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-foreground">{archivedEvents.length}</span>
            </h3>
            <div className="grid grid-cols-1 gap-4 opacity-75 hover:opacity-100 transition-opacity">
              {archivedEvents.map((event, index) => (
                <EditableEventCard
                  key={event.id}
                  event={event}
                  index={index}
                  editingEvent={editingEvent}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  loading={loading}
                  showDebug={showDebug}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventsAdmin;
