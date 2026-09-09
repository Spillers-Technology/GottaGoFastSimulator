/**
 * player.js — the physics state machine.
 *
 * Runs at a fixed 60Hz in classic Genesis units. State is expressed in
 * spline space: `s` (distance along track), `lat` (lateral offset),
 * `h` (height above the track surface). Slope physics act on `s` using the
 * spline's pitch, so hills genuinely convert into speed the way they do in
 * the 2D games — that is the whole reason for the spline.
 */

import { TUNE, topSpeed, accel } from './tune.js';
import { placeCharms, tickCharms } from './charms.js';

export const STATE = { GROUND: 'ground', AIR: 'air', RAIL: 'rail', TRANSFER: 'transfer' };

export class Player {
  constructor(track, flow, beat) {
    this.track = track;
    this.flow = flow;
    this.beat = beat;
    this.reset();
  }

  reset() {
    this.charm = null;
    this.charmFrames = 0;
    this.charms = placeCharms(this.track);
    this.s = 0;
    this.gsp = 0;
    this.lat = 0;
    this.lsp = 0;
    this.h = 0;
    this.ysp = 0;
    this.state = STATE.GROUND;
    this.rolling = false;
    this.crouching = false;
    this.spindash = -1;         // -1 = not charging
    this.rail = null;
    this.railLock = 0;
    this.transfer = null;
    this.airtime = 0;
    this.dist = 0;
    this.facing = 1;            // visual only: sign of travel
    this.runDir = 1;            // fixed forward direction for auto-run
    this.spinAngle = 0;         // visual only
    this.trickAngle = 0;
    this.lastLand = 'neutral';
  }

  get speedFrac() {
    return Math.min(1, Math.abs(this.gsp) / TUNE.MAX_SPEED);
  }

  // =======================================================================

  step(input) {
    tickCharms(this);
    if (this.railLock > 0) this.railLock--;

    switch (this.state) {
      case STATE.GROUND:   this._ground(input); break;
      case STATE.AIR:      this._air(input); break;
      case STATE.RAIL:     this._rail(input); break;
      case STATE.TRANSFER: this._transfer(input); break;
    }

    this._flowDecay();
    this._pickups();

    // visual spin for the ball form
    if (this.rolling || this.state === STATE.AIR) {
      this.spinAngle += this.gsp * 0.09;
    }
  }

  // ---- grounded ---------------------------------------------------------

  _ground(input) {
    const f = this.track.frameAt(this.s, {});

    // --- spindash ---------------------------------------------------------
    if (this.spindash >= 0) {
      this.spindash -= (this.spindash / 0.125) / 256 * TUNE.SPINDASH_DECAY;
      if (input.pressed.jump) {
        this.spindash = Math.min(TUNE.SPINDASH_MAX, this.spindash + TUNE.SPINDASH_CHARGE);
      }
      if (!input.held.down) {
        this.gsp = this.runDir * Math.min(TUNE.SPINDASH_MAX, 8 + Math.floor(this.spindash) / 2);
        this.spindash = -1;
        this.rolling = true;
        this.crouching = false;
        this.flow.add(0.05, 'SPINDASH', this.beat);
      }
      this._lateral(input, 0.2);
      return;
    }

    // --- slope: applied before input, exactly as in the originals ---------
    let slp;
    if (this.rolling) {
      const uphill = Math.sign(this.gsp) * f.pitch > 0;
      slp = uphill ? TUNE.SLOPE_ROLL_UP : TUNE.SLOPE_ROLL_DOWN;
    } else {
      slp = TUNE.SLOPE_RUN;
    }
    this.gsp -= slp * f.pitch;

    // --- input ------------------------------------------------------------
    const a = accel(this.flow.value) * (this.charm === 'bolt' ? TUNE.CHARM_ACCEL_MULT : 1);
    const cap = topSpeed(this.flow.value);

    if (this.rolling) {
      // Rolling can't accelerate; braking is weaker, friction is halved.
      if (input.held.down === false && Math.abs(this.gsp) < TUNE.ROLL_MIN_SPEED) {
        this.rolling = false;
      }
      const fr = TUNE.ROLL_FRICTION;
      this.gsp -= Math.min(Math.abs(this.gsp), fr) * Math.sign(this.gsp);
    } else {
      // Forward is automatic in a runner; Up/Down modulate it.
      if (input.held.down) {
        // brake / crouch
        if (Math.abs(this.gsp) > TUNE.ROLL_TRIGGER_SPEED) {
          this.rolling = true;
        } else {
          this.crouching = true;
          if (this.spindash < 0 && input.pressed.jump) this.spindash = 0;
        }
        this.gsp -= Math.min(Math.abs(this.gsp), TUNE.DECEL * 0.35) * Math.sign(this.gsp);
      } else {
        this.crouching = false;
        // Forward is AUTOMATIC. This is a runner: the interesting decisions
        // are steering, trick selection and rail timing, and none of those
        // survive having to also hold an accelerate key.
        if (this.gsp * this.runDir < cap) {
          this.gsp += a * this.runDir;
        } else {
          // Over cap (downhill, dash pad, rail exit): bleed back down slowly
          // rather than clamping. Keeping earned overspeed feels much better.
          this.gsp -= Math.min(Math.abs(this.gsp) - cap, TUNE.FRICTION * 0.5) * Math.sign(this.gsp);
        }
      }
    }

    this.gsp = Math.max(-TUNE.MAX_SPEED, Math.min(TUNE.MAX_SPEED, this.gsp));

    // --- jump -------------------------------------------------------------
    if (input.pressed.jump && this.spindash < 0 && !this.crouching) {
      this.ysp = TUNE.JUMP_FORCE * (this.charm === 'star' ? TUNE.CHARM_JUMP_MULT : 1);
      this.state = STATE.AIR;
      this.airtime = 0;
      this.rolling = true;      // Sonic jumps in ball form
      this.h += this.ysp;
      this._lateral(input, 1);
      this._advance();
      return;
    }

    if (input.pressed.roll && Math.abs(this.gsp) > TUNE.ROLL_TRIGGER_SPEED) {
      this.rolling = true;
    }

    this.h = 0;
    this.ysp = 0;
    this._lateral(input, 1);
    this._advance();

    // Run off the end of a ledge? (no gaps yet — reserved for hazards)
  }

  // ---- airborne ---------------------------------------------------------

  _air(input) {
    this.airtime++;

    // Air acceleration is exactly 2x ground accel in the originals.
    const cap = topSpeed(this.flow.value);
    if (this.gsp * this.runDir < cap) {
      this.gsp += TUNE.AIR_ACCEL * this.runDir * (this.charm === 'bolt' ? TUNE.CHARM_ACCEL_MULT : 1);
    }

    // Air drag, only while rising slowly — this is what makes short hops
    // preserve speed but floaty jumps bleed it.
    if (this.ysp > 0 && this.ysp < TUNE.AIR_DRAG_THRESHOLD) {
      this.gsp -= this.gsp / 32;
    }

    // Variable jump height.
    if (input.released.jump && this.ysp > TUNE.JUMP_RELEASE_CAP) {
      this.ysp = TUNE.JUMP_RELEASE_CAP;
    }

    // --- tricks -----------------------------------------------------------
    if (this.airtime >= TUNE.TRICK_MIN_AIRTIME && !this.flow.trick) {
      let key = null;
      if (input.pressed.left) key = 'spinL';
      else if (input.pressed.right) key = 'spinR';
      else if (input.pressed.up) key = 'flip';
      else if (input.pressed.down) key = 'dive';
      if (key && this.flow.startTrick(key)) {
        const def = TUNE.TRICKS[key];
        if (def.fall) this.ysp = Math.min(this.ysp, def.fall);
      }
    }
    this.flow.stepAir(this.beat);
    this.trickAngle = this.flow.trick
      ? (this.flow.trick.elapsed / this.flow.trick.def.dur) * Math.PI * 2
      : 0;

    this.ysp = Math.max(TUNE.TERMINAL_VELOCITY, this.ysp - TUNE.GRAVITY);
    this.h += this.ysp;

    this._lateral(input, TUNE.LATERAL_AIR_MULT);
    this._advance();

    // --- rail grab --------------------------------------------------------
    if (this.railLock === 0 && this.ysp <= 0.5) {
      const rail = this._findRail(this.s, this.lat, this.h);
      if (rail) { this._attach(rail); return; }
    }

    // --- landing ----------------------------------------------------------
    if (this.h <= 0 && this.ysp <= 0) {
      this.h = 0;
      this.ysp = 0;
      this.state = STATE.GROUND;
      this.lastLand = this.flow.land(this.beat);
      this.airtime = 0;
      this.trickAngle = 0;
      if (!input.held.down) this.rolling = false;
    }
  }

  /**
   * Frames until this jump ends, and what it ends on. Pure lookahead — it
   * mutates nothing. Feeds the HUD so trick choice is a decision rather
   * than a gamble, which is the whole point of the timing layer.
   */
  predictLanding(limit = 240) {
    if (this.state !== STATE.AIR) return { frames: 0, on: null };
    let h = this.h, ysp = this.ysp, s = this.s;
    for (let n = 1; n <= limit; n++) {
      ysp = Math.max(TUNE.TERMINAL_VELOCITY, ysp - TUNE.GRAVITY);
      h += ysp;
      s += this.gsp;
      if (ysp <= 0.5 && n > this.railLock) {
        const rail = this._findRail(
          ((s % this.track.length) + this.track.length) % this.track.length,
          this.lat, h,
        );
        if (rail) return { frames: n, on: 'rail' };
      }
      if (h <= 0 && ysp <= 0) return { frames: n, on: 'ground' };
    }
    return { frames: limit, on: null };
  }

  // ---- grinding ---------------------------------------------------------

  _rail(input) {
    const rail = this.rail;
    const pitch = this.track.railPitch(rail, this.s);

    // Rails convert gradient into speed hard, and barely lose any to
    // friction. A downhill rail is the fastest thing in the game.
    this.gsp -= TUNE.RAIL_SLOPE * pitch;
    this.gsp -= Math.min(Math.abs(this.gsp), TUNE.RAIL_FRICTION) * Math.sign(this.gsp);
    // A rail must never trap you. Uphill sections can out-decelerate you, so
    // floor the grind speed — the same guarantee the Adventure games make.
    if (this.gsp * this.runDir < TUNE.RAIL_MIN_SPEED) {
      this.gsp = TUNE.RAIL_MIN_SPEED * this.runDir;
    }
    this.gsp = Math.max(-TUNE.MAX_SPEED, Math.min(TUNE.MAX_SPEED, this.gsp));

    this._advance();

    // Left the end of the rail?
    if (!this.track.railCovers(rail, this.s)) { this._detach(0); return; }

    this.lat += (rail.lat - this.lat) * 0.35;
    this.h = this.track.railHeight(rail, this.s);
    this.ysp = 0;

    // --- transfer: the mechanic worth building the level design around ----
    const dir = (input.pressed.right ? 1 : 0) - (input.pressed.left ? 1 : 0);
    if (dir !== 0) {
      const next = this._adjacentRail(rail, dir);
      if (next) {
        this.transfer = {
          from: rail, to: next, t: 0,
          fromLat: this.lat, fromH: this.h,
        };
        this.state = STATE.TRANSFER;
        return;
      }
    }

    if (input.pressed.jump) {
      this.ysp = TUNE.JUMP_FORCE * (this.charm === 'star' ? TUNE.CHARM_JUMP_MULT : 1);
      this._detach(TUNE.RAIL_LOCK_FRAMES);
    }
  }

  _transfer(input) {
    const tr = this.transfer;
    tr.t++;
    const k = tr.t / TUNE.RAIL_TRANSFER_TIME;

    this.gsp -= Math.min(Math.abs(this.gsp), TUNE.RAIL_FRICTION) * Math.sign(this.gsp);
    this._advance();

    const targetH = this.track.railHeight(tr.to, this.s);
    // little arc so the hop reads
    const hop = Math.sin(k * Math.PI) * 34;
    this.lat = tr.fromLat + (tr.to.lat - tr.fromLat) * k;
    this.h = tr.fromH + (targetH - tr.fromH) * k + hop;

    if (k >= 1) {
      if (this.track.railCovers(tr.to, this.s)) {
        this.rail = tr.to;
        this.state = STATE.RAIL;
        this.flow.add(TUNE.FLOW_RAIL_TRANSFER, 'TRANSFER', this.beat);
      } else {
        this._detach(0);
      }
      this.transfer = null;
    }
  }

  _attach(rail) {
    this.rail = rail;
    this.state = STATE.RAIL;
    this.h = this.track.railHeight(rail, this.s);
    this.ysp = 0;
    this.rolling = false;
    this.airtime = 0;
    if (Math.abs(this.gsp) < TUNE.RAIL_MIN_SPEED) {
      this.gsp = TUNE.RAIL_MIN_SPEED * this.runDir;
    }
    // Landing a rail resolves any pending trick, same rules as ground.
    this.lastLand = this.flow.land(this.beat);
    this.trickAngle = 0;
  }

  _detach(lock) {
    this.rail = null;
    this.state = STATE.AIR;
    this.railLock = lock;
    this.airtime = 0;
    this.rolling = true;
  }

  _findRail(s, lat, h) {
    let best = null, bestD = Infinity;
    for (const r of this.track.rails) {
      if (!this.track.railCovers(r, s)) continue;
      const dl = Math.abs(lat - r.lat);
      if (dl > TUNE.RAIL_SNAP_LATERAL) continue;
      const dh = h - this.track.railHeight(r, s);
      if (dh > TUNE.RAIL_SNAP_HEIGHT || dh < -TUNE.RAIL_SNAP_HEIGHT) continue;
      const d = dl + Math.abs(dh);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  _adjacentRail(from, dir) {
    let best = null, bestD = Infinity;
    for (const r of this.track.rails) {
      if (r === from) continue;
      if (!this.track.railCovers(r, this.s)) continue;
      const delta = r.lat - from.lat;
      if (Math.sign(delta) !== dir) continue;
      const d = Math.abs(delta);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  // ---- shared -----------------------------------------------------------

  _lateral(input, mult) {
    const ax = input.axisX();
    if (ax !== 0) {
      this.lsp += TUNE.LATERAL_ACCEL * ax * mult * (this.charm === 'flower' ? TUNE.CHARM_STEER_MULT : 1);
    } else {
      this.lsp -= Math.min(Math.abs(this.lsp), TUNE.LATERAL_FRICTION * (this.charm === 'flower' ? TUNE.CHARM_STEER_MULT : 1)) * Math.sign(this.lsp);
    }
    const lmax = TUNE.LATERAL_MAX * mult;
    this.lsp = Math.max(-lmax, Math.min(lmax, this.lsp));
    // Lateral distance scales with forward speed so the track arcs rather
    // than letting you strafe across it while standing still.
    this.lat += this.lsp * (0.45 + this.speedFrac * 1.4);
    const w = TUNE.TRACK_HALF_WIDTH;
    if (this.lat > w) { this.lat = w; this.lsp = 0; }
    if (this.lat < -w) { this.lat = -w; this.lsp = 0; }
  }

  _advance() {
    this.s += this.gsp;
    this.dist += Math.abs(this.gsp);
    const L = this.track.length;
    this.s = ((this.s % L) + L) % L;
    if (this.gsp !== 0) this.facing = Math.sign(this.gsp) || this.facing;
  }

  _flowDecay() {
    const mult = this.state === STATE.RAIL || this.state === STATE.TRANSFER
      ? TUNE.FLOW_DECAY_RAIL_MULT
      : TUNE.FLOW_DECAY_GROUNDED_MULT;
    this.flow.decay(mult);
  }

  _pickups() {
    // orbs
    for (const o of this.track.orbs) {
      if (o.taken) continue;
      const ds = Math.abs(o.s - this.s);
      if (ds > TUNE.ORB_RADIUS * 2) continue;
      if (Math.abs(o.lat - this.lat) > TUNE.ORB_RADIUS * 1.6) continue;
      if (Math.abs(o.h - this.h) > TUNE.ORB_RADIUS * 1.6) continue;
      o.taken = true;
      o.respawn = 240;
      this.flow.add(TUNE.FLOW_ORB, 'ORB', this.beat);
    }
    for (const o of this.track.orbs) {
      if (o.taken && --o.respawn <= 0) o.taken = false;
    }
    // dash pads
    if (this.state === STATE.GROUND) {
      for (const p of this.track.pads) {
        if (p.cooldown > 0) { p.cooldown--; continue; }
        if (Math.abs(p.s - this.s) > 60) continue;
        if (Math.abs(p.lat - this.lat) > 120) continue;
        p.cooldown = 60;
        this.gsp = Math.max(this.gsp, TUNE.DASH_PAD_SPEED);
        this.flow.add(0.04, 'DASH', this.beat);
      }
    }
  }
}
