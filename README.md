# Slapstack Playroom — Bet 7: objects you can grab

One HTML file. Open `slapstack_playroom.html` in any browser, no install, no
network. Every entity on the screen is a posterior: **Scramble** throws the
two real Bet-5 reconstructions (93-atom tractor, 89-atom star) plus clutter
into an unlabeled atom soup at random poses; **Bind** runs the Bet-6 loopy BP
live, one iteration per frame, and you watch gray atoms crystallize into
believed objects; then you **grab them**. A drag is a pose clamp —
conditioning, not sprite-moving — and everything else re-equilibrates by
message passing. Wheel rotates, shift+wheel scales, all through the exact
Sim(2) algebra. Occlude an object and its atom marginals honestly revert
toward the prior while the pose belief coasts as a widening dashed ellipse;
you can drag the ghost. The prompt box parses commands ("move the tractor up
left, rotate star 40") into clamps — a local grammar everywhere, Claude for
free-form language when the page runs inside claude.ai.

You can only grab what is believed. Clutter has no owner; it does not drag.

## Provenance, not vibes

The JS is a port of `bet6_open.py` / `bet6_bp_binding.py` /
`bet6_multimodal.py`, and it was not trusted until it matched the Python:

### tests_node.js — JS core vs Python ground truth (7/7 GO)
| claim | result |
|---|---|
| `transform_atoms` exact | max err 2.2e-16 |
| renderer matches numpy render | MSE 8.6e-8 |
| BP accuracy matches Python | 0.949 vs 0.949, identical poses |
| BP poses match Python | max err < 1e-4 |
| drag = conditioning (clamped rebind) | 93/93 atoms follow the clamp |
| occluded atoms honestly uncertain | 1.58 bits hidden vs 0.02 visible |
| border entropy rises with noise | 1.162 → 1.440 |

### tests_interaction.js — the playroom's claims (7/7 GO)
| claim | result |
|---|---|
| bind from soup | 0.959 vs ground truth |
| drag → clamp → re-settle keeps binding | 0.959 |
| composed pose lands where dragged | err 0.0023 |
| occluded marginals honestly uncertain | 1.58 bits |
| identity persists through occlusion | 83/83 star atoms stay star |
| re-emergence rebinds | 0.959 |
| rotate+scale about centroid, re-settle | 0.954 |

One kill during the build, worth reading: the first occlusion implementation
sent evidence-free atoms to a *confidently outlier* belief (entropy 0) because
the belief vector collapsed to the lone outlier candidate. No evidence must
mean the prior, not a confident wrong answer — fixed in `core.js`, and a
second bug in the same territory: `argmax` of a uniform marginal ties to
object 0, silently re-assigning occluded star atoms to the tractor. Identity
now persists through occlusion explicitly (`updateAssign` skips unobserved
atoms), which is the 6c claim stated as code: identity lives in the object,
not in the currently visible pixels.

## What this is NOT

- **No text→appearance.** "Make it dusk" needs the SDS oracle on a GPU —
  that is `bet6d_sds_oracle.py`, shipped separately and still untested on
  GPU. The prompt box here only does structural interventions
  (move/rotate/scale/hide), which is exactly what a graphical model can do
  without a generative oracle.
- **No real-photo encoding.** The two objects are Slapstack's own
  reconstructions of a drawn tractor and star, background envelopes,
  signature collisions and all. Scene→atoms on photographs is still the open
  ledger item it was yesterday.
- **No temporal BP.** Coasting covariance during occlusion is visualized with
  the same constant-position + growing-Q model as bet 6c's spirit, but there
  is no constant-velocity tracker in the page; the ellipse is honest about
  position uncertainty, not a full 6c reimplementation.

## Files

- `slapstack_playroom.html` — the deliverable, self-contained (65 KB)
- `core.js` — verified JS port (algebra, 2π pose votes, cavity BP, renderer,
  ownership field)
- `ui.html` + `build.js` — source and assembler (`node build.js`)
- `tests_node.js`, `tests_interaction.js` — both batteries
  (`node tests_node.js && node tests_interaction.js`)
- `groundtruth.json` — Python-generated reference artifacts
- `qa_triptych.png` — headless render QA: scene / entropy-border glow /
  ownership field at a random scramble (binding 0.964)

Templates were trained with `bet6_open.build_templates()` (the Bet-5 torch
model, CPU) and embedded as JSON; retrain with the repo to regenerate.
