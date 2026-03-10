import { Event, Notebook } from '@/types';

export const INITIAL_EVENTS: Event[] = [];

export const INITIAL_QUESTIONS = [
  'Что сегодня заставило вас улыбнуться?',
  'За что вы благодарны этому дню?',
  'Какую одну вещь вы бы хотели изменить прямо сейчас?',
  'Кто вдохновил вас на этой неделе?',
  'Какой самый ценный урок вы получили недавно?',
  'О чем вы мечтаете, но боитесь начать?',
  'Какое слово лучше всего описывает ваше состояние сегодня?'
];

export const INITIAL_CITIES = [
  'Все',
  'Москва',
  'Санкт-Петербург',
  'Казань',
  'Екатеринбург',
  'Новосибирск',
  'Онлайн'
];

export const INITIAL_NOTEBOOKS: Notebook[] = [];

export const INITIAL_JOURNAL_ENTRIES: unknown[] = [];

// TODO: Temporary PINs for testing. Replace with Telegram Auth before public launch
export const PINS = {
  ADMIN: '0000',
  HOST: '1111'
};
