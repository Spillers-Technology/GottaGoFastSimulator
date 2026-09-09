/**
 * track.js — the spline the whole game hangs off.
 *
 * The track is a Catmull-Rom spline through control points, arc-length
 * reparameterised so that `s` (the physics coordinate) is real distance in
 * pixels. Everything else in the game — rails, orbs, pads, camera — is
 * addressed as (s, lateral, height) and resolved to world space here.
 */

import { TUNE } from './tune.js';

const LUT_SAMPLES = 4000;

function catmullRom(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  for (let i = 0; i < 3; i++) {
    out[i] = 0.5 * (
      2 * p1[i] +
      (-p0[i] + p2[i]) * t +
      (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
      (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3
    );
  }
  return out;
}

export class Track {
  constructor(points) {
    this.pts = points;              // [[x,y,z], ...] in PIXELS
    this.n = points.length;
    this._buildLUT();
    this.rails = [];
    this.orbs = [];
    this.pads = [];
    this.props = [];
    this.ramps = [];
  }

  // ---- spline evaluation ------------------------------------------------

  _rawAt(u, out) {
    // The course is a CLOSED loop: control-point indices wrap, so parameter
    // space is [0, n) rather than [0, n-1). Physics wraps `s` modulo track
    // length, so the spline has to actually close or the seam teleports you.
    const n = this.n;
    const seg = ((Math.floor(u) % n) + n) % n;
    const t = u - Math.floor(u);
    const w = (i) => this.pts[((i % n) + n) % n];
    return catmullRom(w(seg - 1), w(seg), w(seg + 1), w(seg + 2), t, out);
  }

  _buildLUT() {
    this.lut = new Float64Array(LUT_SAMPLES + 1);
    const a = [0, 0, 0], b = [0, 0, 0];
    this._rawAt(0, a);
    let acc = 0;
    this.lut[0] = 0;
    const span = this.n;              // full loop
    for (let i = 1; i <= LUT_SAMPLES; i++) {
      this._rawAt((i / LUT_SAMPLES) * span, b);
      acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      this.lut[i] = acc;
      a[0] = b[0]; a[1] = b[1]; a[2] = b[2];
    }
    this.length = acc;
  }

  /** arc length (px) -> spline parameter u */
  _uAt(s) {
    const L = this.length;
    s = ((s % L) + L) % L;              // the track loops
    // binary search the LUT
    let lo = 0, hi = LUT_SAMPLES;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.lut[mid] < s) lo = mid + 1; else hi = mid;
    }
    const i = Math.max(lo - 1, 0);
    const d0 = this.lut[i], d1 = this.lut[i + 1];
    const f = d1 > d0 ? (s - d0) / (d1 - d0) : 0;
    return ((i + f) / LUT_SAMPLES) * this.n;
  }

  /** Centreline position at arc length s. */
  pointAt(s, out = [0, 0, 0]) {
    return this._rawAt(this._uAt(s), out);
  }

  /**
   * Orthonormal-ish frame at s: forward tangent, lateral (right), up.
   * The track never rolls, so `up` is world up and lateral is derived —
   * this keeps banking out of the physics, which we want for now.
   */
  frameAt(s, out = {}) {
    const h = 4;
    const a = this.pointAt(s - h, [0, 0, 0]);
    const b = this.pointAt(s + h, [0, 0, 0]);
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // right = normalize(cross(tangent, worldUp)) = (-t.z, 0, t.x).
    // Note the sign: cross(up, tangent) gives LEFT in a right-handed Y-up
    // space, which silently inverts steering, rail transfers and trick
    // direction all at once.
    let rx = -tz, ry = 0, rz = tx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; rz /= rl;
    out.t = [tx, ty, tz];
    out.r = [rx, ry, rz];
    out.pitch = ty;      // sin(slope angle); +ve means s-forward is uphill
    return out;
  }

  /** (s, lateral, height) -> world px. */
  toWorld(s, lat, h, out = [0, 0, 0]) {
    const p = this.pointAt(s, [0, 0, 0]);
    const f = this.frameAt(s, {});
    out[0] = p[0] + f.r[0] * lat;
    out[1] = p[1] + h;
    out[2] = p[2] + f.r[2] * lat;
    return out;
  }

  // ---- rails ------------------------------------------------------------

  addRail(sStart, sEnd, lat, base, amp = 0, freq = 0) {
    this.rails.push({ sStart, sEnd, lat, base, amp, freq, id: this.rails.length });
  }

  /** Rail surface height (px above track centreline) at s. */
  railHeight(rail, s) {
    if (rail.amp === 0) return rail.base;
    return rail.base + rail.amp * Math.sin((s - rail.sStart) * rail.freq);
  }

  /** Local rail gradient, expressed the same way as track pitch. */
  railPitch(rail, s) {
    const h = 6;
    const dy = this.railHeight(rail, s + h) - this.railHeight(rail, s - h);
    const trackPitch = this.frameAt(s, {}).pitch;
    return trackPitch + dy / (2 * h);
  }

  railCovers(rail, s) {
    return s >= rail.sStart && s <= rail.sEnd;
  }
}

// ---------------------------------------------------------------------------
// Procedural course.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCourse(seed = 7) {
  const rnd = mulberry32(seed);
  const N = TUNE.PHRASES;
  const SEGMENTS = N * 16;
  const R = 9000;
  const smooth = (t) => t * t * (3 - 2 * t);

  // One terrain phrase: long gentle descent -> flat runout -> short steep
  // climb, returning to the height it started at. Smoothstep on both ramps
  // of the shape means the derivative is zero at every junction, so phrases
  // butt together with no kink. Returns 1 at the top, 0 at the bottom.
  const D = TUNE.PHRASE_DESCENT, RU = TUNE.PHRASE_RUNOUT;
  const C = 1 - D - RU;
  function phraseHeight(u) {
    if (u < D) return 1 - smooth(u / D);
    if (u < D + RU) return 0;
    return smooth((u - D - RU) / C);
  }

  const pts = [];
  const rWob = [0.26 + rnd() * 0.1, 0.13 + rnd() * 0.08];
  const gPh = rnd() * 6.28;
  for (let i = 0; i < SEGMENTS; i++) {
    const th = (i / SEGMENTS) * Math.PI * 2;
    const r = R * (1 + rWob[0] * Math.sin(3 * th + 0.7) + rWob[1] * Math.sin(5 * th + 2.1));
    const u = ((i / SEGMENTS) * N) % 1;
    const y = TUNE.PHRASE_AMP * phraseHeight(u)
            + TUNE.PHRASE_GLOBAL_AMP * Math.sin(2 * th + gPh);
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }

  const track = new Track(pts);
  const L = track.length;

  // --- locate each phrase's low point from the BUILT geometry ------------
  // The height profile is authored in theta, but arc length is not
  // proportional to theta on a wobbly ring. Rather than trust the mapping,
  // find where the descent actually bottoms out and hang everything off that.
  const bottoms = [];
  for (let k = 0; k < N; k++) {
    const s0 = (L * k) / N, s1 = (L * (k + 1)) / N;
    let bestS = s0, bestY = Infinity;
    for (let s = s0; s < s1; s += 40) {
      const y = track.pointAt(s, [0, 0, 0])[1];
      if (y < bestY) { bestY = y; bestS = s; }
    }
    bottoms.push(bestS);
  }

  // --- ramps: at the bottom of each descent, where you are fastest -------
  bottoms.forEach((sBottom, k) => {
    track.ramps.push({
      s: sBottom + 90,
      lat: (rnd() - 0.5) * 180,
      cooldown: 0,
      id: k,
    });
  });

  // --- rails: on the descents, ending before the ramp -------------------
  // Rails and ramps are alternatives, not a sequence: grind the fast line,
  // or drop off it and take the kicker. Both are valid, which is the point.
  bottoms.forEach((sBottom, k) => {
    const phraseLen = L / N;
    const sStart = sBottom - phraseLen * 0.42;
    const len = phraseLen * 0.34;
    const base = 90 + rnd() * 40;
    const amp = 30 + rnd() * 45;
    const freq = (Math.PI * 2) / (1700 + rnd() * 1400);
    const kind = k % 3;
    if (kind === 0) {
      track.addRail(sStart, sStart + len, 0, base, amp, freq);
    } else if (kind === 1) {
      track.addRail(sStart, sStart + len, -110, base, amp, freq);
      track.addRail(sStart, sStart + len, 110, base + 30, amp, freq * 1.15);
    } else {
      track.addRail(sStart, sStart + len, -150, base, amp, freq);
      track.addRail(sStart, sStart + len, 0, base + 45, amp * 1.25, freq * 0.8);
      track.addRail(sStart, sStart + len, 150, base, amp, freq * 1.25);
    }
  });

  // --- orbs: draw the intended air line off each ramp --------------------
  // Level design as instruction. The arc shows you where the jump goes
  // before you have taken it, which is how you teach a mechanic without UI.
  for (const ramp of track.ramps) {
    for (let k = 0; k < 7; k++) {
      const f = k / 6;
      track.orbs.push({
        s: ramp.s + 140 + f * 620,
        lat: ramp.lat,
        h: 55 + Math.sin(f * Math.PI) * 210,
        taken: false,
      });
    }
  }
  // plus ground pickups on the climbs, so the recovery beat is not empty
  for (let k = 0; k < N; k++) {
    const sClimb = bottoms[k] + (L / N) * 0.24;
    for (let j = 0; j < 5; j++) {
      track.orbs.push({
        s: sClimb + j * 110,
        lat: Math.sin((k + j) * 1.1) * 150,
        h: 40,
        taken: false,
      });
    }
  }

  // --- dash pads: seed the top of every third descent --------------------
  for (let k = 0; k < N; k += 3) {
    track.pads.push({ s: bottoms[k] - (L / N) * 0.55, lat: (rnd() - 0.5) * 220, cooldown: 0 });
  }

  // --- roadside props ----------------------------------------------------
  // Purely for speed perception. Parallax is most of "feeling fast".
  for (let s = 0; s < L; s += 210) {
    for (const side of [-1, 1]) {
      const lat = side * (TUNE.TRACK_HALF_WIDTH + 90 + rnd() * 420);
      track.props.push({
        s, lat,
        h: -40,
        w: 40 + rnd() * 60,
        tall: 200 + rnd() * 700,
        hue: 0.28 + rnd() * 0.12,
      });
    }
  }

  return track;
}
