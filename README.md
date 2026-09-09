# SpillerMug

A coffee-powered momentum runner: a tiny punk mug in charm-covered clogs.
Run automatically, earn flow with timed tricks, and grind rails to keep speed.

## Play locally

Use Node 22 or newer. No dependencies or build step.

```sh
npm run dev
npm run check
npm test
```

Open http://127.0.0.1:8778/src/index.html. Steer with A/D or arrows, jump
with Space, brake/crouch with S/down, and respawn with R. In the air, arrows
perform tricks; on rails, left/right transfer and Space hops off.

Collect floating clog charms: yellow lightning gives 45% quicker acceleration,
pink stars give 20% stronger jumps, and mint flowers give 40% quicker lateral
acceleration and braking. One charm at a time, lasting 12 seconds; collecting
another replaces it. Its badge appears on both clogs and the HUD shows time
remaining. Charms respawn after 20 seconds; R clears the effect and resets them.
The speed cap still comes from flow.

The procedural 3D mug has a running gait, blinks, tucked jumping feet, rolling
and trick rotations, and a crouched rail stance. No asset downloads or model
loader are required.

## GitHub Pages

Pages must use **GitHub Actions** as its source. Pushes to `main` validate the
modules and physics, upload `src/` directly, and deploy with the `github-pages`
environment. Pull requests run validation only. The **GitHub Pages** workflow
also supports **Run workflow** for a manual redeploy. Its deployment output is
the authoritative site URL (the organization has a custom Pages domain).

The Docker files are retained for optional local hosting; deployment no longer
requires the historical self-hosted runner or Docker network. Three.js is pinned
in the import map and loaded from jsDelivr, so playing requires network access.
