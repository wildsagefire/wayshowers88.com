// ─────────────────────────────────────────────────────────────
//  WayShowers88 — Aspect patterns: kite · grand trine · T-square · grand cross
//
//  Closed aspect figures among the ten planets. SHARED engine ↔ site:
//    Lunar Report Engine/patterns.js   ← the source. Edit here.
//    WayShowers Website/patterns.js    ← byte-identical copy. Regenerate, don't hand-edit.
//  Cross-platform Node + browser, no dependencies (portability rule).
//
//  API
//    findPatterns(positions, opts) → Pattern[]   sorted tightest first (by maxOrb)
//    describe(pattern)             → one plain-English sentence for the site card
//
//  positions: [{ name, lon, retro?, noAspect? }] — either engine positionsAt().positions
//  or the calculator's own array. Anything flagged noAspect is ignored, and only the
//  bodies in the v1 list take part (opts.includeChiron / opts.includeAngles widen it).
//
//  Orbs are this module's own table — the site's, with NO luminary widening. Patterns
//  must stay tight. opts.orbs may override, e.g. { Sextile: 3 }.
//
//  Definitions (every leg within orb):
//    grand-trine  three bodies pairwise in trine. element = shared element, else 'dissociate'.
//    kite         a grand trine + a fourth body opposing one corner and sextile the other
//                 two. head = the fourth body, tail = the opposed corner, wings = the rest.
//                 A kite subsumes its grand trine.
//    t-square     two bodies in opposition + a third square to both. apex = the third.
//                 mode = shared modality, else 'dissociate'.
//    grand-cross  four bodies, two oppositions + four squares. Subsumes its T-squares.
//
//  Conjunction merging: two candidates that differ only by swapping bodies conjunct
//  (≤ conjunction orb) in the same role are ONE pattern with both bodies in that role.
//  Roles are therefore arrays throughout: head:['Sun','Mercury'].
//
//  Output shape:
//    { type, bodies:[...], element|mode, head/tail/wings | apex/base | corners,
//      legs:[{a,b,aspect,orb}], maxOrb, label }
//  legs carry every figure leg (orb 2 dp) plus any same-role conjunctions; maxOrb is
//  the loosest FIGURE leg (same-role conjunctions don't count — they aren't legs).
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Patterns = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
    'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  const ELEMENT = ['Fire','Earth','Air','Water'];
  const MODE = ['Cardinal','Fixed','Mutable'];
  const PLANETS = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
  const ORBS = { Conjunction:8, Sextile:4, Square:6, Trine:6, Opposition:8 };
  const ANGLE = { Conjunction:0, Sextile:60, Square:90, Trine:120, Opposition:180 };

  const n360 = x => ((x % 360) + 360) % 360;
  const signIdx = lon => Math.floor(n360(lon) / 30);
  const signName = lon => SIGNS[signIdx(lon)];
  const sep = (a, b) => Math.abs(n360(a.lon - b.lon + 180) - 180);
  const r2 = x => Math.round(x * 100) / 100;

  // Orb of the named aspect between two bodies, or null when out of orb.
  function orbOf(a, b, aspect, orbs) {
    const o = Math.abs(sep(a, b) - ANGLE[aspect]);
    return o <= orbs[aspect] ? o : null;
  }

  // Slot layout per figure. Slot names carry their role; the trailing digit only
  // distinguishes interchangeable slots (w1/w2, b1/b2, c1..c3, s0..s3).
  // legs: which aspect every slot pair must hold.
  const FIGURES = {
    'grand-trine': { slots:['c1','c2','c3'],
      legs:{ 'c1|c2':'Trine', 'c1|c3':'Trine', 'c2|c3':'Trine' } },
    'kite': { slots:['head','tail','w1','w2'],
      legs:{ 'head|tail':'Opposition', 'head|w1':'Sextile', 'head|w2':'Sextile',
             'tail|w1':'Trine', 'tail|w2':'Trine', 'w1|w2':'Trine' } },
    't-square': { slots:['apex','b1','b2'],
      legs:{ 'b1|b2':'Opposition', 'apex|b1':'Square', 'apex|b2':'Square' } },
    'grand-cross': { slots:['s0','s1','s2','s3'],
      legs:{ 's0|s2':'Opposition', 's1|s3':'Opposition',
             's0|s1':'Square', 's1|s2':'Square', 's2|s3':'Square', 's3|s0':'Square' } }
  };
  const kindOf = slot => slot.replace(/\d+$/, '');
  const legAspect = (fig, p, q) => fig.legs[p + '|' + q] || fig.legs[q + '|' + p];

  // A raw candidate: { type, slots:{ slotName: [body, ...] } } with single bodies.
  const raw = (type, map) => {
    const slots = {};
    for (const k in map) slots[k] = [map[k]];
    return { type, slots };
  };

  // ── Detection (single-body slots) ─────────────────────────────
  function detect(B, orbs) {
    const out = [];
    const n = B.length;
    const has = (i, j, asp) => orbOf(B[i], B[j], asp, orbs) !== null;

    // grand trines + kites
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      if (!(has(i, j, 'Trine') && has(i, k, 'Trine') && has(j, k, 'Trine'))) continue;
      out.push(raw('grand-trine', { c1:B[i], c2:B[j], c3:B[k] }));
      const corners = [i, j, k];
      for (let d = 0; d < n; d++) {
        if (corners.includes(d)) continue;
        for (const c of corners) {
          const wings = corners.filter(x => x !== c);
          if (has(d, c, 'Opposition') && has(d, wings[0], 'Sextile') && has(d, wings[1], 'Sextile'))
            out.push(raw('kite', { head:B[d], tail:B[c], w1:B[wings[0]], w2:B[wings[1]] }));
        }
      }
    }
    // T-squares
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (!has(i, j, 'Opposition')) continue;
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        if (has(k, i, 'Square') && has(k, j, 'Square'))
          out.push(raw('t-square', { apex:B[k], b1:B[i], b2:B[j] }));
      }
    }
    // grand crosses — one of three pairings of a quadruple can be the two oppositions
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) for (let l = k + 1; l < n; l++) {
        const pairings = [[i, k, j, l], [i, j, k, l], [i, l, j, k]]; // [a,c,b,d]: a☍c, b☍d
        for (const [a, c, b, d] of pairings) {
          if (has(a, c, 'Opposition') && has(b, d, 'Opposition') &&
              has(a, b, 'Square') && has(b, c, 'Square') && has(c, d, 'Square') && has(d, a, 'Square')) {
            out.push(raw('grand-cross', { s0:B[a], s1:B[b], s2:B[c], s3:B[d] }));
            break;
          }
        }
      }
    return out;
  }

  const bodiesOf = p => Object.values(p.slots).flat();
  const subset = (small, big) => small.every(x => big.includes(x));

  // Kite subsumes its grand trine; grand cross subsumes its T-squares.
  function subsume(list) {
    const kites = list.filter(p => p.type === 'kite').map(bodiesOf);
    const crosses = list.filter(p => p.type === 'grand-cross').map(bodiesOf);
    return list.filter(p => {
      const b = bodiesOf(p);
      if (p.type === 'grand-trine') return !kites.some(k => subset(b, k));
      if (p.type === 't-square') return !crosses.some(k => subset(b, k));
      return true;
    });
  }

  // ── Conjunction merging ───────────────────────────────────────
  function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    arr.forEach((x, i) => {
      for (const rest of permutations(arr.filter((_, j) => j !== i))) out.push([x, ...rest]);
    });
    return out;
  }
  const compatible = (sa, sb, orbs) =>
    sb.every(x => sa.every(y => x === y || orbOf(x, y, 'Conjunction', orbs) !== null));

  // Can B fold into A? Returns the slot mapping (B slot → A slot) or null.
  function mergeMap(A, Bp, orbs) {
    if (A.type !== Bp.type) return null;
    const names = FIGURES[A.type].slots;
    for (const perm of permutations(names)) {
      let ok = true;
      for (let i = 0; i < names.length; i++) {
        const aSlot = names[i], bSlot = perm[i];
        if (kindOf(aSlot) !== kindOf(bSlot) || !compatible(A.slots[aSlot], Bp.slots[bSlot], orbs)) { ok = false; break; }
      }
      if (ok) { const m = {}; names.forEach((s, i) => m[perm[i]] = s); return m; }
    }
    return null;
  }

  function merge(list, orbs) {
    const acc = [];
    for (const p of list) {
      let folded = false;
      for (const A of acc) {
        const m = mergeMap(A, p, orbs);
        if (!m) continue;
        for (const bSlot in m) for (const body of p.slots[bSlot])
          if (!A.slots[m[bSlot]].includes(body)) A.slots[m[bSlot]].push(body);
        folded = true; break;
      }
      if (!folded) acc.push({ type:p.type, slots:Object.fromEntries(Object.entries(p.slots).map(([k, v]) => [k, v.slice()])) });
    }
    return acc;
  }

  // ── Output ────────────────────────────────────────────────────
  const names = arr => arr.map(b => b.name);
  function joinNames(arr) {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }
  // "Sun and Mercury in Aries" | "Sun in Aries and Mercury in Taurus"
  function withSign(bodies) {
    const signs = bodies.map(b => signName(b.lon));
    if (signs.every(s => s === signs[0])) return joinNames(names(bodies)) + ' in ' + signs[0];
    return joinNames(bodies.map(b => b.name + ' in ' + signName(b.lon)));
  }
  function shared(bodies, table, step) {
    const vals = bodies.map(b => table[signIdx(b.lon) % step]);
    return vals.every(v => v === vals[0]) ? vals[0] : 'dissociate';
  }

  function finalize(p, orbs) {
    const fig = FIGURES[p.type];
    const legs = [];
    let maxOrb = 0;
    for (let i = 0; i < fig.slots.length; i++) for (let j = i + 1; j < fig.slots.length; j++) {
      const sa = fig.slots[i], sb = fig.slots[j], asp = legAspect(fig, sa, sb);
      for (const x of p.slots[sa]) for (const y of p.slots[sb]) {
        const o = orbOf(x, y, asp, orbs);
        if (o === null) continue;
        legs.push({ a:x.name, b:y.name, aspect:asp, orb:r2(o) });
        if (o > maxOrb) maxOrb = o;
      }
    }
    for (const s of fig.slots) {
      const arr = p.slots[s];
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const o = orbOf(arr[i], arr[j], 'Conjunction', orbs);
        if (o !== null) legs.push({ a:arr[i].name, b:arr[j].name, aspect:'Conjunction', orb:r2(o) });
      }
    }
    const all = bodiesOf(p);
    const out = { type:p.type, bodies:names(all) };
    let label;
    if (p.type === 'kite' || p.type === 'grand-trine') {
      // A kite's element is its triangle's (tail + wings); the head sits opposite, in
      // another element by construction.
      const tri = p.type === 'kite' ? p.slots.tail.concat(p.slots.w1, p.slots.w2) : all;
      out.element = shared(tri, ELEMENT, 4);
      const inEl = out.element === 'dissociate' ? null : 'in ' + out.element;
      if (p.type === 'kite') {
        out.head = names(p.slots.head); out.tail = names(p.slots.tail);
        out.wings = names(p.slots.w1.concat(p.slots.w2));
        label = (inEl ? 'Kite ' + inEl : 'Dissociate kite')
          + ' — head ' + withSign(p.slots.head)
          + ', wings ' + joinNames(out.wings)
          + ', tail ' + joinNames(out.tail);
      } else {
        out.corners = out.bodies.slice();
        label = (inEl ? 'Grand trine ' + inEl : 'Dissociate grand trine') + ' — ' + joinNames(out.bodies);
      }
    } else {
      out.mode = shared(all, MODE, 3);
      const inMode = out.mode === 'dissociate' ? null : 'in ' + out.mode + ' signs';
      if (p.type === 't-square') {
        out.apex = names(p.slots.apex); out.base = names(p.slots.b1.concat(p.slots.b2));
        label = (inMode ? 'T-square ' + inMode : 'Dissociate T-square')
          + ' — apex ' + withSign(p.slots.apex) + ', base ' + joinNames(out.base);
      } else {
        label = (inMode ? 'Grand cross ' + inMode : 'Dissociate grand cross') + ' — ' + joinNames(out.bodies);
      }
    }
    out.legs = legs;
    out.maxOrb = r2(maxOrb);
    out.label = label;
    out._slots = p.slots; // bodies with lon, for describe() and the wheel highlight
    return out;
  }

  // ── Public ────────────────────────────────────────────────────
  function findPatterns(positions, opts) {
    opts = opts || {};
    const orbs = Object.assign({}, ORBS, opts.orbs || {});
    const allowed = PLANETS.slice();
    if (opts.includeChiron) allowed.push('Chiron');
    if (opts.includeAngles) allowed.push('Ascendant', 'Midheaven');
    const B = (positions || []).filter(p => p && !p.noAspect && allowed.includes(p.name) && isFinite(p.lon));
    const found = merge(subsume(detect(B, orbs)), orbs).map(p => finalize(p, orbs));
    return found.sort((a, b) => a.maxOrb - b.maxOrb || a.bodies.length - b.bodies.length);
  }

  // One sentence per type, written once. House voice: the chart is the client's; the
  // sentence returns the authority to them and claims nothing about how they feel.
  function describe(p) {
    const s = p._slots || {};
    switch (p.type) {
      case 'kite':
        return 'A kite: the ease of a grand trine given a direction — everything the triangle gathers is pointed at '
          + (s.head ? withSign(s.head) : joinNames(p.head || [])) + '.';
      case 'grand-trine':
        return 'A grand trine: three planets in easy flow, a circuit'
          + (p.element === 'dissociate' ? ' across elements' : ' of ' + p.element)
          + ' that runs by itself — the strength that is easy to overlook because it never asked for effort.';
      case 't-square':
        return 'A T-square: two planets pulling against each other and '
          + (s.apex ? withSign(s.apex) : joinNames(p.apex || []))
          + ' carrying the tension — friction that wants to become drive.';
      case 'grand-cross':
        return 'A grand cross: four planets locked in square, pressure from every direction — nothing settles for long, and a great deal gets built.';
    }
    return '';
  }

  return { findPatterns, describe, ORBS, PLANETS, FIGURES };
});
