/**
 * physics.js — headless physics assertions, runnable in node OR a browser.
 *
 * These exist because the failure modes that matter here are invisible in a
 * screenshot: stalling mid-grind, running the course backwards, a
 * discontinuity at the lap seam, NaN after ten minutes of play. Run this
 * after ANY change to tune.js, track.js, player.js or flow.js.
 *
 * Assertions carry their measured values even on success, because when you
 * are tuning feel the number is usually more useful than the pass/fail.
 */

import { TUNE, topSpeed } from '../src/js/tune.js';
import { buildCourse } from '../src/js/track.js';
import { Flow, Beat } from '../src/js/flow.js';
import { Player, STATE } from '../src/js/player.js';

export function runAll() {
  const log = [];
  let pass = 0, fail = 0;
  const failures = [];
  function check(name, cond, detail = '') {
    if (cond) pass++; else { fail++; failures.push(name); }
    log.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  \u2014 ' + detail : ''}`);
  }



  // A stand-in for Input with scriptable held/pressed sets.
  function mkInput() {
    const i = {
      held: {}, pressed: {}, released: {},
      axisX() { return (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0); },
      step() { this.pressed = {}; this.released = {}; },
      press(k) { this.pressed[k] = true; this.held[k] = true; },
      release(k) { this.released[k] = true; this.held[k] = false; },
    };
    return i;
  }

  // Pick a stretch with no rails overhead and little gradient, so jump and
  // trick tests measure what they claim to rather than accidentally grinding.
  function clearS(track) {
    let best = 0, bestScore = Infinity;
    for (let s = 0; s < track.length; s += 50) {
      if (track.rails.some(r => s > r.sStart - 2500 && s < r.sEnd + 500)) continue;
      const score = Math.abs(track.frameAt(s, {}).pitch);
      if (score < bestScore) { bestScore = score; best = s; }
    }
    return { s: best, pitch: bestScore };
  }

  function mk() {
    const track = buildCourse(7);
    const flow = new Flow(), beat = new Beat();
    return { track, flow, beat, p: new Player(track, flow, beat), i: mkInput() };
  }
  function run(env, frames, fn) {
    for (let f = 0; f < frames; f++) {
      env.i.step();
      if (fn) fn(f, env.i, env.p);
      env.beat.update(TUNE.FIXED_DT);
      env.p.step(env.i);
    }
  }

  // ---- 1. track geometry ---------------------------------------------------
  {
    const { track } = mk();
    log.push(`track length: ${track.length.toFixed(0)} px  (${(track.length*TUNE.WORLD_SCALE).toFixed(0)} world units)`);
    check('track length is sane', track.length > 20000 && track.length < 400000, track.length.toFixed(0));

    // Seam continuity: stepping across s=0 must not teleport.
    let maxJump = 0;
    const prev = track.pointAt(track.length - 20, [0,0,0]).slice();
    let last = prev;
    for (let k = -20; k <= 20; k += 2) {
      const s = ((k % track.length) + track.length) % track.length;
      const q = track.pointAt(s, [0,0,0]);
      const d = Math.hypot(q[0]-last[0], q[1]-last[1], q[2]-last[2]);
      if (k > -20) maxJump = Math.max(maxJump, d);
      last = q.slice();
    }
    check('spline is continuous across the seam', maxJump < 6, `max step ${maxJump.toFixed(2)}px for a 2px advance`);

    // Arc-length parameterisation: equal s steps => equal world distance.
    let mn = 1e9, mx = 0;
    for (let s = 0; s < track.length; s += track.length / 500) {
      const a = track.pointAt(s, [0,0,0]), b = track.pointAt(s + 50, [0,0,0]);
      const d = Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]);
      mn = Math.min(mn, d); mx = Math.max(mx, d);
    }
    check('arc-length reparameterisation holds', mx / mn < 1.15, `50px step spans ${mn.toFixed(1)}..${mx.toFixed(1)}px`);
    check('rails were generated', track.rails.length >= 9, `${track.rails.length} rails`);

    // Rail gradient invariant, checked on the geometry directly so it holds
    // regardless of what the speed floor masks downstream.
    {
      let worst = 0, worstId = -1;
      for (const r of track.rails) {
        for (let s = r.sStart; s <= r.sEnd; s += 25) {
          const g = Math.abs(track.railPitch(r, s) - track.frameAt(s, {}).pitch);
          if (g > worst) { worst = g; worstId = r.id; }
        }
      }
      check('rail gradients stay grindable', worst < 0.3,
            `steepest local rail gradient ${worst.toFixed(3)} (rail ${worstId})`);
    }

    // Lateral basis handedness. `lat` must map to screen-right, or steering,
    // rail transfers and trick direction all invert together.
    {
      const f = track.frameAt(0, {});
      const [tx, , tz] = f.t, [rx, , rz] = f.r;
      // right x tangent must point UP. Sanity anchor: three.js's default
      // camera has t=(0,0,-1), up=(0,1,0), so right=t x up=(1,0,0)=+X.
      const upY = rz * tx - rx * tz;          // (right x tangent).y
      check('lateral axis is right-handed (lat = screen right)', upY > 0,
            `(right x tangent).y = ${upY.toFixed(3)}, must be positive`);
    }
  }

  // ---- 2. ground acceleration ---------------------------------------------
  {
    const env = mk();
    run(env, 600, (f, i) => { i.held.up = true; });
    const cap = topSpeed(env.flow.value);
    check('accelerates toward top speed', env.p.gsp > TUNE.TOP_SPEED * 0.7,
          `gsp ${env.p.gsp.toFixed(2)} vs base cap ${TUNE.TOP_SPEED}`);
    check('respects the speed cap (+slope overspeed)', env.p.gsp < TUNE.MAX_SPEED,
          `gsp ${env.p.gsp.toFixed(2)} < ${TUNE.MAX_SPEED}`);
    // Forward is automatic, so the regulator is the over-cap bleed, not
    // release friction. Overspeed earned from a hill or a rail should decay
    // back toward the cap gradually rather than being clamped away.
    {
      const flat = clearS(env.track);
      env.p.s = flat.s; env.p.gsp = 14; env.p.lat = 0; env.p.h = 0;
      env.p.state = STATE.GROUND; env.p.rolling = false;
      const before = env.p.gsp;
      run(env, 60);
      const mid = env.p.gsp;
      run(env, 400);
      check('overspeed bleeds back toward the cap instead of clamping',
            mid < before && mid > topSpeed(env.flow.value) && env.p.gsp < mid,
            `14.00 -> ${mid.toFixed(2)} (60f) -> ${env.p.gsp.toFixed(2)} (460f), cap ${topSpeed(env.flow.value).toFixed(2)}`);
    }
    {
      // Braking must still work.
      const env2 = mk();
      run(env2, 200);
      const before = env2.p.gsp;
      run(env2, 90, (f, i) => { i.held.down = true; });
      check('brake input decelerates', env2.p.gsp < before,
            `${before.toFixed(2)} -> ${env2.p.gsp.toFixed(2)}`);
    }
  }

  // ---- 3. slopes give free speed ------------------------------------------
  {
    const env = mk();
    // find the steepest descent on the course and coast down it
    let best = 0, bestS = 0;
    for (let s = 0; s < env.track.length; s += 50) {
      const pitch = env.track.frameAt(s, {}).pitch;
      if (-pitch > best) { best = -pitch; bestS = s; }
    }
    env.p.s = bestS; env.p.gsp = 1; env.p.rolling = true;
    const before = env.p.gsp;
    run(env, 120, (f, i) => { i.held.down = true; });
    check('rolling downhill converts gradient into speed', env.p.gsp > before * 2,
          `${before.toFixed(2)} -> ${env.p.gsp.toFixed(2)} on pitch ${(-best).toFixed(3)}`);
  }

  // ---- 4. jump / air / landing --------------------------------------------
  {
    const env = mk();
    const flat = clearS(env.track);
    env.p.s = flat.s; env.p.gsp = 5;
    run(env, 60);
    env.i.step(); env.i.press('jump');
    env.beat.update(TUNE.FIXED_DT); env.p.step(env.i);
    check('jump leaves the ground', env.p.state === STATE.AIR, `state ${env.p.state}, ysp ${env.p.ysp.toFixed(2)}`);
    let peak = 0, frames = 0;
    while (env.p.state === STATE.AIR && frames < 400) {
      env.i.step(); env.beat.update(TUNE.FIXED_DT); env.p.step(env.i);
      peak = Math.max(peak, env.p.h); frames++;
    }
    check('lands on the ground (not a rail)', env.p.state === STATE.GROUND,
          `after ${frames} frames, peak ${peak.toFixed(0)}px`);
    // Ballistic prediction: 2 * JUMP_FORCE / GRAVITY frames of hang time.
    const expect = (2 * TUNE.JUMP_FORCE) / TUNE.GRAVITY;
    check('airtime matches the ballistic prediction', Math.abs(frames - expect) < expect * 0.25,
          `${frames} frames vs predicted ${expect.toFixed(0)}`);
    check('longest trick fits inside a full jump',
          Math.max(...Object.values(TUNE.TRICKS).map(t => t.dur)) < frames,
          `longest trick ${Math.max(...Object.values(TUNE.TRICKS).map(t => t.dur))}f vs ${frames}f airtime`);
  }

  // ---- 5. tricks and flow --------------------------------------------------
  {
    const env = mk();
    env.p.s = clearS(env.track).s; env.p.gsp = 5;
    run(env, 60);
    const flowBefore = env.flow.value;
    env.i.step(); env.i.press('jump'); env.beat.update(TUNE.FIXED_DT); env.p.step(env.i);
    // wait past TRICK_MIN_AIRTIME, then backflip
    run(env, TUNE.TRICK_MIN_AIRTIME + 1);
    const predicted = env.p.predictLanding();
    env.i.step(); env.i.press('up'); env.beat.update(TUNE.FIXED_DT); env.p.step(env.i);
    check('trick starts in the air', !!env.flow.trick, env.flow.trick ? env.flow.trick.def.name : 'none');
    check('landing predictor agrees with the trick fitting', predicted.frames > TUNE.TRICKS.flip.dur,
          `predicted ${predicted.frames}f to ${predicted.on}, backflip needs ${TUNE.TRICKS.flip.dur}f`);
    run(env, TUNE.TRICKS.flip.dur + 2);
    check('completed trick pays out flow', env.flow.value > flowBefore,
          `flow ${flowBefore.toFixed(3)} -> ${env.flow.value.toFixed(3)}`);
    check('flow raises the speed cap', topSpeed(env.flow.value) > TUNE.TOP_SPEED,
          `cap now ${topSpeed(env.flow.value).toFixed(2)}`);
  }

  // ---- 6. fumbled landing punishes ----------------------------------------
  {
    const env = mk();
    env.p.s = clearS(env.track).s; env.p.gsp = 5;
    run(env, 60);
    env.flow.value = 0.8;
    env.i.step(); env.i.press('jump'); env.beat.update(TUNE.FIXED_DT); env.p.step(env.i);
    run(env, TUNE.TRICK_MIN_AIRTIME + 1);
    // start a long trick too late for it to possibly finish
    while (env.p.state === STATE.AIR && env.p.predictLanding().frames > TUNE.TRICKS.flip.dur - 6) {
      env.i.step(); env.beat.update(TUNE.FIXED_DT); env.p.step(env.i);
    }
    env.i.step(); env.i.press('up'); env.beat.update(TUNE.FIXED_DT); env.p.step(env.i);
    const before = env.flow.value;
    let n = 0;
    while (env.p.state === STATE.AIR && n++ < 200) { env.i.step(); env.beat.update(TUNE.FIXED_DT); env.p.step(env.i); }
    check('landing mid-trick fumbles and costs flow', env.p.lastLand === 'fumble' && env.flow.value < before,
          `land=${env.p.lastLand}, flow ${before.toFixed(3)} -> ${env.flow.value.toFixed(3)}`);
  }

  // ---- 7. rail attach, grind, transfer ------------------------------------
  {
    const env = mk();
    const rail = env.track.rails.find(r => env.track.rails.filter(o => o.sStart === r.sStart).length >= 2);
    check('found a multi-rail section for transfer testing', !!rail);
    if (rail) {
      env.p.s = rail.sStart + 300;
      env.p.lat = rail.lat;
      env.p.h = env.track.railHeight(rail, env.p.s) + 10;
      env.p.ysp = -1;
      env.p.gsp = 5;
      env.p.state = STATE.AIR;
      env.i.step(); env.beat.update(TUNE.FIXED_DT); env.p.step(env.i);
      check('snaps onto a rail when descending into it', env.p.state === STATE.RAIL, `state ${env.p.state}`);

      const speedIn = env.p.gsp;
      run(env, 90);

      // The RAIL_MIN_SPEED floor guarantees you never stall, which means a
      // wildly wrong RAIL_SLOPE no longer shows up as a stall - it shows up
      // as being pinned to the floor. Measure that instead.
      {
        const env3 = mk();
        const long = env3.track.rails.reduce((a, b) =>
          (b.sEnd - b.sStart) > (a.sEnd - a.sStart) ? b : a);
        env3.p.s = long.sStart + 50;
        env3.p.lat = long.lat;
        env3.p.h = env3.track.railHeight(long, env3.p.s) + 8;
        env3.p.ysp = -1; env3.p.gsp = 6; env3.p.state = STATE.AIR;
        env3.i.step(); env3.beat.update(TUNE.FIXED_DT); env3.p.step(env3.i);
        let sum = 0, n = 0, pinned = 0;
        while (env3.p.state === STATE.RAIL && n < 4000) {
          env3.i.step(); env3.beat.update(TUNE.FIXED_DT); env3.p.step(env3.i);
          sum += env3.p.gsp; n++;
          if (env3.p.gsp <= TUNE.RAIL_MIN_SPEED + 0.01) pinned++;
        }
        const avg = sum / Math.max(n, 1), frac = pinned / Math.max(n, 1);
        check('a full grind stays fast rather than pinned to the floor',
              avg > TUNE.RAIL_MIN_SPEED * 2 && frac < 0.25,
              `avg ${avg.toFixed(2)} over ${n}f, ${(frac * 100).toFixed(0)}% of frames at the floor`);
      }
      check('grinding preserves speed', env.p.gsp > speedIn * 0.9,
            `${speedIn.toFixed(2)} -> ${env.p.gsp.toFixed(2)} over 90 frames`);

      if (env.p.state === STATE.RAIL) {
        const flowBefore = env.flow.value;
        const from = env.p.rail;
        const dir = env.track.rails.some(r => r !== from && env.track.railCovers(r, env.p.s) && r.lat > from.lat) ? 'right' : 'left';
        env.i.step(); env.i.press(dir); env.beat.update(TUNE.FIXED_DT); env.p.step(env.i);
        check('transfer starts', env.p.state === STATE.TRANSFER, `state ${env.p.state}`);
        run(env, TUNE.RAIL_TRANSFER_TIME + 2);
        check('transfer completes onto the neighbouring rail',
              env.p.state === STATE.RAIL && env.p.rail !== from, `state ${env.p.state}`);
        check('transfer pays out flow', env.flow.value > flowBefore,
              `flow ${flowBefore.toFixed(3)} -> ${env.flow.value.toFixed(3)}`);
      }
    }
  }

  // ---- 8. long run: no NaN, no seam explosion ------------------------------
  {
    const env = mk();
    let bad = null, maxWorldStep = 0, laps = 0;
    let prevS = env.p.s;
    let prev = env.track.toWorld(env.p.s, env.p.lat, env.p.h, [0,0,0]).slice();
    run(env, 20000, (f, i) => {
      i.held.up = true;
      if (f % 97 === 0) i.press('jump');
      if (f % 97 === 20) i.press('left');
    });
    // re-run measuring continuity
    const env2 = mk();
    prev = env2.track.toWorld(env2.p.s, env2.p.lat, env2.p.h, [0,0,0]).slice();
    run(env2, 20000, (f, i) => {
      i.held.up = true;
      if (f % 97 === 0) i.press('jump');
      const p = env2.p;
      if (!Number.isFinite(p.s + p.gsp + p.lat + p.h + p.ysp)) bad = bad || `frame ${f}`;
      const w = env2.track.toWorld(p.s, p.lat, p.h, [0,0,0]);
      const d = Math.hypot(w[0]-prev[0], w[1]-prev[1], w[2]-prev[2]);
      if (f > 0) maxWorldStep = Math.max(maxWorldStep, d);
      prev = w.slice();
      if (p.s < prevS - 1000) laps++;
      prevS = p.s;
    });
    check('20k frames with no NaN', bad === null, bad || 'all finite');
    check('no positional discontinuity (incl. lap seam)', maxWorldStep < TUNE.MAX_SPEED * 3,
          `max single-frame world step ${maxWorldStep.toFixed(2)}px`);
    check('never ends up running the course backwards', env2.p.gsp > -1,
          `final gsp ${env2.p.gsp.toFixed(2)}, runDir ${env2.p.runDir}`);
    const lapsByDist = env2.p.dist / env2.track.length;
    log.push(`  (20k frames: travelled ${(env2.p.dist/1000).toFixed(1)}k px = ${lapsByDist.toFixed(2)} laps, ending at s=${env2.p.s.toFixed(0)})`);
    check('completed at least one lap in 20k frames', laps >= 1 && lapsByDist >= 1,
          `${laps} seam crossings, ${lapsByDist.toFixed(2)} laps by distance`);
  }
  // Charms are bounded, replaceable modifiers with visible pickup state.
  {
    const e = mk();
    e.p.charms = [{ s: e.track.length - 5, lat: 0, h: 12, kind: 'bolt', cooldown: 0 }];
    e.p.step(e.i);
    check('charm collects across lap seam', e.p.charm === 'bolt');
    check('charm pickup goes on cooldown', e.p.charms[0].cooldown === TUNE.CHARM_RESPAWN);
    e.p.charms = [{ s: e.p.s, lat: 0, h: 12, kind: 'star', cooldown: 0 }];
    e.p.step(e.i);
    check('new charm replaces previous effect', e.p.charm === 'star' && e.p.charmFrames === TUNE.CHARM_DURATION);
    e.p.charms = [];
    e.p.charmFrames = 1;
    e.p.step(e.i);
    check('charm expires at fixed frame boundary', e.p.charm === null && e.p.charmFrames === 0);
    e.p.charm = 'star'; e.p.charmFrames = 100;
    e.p.reset();
    check('respawn clears charm and restores pickups', e.p.charm === null && e.p.charms.every(c => c.cooldown === 0));
    for (const kind of ['bolt', 'star', 'flower']) {
      const normal = mk(), boosted = mk();
      normal.p.charms = []; boosted.p.charms = [];
      normal.p.s = boosted.p.s = clearS(normal.track).s;
      boosted.p.charm = kind; boosted.p.charmFrames = 100;
      if (kind === 'star') { normal.i.press('jump'); boosted.i.press('jump'); }
      if (kind === 'flower') { normal.i.press('right'); boosted.i.press('right'); }
      normal.p.step(normal.i); boosted.p.step(boosted.i);
      const field = kind === 'bolt' ? 'gsp' : kind === 'star' ? 'ysp' : 'lsp';
      check(kind + ' changes intended movement', boosted.p[field] > normal.p[field]);
      check(kind + ' preserves base tuning', TUNE.JUMP_FORCE === 6.5 && TUNE.ACCEL === 0.046875);
    }
  }
  return { log, pass, fail, failures };
}
