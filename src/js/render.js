/**
 * render.js — three.js presentation layer.
 *
 * Deliberately dumb: it reads player/track state and draws. No gameplay
 * decisions live here. The one thing it does own is *speed perception*,
 * which is mostly parallax, FOV and camera pull-back rather than actual
 * velocity — see updateCamera().
 */

import * as THREE from 'three';
import { TUNE } from './tune.js';
import { createMascot, animateMascot, makeCharm } from './mascot.js';

const S = TUNE.WORLD_SCALE;
const v = (a) => new THREE.Vector3(a[0] * S, a[1] * S, a[2] * S);

export class Renderer {
  constructor(canvas, track) {
    this.track = track;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fd4f0);
    this.scene.fog = new THREE.Fog(0x8fd4f0, 220, 900);

    this.camera = new THREE.PerspectiveCamera(TUNE.FOV_BASE, 1, 0.5, 2000);
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.fov = TUNE.FOV_BASE;
    this._first = true;

    this._lights();
    this._buildTrack();
    this._buildRails();
    this._buildProps();
    this._buildOrbs();
    this._buildPads();
    this._buildPlayer();
    this.charmMeshes = [];

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x4a5d3a, 1.15));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    sun.position.set(0.4, 1, 0.3);
    this.scene.add(sun);
  }

  // ---- geometry ---------------------------------------------------------

  _sampleCentre(step = 55) {
    const out = [];
    for (let s = 0; s < this.track.length; s += step) out.push(s);
    out.push(this.track.length);   // wraps to s=0, closing the ribbon
    return out;
  }

  _buildTrack() {
    const samples = this._sampleCentre(55);
    const hw = TUNE.TRACK_HALF_WIDTH;
    const pos = [], col = [], idx = [];
    const p = [0, 0, 0];
    const c1 = new THREE.Color(0x5a8f4a), c2 = new THREE.Color(0x6ba055);

    samples.forEach((s, i) => {
      this.track.pointAt(s, p);
      const f = this.track.frameAt(s, {});
      // stripes every ~340px give the eye something to clock speed against
      const c = (Math.floor(s / 340) % 2 === 0) ? c1 : c2;
      for (const side of [-1, 1]) {
        pos.push((p[0] + f.r[0] * hw * side) * S, p[1] * S, (p[2] + f.r[2] * hw * side) * S);
        col.push(c.r, c.g, c.b);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.scene.add(new THREE.Mesh(g, m));

    // Edge kerbs — a strong horizontal reference line at the track boundary.
    for (const side of [-1, 1]) {
      const pts = samples.map((s) => {
        const q = this.track.pointAt(s, [0, 0, 0]);
        const f = this.track.frameAt(s, {});
        return new THREE.Vector3(
          (q[0] + f.r[0] * hw * side) * S,
          (q[1] + 14) * S,
          (q[2] + f.r[2] * hw * side) * S,
        );
      });
      const curve = new THREE.CatmullRomCurve3(pts.slice(0, -1), true);
      const tube = new THREE.TubeGeometry(curve, pts.length, 6 * S, 6, true);
      this.scene.add(new THREE.Mesh(tube, new THREE.MeshLambertMaterial({ color: 0xe8e2d0 })));
    }
  }

  _buildRails() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8dde6, emissive: 0x2a3550 });
    for (const rail of this.track.rails) {
      const pts = [];
      for (let s = rail.sStart; s <= rail.sEnd; s += 40) {
        const q = this.track.pointAt(s, [0, 0, 0]);
        const f = this.track.frameAt(s, {});
        const hh = this.track.railHeight(rail, s);
        pts.push(new THREE.Vector3(
          (q[0] + f.r[0] * rail.lat) * S,
          (q[1] + hh) * S,
          (q[2] + f.r[2] * rail.lat) * S,
        ));
      }
      if (pts.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(pts, false);
      const tube = new THREE.TubeGeometry(curve, pts.length * 2, 7 * S, 6, false);
      this.scene.add(new THREE.Mesh(tube, mat));

      // support posts, so rails read as objects in space rather than lines
      const postG = new THREE.BoxGeometry(6 * S, 1, 6 * S);
      const postM = new THREE.MeshLambertMaterial({ color: 0x8d94a3 });
      for (let i = 0; i < pts.length; i += 8) {
        const q = this.track.pointAt(rail.sStart + i * 40, [0, 0, 0]);
        const post = new THREE.Mesh(postG, postM);
        const hh = pts[i].y - q[1] * S;
        post.scale.y = Math.max(hh, 0.1);
        post.position.set(pts[i].x, q[1] * S + hh / 2, pts[i].z);
        this.scene.add(post);
      }
    }
  }

  _buildProps() {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.MeshLambertMaterial({ vertexColors: false, color: 0xffffff });
    const mesh = new THREE.InstancedMesh(g, m, this.track.props.length);
    const mat4 = new THREE.Matrix4();
    const col = new THREE.Color();
    this.track.props.forEach((pr, i) => {
      const w = this.track.toWorld(pr.s, pr.lat, pr.h, [0, 0, 0]);
      mat4.makeScale(pr.w * S, pr.tall * S, pr.w * S);
      mat4.setPosition(w[0] * S, (w[1] + pr.tall / 2) * S, w[2] * S);
      mesh.setMatrixAt(i, mat4);
      col.setHSL(pr.hue, 0.42, 0.34);
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }

  _buildOrbs() {
    const g = new THREE.IcosahedronGeometry(TUNE.ORB_RADIUS * 0.55 * S, 0);
    const m = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x8a6000 });
    this.orbMesh = new THREE.InstancedMesh(g, m, this.track.orbs.length);
    this.orbMesh.frustumCulled = false;
    this.scene.add(this.orbMesh);
    this._orbM = new THREE.Matrix4();
  }

  _buildPads() {
    const g = new THREE.PlaneGeometry(200 * S, 90 * S);
    const m = new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.85 });
    for (const p of this.track.pads) {
      const w = this.track.toWorld(p.s, p.lat, 3, [0, 0, 0]);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(w[0] * S, w[1] * S, w[2] * S);
      mesh.rotation.x = -Math.PI / 2;
      const f = this.track.frameAt(p.s, {});
      mesh.rotation.z = Math.atan2(f.t[0], f.t[2]);
      this.scene.add(mesh);
    }
  }

  _buildPlayer() {
    this.playerGroup = new THREE.Group();
    this.mascot = createMascot();
    const modelScale = new THREE.Group();
    modelScale.scale.setScalar(S);
    modelScale.add(this.mascot.root);
    this.playerGroup.add(modelScale);
    this.scene.add(this.playerGroup);

    // ground shadow blob
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(20 * S, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
  }

  // ---- per-frame --------------------------------------------------------

  update(player, flow, alpha) {
    this._updatePlayer(player);
    this._updateOrbs();
    player.charms.forEach((charm, i) => {
      let mesh = this.charmMeshes[i];
      if (!mesh) {
        mesh = makeCharm(charm.kind);
        mesh.scale.setScalar(S * 1.8);
        this.scene.add(mesh); this.charmMeshes[i] = mesh;
      }
      mesh.visible = charm.cooldown === 0;
      const pos = this.track.toWorld(charm.s, charm.lat, 28 + Math.sin(performance.now() * 0.004 + i) * 5, [0, 0, 0]);
      mesh.position.copy(v(pos));
      mesh.rotation.y = performance.now() * 0.002;
    });
    this.updateCamera(player, flow);
    this.renderer.render(this.scene, this.camera);
  }

  _updatePlayer(p) {
    const w = this.track.toWorld(p.s, p.lat, p.h + 20, [0, 0, 0]);
    this.playerGroup.position.set(w[0] * S, w[1] * S, w[2] * S);

    const f = this.track.frameAt(p.s, {});
    const yaw = Math.atan2(f.t[0], f.t[2]);
    this.playerGroup.rotation.set(0, yaw, 0);

    animateMascot(this.mascot, p, performance.now() / 1000);

    const g = this.track.toWorld(p.s, p.lat, 2, [0, 0, 0]);
    this.shadow.position.set(g[0] * S, g[1] * S, g[2] * S);
    const fade = Math.max(0, 1 - p.h / 400);
    this.shadow.material.opacity = 0.3 * fade;
    this.shadow.scale.setScalar(0.6 + fade * 0.5);
  }

  _updateOrbs() {
    const m = this._orbM;
    const t = performance.now() * 0.003;
    this.track.orbs.forEach((o, i) => {
      if (o.taken) {
        m.makeScale(0, 0, 0);
      } else {
        const w = this.track.toWorld(o.s, o.lat, o.h, [0, 0, 0]);
        m.makeRotationY(t + i);
        m.setPosition(w[0] * S, w[1] * S, w[2] * S);
      }
      this.orbMesh.setMatrixAt(i, m);
    });
    this.orbMesh.instanceMatrix.needsUpdate = true;
  }

  updateCamera(p, flow) {
    const sf = p.speedFrac;
    // Pull back and rise with speed — the cheapest, strongest speed cue.
    const behind = TUNE.CAM_BEHIND * (1 + sf * 0.45);
    const height = TUNE.CAM_HEIGHT + p.h * 0.55 + sf * 40;
    const lat = p.lat * TUNE.CAM_LATERAL_LAG;

    const want = this.track.toWorld(p.s - behind, lat, height, [0, 0, 0]);
    const look = this.track.toWorld(
      p.s + TUNE.CAM_LOOK_AHEAD * (1 + sf * 0.5),
      p.lat * 0.45,
      p.h * 0.5 + 55,
      [0, 0, 0],
    );

    const wv = v(want), lv = v(look);
    if (this._first) { this.camPos.copy(wv); this.camLook.copy(lv); this._first = false; }
    this.camPos.lerp(wv, TUNE.CAM_SMOOTH);
    this.camLook.lerp(lv, TUNE.CAM_SMOOTH * 1.4);

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    const wantFov = TUNE.FOV_BASE + sf * TUNE.FOV_PER_SPEED + flow.value * 4;
    this.fov += (wantFov - this.fov) * TUNE.FOV_SMOOTH;
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
}
