/* ══════════════════════════════════════════════════════════════
   SKY TODAY — writes the Moon Clock's static text.
   The live clock only appears once JavaScript runs, so search and
   AI crawlers saw "The Moon is in —". This fills two marked blocks
   in moon-clock.html with plain HTML:
     SKY-TODAY   today's sign, degree, phase, next ingress, lunations
     TWELVE      the weather of all twelve signs (from the page's SIGNS)
   and bumps the Moon Clock's <lastmod> in sitemap.xml. It also fills
   NEXT-MOONS in luminary.html: the next four New and Full Moons,
   their signs, any eclipse, and the last day to order.
   Run daily by .github/workflows/sky-today.yml.
   Usage: node tools/sky-today.cjs [--at 2026-10-31T00:05:00Z]
   ══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'moon-clock.html');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const Astronomy = require(path.join(ROOT, 'astronomy.browser.min.js'));

const atArg = process.argv.indexOf('--at');
const now = atArg > -1 ? new Date(process.argv[atArg + 1]) : new Date();

let html = fs.readFileSync(PAGE, 'utf8');
const EOL = html.includes('\r\n') ? '\r\n' : '\n';

// The twelve reads live once, in the page's own SIGNS array.
const signsSrc = html.match(/const SIGNS = (\[[\s\S]*?\n\]);/);
if (!signsSrc) throw new Error('SIGNS array not found in moon-clock.html');
const SIGNS = vm.runInNewContext(signsSrc[1]);

/* ── sky maths: the same calls as the live clock ── */
const moonLon = d => Astronomy.EclipticGeoMoon(d).lon;

function phaseName(e){
  if (e < 10 || e > 350) return 'New Moon';
  if (e < 80)  return 'Waxing Crescent';
  if (e <= 100) return 'First Quarter';
  if (e < 170) return 'Waxing Gibbous';
  if (e <= 190) return 'Full Moon';
  if (e < 260) return 'Waning Gibbous';
  if (e <= 280) return 'Last Quarter';
  return 'Waning Crescent';
}

function nextIngress(from, lon){
  const signIdx = Math.floor(lon / 30);
  const start = from.getTime();
  for (let ms = start + 3600000; ms <= start + 4 * 86400000; ms += 3600000){
    if (Math.floor(moonLon(new Date(ms)) / 30) !== signIdx){
      let a = ms - 3600000, b = ms;
      while (b - a > 30000){
        const m = (a + b) / 2;
        if (Math.floor(moonLon(new Date(m)) / 30) === signIdx) a = m; else b = m;
      }
      return { when: new Date(b), sign: SIGNS[(signIdx + 1) % 12] };
    }
  }
  return null;
}

const fmtDay = d => new Intl.DateTimeFormat('en-GB',
  { weekday:'long', day:'numeric', month:'long', timeZone:'UTC' }).format(d);
const fmtDate = d => new Intl.DateTimeFormat('en-GB',
  { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'UTC' }).format(d);
const fmtTime = d => new Intl.DateTimeFormat('en-GB',
  { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'UTC' }).format(d) + ' UTC';
const slug = s => 'moon-in-' + s.name.toLowerCase();
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── today ── */
const lon = moonLon(now);
const elong = Astronomy.MoonPhase(now);
const illum = Astronomy.Illumination(Astronomy.Body.Moon, now).phase_fraction;
const signIdx = Math.floor(lon / 30);
const sign = SIGNS[signIdx];
const degInSign = lon - signIdx * 30;
const dd = Math.floor(degInSign);
const mm = String(Math.floor((degInSign - dd) * 60)).padStart(2, '0');
const ing = nextIngress(now, lon);
const nextNew = Astronomy.SearchMoonPhase(0, now, 40).date;
const nextFull = Astronomy.SearchMoonPhase(180, now, 40).date;

const today = [
  `<section id="sky-today" class="sky-today" aria-label="The Moon today">`,
  `  <p class="st-k">The Moon today · ${fmtDate(now)}, ${fmtTime(now)}</p>`,
  `  <p class="st-v">The Moon is in <b>${sign.name}</b>, at ${dd}°${mm}′ — ${phaseName(elong)}, ${Math.round(illum * 100)}% of her face lit.</p>`,
  ing ? `  <p>She enters <b>${ing.sign.name}</b> on ${fmtDay(ing.when)} at ${fmtTime(ing.when)}. Next New Moon: ${fmtDay(nextNew)}. Next Full Moon: ${fmtDay(nextFull)}.</p>` : '',
  `  <p><a href="#${slug(sign)}">The weather while the Moon walks ${sign.name} ↓</a></p>`,
  `</section>`,
].filter(Boolean);

/* ── the twelve ── */
const twelve = [
  `<section class="twelve" id="the-twelve" aria-labelledby="twelve-h">`,
  `  <h2 id="twelve-h">The Moon in each sign</h2>`,
  `  <p class="twelve-lede">The Moon moves about thirteen degrees a day, so she spends roughly two and a half days in each sign and walks all twelve in a little over 27 days. This is the weather of each.</p>`,
  `  <div class="twelve-grid">`,
  ...SIGNS.flatMap(s => [
    `    <article class="sign-card" id="${slug(s)}" style="--sign:${s.color}">`,
    `      <h3><span aria-hidden="true">${s.glyph}</span> The Moon in ${s.name}</h3>`,
    `      <p class="sign-meta">${s.element} · ${s.mode}</p>`,
    `      <p>${esc(s.read)}</p>`,
    `      <p class="sign-poem">“${esc(s.poem)}”</p>`,
    `    </article>`,
  ]),
  `  </div>`,
  `</section>`,
];

function fill(src, name, lines){
  const re = new RegExp(`([ \\t]*)<!-- ${name}:START -->[\\s\\S]*?<!-- ${name}:END -->`);
  const m = src.match(re);
  if (!m) throw new Error(`${name} markers not found`);
  const ind = m[1];
  const body = lines.map(l => ind + l).join(EOL);
  return src.replace(re, `${ind}<!-- ${name}:START -->${EOL}${body}${EOL}${ind}<!-- ${name}:END -->`);
}

html = fill(html, 'SKY-TODAY', today);
html = fill(html, 'TWELVE', twelve);
fs.writeFileSync(PAGE, html);

const day = now.toISOString().slice(0, 10);
const map = fs.readFileSync(SITEMAP, 'utf8')
  .replace(/(moon-clock\.html<\/loc><lastmod>)[^<]*/, `$1${day}`);
fs.writeFileSync(SITEMAP, map);

/* ── the next moons, for the Luminary page ──
   A moon stays open for orders until three days after it peaks. */
const LUMINARY = path.join(ROOT, 'luminary.html');
const DAY = 86400000;
function eclipseNear(kind, when){
  // an eclipse within a day of the lunation makes it an eclipse moon
  const e = kind === 'full'
    ? Astronomy.SearchLunarEclipse(new Date(when.getTime() - 2 * DAY))
    : Astronomy.SearchGlobalSolarEclipse(new Date(when.getTime() - 2 * DAY));
  const t = (e.peak.date || e.peak).getTime();
  if (Math.abs(t - when.getTime()) > DAY) return '';
  const a = /^[aeiou]/.test(e.kind) ? 'an' : 'a';
  return `${a} ${e.kind} ${kind === 'full' ? 'lunar' : 'solar'} eclipse`;
}
const moons = [];
for (let t = new Date(now.getTime() - 3 * DAY); moons.length < 4; ){
  const nm = Astronomy.SearchMoonPhase(0, t, 40).date;
  const fm = Astronomy.SearchMoonPhase(180, t, 40).date;
  const [kind, when] = nm < fm ? ['new', nm] : ['full', fm];
  const closes = new Date(when.getTime() + 3 * DAY);
  if (closes > now) moons.push({ kind, when, closes, sign: SIGNS[Math.floor(moonLon(when) / 30)], eclipse: eclipseNear(kind, when) });
  t = new Date(when.getTime() + DAY);
}
const nextMoons = [
  `<ul class="moon-list">`,
  ...moons.map(m => [
    `  <li>`,
    `    <span class="ml-name">${m.kind === 'new' ? 'New' : 'Full'} Moon in ${m.sign.name}</span>`,
    `    <span class="ml-when">${fmtDay(m.when)}${m.when.getUTCFullYear() !== now.getUTCFullYear() ? ' ' + m.when.getUTCFullYear() : ''}${m.eclipse ? ' · ' + m.eclipse : ''}</span>`,
    `    <span class="ml-open">${m.when <= now ? 'Peaked; still open' : 'Open'} for orders until ${fmtDay(m.closes)}</span>`,
    `  </li>`,
  ]).flat(),
  `</ul>`,
];
if (fs.existsSync(LUMINARY)){
  const lum = fs.readFileSync(LUMINARY, 'utf8');
  fs.writeFileSync(LUMINARY, fill(lum, 'NEXT-MOONS', nextMoons));
}

console.log(`${day}: Moon ${dd}°${mm}′ ${sign.name}, ${phaseName(elong)} ${Math.round(illum * 100)}%` +
  (ing ? `, enters ${ing.sign.name} ${ing.when.toISOString()}` : ''));
