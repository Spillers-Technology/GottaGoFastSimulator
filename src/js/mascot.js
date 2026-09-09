/** Coffee-powered little troublemaker. Geometry and poses are presentation only. */
import * as THREE from 'three';
import { CHARMS } from './charms.js';
import { STATE } from './player.js';

export function createMascot() {
  const root = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ color: 0xffefd3 });
  const ink = new THREE.MeshLambertMaterial({ color: 0x292333 });
  const pink = new THREE.MeshLambertMaterial({ color: 0xff548c });
  const coffee = new THREE.MeshLambertMaterial({ color: 0x633b28 });
  const mesh = (geometry, material, x, y, z, parent = root) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    parent.add(part);
    return part;
  };
  mesh(new THREE.CylinderGeometry(17, 14, 29, 24), cream, 0, 5, 0);
  const rim = mesh(new THREE.TorusGeometry(16, 2, 8, 32), cream, 0, 20, 0);
  rim.rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(14.7, 14.7, 1, 24), coffee, 0, 19.6, 0);
  mesh(new THREE.TorusGeometry(10, 3.5, 8, 20), cream, 19, 6, 0);
  // Face looks down the course (+Z); handle and rear patch read from chase view.
  const eyes = [];
  for (const x of [-6, 6]) {
    eyes.push(mesh(new THREE.SphereGeometry(2.2, 8, 8), ink, x, 8, 15));
    mesh(new THREE.SphereGeometry(2.4, 8, 8), pink, x * 1.65, 3, 12.8).scale.set(1, 0.5, 0.3);
  }
  const smile = mesh(new THREE.TorusGeometry(4, 0.9, 6, 12, Math.PI), ink, 0, 3, 16);
  smile.rotation.z = Math.PI;
  // A small pink crest and a lightning patch: just a tiny bit punk.
  for (let i = -1; i <= 1; i++) {
    const spike = mesh(new THREE.ConeGeometry(3.2, 9 - Math.abs(i) * 2, 4), pink, i * 5, 24, -8);
    spike.rotation.z = -i * 0.18;
  }
  mesh(new THREE.BoxGeometry(14, 15, 1), ink, 0, 5, -15);
  const bolt = new THREE.Shape();
  bolt.moveTo(1, 6); bolt.lineTo(-4, 0); bolt.lineTo(-1, 0);
  bolt.lineTo(-2, -6); bolt.lineTo(4, 1); bolt.lineTo(1, 1); bolt.closePath();
  const patch = mesh(new THREE.ShapeGeometry(bolt), pink, 0, 5, -15.6);
  patch.rotation.y = Math.PI;
  const feet = [], badges = [];
  const mint = new THREE.MeshLambertMaterial({ color: 0x62e6cb });
  for (const x of [-9, 9]) {
    const leg = new THREE.Group();
    leg.position.set(x, -9, 0); root.add(leg); feet.push(leg);
    mesh(new THREE.CylinderGeometry(2.2, 2.2, 7, 8), ink, 0, -2, 0, leg);
    const shoe = mesh(new THREE.SphereGeometry(1, 12, 8), x < 0 ? pink : mint, 0, -7, 3, leg);
    shoe.scale.set(7, 4, 10);
    mesh(new THREE.BoxGeometry(13, 2, 16), cream, 0, -9, 3, leg);
    // Vent holes and a heel strap make the rounded shoes read as foam clogs.
    for (const hx of [-3, 3]) for (const z of [2, 6]) {
      const hole = mesh(new THREE.SphereGeometry(1.3, 8, 6), ink, hx, -3.5, z, leg);
      hole.scale.y = 0.2;
    }
    const strap = mesh(new THREE.TorusGeometry(5, 1, 6, 12, Math.PI), x < 0 ? pink : mint, 0, -5, -3, leg);
    strap.rotation.x = Math.PI / 2;
    for (const kind of Object.keys(CHARMS)) {
      const badge = makeCharm(kind);
      badge.scale.setScalar(0.26);
      badge.rotation.x = -Math.PI / 2;
      badge.position.set(0, -2.8, 6);
      badge.visible = false;
      leg.add(badge); badges.push({ kind, badge });
    }
  }
  return { root, feet, eyes, badges };
}

export function animateMascot(mascot, p, time) {
  const { root, feet, eyes } = mascot;
  for (const { kind, badge } of mascot.badges) badge.visible = p.charm === kind;
  const ground = p.state === STATE.GROUND;
  const rail = p.state === STATE.RAIL || p.state === STATE.TRANSFER;
  const run = ground && !p.rolling && !p.crouching;
  // Distance-driven gait stays matched to speed, independent of render FPS.
  const stride = p.s * 0.075;
  const energy = Math.min(1, Math.abs(p.gsp) / 4);
  root.position.y = run ? Math.abs(Math.sin(stride)) * 2 * energy : 0;
  root.rotation.set(0, 0, run ? Math.sin(stride) * 0.07 * energy : 0);
  const squash = rail || p.crouching ? 0.82 : 1;
  root.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  feet.forEach((foot, i) => {
    foot.rotation.set(run ? Math.sin(stride + i * Math.PI) * 0.8 * energy : -0.35, 0, rail ? (i ? -0.25 : 0.25) : 0);
  });
  if (ground && p.rolling) root.rotation.x = -p.spinAngle;
  if (p.trickAngle) {
    const key = p.flow.trick?.key;
    if (key === 'flip') root.rotation.x = -p.trickAngle;
    else root.rotation.y = key === 'spinL' ? p.trickAngle : -p.trickAngle;
  }
  for (const eye of eyes) eye.scale.y = time % 4.2 < 0.13 ? 0.1 : 1;
}

// Same silhouettes on the course and on the clogs.
export function makeCharm(kind) {
  const shape = new THREE.Shape();
  if (kind === 'bolt') {
    shape.moveTo(2, 12); shape.lineTo(-9, -1); shape.lineTo(-2, -1);
    shape.lineTo(-4, -12); shape.lineTo(9, 3); shape.lineTo(2, 3);
  } else {
    const points = kind === 'star' ? 10 : 40;
    for (let i = 0; i < points; i++) {
      const a = Math.PI / 2 + i * Math.PI * 2 / points;
      const r = kind === 'star' ? (i % 2 ? 5 : 12) : 9 + 3 * Math.cos(a * 5);
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  shape.closePath();
  return new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }),
    new THREE.MeshLambertMaterial({ color: CHARMS[kind].color }));
}
