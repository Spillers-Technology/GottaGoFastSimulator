/**
 * flow.js — the flow meter, trick state machine, and beat clock.
 *
 * This is the part that is ours rather than Sega's. The thesis:
 * raw speed should be earned through timing, not handed out by the level.
 * Flow decays constantly; timed actions feed it; flow raises the speed cap.
 */

import { TUNE } from './tune.js';

export class Beat {
  constructor() { this.t = 0; this.index = 0; }

  update(dt) {
    this.t += dt;
    this.period = 60 / TUNE.BPM;
    this.index = Math.floor(this.t / this.period);
    this.phase = (this.t % this.period) / this.period;
  }

  /** Distance to the nearest beat, in seconds. */
  offset() {
    const p = this.period || (60 / TUNE.BPM);
    const m = this.t % p;
    return Math.min(m, p - m);
  }

  onBeat() { return this.offset() <= TUNE.BEAT_WINDOW; }
}

export class Flow {
  constructor() {
    this.value = 0;
    this.chain = 0;            // tricks landed without touching ground
    this.trick = null;         // { key, dur, elapsed, flow }
    this.sinceTrickEnd = 999;
    this.events = [];          // consumed by the HUD
    this.bestChain = 0;
    this.score = 0;
  }

  // ---- meter ------------------------------------------------------------

  decay(mult) {
    this.value = Math.max(0, this.value - TUNE.FLOW_DECAY * mult);
  }

  add(amount, label, beat) {
    let gained = amount;
    let onBeat = false;
    if (beat && beat.onBeat()) { gained *= TUNE.ON_BEAT_MULT; onBeat = true; }
    this.value = Math.min(TUNE.FLOW_MAX, this.value + gained);
    this.score += Math.round(gained * 1000);
    this.events.push({ label, gained, onBeat, life: 1 });
    return gained;
  }

  punish(mult, label) {
    this.value *= mult;
    this.chain = 0;
    this.events.push({ label, gained: -1, onBeat: false, life: 1 });
  }

  // ---- tricks -----------------------------------------------------------

  /** Returns true if a trick actually started. */
  startTrick(key) {
    if (this.trick) return false;
    const def = TUNE.TRICKS[key];
    if (!def) return false;
    this.trick = { key, def, elapsed: 0 };
    return true;
  }

  /**
   * Advance the trick clock. Called once per physics step while airborne.
   * A trick that finishes opens a LAND_WINDOW: land inside it and the
   * landing is "clean". That is the rhythm hook — you must read your
   * airtime and pick tricks that fit inside it.
   */
  stepAir(beat) {
    if (this.trick) {
      this.trick.elapsed++;
      if (this.trick.elapsed >= this.trick.def.dur) {
        const chainBonus = 1 + this.chain * TUNE.FLOW_CHAIN_MULT;
        this.add(
          TUNE.FLOW_TRICK_BASE * this.trick.def.flow * chainBonus,
          this.trick.def.name + (this.chain ? ` x${this.chain + 1}` : ''),
          beat,
        );
        this.chain++;
        this.bestChain = Math.max(this.bestChain, this.chain);
        this.trick = null;
        this.sinceTrickEnd = 0;
      }
    } else {
      this.sinceTrickEnd++;
    }
  }

  /**
   * Resolve a landing.
   *   mid-trick        -> fumble, heavy flow loss
   *   inside window    -> clean, bonus
   *   otherwise        -> neutral
   */
  land(beat) {
    let result = 'neutral';
    if (this.trick) {
      this.punish(TUNE.FLOW_FUMBLE_PENALTY, 'FUMBLE');
      this.trick = null;
      result = 'fumble';
    } else if (this.chain > 0 && this.sinceTrickEnd <= TUNE.LAND_WINDOW) {
      this.add(TUNE.FLOW_CLEAN_LAND * (1 + this.chain * TUNE.FLOW_CHAIN_MULT), 'CLEAN', beat);
      result = 'clean';
    }
    this.chain = 0;
    this.sinceTrickEnd = 999;
    return result;
  }

  tickEvents() {
    for (const e of this.events) e.life -= 0.016;
    this.events = this.events.filter((e) => e.life > 0);
  }
}
