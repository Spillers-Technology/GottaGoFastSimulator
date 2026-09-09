/**
 * tune.js — every number that affects feel, in one place.
 *
 * UNITS: physics runs at a fixed 60Hz in CLASSIC GENESIS UNITS (pixels per
 * frame), because that is how the Sonic constants were reverse-engineered.
 * Sonic is ~40px tall. Do not "convert to seconds" — the whole point is that
 * these values are directly comparable to the Sonic Physics Guide.
 *
 * WORLD_SCALE converts px -> three.js units at render time only.
 */

export const TUNE = {
  // ---- world ----------------------------------------------------------
  WORLD_SCALE: 0.05,     // 1px = 0.05 units => Sonic (40px) is 2 units tall
  FIXED_DT: 1 / 60,
  MAX_STEPS: 5,          // spiral-of-death guard

  // ---- clog charms: temporary modifiers, never mutate base physics ----
  CHARM_DURATION: 720, // 12 seconds at 60Hz; new pickups replace the old charm
  CHARM_RESPAWN: 1200,
  CHARM_RADIUS: 42,
  CHARM_ACCEL_MULT: 1.45,
  CHARM_JUMP_MULT: 1.2,
  CHARM_STEER_MULT: 1.4,

  // ---- ground movement (Sonic Physics Guide, Sonic 3 values) ----------
  ACCEL: 0.046875,
  DECEL: 0.5,            // applied when input opposes travel
  FRICTION: 0.046875,
  TOP_SPEED: 6,
  MAX_SPEED: 16,         // hard cap, incl. downhill accumulation

  // ---- air ------------------------------------------------------------
  AIR_ACCEL: 0.09375,    // exactly 2x ground accel, per the original
  GRAVITY: 0.21875,
  JUMP_FORCE: 6.5,
  JUMP_RELEASE_CAP: 4,   // variable jump height
  TERMINAL_VELOCITY: -16,
  AIR_DRAG_THRESHOLD: 4, // drag only applies while rising below this speed

  // ---- slopes ---------------------------------------------------------
  SLOPE_RUN: 0.125,
  SLOPE_ROLL_UP: 0.078125,
  SLOPE_ROLL_DOWN: 0.3125,

  // ---- rolling --------------------------------------------------------
  ROLL_FRICTION: 0.0234375,
  ROLL_DECEL: 0.125,
  ROLL_MIN_SPEED: 0.5,   // below this, stand back up
  ROLL_TRIGGER_SPEED: 1.03125,

  // ---- spindash -------------------------------------------------------
  SPINDASH_CHARGE: 2.0,
  SPINDASH_MAX: 12,
  SPINDASH_DECAY: 0.125, // per frame, charge bleeds off

  // ---- lateral (the 2.5D axis) ---------------------------------------
  LATERAL_ACCEL: 0.55,
  LATERAL_FRICTION: 0.35,
  LATERAL_MAX: 4.2,
  LATERAL_AIR_MULT: 0.65,
  TRACK_HALF_WIDTH: 220, // px

  // ---- flow: the core original mechanic -------------------------------
  // Flow decays constantly. Timed tricks, clean landings and rail
  // transfers feed it. Flow raises your speed cap, so going fast is
  // something you EARN with timing rather than something the level gives you.
  FLOW_MAX: 1.0,
  FLOW_DECAY: 0.0022,          // per frame (~0.13/sec => ~7.5s from full)
  FLOW_DECAY_GROUNDED_MULT: 1.0,
  FLOW_DECAY_RAIL_MULT: 0.25,  // rails hold your flow: they are a safe haven
  FLOW_SPEED_BONUS: 9.0,       // top speed = TOP_SPEED + flow * this
  FLOW_ACCEL_BONUS: 0.03,      // accel also scales, or high cap feels sluggish
  FLOW_FUMBLE_PENALTY: 0.45,   // multiplier applied on a botched landing
  FLOW_CRASH_PENALTY: 0.2,

  // flow rewards
  FLOW_TRICK_BASE: 0.11,
  FLOW_CLEAN_LAND: 0.09,
  FLOW_RAIL_TRANSFER: 0.16,
  FLOW_ORB: 0.07,
  FLOW_CHAIN_MULT: 0.35,       // each chained trick adds this fraction again

  // ---- tricks ---------------------------------------------------------
  LAND_WINDOW: 12,             // frames after a trick ends that count as clean
  TRICK_MIN_AIRTIME: 8,        // can't trick off a tiny hop
  TRICKS: {
    spinL:   { dur: 20, flow: 1.0, name: 'Spin L' },
    spinR:   { dur: 20, flow: 1.0, name: 'Spin R' },
    flip:    { dur: 34, flow: 1.7, name: 'Backflip' },
    dive:    { dur: 14, flow: 0.8, name: 'Dive', fall: -3.5 },
  },

  // ---- rhythm ---------------------------------------------------------
  // A beat clock. Actions landed near a beat pay out more. This is the
  // hook to develop next: right now it is a multiplier, later it should
  // drive level layout too.
  BPM: 148,
  BEAT_WINDOW: 0.09,           // seconds either side of the beat
  ON_BEAT_MULT: 1.6,

  // ---- rails ----------------------------------------------------------
  RAIL_SNAP_HEIGHT: 26,        // px above/below rail line that will grab
  RAIL_SNAP_LATERAL: 46,       // px lateral tolerance
  RAIL_MIN_FALL_SPEED: -0.2,   // must be descending (or near it) to grab
  RAIL_FRICTION: 0.004,        // rails are near-frictionless
  RAIL_SLOPE: 0.42,            // rails convert gradient to speed aggressively
  RAIL_MIN_SPEED: 2.5,         // hopping on gives you at least this
  RAIL_TRANSFER_TIME: 11,      // frames a transfer hop takes
  RAIL_LOCK_FRAMES: 8,         // ignore re-snap right after jumping off

  // ---- pickups / pads -------------------------------------------------
  DASH_PAD_SPEED: 13,
  ORB_RADIUS: 42,

  // ---- ramps: where descent speed becomes trick time ------------------
  // The answer to "too fast downhill gets dumb". Raw speed has no ceiling
  // of interest; airtime does. A ramp converts ground speed into hang time,
  // so a faster descent buys a longer trick window rather than a bigger
  // number. Speed becomes the INPUT to the skill system, not the reward.
  RAMP_MIN_SPEED: 3.0,
  RAMP_BASE: 2.0,        // launch floor, so a slow approach still gets air
  RAMP_GAIN: 0.42,       // ysp added per px/frame of ground speed
  RAMP_MAX_YSP: 10,      // hard ceiling, or a 16px/frame entry gets silly
  RAMP_HALF_WIDTH: 105,  // narrower than the track: you can steer around one
  RAMP_COOLDOWN: 45,

  // ---- terrain phrasing -----------------------------------------------
  // The course is built from repeating phrases rather than continuous
  // noise: long gentle descent -> flat runout with a ramp -> short steep
  // climb. Asymmetry is deliberate. Descents are where speed is earned so
  // they should be long; climbs only shed overspeed, so they should be
  // brief and steep, which is what stops the lap feeling like a climb.
  PHRASES: 14,
  PHRASE_DESCENT: 0.60,  // fraction of a phrase spent descending
  PHRASE_RUNOUT: 0.16,   // flat landing zone; the ramp sits at its start
  PHRASE_AMP: 250,       // px of drop per phrase
  PHRASE_GLOBAL_AMP: 180,// slow whole-lap undulation so phrases vary

  // ---- camera ---------------------------------------------------------
  CAM_BEHIND: 300,             // px behind player along spline
  CAM_HEIGHT: 130,
  CAM_LOOK_AHEAD: 420,
  CAM_LATERAL_LAG: 0.12,
  CAM_SMOOTH: 0.14,
  FOV_BASE: 62,
  FOV_PER_SPEED: 16,          // extra degrees of FOV at max speed — most of "feeling fast"
  FOV_SMOOTH: 0.06,
};

// Convenience: current top speed given flow.
export function topSpeed(flow) {
  return TUNE.TOP_SPEED + flow * TUNE.FLOW_SPEED_BONUS;
}
export function accel(flow) {
  return TUNE.ACCEL + flow * TUNE.FLOW_ACCEL_BONUS;
}
