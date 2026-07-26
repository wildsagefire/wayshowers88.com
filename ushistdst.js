// ─────────────────────────────────────────────────────────────
//  WayShowers88 — Historical US daylight-saving resolver
//
//  WHY THIS EXISTS
//  The IANA tz database only guarantees accuracy from 1970 onward. Before
//  that it applies the zone's REPRESENTATIVE CITY rules to the whole zone:
//    America/Chicago  = Chicago's DST history  → wrong for MS, TX, TN, AL…
//    America/New_York = New York's DST history → wrong for VA, GA, FL, NC…
//    America/Los_Angeles = California's        → wrong for NV
//  Verified 24 Jul 2026 on a Biloxi, Mississippi 1960 birth: IANA gave CDT
//  (UTC-5) → Ascendant Leo 29°59'. Mississippi did not observe DST in 1960;
//  the true offset is CST (UTC-6) → Ascendant Virgo 12°53', matching
//  astroseek and Cafe Astrology to the arcminute.
//
//  Sign-based placements are unaffected by a one-hour error. RISING SIGN and
//  HOUSE CUSPS are not — and they are the centrepiece of The Luminary.
//
//  THE REAL BOUNDARY IS 1967, NOT 1970
//    1918-03-31 → 1919-10-26   national DST (Standard Time Act)    → trust IANA
//    1920-01-01 → 1942-02-08   local option, city by city          → cannot resolve
//    1942-02-09 → 1945-09-30   federal War Time, nationwide        → trust IANA
//    1945-10-01 → 1966-12-31   local option, the 1946-66 patchwork → state table
//    1967-04-30 →              Uniform Time Act, statewide         → trust IANA
//
//  WHAT THIS MODULE WILL NOT DO
//  It will not guess. Where the historical record is genuinely city-by-city
//  (Missouri, Illinois, Ohio, Iowa, and everywhere in 1920-1941) it returns
//  verdict 'stop' and the caller is expected to refuse to cast the chart.
//  The gold-standard source for those cases is the ACS/Shanks American Atlas,
//  which is licensed commercial data and is not embedded here.
//
//  Usage (Node):    const H = require('./ushistdst');
//  Usage (browser): this file defines globalThis.WS88_HISTDST
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WS88_HISTDST = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // ── The raw IANA lookup (unchanged behaviour, used as the substrate) ──
  function zoneOffsetHours(zone, y, m, d, hh, mm) {
    try {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
      const want = Date.UTC(y, m - 1, d, hh, mm);
      let guess = want;
      for (let i = 0; i < 3; i++) {
        const p = {};
        for (const part of dtf.formatToParts(new Date(guess))) p[part.type] = part.value;
        const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
        const diff = want - asUTC;
        if (diff === 0) break;
        guess += diff;
      }
      return (want - guess) / 3600000;
    } catch (e) { return NaN; }
  }

  // A zone's STANDARD (winter) offset for a given year. Mid-January is standard
  // time in every US zone, so this reads the zone's base offset without DST.
  function standardOffsetHours(zone, year) {
    return zoneOffsetHours(zone, year, 1, 15, 12, 0);
  }

  // ── US state resolution from the place string ──
  const STATES = {
    'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
    'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
    'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
    'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
    'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
    'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
    'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
    'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
    'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
    'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
    'district of columbia':'DC'
  };
  const ABBREV = new Set(Object.values(STATES));

  // Zones that cover US territory. Anything outside this list is not our problem
  // (European and Australian DST was national statute and IANA models it well).
  const US_ZONES = new Set([
    'America/New_York','America/Detroit','America/Kentucky/Louisville',
    'America/Kentucky/Monticello','America/Indiana/Indianapolis','America/Indiana/Vincennes',
    'America/Indiana/Winamac','America/Indiana/Marengo','America/Indiana/Petersburg',
    'America/Indiana/Vevay','America/Indiana/Tell_City','America/Indiana/Knox',
    'America/Chicago','America/Menominee','America/North_Dakota/Center',
    'America/North_Dakota/New_Salem','America/North_Dakota/Beulah',
    'America/Denver','America/Boise','America/Phoenix','America/Los_Angeles',
    'America/Anchorage','America/Juneau','America/Sitka','America/Metlakatla',
    'America/Yakutat','America/Nome','America/Adak','Pacific/Honolulu'
  ]);

  // IANA zones created specifically to model a locality's divergent history.
  // Where one of these is in use, the tz maintainers have done the work.
  const CITY_SPECIFIC = /^America\/(Detroit|Menominee|Indiana\/|Kentucky\/|North_Dakota\/|Phoenix|Boise|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak)/;

  function resolveState(place) {
    if (!place) return null;
    const s = String(place).toLowerCase();
    // "Washington D.C." must beat the state of Washington.
    if (/washington,?\s*d\.?\s*c\.?/.test(s) || /district of columbia/.test(s)) return 'DC';
    const parts = s.split(',').map(p => p.trim().replace(/\.$/, ''));
    for (const p of parts) {
      if (STATES[p]) return STATES[p];
      const up = p.toUpperCase();
      if (up.length === 2 && ABBREV.has(up)) return up;
    }
    // cities.js writes a couple of US entries without a state field.
    if (/^new york city\b/.test(s)) return 'NY';
    return null;
  }

  function looksUS(place, zone) {
    if (zone && US_ZONES.has(zone)) return true;
    if (!place) return false;
    return /(,|\b)\s*(united states|usa|u\.s\.a\.|us)\s*$/i.test(String(place).trim());
  }

  // ── The 1946–1966 state table ──
  //  'no'    = the state did not observe DST — force standard time
  //  'yes'   = the state observed DST statewide — IANA's representative city is a fair proxy
  //  'local' = genuinely city-by-city; the record cannot be resolved without an atlas
  //  'iana'  = IANA models this state deliberately with its own zone(s); defer to it
  const TABLE = {
    AL:'no', AK:'no', AZ:'no', AR:'no',
    CA:[[1946,1949,'no'], [1950,1966,'yes']],      // statewide by referendum, Nov 1949
    CO:'no', CT:'yes', DC:'yes', DE:'yes', FL:'no', GA:'no', HI:'no',
    ID:'no',
    IL:'local',                                     // Chicago observed; downstate varied
    IN:'iana', IA:'local', KS:'no', KY:'iana', LA:'no',
    ME:'yes', MD:'yes', MA:'yes', MI:'iana',
    MN:[[1946,1956,'local'], [1957,1966,'yes']],
    MS:'no', MO:'local', MT:'no', NE:'no', NV:'no',
    NH:'yes', NJ:'yes', NM:'no', NY:'yes', NC:'no', ND:'no',
    OH:'local',                                     // big cities observed; rural varied
    OK:'no',
    OR:[[1946,1961,'no'], [1962,1966,'yes']],
    PA:'yes', RI:'yes', SC:'no', SD:'no', TN:'no', TX:'no', UT:'no',
    VT:'yes', VA:'no',
    WA:[[1946,1960,'no'], [1961,1966,'yes']],
    WV:'no', WI:[[1946,1956,'local'], [1957,1966,'yes']], WY:'no'
  };

  function tableLookup(state, year) {
    const e = TABLE[state];
    if (!e) return null;
    if (typeof e === 'string') return e;
    for (const [from, to, v] of e) if (year >= from && year <= to) return v;
    return null;
  }

  // States that never observed DST in the local-option era. For 1920–1941 these
  // are the only ones we will assert on — everywhere else that era is a coin toss.
  function neverObserved(state) {
    const e = TABLE[state];
    return e === 'no';
  }

  const MS_DAY = 86400000;
  function utcOf(y, m, d, hh, mm) { return Date.UTC(y, m - 1, d, hh, mm); }

  // Is the birth within `days` of a DST transition in this zone? Even for a state
  // that did observe DST, the exact start/end dates varied between localities in
  // 1946-1966 (the Northeast extended the end from late September to late October
  // through the 1950s). Near a boundary the representative city can be a day or a
  // fortnight out, which is a full hour of error.
  function nearTransition(zone, y, m, d, hh, mm, days) {
    const base = zoneOffsetHours(zone, y, m, d, hh, mm);
    if (isNaN(base)) return false;
    const t = utcOf(y, m, d, hh, mm);
    for (const sign of [-1, 1]) {
      const p = new Date(t + sign * days * MS_DAY);
      const o = zoneOffsetHours(zone, p.getUTCFullYear(), p.getUTCMonth() + 1,
        p.getUTCDate(), p.getUTCHours(), p.getUTCMinutes());
      if (!isNaN(o) && o !== base) return true;
    }
    return false;
  }

  // ── The resolver ──
  //  Returns { offset, verdict, source, note, state }
  //    verdict 'ok'    — offset is trustworthy, cast the chart
  //    verdict 'check' — offset is our best answer but the era is shaky; warn loudly
  //    verdict 'stop'  — the record cannot be resolved; refuse to cast
  function resolveOffset(args) {
    const r = resolveOffsetInner(args);
    r.year = args.year;
    return r;
  }

  function resolveOffsetInner({ year, month, day, hour = 12, minute = 0, iana, place, lat, lon }) {
    const zone = iana || null;

    // An explicit fixed-offset zone means the operator has already made the call.
    // Never second-guess a deliberate override.
    if (zone && /^Etc\/GMT[+-]?\d+$/.test(zone)) {
      return { offset: zoneOffsetHours(zone, year, month, day, hour, minute),
        verdict: 'ok', source: 'explicit-override', state: resolveState(place),
        note: `Fixed offset ${zone} supplied by the operator — historical DST logic bypassed.` };
    }

    const ianaOff = zone ? zoneOffsetHours(zone, year, month, day, hour, minute) : NaN;
    const pass = (verdict, source, note) => ({ offset: ianaOff, verdict, source, note, state: resolveState(place) });

    if (!zone || isNaN(ianaOff)) return pass('ok', 'iana', null);

    // Non-US, or US but from 1967 on: IANA is reliable.
    if (!looksUS(place, zone)) return pass('ok', 'iana', null);
    if (year >= 1967) return pass('ok', 'iana-uniform-time-act', null);

    const t = utcOf(year, month, day, hour, minute);
    // Federal War Time — nationwide, no local option, IANA correct.
    if (t >= Date.UTC(1942, 1, 9) && t < Date.UTC(1945, 8, 30))
      return pass('ok', 'federal-war-time', null);
    // The 1918–1919 national DST years.
    if (t >= Date.UTC(1918, 2, 31) && t < Date.UTC(1919, 9, 27))
      return pass('ok', 'federal-standard-time-act', null);

    const state = resolveState(place);
    const std = standardOffsetHours(zone, year);

    // Is there actually anything to resolve? If the representative city was
    // already on standard time, then a locality that skipped daylight saving
    // lands on the same offset — both hypotheses agree and the local-option
    // mess is moot. Only the shoulder weeks around a clock change stay risky,
    // because a locality could have run a longer or shorter DST season.
    if (ianaOff === std && !nearTransition(zone, year, month, day, hour, minute, 21)) {
      return { offset: ianaOff, verdict: 'ok', source: 'standard-time-either-way', state,
        note: null };
    }

    if (!state) {
      return { offset: ianaOff, verdict: 'stop', source: 'unresolved-state', state: null,
        note: `This is a US birth before 1967, when daylight saving was a local-option patchwork, but the US state could not be read from the birthplace "${place || '(none)'}". Add the state to the place string (e.g. "Biloxi, Mississippi, United States") and re-run.` };
    }

    // Locality-specific IANA zones: the tz maintainers modelled these on purpose.
    const verdictRaw = tableLookup(state, year);
    if (verdictRaw === 'iana' || CITY_SPECIFIC.test(zone)) {
      return { offset: ianaOff, verdict: 'check', source: 'iana-locality-zone', state,
        note: `${state} in ${year} is modelled by a locality-specific IANA zone (${zone}); that is the best available data, but ${state}'s pre-1967 record is irregular. Worth a spot-check against an atlas if the rising sign sits near a cusp.` };
    }

    // 1920–1941: the interwar local-option era. Only the never-observed states
    // can be asserted; everything else is genuinely unknowable from open sources.
    if (year < 1942) {
      if (neverObserved(state)) {
        return { offset: std, verdict: 'check', source: 'table-1920-1941-nodst', state,
          note: `${state} did not observe daylight saving in the local-option era, so standard time (UTC${std >= 0 ? '+' : ''}${std}) is applied instead of IANA's ${ianaOff}. Interwar records are thin — verify if the chart hinges on the exact degree.` };
      }
      return { offset: ianaOff, verdict: 'stop', source: 'local-option-1920-1941', state,
        note: `${state} in ${year} falls in the 1920–1941 local-option era, when daylight saving was decided city by city and IANA simply replays ${zone.split('/')[1].replace(/_/g, ' ')}'s rules. This cannot be resolved from open sources — check the ACS/Shanks American Atlas for the specific town, then re-run with an explicit offset.` };
    }

    // 1945-10-01 → 1966-12-31: the main patchwork window.
    if (verdictRaw === 'no') {
      return { offset: std, verdict: 'ok', source: 'table-1946-1966-nodst', state,
        note: `${state} did not observe daylight saving in ${year}; standard time (UTC${std >= 0 ? '+' : ''}${std}) applied. IANA would have given UTC${ianaOff >= 0 ? '+' : ''}${ianaOff}.` };
    }
    if (verdictRaw === 'yes') {
      if (nearTransition(zone, year, month, day, hour, minute, 21)) {
        return { offset: ianaOff, verdict: 'check', source: 'table-1946-1966-dst-shoulder', state,
          note: `${state} did observe daylight saving in ${year}, but this birth falls within three weeks of a clock change. Start and end dates varied between localities before the Uniform Time Act — an atlas check on the exact town is warranted.` };
      }
      return { offset: ianaOff, verdict: 'ok', source: 'table-1946-1966-dst', state, note: null };
    }

    // 'local' — the honest dead end.
    return { offset: ianaOff, verdict: 'stop', source: 'local-option-1946-1966', state,
      note: `${state} had no statewide daylight-saving law in ${year} — observance was decided municipality by municipality, and IANA simply replays ${zone.split('/')[1].replace(/_/g, ' ')}'s rules. This cannot be resolved from open sources. Check the ACS/Shanks American Atlas (or a contemporaneous local newspaper) for the specific town, then re-run with an explicit offset.` };
  }

  // Human-readable one-liner for briefs and logs.
  function describe(r) {
    const o = `UTC${r.offset >= 0 ? '+' : ''}${r.offset}`;
    const tag = r.verdict === 'ok' ? '✓' : r.verdict === 'check' ? '⚠' : '✗';
    return `${tag} ${o} · ${r.source}${r.state ? ` · ${r.state}` : ''}`;
  }

  // The exact command-line fix to hand back when we stop.
  function overrideHint(offset) {
    const n = Math.abs(Math.round(offset));
    return `Etc/GMT${offset <= 0 ? '+' : '-'}${n}`;
  }

  return { resolveOffset, zoneOffsetHours, standardOffsetHours, resolveState,
    looksUS, describe, overrideHint, TABLE, US_ZONES };
});
