import { useState, useEffect } from 'react';
import EventsView from '@/components/EventsView';
import { Event, Notebook } from '@/types';
import ReflectionView from '@/components/ReflectionView';
import NotebooksView from '@/components/NotebooksView';
import { useToast } from '@/hooks/use-toast';
import MainLayout from '@/components/layout/MainLayout';

const Index = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>(['Все']);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const { toast } = useToast();

  const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';

  const postgrestFetch = async <T,>(
    path: string,
    params: Record<string, string>,
    options: { count?: boolean } = {}
  ): Promise<{ data: T; count?: number }> => {
    const url = new URL(path, POSTGREST_URL);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const headers: HeadersInit = {};
    if (options.count) headers['Prefer'] = 'count=exact';

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    let count: number | undefined;
    if (options.count) {
      const range = response.headers.get('Content-Range');
      const match = range?.match(/\/(\d+)$/);
      if (match) count = Number(match[1]);
    }

    return { data, count };
  };

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
    return trimmed.replace(/\s*\(UTC[+-]?\d+(?::\d{2})?\)\s*$/i, '').trim();
  };

  const cityKey = (rawCity?: string): string =>
    cityLabel(rawCity)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .trim();

  const buildCitiesList = (eventsData: Event[], dbCities: string[]): string[] => {
    const normalized = new Map<string, string>();

    dbCities.forEach((city) => {
      const label = cityLabel(city);
      if (!label || label === 'Все') return;
      const key = cityKey(label);
      if (!key) return;
      normalized.set(key, label);
    });

    eventsData.forEach((event) => {
      const label = cityLabel(event.city);
      if (!label || label === 'Все') return;
      const key = cityKey(label);
      if (!key) return;
      if (!normalized.has(key)) {
        normalized.set(key, label);
      }
    });

    const all = Array.from(normalized.values()).sort((a, b) => a.localeCompare(b, 'ru'));
    const hasOnline = all.some((c) => cityKey(c) === 'онлайн');
    const noOnline = all.filter((c) => cityKey(c) !== 'онлайн');

    return ['Все', ...(hasOnline ? ['Онлайн'] : []), ...noOnline];
  };

  const fetchAllEvents = async () => {
    const pageSize = 50;
    let from = 0;
    let all: Event[] = [];
    let totalCount: number | null = null;

    while (true) {
      const { data, count } = await postgrestFetch<Event[]>(
        'events',
        {
          select: 'id, garden_id, title, description, date, time, city, source_timezone, location, speaker, category, registration_link, price, image_gradient, image_url, image_focus_x, image_focus_y, created_at',
          order: 'id.asc',
          limit: String(pageSize),
          offset: String(from)
        },
        { count: from === 0 }
      );

      if (from === 0 && typeof count === 'number') totalCount = count;

      all = all.concat((data || []) as Event[]);
      if (!data || data.length < pageSize) break;

      from += pageSize;
    }

    all.sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)));

    return { data: all, count: totalCount };
  };

  // Cache keys with version to invalidate old cache
  const CACHE_VERSION = 'v3';
  const CACHE_KEYS = {
    events: `skrebeyko_events_cache_${CACHE_VERSION}`,
    questions: `skrebeyko_questions_cache_${CACHE_VERSION}`,
    cities: `skrebeyko_cities_cache_${CACHE_VERSION}`,
    notebooks: `skrebeyko_notebooks_cache_${CACHE_VERSION}`,
  };

  // Load data
  useEffect(() => {
    // Clear old cache versions
    const oldCacheKeys = [
      'skrebeyko_events_cache',
      'skrebeyko_questions_cache',
      'skrebeyko_cities_cache',
      'skrebeyko_notebooks_cache',
      'skrebeyko_events_cache_v1',
      'skrebeyko_questions_cache_v1',
      'skrebeyko_cities_cache_v1',
      'skrebeyko_notebooks_cache_v1',
    ];
    oldCacheKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
      }
    });

    // 1. Try to load from cache immediately (Stale-While-Revalidate)
    const hasCache = loadFromCache();

    // If we have cache, we're not "loading" in the blocking sense
    if (hasCache) {
      setLoading(false);
    }

    // 2. Fetch fresh data
    loadData(1, hasCache);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFromCache = () => {
    try {
      const cachedEvents = localStorage.getItem(CACHE_KEYS.events);
      const cachedQuestions = localStorage.getItem(CACHE_KEYS.questions);
      const cachedCities = localStorage.getItem(CACHE_KEYS.cities);
      const cachedNotebooks = localStorage.getItem(CACHE_KEYS.notebooks);

      const eventsData: Event[] = cachedEvents ? JSON.parse(cachedEvents) : [];
      const citiesData: string[] = cachedCities ? JSON.parse(cachedCities) : [];

      if (cachedEvents) setEvents(eventsData);
      if (cachedQuestions) setQuestions(JSON.parse(cachedQuestions));
      if (cachedCities || cachedEvents) setCities(buildCitiesList(eventsData, citiesData));
      if (cachedNotebooks) setNotebooks(JSON.parse(cachedNotebooks));

      return !!(cachedEvents && cachedQuestions && cachedCities && cachedNotebooks);
    } catch (error) {
      console.error('Error loading from cache:', error);
      return false;
    }
  };

  const saveToCache = (eventsData: Event[], questionsData: string[], citiesData: string[], notebooksData: Notebook[]) => {
    try {
      // Remove base64 images to avoid QuotaExceededError
      const eventsForCache = eventsData.map(({ image_url, ...rest }) => rest);
      const notebooksForCache = notebooksData.map(({ image_url, ...rest }) => rest);

      localStorage.setItem(CACHE_KEYS.events, JSON.stringify(eventsForCache));
      localStorage.setItem(CACHE_KEYS.questions, JSON.stringify(questionsData));
      localStorage.setItem(CACHE_KEYS.cities, JSON.stringify(citiesData));
      localStorage.setItem(CACHE_KEYS.notebooks, JSON.stringify(notebooksForCache));
    } catch (error) {
      console.error('Error saving to cache:', error);
      // If still too large, clear old cache
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('Cache quota exceeded, clearing old cache');
        Object.values(CACHE_KEYS).forEach(key => localStorage.removeItem(key));
      }
    }
  };

  const loadData = async (attempt = 1, hasCache = false): Promise<void> => {
    const maxAttempts = 3;

    try {
      if (attempt > 1 && !hasCache) {
        setRetrying(true);
      } else if (!hasCache) {
        // Only show loading spinner if we don't have cache
        setLoading(true);
      }

      // Load all data in parallel with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 15000)
      );

      const dataPromise = Promise.all([
        fetchAllEvents(),
        postgrestFetch<{ question: string }[]>(
          'questions',
          { select: 'question,order_index', order: 'order_index.asc' }
        ),
        postgrestFetch<{ name: string }[]>(
          'cities',
          { select: 'name', order: 'name.asc' }
        ),
        postgrestFetch<Notebook[]>(
          'notebooks',
          { select: 'id, title, description, image_url, pdf_url, created_at', order: 'created_at.desc' }
        )
      ]);

      const [eventsResult, questionsResult, citiesResult, notebooksResult] = await Promise.race([
        dataPromise,
        timeoutPromise
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ]) as [any, any, any, any];

      // Check for errors
      // Set all data
      const eventsData = eventsResult.data || [];
      const questionsData = questionsResult.data?.map((q: { question: string }) => q.question) || [];
      const citiesData = buildCitiesList(
        eventsData,
        citiesResult.data?.map((c: { name: string }) => c.name) || []
      );
      const notebooksData = notebooksResult.data || [];

      setEvents(eventsData);
      setQuestions(questionsData);
      setCities(citiesData);
      setNotebooks(notebooksData);

      // Save to cache
      saveToCache(eventsData, questionsData, citiesData, notebooksData);

      // Data loaded successfully
      setLoading(false);
      setRetrying(false);

    } catch (error) {
      console.error(`Error loading data (attempt ${attempt}/${maxAttempts}):`, error);

      if (attempt < maxAttempts) {
        // Retry after delay
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        return loadData(attempt + 1, hasCache);
      } else {
        // All attempts failed
        if (hasCache) {
          toast({
            title: "Обновление неудачно",
            description: "Не удалось загрузить свежие данные, показаны сохраненные.",
            variant: "default",
          });
        } else {
          toast({
            title: "Ошибка загрузки",
            description: "Не удалось загрузить данные. Проверьте подключение к интернету.",
            variant: "destructive",
          });
        }

        setLoading(false);
        setRetrying(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-neutral-500 font-body">
            {retrying ? "Повторная попытка загрузки..." : "Загрузка..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-16">
        {/* Reflection Section */}
        <ReflectionView questions={questions} />

        {/* Events Section */}
        <div className="space-y-8">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Календарь событий</h2>
          <EventsView
            events={events}
            cities={cities}
          />
        </div>

        {/* Notebooks Section */}
        <div className="space-y-8">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Блокноты издательства</h2>
          <NotebooksView notebooks={notebooks} />
        </div>
      </div>
    </MainLayout>
  );
};

export default Index;
