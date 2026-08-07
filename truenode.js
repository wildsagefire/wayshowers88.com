// ─────────────────────────────────────────────────────────────
//  WayShowers88 — True (osculating) lunar node
//
//  WHY THIS EXISTS
//  Until Aug 2026 the engine and website calculator reported the MEAN node
//  (Meeus polynomial). astro.com and every mainstream chart app default to
//  the TRUE node — the ascending node of the Moon's osculating orbit. A
//  client (Xuan) caught the discrepancy in the Nodal Shift video window:
//  the true node entered Aquarius 26 Jul 2026; the mean node not until
//  19 Aug. Adrian's call, 4 Aug 2026: everything moves to the true node.
//  (School choice, not a bug fix — the mean node is a legitimate older
//  reckoning. Nothing customer-facing calls this a correction.)
//
//  METHOD
//  Geocentric lunar state vector (position + velocity, J2000 equatorial)
//  from astronomy-engine, rotated into the TRUE ECLIPTIC OF DATE (ECT —
//  precession + nutation, the same frame the engine uses for planets).
//  Orbit normal h = r × v; the ascending node line is k × h, whose
//  ecliptic longitude is atan2(hx, −hy). Verified against Swiss Ephemeris
//  (astro.com swetest) to ~1 arcminute — see test-truenode.js.
//
//  SHARED-MODULE DISCIPLINE (ushistdst.js precedent)
//  This exact file ships byte-identical in the Lunar Report Engine and the
//  WayShowers Website repo. The Astronomy library is passed in by the
//  caller (Node: require('astronomy-engine'); browser: the global from
//  astronomy.browser.js) so the file itself stays environment-neutral.
//
//  Usage (Node):    const TN = require('./truenode');
//                   TN.trueNodeLon(dateUTC, Astronomy)
//  Usage (browser): this file defines globalThis.WS88_TRUENODE
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WS88_TRUENODE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const n360 = x => ((x % 360) + 360) % 360;

  // Ecliptic-of-date longitude (degrees) of the Moon's true (osculating)
  // ascending node at a UTC instant.
  function trueNodeLon(dateUTC, Astronomy) {
    const t = Astronomy.MakeTime(dateUTC);
    const s = Astronomy.GeoMoonState(t);        // EQJ frame: AU, AU/day
    const rot = Astronomy.Rotation_EQJ_ECT(t);  // → true ecliptic of date
    const r = Astronomy.RotateVector(rot, new Astronomy.Vector(s.x, s.y, s.z, t));
    const v = Astronomy.RotateVector(rot, new Astronomy.Vector(s.vx, s.vy, s.vz, t));
    // h = r × v (orbit normal; z > 0 for the Moon's prograde orbit), then
    // ascending node N = k × h = (−hy, hx, 0) → lon = atan2(hx, −hy).
    const hx = r.y * v.z - r.z * v.y;
    const hy = r.z * v.x - r.x * v.z;
    return n360(Math.atan2(hx, -hy) * 180 / Math.PI);
  }

  // Is the true node retrograde at this instant? (Unlike the mean node it
  // oscillates — direct stretches of days to weeks are normal.)
  function trueNodeRetro(dateUTC, Astronomy) {
    const ms = 43200000; // ±12h
    const l1 = trueNodeLon(new Date(dateUTC.getTime() - ms), Astronomy);
    const l2 = trueNodeLon(new Date(dateUTC.getTime() + ms), Astronomy);
    let d = l2 - l1; if (d > 180) d -= 360; if (d < -180) d += 360;
    return d < 0;
  }

  return { trueNodeLon, trueNodeRetro };
});
