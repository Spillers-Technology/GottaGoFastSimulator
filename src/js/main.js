/**
 * main.js — fixed-timestep loop, HUD, and the live tuning panel.
 *
 * The loop is a hard 60Hz accumulator. Physics NEVER sees a variable dt,
 * because the Sonic constants are per-frame values and interpolating them
 * changes the feel in ways that are very hard to debug later.
 */

import { CHARMS } from './charms.js';
import { TUNE } from './tune.js';
import { buildCourse } from './track.js';
import { Input } from './input.js';
import { Flow, Beat } from './flow.js';
import { Player, STATE } from './player.js';
import { Renderer } from './render.js';

const track = buildCourse(7);
const flow = new Flow();
const beat = new Beat();
const player = new Player(track, flow, beat);
const input = new Input();
const view = new Renderer(document.getElementById('game'), track);

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

let acc = 0;
let last = performance.now();
let fps = 60, fpsAcc = 0, fpsN = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;            // tabbed away
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

  acc += dt;
  let steps = 0;
  while (acc >= TUNE.FIXED_DT && steps < TUNE.MAX_STEPS) {
    input.step();
    beat.update(TUNE.FIXED_DT);
    player.step(input);
    flow.tickEvents();
    acc -= TUNE.FIXED_DT;
    steps++;
  }
  if (steps === TUNE.MAX_STEPS) acc = 0;

  view.update(player, flow, acc / TUNE.FIXED_DT);
  hud();
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

const el = (id) => document.getElementById(id);
const speedEl = el('speed'), flowBar = el('flowbar'), stateEl = el('state');
const chainEl = el('chain'), eventsEl = el('events'), beatEl = el('beat');
const scoreEl = el('score'), fpsEl = el('fps'), airEl = el('air');

function hud() {
  // Speed shown in px/frame (the unit you tune in) plus a readable analogue.
  const charm = CHARMS[player.charm];
  el('charm').textContent = charm
    ? `${charm.name}: ${charm.effect} · ${Math.ceil(player.charmFrames / 60)}s`
    : 'Clog charms: ⚡ acceleration · ★ jump · ✿ steering';
  const gsp = Math.abs(player.gsp);
  speedEl.textContent = gsp.toFixed(2);
  el('speedkmh').textContent = Math.round(gsp * 60 * 0.09) + ' km/h';

  flowBar.style.width = (flow.value * 100).toFixed(1) + '%';
  flowBar.style.background = flow.value > 0.75
    ? 'linear-gradient(90deg,#ffd23f,#ff6b35)'
    : 'linear-gradient(90deg,#35e0ff,#5b8cff)';
  el('cap').textContent = (TUNE.TOP_SPEED + flow.value * TUNE.FLOW_SPEED_BONUS).toFixed(1);

  stateEl.textContent = player.state.toUpperCase() +
    (player.rolling && player.state === STATE.GROUND ? ' (roll)' : '') +
    (player.spindash >= 0 ? ` charge ${player.spindash.toFixed(1)}` : '');

  // Airtime readout: which tricks actually fit before you touch down.
  const pred = player.predictLanding();
  if (pred.frames > 0) {
    const left = pred.frames - (flow.trick ? flow.trick.def.dur - flow.trick.elapsed : 0);
    airEl.style.display = 'block';
    airEl.innerHTML =
      `<span class="airf">${pred.frames}f</span> to ${pred.on || '…'}` +
      '<div class="fits">' + Object.entries(TUNE.TRICKS).map(([k, d]) => {
        const fits = d.dur <= left;
        return `<span class="fit ${fits ? 'yes' : 'no'}">${d.name} ${d.dur}</span>`;
      }).join('') + '</div>';
  } else {
    airEl.style.display = 'none';
  }

  const t = flow.trick;
  chainEl.textContent = t
    ? `${t.def.name} ${Math.round((t.elapsed / t.def.dur) * 100)}%`
    : (flow.chain ? `CHAIN x${flow.chain}` : '');
  chainEl.style.color = t
    ? (t.elapsed / t.def.dur > 0.85 ? '#7dff9b' : '#ffd23f')
    : '#8fe9ff';

  scoreEl.textContent = flow.score.toLocaleString();
  fpsEl.textContent = fps.toFixed(0);

  // beat pulse
  const pulse = 1 - Math.min(1, beat.offset() / TUNE.BEAT_WINDOW);
  beatEl.style.transform = `scale(${1 + pulse * 0.6})`;
  beatEl.style.opacity = 0.35 + pulse * 0.65;

  // floating event text
  eventsEl.innerHTML = flow.events.slice(-5).map((e) => {
    const cls = e.gained < 0 ? 'bad' : (e.onBeat ? 'beat' : 'good');
    const suffix = e.onBeat ? ' ♪' : '';
    return `<div class="ev ${cls}" style="opacity:${Math.min(1, e.life)}">${e.label}${suffix}</div>`;
  }).join('');

  // speed vignette
  document.body.style.setProperty('--rush', player.speedFrac.toFixed(3));
}

// ---------------------------------------------------------------------------
// Live tuning panel — the point of the whole exercise is getting the feel
// right, and that means changing numbers without a reload.
// ---------------------------------------------------------------------------

const KNOBS = [
  ['ACCEL', 0.005, 0.3, 0.001],
  ['FRICTION', 0, 0.3, 0.001],
  ['DECEL', 0.05, 1.5, 0.01],
  ['TOP_SPEED', 2, 16, 0.1],
  ['MAX_SPEED', 8, 40, 0.5],
  ['GRAVITY', 0.05, 0.6, 0.005],
  ['JUMP_FORCE', 3, 14, 0.1],
  ['AIR_ACCEL', 0.01, 0.4, 0.005],
  ['SLOPE_RUN', 0, 0.5, 0.005],
  ['SLOPE_ROLL_DOWN', 0, 1, 0.01],
  ['LATERAL_ACCEL', 0.05, 2, 0.05],
  ['LATERAL_MAX', 1, 12, 0.1],
  ['FLOW_DECAY', 0, 0.02, 0.0002],
  ['FLOW_SPEED_BONUS', 0, 24, 0.5],
  ['RAIL_SLOPE', 0, 1.5, 0.01],
  ['RAIL_FRICTION', 0, 0.06, 0.001],
  ['BPM', 60, 220, 1],
  ['CAM_BEHIND', 80, 900, 10],
  ['CAM_HEIGHT', 20, 500, 5],
  ['CAM_LOOK_AHEAD', 0, 1400, 20],
  ['FOV_BASE', 40, 100, 1],
  ['FOV_PER_SPEED', 0, 40, 1],
];

const panel = el('panel');
panel.innerHTML = KNOBS.map(([k, lo, hi, st]) => `
  <label><span>${k}</span><b id="v_${k}">${TUNE[k]}</b>
  <input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${st}" value="${TUNE[k]}"></label>
`).join('') + `<button id="dump">copy tune.js values</button>
<button id="respawn">respawn</button>`;

panel.addEventListener('input', (e) => {
  const k = e.target.dataset.k;
  if (!k) return;
  TUNE[k] = parseFloat(e.target.value);
  el('v_' + k).textContent = TUNE[k];
});
el('dump').onclick = () => {
  const txt = KNOBS.map(([k]) => `  ${k}: ${TUNE[k]},`).join('\n');
  navigator.clipboard.writeText(txt);
  el('dump').textContent = 'copied ✓';
  setTimeout(() => (el('dump').textContent = 'copy tune.js values'), 1200);
};
el('respawn').onclick = () => player.reset();

addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') panel.classList.toggle('open');
  if (e.code === 'KeyR') player.reset();
});
