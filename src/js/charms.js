import { TUNE } from './tune.js';

export const CHARMS = {
  bolt: { name: 'Lightning', effect: 'quicker acceleration', color: 0xffd23f },
  star: { name: 'Star', effect: 'higher jumps', color: 0xff548c },
  flower: { name: 'Flower', effect: 'snappier steering', color: 0x62e6cb },
};

export function placeCharms(track) {
  return Array.from({ length: Math.floor(track.length / 1800) }, (_, i) => ({
    s: 650 + i * 1800, lat: [0, -110, 110][i % 3], h: 12,
    kind: Object.keys(CHARMS)[i % 3], cooldown: 0,
  }));
}

export function tickCharms(player) {
  if (player.charmFrames > 0 && --player.charmFrames === 0) player.charm = null;
  for (const charm of player.charms) {
    if (charm.cooldown > 0) { charm.cooldown--; continue; }
    const delta = Math.abs(charm.s - player.s);
    const distance = Math.min(delta, player.track.length - delta);
    if (distance > TUNE.CHARM_RADIUS || Math.abs(charm.lat - player.lat) > TUNE.CHARM_RADIUS ||
        Math.abs(charm.h - player.h) > TUNE.CHARM_RADIUS) continue;
    player.charm = charm.kind;
    player.charmFrames = TUNE.CHARM_DURATION;
    charm.cooldown = TUNE.CHARM_RESPAWN;
    player.flow.add(0, `${CHARMS[charm.kind].name.toUpperCase()} CHARM`, player.beat);
  }
}
