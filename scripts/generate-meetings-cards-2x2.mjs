import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = process.env.POSTGREST_URL || 'https://api.skrebeyko.ru/';
const START_DATE = process.argv[2] || '2026-03-25';
const END_DATE = process.argv[3] || '2026-04-02';
const CARDS_PER_PAGE = 4;
const DESCRIPTION_MAX = 220;

const normalizeDate = (dateStr = '') => {
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  return dateStr.trim();
};

const truncateAtWordBoundary = (text, maxLength) => {
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace <= 0) return `${sliced.trimEnd()}...`;
  return `${sliced.slice(0, lastSpace).trimEnd()}...`;
};

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatRuDate = (normalizedDate) => {
  const dt = new Date(`${normalizedDate}T00:00:00`);
  return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

const chunk = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const renderCard = (event) => {
  const normalizedDate = normalizeDate(event.date);
  const dateLabel = formatRuDate(normalizedDate);
  const description = truncateAtWordBoundary((event.description || '').trim(), DESCRIPTION_MAX);
  const title = escapeHtml(event.title || '');
  const speaker = escapeHtml(event.speaker || '');
  const city = escapeHtml(event.city || '');
  const time = escapeHtml(event.time || '');
  const category = escapeHtml(event.category || 'Встреча');
  const price = escapeHtml(event.price || 'Бесплатно');
  const registration = event.registration_link ? escapeHtml(event.registration_link) : '';
  const imageUrl = event.image_url ? escapeHtml(event.image_url) : '';

  return `
    <article class="card">
      <div class="image-wrap">
        ${
          imageUrl
            ? `<img class="cover" src="${imageUrl}" alt="${title}" loading="eager" />`
            : '<div class="cover cover-fallback"></div>'
        }
        <span class="category-pill">${category}</span>
      </div>
      <div class="content">
        <div class="meta-row">
          <span class="pill">• ${escapeHtml(dateLabel)}</span>
          <span class="pill">◷ ${time}</span>
          <span class="pill">◉ ${city}</span>
        </div>
        <h2>${title}</h2>
        <p class="speaker">${speaker}</p>
        <p class="desc">${escapeHtml(description)}</p>
      </div>
      <div class="bottom">
        <p class="price">${price}</p>
        ${
          registration
            ? `<a class="btn" href="${registration}" target="_blank" rel="noopener noreferrer">Записаться</a>`
            : '<span class="btn btn-muted">Подробнее</span>'
        }
      </div>
    </article>
  `;
};

const baseCss = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Arial, sans-serif;
    color: #1f2a37;
    background: #f7e8ed;
  }
  .sheet {
    width: 1080px;
    height: 1350px;
    padding: 24px;
    margin: 0 auto;
    background: linear-gradient(180deg, #f8edf1 0%, #f1e4e9 100%);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .card {
    background: #fff;
    border: 1px solid #e8e9ee;
    border-radius: 28px 28px 8px 8px;
    padding: 14px 14px 12px;
    box-shadow: 0 10px 24px -18px rgba(0, 0, 0, 0.3);
    display: grid;
    grid-template-rows: 182px minmax(0, 1fr) auto;
    gap: 8px;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }
  .image-wrap {
    position: relative;
    border-radius: 20px;
    overflow: hidden;
    height: 182px;
    flex: 0 0 auto;
  }
  .cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cover-fallback {
    background: linear-gradient(135deg, #e6e7ee 0%, #d8dbe4 100%);
  }
  .category-pill {
    position: absolute;
    top: 10px;
    left: 10px;
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    color: #3f4a5a;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid rgba(231, 234, 241, 0.9);
  }
  .content {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 9px;
    border-radius: 999px;
    border: 1px solid #ebedf2;
    background: #f8f9fb;
    color: #5f6b7a;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 22px;
    line-height: 1.14;
    letter-spacing: -0.02em;
    font-weight: 620;
    color: #111827;
  }
  .speaker {
    margin: 0 0 8px;
    color: #687384;
    font-size: 15px;
    line-height: 1.25;
    font-weight: 450;
  }
  .desc {
    margin: 0;
    color: #4f5c6e;
    font-size: 14px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 7;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .bottom {
    margin-top: 0;
    border-top: 1px solid #eceef3;
    padding-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .price {
    margin: 0;
    font-size: 17px;
    line-height: 1;
    font-weight: 650;
    color: #101828;
    white-space: nowrap;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 116px;
    height: 36px;
    border-radius: 999px;
    background: #5778a9;
    color: #fff;
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    padding: 0 12px;
    white-space: nowrap;
  }
  .btn-muted { opacity: 0.55; }
`;

const renderSinglePageHtml = (eventsChunk, title) => `
<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>${baseCss}</style>
</head>
<body>
  <main class="sheet">
    ${eventsChunk.map(renderCard).join('\n')}
  </main>
</body>
</html>
`;

const renderMultiPageHtml = (pages, title) => `
<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${baseCss}
    body { background: #fff; }
    .page-break { break-after: page; page-break-after: always; }
    @page { size: 1080px 1350px; margin: 0; }
  </style>
</head>
<body>
  ${pages
    .map(
      (eventsChunk, i) => `
      <section class="sheet ${i < pages.length - 1 ? 'page-break' : ''}">
        ${eventsChunk.map(renderCard).join('\n')}
      </section>
    `
    )
    .join('\n')}
</body>
</html>
`;

const fetchEvents = async () => {
  const endpoint = new URL('events', API_BASE);
  endpoint.searchParams.set(
    'select',
    'id,title,description,date,time,city,source_timezone,location,speaker,category,registration_link,price,image_url,image_focus_x,image_focus_y'
  );
  endpoint.searchParams.set('order', 'date.asc,time.asc,id.asc');
  endpoint.searchParams.set('limit', '1000');

  const response = await fetch(endpoint.toString());
  if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
};

const main = async () => {
  const allEvents = await fetchEvents();
  const filtered = allEvents.filter((event) => {
    const d = normalizeDate(event.date);
    return d >= START_DATE && d <= END_DATE;
  });

  if (!filtered.length) {
    throw new Error(`Нет встреч в диапазоне ${START_DATE}..${END_DATE}`);
  }

  const pages = chunk(filtered, CARDS_PER_PAGE);
  const outDir = path.resolve(
    'exports',
    `cards_${START_DATE}_to_${END_DATE}_2x2`.replaceAll(':', '-')
  );
  await fs.mkdir(outDir, { recursive: true });
  const existing = await fs.readdir(outDir);
  await Promise.all(
    existing
      .filter((name) => /^page-\d+\.(html|png)$/i.test(name))
      .map((name) => fs.unlink(path.join(outDir, name)))
  );

  for (let i = 0; i < pages.length; i += 1) {
    const html = renderSinglePageHtml(
      pages[i],
      `Встречи ${START_DATE}..${END_DATE} 2x2 - стр ${i + 1}`
    );
    const fileName = `page-${String(i + 1).padStart(2, '0')}.html`;
    await fs.writeFile(path.join(outDir, fileName), html, 'utf8');
  }

  const fullHtml = renderMultiPageHtml(pages, `Встречи ${START_DATE}..${END_DATE} 2x2`);
  await fs.writeFile(path.join(outDir, 'all-pages.html'), fullHtml, 'utf8');
  await fs.writeFile(path.join(outDir, 'events.json'), JSON.stringify(filtered, null, 2), 'utf8');

  console.log(`Export folder: ${outDir}`);
  console.log(`Events: ${filtered.length}; pages: ${pages.length}; cards/page: ${CARDS_PER_PAGE}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

