/* Assertion battery: JS port vs Python ground truth.
   GO/NO-GO before any of this ships inside the playroom. */
"use strict";
const fs = require("fs");
const C = require("./core.js");

const GT = JSON.parse(fs.readFileSync(__dirname + "/groundtruth.json"));
let pass = 0, fail = 0;
function check(name, ok, detail) {
  console.log((ok ? "GO   " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
  ok ? pass++ : fail++;
}

// ---- 1. Exact Sim(2) transform matches Python to float precision
{
  const js = C.transformAtoms(GT.templates[0], GT.xis[0]);
  let maxErr = 0;
  for (let i = 0; i < js.length; i++)
    for (let q = 0; q < 10; q++)
      maxErr = Math.max(maxErr, Math.abs(js[i][q] - GT.transformed0[i][q]));
  check("transform_atoms exact", maxErr < 1e-9, "max |err| = " + maxErr.toExponential(2));
}

// ---- 2. Renderer matches numpy render (bbox-culled JS vs full numpy)
{
  const H = 96;
  const pre = C.renderPre(GT.obs, H);
  let mse = 0;
  for (let c = 0; c < 3; c++)
    for (let py = 0; py < H; py++)
      for (let px = 0; px < H; px++) {
        const jsv = 1 / (1 + Math.exp(-2 * pre[c * H * H + py * H + px]));
        const d = jsv - GT.render96[c][py][px];
        mse += d * d;
      }
  mse /= 3 * H * H;
  check("render matches numpy", mse < 1e-6, "MSE = " + mse.toExponential(2));
}

// ---- 3. BP binding: accuracy and recovered poses match Python
{
  const t0 = Date.now();
  const { marg, mu } = C.bpBind(GT.templates, GT.obs, { iters: 40 });
  const ms = Date.now() - t0;
  const K = 2;
  let correct = 0;
  for (let i = 0; i < GT.gt.length; i++) {
    let best = 0;
    for (let k = 1; k <= K; k++) if (marg[i][k] > marg[i][best]) best = k;
    const pred = best === K ? -1 : best;
    if (pred === GT.gt[i]) correct++;
  }
  const acc = correct / GT.gt.length;
  check("BP accuracy matches python", Math.abs(acc - GT.py_acc) < 0.02,
        "js " + acc.toFixed(3) + " vs py " + GT.py_acc.toFixed(3) + ", " + ms + " ms");
  let poseErr = 0;
  for (let k = 0; k < K; k++)
    for (let q = 0; q < 4; q++)
      poseErr = Math.max(poseErr, Math.abs(
        q === 2 ? C.wrapPi(mu[k][q] - GT.py_mu[k][q]) : mu[k][q] - GT.py_mu[k][q]));
  check("BP poses match python", poseErr < 0.02, "max pose err = " + poseErr.toFixed(4));
}

// ---- 4. Intervention: clamp object 0's pose elsewhere; assignments re-settle
{
  const newPose = [-0.5, 0.5, 0.3, 0.0];
  const moved = GT.obs.map(a => a.slice());
  // move object 0's atoms to the clamped pose (undo old xi, apply new)
  const t0atoms = C.transformAtoms(GT.templates[0], newPose);
  let j = 0;
  for (let i = 0; i < GT.gt.length; i++)
    if (GT.gt[i] === 0) { moved[i] = t0atoms[j].slice(); j++; }
  const { marg } = C.bpBind(GT.templates, moved,
                            { iters: 25, clampPose: [newPose, null] });
  let correct = 0, n0 = 0;
  for (let i = 0; i < GT.gt.length; i++) {
    if (GT.gt[i] !== 0) continue;
    n0++;
    let best = 0;
    for (let k = 1; k <= 2; k++) if (marg[i][k] > marg[i][best]) best = k;
    if (best === 0) correct++;
  }
  check("clamped-pose rebind (drag = conditioning)", correct / n0 > 0.9,
        (correct) + "/" + n0 + " atoms follow the clamp");
}

// ---- 5. Permanence: hidden atoms carry no evidence, marginals go uncertain,
//         but the object's clamped/coasted pose keeps identity alive.
{
  const hidden = GT.gt.map(g => g === 1);   // occlude the star entirely
  const { marg, mu } = C.bpBind(GT.templates, GT.obs, { iters: 25, hiddenMask: hidden });
  const ent = C.atomEntropy(marg);
  let hiddenEnt = 0, visEnt = 0, nh = 0, nv = 0;
  for (let i = 0; i < ent.length; i++)
    if (hidden[i]) { hiddenEnt += ent[i]; nh++; } else { visEnt += ent[i]; nv++; }
  hiddenEnt /= nh; visEnt /= nv;
  check("occluded atoms honestly uncertain", hiddenEnt > visEnt + 0.3,
        "hidden " + hiddenEnt.toFixed(2) + " bits vs visible " + visEnt.toFixed(2));
}

// ---- 6. Ownership field: entropy rises with observation noise (border honesty)
{
  const H = 72;
  const { marg } = C.bpBind(GT.templates, GT.obs, { iters: 30 });
  const clean = C.ownershipField(GT.obs, marg, 2, H);
  // noisy copy
  const rngNoise = (i) => Math.sin(i * 12.9898) * 43758.5453 % 1;
  const noisy = GT.obs.map((a, i) => a.map((x, q) =>
    x + (rngNoise(i * 10 + q) - 0.5) * 0.12 * [1,1,1,.3,.3,20,3,.5,.5,.5][q]));
  for (const a of noisy) { a[3] = Math.max(a[3], 0.012); a[4] = Math.max(a[4], 0.008); a[5] = Math.max(a[5], 0.5); }
  const { marg: margN } = C.bpBind(GT.templates, noisy, { iters: 30 });
  const dirty = C.ownershipField(noisy, margN, 2, H);
  const meanEnt = (f) => {
    let s = 0, n = 0;
    for (let i = 0; i < f.ent.length; i++) if (f.support[i]) { s += f.ent[i]; n++; }
    return s / n;
  };
  const e0 = meanEnt(clean), e1 = meanEnt(dirty);
  check("border entropy rises with noise", e1 > e0,
        "clean " + e0.toFixed(3) + " -> noisy " + e1.toFixed(3));
}

console.log("\n" + pass + " GO, " + fail + " FAIL");
process.exit(fail ? 1 : 0);
