import { useState, useMemo, useEffect, useRef } from 'react';
import { MapPin, Clock, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Globe, Check, ChevronsUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import MapView from './MapView';
import { getMonthGenitive, getMonthNominative, formatEventDateTimeForViewer } from '@/lib/dateUtils';
import { Event } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { LazyImage } from '@/components/ui/lazy-image';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command';

interface EventsViewProps {
  events: Event[];
  cities: string[];
}

type ViewMode = 'day' | 'week' | 'month';
const ALL_CITY = 'Все';
const ONLINE_CITY = 'Онлайн';

const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  return dateStr.trim();
};

const cityLabel = (rawCity?: string): string => {
  const trimmed = String(rawCity || '').trim();
  if (!trimmed) return '';
  const noUtc = trimmed.replace(/\s*\(UTC[+-]?\d+(?::\d{2})?\)\s*$/i, '').trim();
  const commaIdx = noUtc.indexOf(',');
  return (commaIdx === -1 ? noUtc : noUtc.slice(0, commaIdx)).trim();
};

const cityKey = (rawCity?: string): string => {
  return cityLabel(rawCity)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
};

const isOnlineCity = (rawCity?: string): boolean => {
  const key = cityKey(rawCity).replace(/-/g, '');
  return key === cityKey(ONLINE_CITY);
};

const EventsView = ({ events, cities }: EventsViewProps) => {
  const [selectedCity, setSelectedCity] = useState('Все');
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showMap, setShowMap] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [filterByDate, setFilterByDate] = useState(false);
  const [expandedEventIds, setExpandedEventIds] = useState<Set<number>>(() => new Set());
  const [overflowingDescriptionIds, setOverflowingDescriptionIds] = useState<Set<number>>(() => new Set());
  const descriptionRefs = useRef<Map<number, HTMLParagraphElement>>(new Map());
  const showDebug = (() => {
    if (typeof window === 'undefined') return false;
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

  // Calendar logic helpers
  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const cityOptions = useMemo(() => {
    const base = cities.filter((c) => c !== ALL_CITY && !isOnlineCity(c));
    const seen = new Set<string>();
    const unique: string[] = [];
    base.forEach((city) => {
      const label = cityLabel(city);
      const key = cityKey(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      unique.push(label);
    });
    return unique;
  }, [cities]);

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleDateClick = (date: Date) => {
    if (selectedDate.getTime() === date.getTime()) {
      setFilterByDate(!filterByDate);
    } else {
      setSelectedDate(date);
      setFilterByDate(true);
    }
  };

  const toggleDescription = (eventId: number) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    // Exclude past events (prior to today)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Create Date objects for comparison properly
    filtered = filtered.filter(e => {
      const eventDate = new Date(normalizeDate(e.date) + 'T00:00:00');
      // Reset time part for accurate date comparison
      eventDate.setHours(0, 0, 0, 0);
      return eventDate >= startOfToday;
    });

    if (selectedCity !== ALL_CITY) {
      if (isOnlineCity(selectedCity)) {
        filtered = filtered.filter((e) => isOnlineCity(e.city));
      } else {
        const selectedKey = cityKey(selectedCity);
        filtered = filtered.filter((e) => cityKey(e.city) === selectedKey);
      }
    }

    if (viewMode === 'day') {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const targetStr = `${year}-${month}-${day}`;
      filtered = filtered.filter(e => normalizeDate(e.date) === targetStr);
    } else if (viewMode === 'week') {
      const currentDay = selectedDate.getDay();
      const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
      const weekStart = new Date(selectedDate);
      weekStart.setDate(selectedDate.getDate() + mondayOffset);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      filtered = filtered.filter(e => {
        const eventDate = new Date(normalizeDate(e.date) + 'T00:00:00');
        return eventDate >= weekStart && eventDate <= weekEnd;
      });
    } else if (viewMode === 'month') {
      if (filterByDate) {
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const targetStr = `${year}-${month}-${day}`;
        filtered = filtered.filter(e => normalizeDate(e.date) === targetStr);
      } else {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        filtered = filtered.filter(e => normalizeDate(e.date).startsWith(`${year}-${month}`));
      }
    }
    return filtered;
  }, [events, selectedCity, selectedDate, viewMode, currentDate, filterByDate]);

  useEffect(() => {
    const nextOverflowing = new Set<number>();
    filteredEvents.forEach((event) => {
      const descriptionEl = descriptionRefs.current.get(event.id);
      if (!descriptionEl) return;
      if (descriptionEl.scrollHeight - descriptionEl.clientHeight > 16) {
        nextOverflowing.add(event.id);
      }
    });
    setOverflowingDescriptionIds(nextOverflowing);
  }, [filteredEvents, expandedEventIds]);

  const monthName = `${getMonthNominative(currentDate)} ${currentDate.getFullYear()}`;
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  if (showMap) {
    return <MapView events={events} cities={cities} onClose={() => setShowMap(false)} />;
  }

  return (
    <div className="space-y-8">
      {/* Controls Container */}
      <div className="flex flex-col gap-6">

        {/* Top Controls: Tabs & City Filter */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="p-1 rounded-2xl bg-secondary border border-border inline-flex">
            {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setViewMode(mode);
                  if (mode === 'month') setFilterByDate(false);
                }}
                className={`
                  px-5 py-2 rounded-xl text-sm font-medium transition-all duration-300 relative
                  ${viewMode === mode ? 'text-black' : 'text-muted-foreground hover:text-foreground'}
                `}
              >
                {viewMode === mode && (
                  <motion.div
                    layoutId="viewModeTab"
                    className="absolute inset-0 bg-white rounded-xl shadow-sm border border-border/50"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10">{mode === 'day' ? 'День' : mode === 'week' ? 'Неделя' : 'Месяц'}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <Popover open={cityOpen} onOpenChange={setCityOpen}>
              <PopoverTrigger asChild>
                <button
                  className="min-w-[220px] px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all bg-transparent border-border text-foreground hover:border-border/80 flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    {selectedCity === ALL_CITY
                      ? 'Все города'
                      : isOnlineCity(selectedCity)
                        ? ONLINE_CITY
                        : `Город: ${selectedCity}`}
                  </span>
                  <ChevronsUpDown className="w-4 h-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Поиск города..." />
                  <CommandList>
                    <CommandEmpty>Ничего не найдено</CommandEmpty>
                    <CommandGroup heading="Фильтр">
                      <CommandItem
                        onSelect={() => {
                          setSelectedCity(ALL_CITY);
                          setCityOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${selectedCity === ALL_CITY ? 'opacity-100' : 'opacity-0'}`} />
                        {ALL_CITY}
                      </CommandItem>
                      <CommandItem
                        onSelect={() => {
                          setSelectedCity(ONLINE_CITY);
                          setCityOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${isOnlineCity(selectedCity) ? 'opacity-100' : 'opacity-0'}`} />
                        {ONLINE_CITY}
                      </CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="Города">
                      {cityOptions.map((city) => (
                        <CommandItem
                          key={city}
                          onSelect={() => {
                            setSelectedCity(city);
                            setCityOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${cityKey(selectedCity) === cityKey(city) ? 'opacity-100' : 'opacity-0'}`} />
                          {city}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Calendar View */}
        {viewMode === 'month' && (
          <div className="clean-card p-6 md:p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-display font-semibold text-foreground capitalize">
                {monthName}
              </h2>
              <div className="flex gap-2">
                <button onClick={handlePrevMonth} className="w-9 h-9 rounded-full flex items-center justify-center border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-all">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button onClick={handleNextMonth} className="w-9 h-9 rounded-full flex items-center justify-center border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-all">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 mb-4">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-4">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const hasEvents = filteredEvents.some((e) => normalizeDate(e.date) === dateStr);
                const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === currentDate.getMonth();
                const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth();

                return (
                  <div key={day} className="flex flex-col items-center justify-center gap-1">
                    <button
                      onClick={() => handleDateClick(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                      className={`
                        w-10 h-10 rounded-xl text-base font-medium transition-all relative group
                        ${isSelected ? 'bg-primary text-primary-foreground shadow-lg scale-110' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}
                        ${!isSelected && isToday ? 'border border-primary/20 text-primary' : ''}
                      `}
                    >
                      {day}
                      {hasEvents && !isSelected && (
                        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Events List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-display text-foreground">
              {viewMode === 'day' ? `${selectedDate.getDate()} ${getMonthGenitive(selectedDate)}` :
                filterByDate ? `События ${selectedDate.getDate()} ${getMonthGenitive(selectedDate)}` : 'События'}
            </h3>
            {(selectedCity !== ALL_CITY || filterByDate) && (
              <button
                onClick={() => { setSelectedCity(ALL_CITY); setFilterByDate(false); setShowAllCities(false); }}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" /> Сбросить
              </button>
            )}
          </div>

          <AnimatePresence mode="popLayout">
            {filteredEvents.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="clean-card p-12 text-center"
              >
                <CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Нет событий по выбранным фильтрам</p>
              </motion.div>
            ) : (
              <div className="event-cards-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 xl:gap-8">
                {filteredEvents.map((event, index) => {
                  const eventDate = new Date(normalizeDate(event.date) + 'T00:00:00');
                  const description = event.description?.trim() ?? '';
                  const isDescriptionExpanded = expandedEventIds.has(event.id);
                  const showDescriptionToggle = overflowingDescriptionIds.has(event.id) || isDescriptionExpanded;
                  const displayDateTime = formatEventDateTimeForViewer(
                    event.date,
                    event.time,
                    event.city,
                    event.source_timezone
                  );
                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.05 }}
                      className="event-card bg-white rounded-[2.5rem] p-4 shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300 border border-slate-100 group flex flex-col h-full"
                    >
                      {/* Image Frame - Top "Cover" */}
                      <div className="event-card-image w-full aspect-[4/3] rounded-[2rem] overflow-hidden relative bg-slate-50 shrink-0 shadow-inner mb-6">
                        <LazyImage
                          src={event.image_url}
                          alt={event.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          style={{ objectPosition: `${event.image_focus_x ?? 50}% ${event.image_focus_y ?? 50}%` }}
                          fallback={
                            <div className="w-full h-full bg-slate-50 flex items-center justify-center text-slate-300">
                              <CalendarIcon className="w-16 h-16" />
                            </div>
                          }
                        />
                      </div>

                      {/* Content */}
                      <div className="event-card-content flex-1 flex flex-col px-2 w-full items-start text-left">
                        {showDebug && (
                          <div className="text-[11px] text-slate-400 mb-2">
                            id: {event.id}
                            {event.garden_id ? `, garden_id: ${event.garden_id}` : ''}
                            {typeof event.image_focus_x === 'number' || typeof event.image_focus_y === 'number'
                              ? `, focus: ${event.image_focus_x ?? 50}/${event.image_focus_y ?? 50}`
                              : ''}
                          </div>
                        )}
                        {/* Meta Pills - Left Aligned */}
                        <div className="flex flex-wrap gap-2 mb-4 justify-start">
                          <Badge className="rounded-full bg-slate-50 border border-slate-100 text-slate-600 font-bold px-3 py-1.5 text-xs tracking-wide hover:bg-slate-50">
                            {event.category || 'Встреча'}
                          </Badge>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-slate-600 text-xs font-bold tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            {event.city === 'Онлайн' ? displayDateTime.dateLabel : `${eventDate.getDate()} ${getMonthGenitive(eventDate)}`}
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-slate-600 text-xs font-bold tracking-wide">
                            <Clock className="w-3 h-3" />
                            {displayDateTime.timeLabel}
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-slate-600 text-xs font-bold tracking-wide">
                            {event.city === 'Онлайн' ? <Globe className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                            {event.city}
                          </div>
                        </div>

                        <h4 className="text-xl md:text-2xl font-display font-bold text-slate-900 mb-2 leading-tight">
                          {event.title}
                        </h4>

                        <p className="text-base text-slate-500 font-medium mb-4">{event.speaker}</p>

                        <div className="mb-8">
                          <p
                            ref={(el) => {
                              if (el) {
                                descriptionRefs.current.set(event.id, el);
                              } else {
                                descriptionRefs.current.delete(event.id);
                              }
                            }}
                            className={`event-card-description text-slate-600 text-sm leading-relaxed font-body ${
                              isDescriptionExpanded
                                ? 'event-card-description-expanded'
                                : 'event-card-description-collapsed line-clamp-6'
                            }`}
                          >
                            {description}
                          </p>
                          {showDescriptionToggle && (
                            <button
                              type="button"
                              onClick={() => toggleDescription(event.id)}
                              className="mt-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                              {isDescriptionExpanded ? 'Свернуть' : 'Читать далее'}
                            </button>
                          )}
                        </div>

                        <div className="mt-auto pt-6 flex flex-col w-full gap-4 border-t border-slate-100">
                          <div className="text-xl font-bold text-slate-900">
                            {event.price || 'Бесплатно'}
                          </div>

                          {event.registration_link && (
                            <a
                              href={event.registration_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="self-start px-5 py-3 rounded-full bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 hover:shadow-primary/30 inline-flex items-center justify-center gap-2"
                            >
                              Записаться
                            </a>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};

export default EventsView;
