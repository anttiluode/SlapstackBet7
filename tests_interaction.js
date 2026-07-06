/* Interaction-semantics battery — the playroom's claims, tested headless:
   drag = clamp + re-settle round trip; identity persists through occlusion;
   re-emergence rebinds. Mirrors the app's updateAssign/gesture logic. */
"use strict";
const fs = require("fs");
const C = require("./core.js");
const T = JSON.parse(fs.readFileSync("/home/claude/templates.json"));
const templates = [T.tractor, T.star];
const K = 2;
let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log((ok ? "GO   " : "FAIL ") + n + (d ? "  [" + d + "]" : "")); ok ? pass++ : fail++; };

function composePose(g2, g1) {
  const s2 = Math.exp(g2[3]);
  const c = Math.cos(g2[2]), s = Math.sin(g2[2]);
  return [s2 * (c * g1[0] - s * g1[1]) + g2[0], s2 * (s * g1[0] + c * g1[1]) + g2[1],
          C.wrapPi(g1[2] + g2[2]), g1[3] + g2[3]];
}
function argAssign(marg, prevAssign, hiddenOf) {
  return marg.map((m, i) => {
    if (prevAssign && prevAssign[i] >= 0 && hiddenOf(prevAssign[i])) return prevAssign[i];
    let b = 0;
    for (let k = 1; k <= K; k++) if (m[k] > m[b]) b = k;
    return b === K ? -1 : b;
  });
}

// ---- build a scrambled scene (seeded)
let st = 4242; const rand = () => { st = (st * 1103515245 + 12345) & 0x7fffffff; return st / 0x7fffffff; };
const TAU = Math.PI * 2;
const obs = [], gt = [];
const xis = [[0.2, -0.15, 2.4, 0.08], [-0.35, 0.3, -0.9, -0.1]];
for (let k = 0; k < K; k++)
  for (const a of C.transformAtoms(templates[k], xis[k])) { obs.push(a); gt.push(k); }
for (let i = 0; i < 15; i++) {
  const su = 0.04 + 0.08 * rand();
  obs.push([-0.95 + 1.9 * rand(), -0.95 + 1.9 * rand(), -Math.PI / 2 + Math.PI * rand(),
            su, su * (0.4 + 0.5 * rand()), 4 + 10 * rand(), TAU * rand(), rand(), rand(), rand()]);
  gt.push(-1);
}
const NS = [1, 1, 1, .3, .3, 20, 3, .5, .5, .5];
for (const a of obs) for (let q = 0; q < 10; q++) {
  const g = Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(TAU * rand());
  a[q] += g * 0.006 * NS[q];
}
for (const a of obs) { a[3] = Math.max(a[3], .012); a[4] = Math.max(a[4], .008); a[5] = Math.max(a[5], .5); }

// ---- 1. bind from soup
let r = C.bpBind(templates, obs, { iters: 40 });
let assign = argAssign(r.marg, null, () => false);
{
  let ok = 0;
  for (let i = 0; i < gt.length; i++) if (assign[i] === gt[i]) ok++;
  check("bind from soup", ok / gt.length > 0.9, (ok / gt.length).toFixed(3));
}

// ---- 2. drag round trip: gesture on believed atoms, clamp, re-settle
{
  const g = [0.3, 0.25, 0, 0];  // translate
  for (let i = 0; i < obs.length; i++)
    if (assign[i] === 0) obs[i] = C.transformAtoms([obs[i]], g)[0];
  const clamped = composePose(g, r.mu[0]);
  r = C.bpBind(templates, obs, { iters: 10, clampPose: [clamped, null] });
  assign = argAssign(r.marg, assign, () => false);
  let ok = 0;
  for (let i = 0; i < gt.length; i++) if (assign[i] === gt[i]) ok++;
  const poseErr = Math.hypot(clamped[0] - (xis[0][0] + 0.3), clamped[1] - (xis[0][1] + 0.25));
  check("drag = clamp + re-settle keeps binding", ok / gt.length > 0.9, (ok / gt.length).toFixed(3));
  check("composed pose lands where dragged", poseErr < 0.03, "err " + poseErr.toFixed(4));
}

// ---- 3. occlusion: star hidden -> marginals uncertain, identity persists
{
  const hiddenMask = assign.map(a => a === 1);
  const r2 = C.bpBind(templates, obs, { iters: 12, hiddenMask,
                                        clampPose: [null, r.mu[1]] });
  const assign2 = argAssign(r2.marg, assign, k => k === 1);
  const ent = C.atomEntropy(r2.marg);
  let hEnt = 0, n = 0, kept = 0, nStar = 0;
  for (let i = 0; i < gt.length; i++) {
    if (!hiddenMask[i]) continue;
    hEnt += ent[i]; n++;
    if (gt[i] === 1) { nStar++; if (assign2[i] === 1) kept++; }
  }
  check("occluded marginals honestly uncertain", hEnt / n > 1.5, (hEnt / n).toFixed(2) + " bits");
  check("identity persists through occlusion", kept === nStar, kept + "/" + nStar + " star atoms stay star");
  // ---- 4. re-emergence rebinds from scratch
  const r3 = C.bpBind(templates, obs, { iters: 20 });
  const assign3 = argAssign(r3.marg, null, () => false);
  let ok = 0;
  for (let i = 0; i < gt.length; i++) if (assign3[i] === gt[i]) ok++;
  check("re-emergence rebinds", ok / gt.length > 0.9, (ok / gt.length).toFixed(3));
}

// ---- 5. rotation + scale gesture composition consistency
{
  const c = [r.mu[0][0], r.mu[0][1]];
  const drho = Math.PI / 5, ds = 0.15;
  const rc = [Math.cos(drho), Math.sin(drho)];
  const gRot = [c[0] - (rc[0] * c[0] - rc[1] * c[1]), c[1] - (rc[1] * c[0] + rc[0] * c[1]), drho, 0];
  const s = Math.exp(ds);
  const gScl = [c[0] - s * c[0], c[1] - s * c[1], 0, ds];
  const g = composePose(gScl, gRot);
  for (let i = 0; i < obs.length; i++)
    if (assign[i] === 0) obs[i] = C.transformAtoms([obs[i]], g)[0];
  const clamped = composePose(g, r.mu[0]);
  const r4 = C.bpBind(templates, obs, { iters: 12, clampPose: [clamped, null] });
  const a4 = argAssign(r4.marg, assign, () => false);
  let ok = 0;
  for (let i = 0; i < gt.length; i++) if (a4[i] === gt[i]) ok++;
  check("rotate+scale about centroid then re-settle", ok / gt.length > 0.9, (ok / gt.length).toFixed(3));
}

console.log("\n" + pass + " GO, " + fail + " FAIL");
process.exit(fail ? 1 : 0);
