# Meetings

Frontend for the Meetings app (Vite + React + TypeScript + Tailwind).

## Requirements

- Node.js 18+ (recommended)
- npm

## Setup

```sh
npm install
cp .env.example .env
```

Fill `.env` if you need to override the default backend:

- `VITE_POSTGREST_URL` — PostgREST API base URL (defaults to `https://api.skrebeyko.ru`)

## Development

```sh
npm run dev
```

## Build

```sh
npm run build
```

## Preview production build

```sh
npm run preview
```

## Notes

- `.env` is not committed; use `.env.example` as a template.
- Build artifacts (e.g., `dist*`, `build*`, `archive/`, `*.zip`) are intentionally ignored.
