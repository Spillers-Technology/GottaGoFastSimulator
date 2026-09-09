/**
 * input.js — edge-triggered input. The trick system needs presses, not
 * held state, so everything exposes both.
 */

const MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyJ: 'jump',
  ShiftLeft: 'roll', ShiftRight: 'roll', KeyK: 'roll',
};

export class Input {
  constructor(target = window) {
    this.held = {};
    this.pressed = {};
    this.released = {};
    this._down = {};
    this._up = {};
    target.addEventListener('keydown', (e) => {
      const a = MAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!this.held[a]) this._down[a] = true;
      this.held[a] = true;
    });
    target.addEventListener('keyup', (e) => {
      const a = MAP[e.code];
      if (!a) return;
      e.preventDefault();
      this.held[a] = false;
      this._up[a] = true;
    });
    window.addEventListener('blur', () => { this.held = {}; });
  }

  /** Call once per FIXED physics step, before reading. */
  step() {
    this.pressed = this._down;
    this.released = this._up;
    this._down = {};
    this._up = {};
  }

  axisX() { return (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0); }
}
