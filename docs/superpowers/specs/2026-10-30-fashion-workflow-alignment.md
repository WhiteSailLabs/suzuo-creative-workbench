# Fashion Design Workflow Alignment

## Purpose

This document aligns the Huichuang AI prototype with the real workflow of a fashion designer working with a client. It is the product baseline for the next implementation phase.

The product is a meeting-driven concept design workspace, not a production pattern-making, costing, sourcing, or 3D fitting system.

## Success Definition

In one real or scripted client meeting, a designer can:

1. Capture a spoken requirement and turn it into a structured fashion brief.
2. Upload a reference image and bind it to a specific design use, such as collar shape or silhouette.
3. Generate a first concept version without manually running every workflow node.
4. State a constrained change such as “make the collar smaller, keep the color and silhouette unchanged”.
5. Generate a new version while preserving the previous version and recording the change source.
6. Inspect the brief, references, workflow state, version history, and export package.

## Real Fashion Workflow

The product workflow is:

```text
Project and meeting
  -> transcript and uploads
  -> structured fashion brief
  -> brief correction or confirmation
  -> material and reference binding
  -> V1 concept
  -> natural-language change request
  -> constrained change patch
  -> affected-node rerun
  -> V2 with V1 preserved
  -> proposal export
```

The primary control surface is the conversation and the structured brief. “Run node” is a recovery or override action, not the normal starting point.

## Fashion Brief

The minimum brief fields are:

| Field | Meaning | Example |
| --- | --- | --- |
| garment_type | Garment category | New Chinese-style commuter jacket |
| target_user | Intended wearer | Urban professional woman |
| style | Design direction | Restrained, modern, minimal |
| color | Color requirement | Warm ivory |
| fit | Silhouette and ease | Relaxed |
| length | Garment length | Mid-length |
| collar | Collar requirement | Use reference image A only for collar |
| sleeve | Sleeve requirement | Slightly extended cuff |
| fabric_reference | Material visual reference | Soft cotton weave |
| pattern | Pattern or decoration | Subtle Suzhou-inspired pattern |
| negative_constraints | Explicit exclusions | No belt |

Each field must support a source reference, confidence, and state: confirmed, tentative, conflicting, or missing.

## Reference Binding

An uploaded image is not automatically a whole-garment reference. The user must be able to bind it to one or more purposes:

- overall_style
- silhouette
- collar
- sleeve
- fabric_texture
- color
- pattern

The binding must be visible in the asset card and included in the generation provenance. A correction must be possible without deleting the original upload.

## Version and Change Rules

Every generation creates a new artifact version. Previous versions are immutable.

A constrained change records:

- base version
- changed fields
- preserved fields
- source transcript or manual instruction
- affected workflow nodes
- brief revision

Example:

```json
{
  "type": "MODIFY_ATTRIBUTE",
  "patch": {"collar": "smaller"},
  "preserve": ["color", "fit", "length", "fabric_reference", "belt"],
  "base_revision": "V1"
}
```

If a task completes against an outdated brief revision, it is retained as history and marked stale; it must not replace the current published version.

## Meeting Acceptance Script

The following script is the baseline end-to-end test:

1. Client says: “I want a warm ivory, relaxed new Chinese-style commuter jacket, kept simple.”
   Expected: a structured brief is created; `garment_type`, `color`, `fit`, and `style` become candidate or confirmed fields.
2. Designer says: “Use the soft cotton weave sample from our library.”
   Expected: a local material is matched and its source and license are shown.
3. Client uploads a collar photo and says: “Only use the collar from this image, not its color.”
   Expected: the image is previewed and bound to `collar`; color is explicitly excluded from the binding.
4. Client says: “Make the collar smaller, add a little pattern to the cuff, and keep everything else unchanged.”
   Expected: a change patch is created with `collar` and `sleeve/pattern` changes and explicit preserve fields.
5. The system generates V2.
   Expected: V1 remains available; V2 shows its input revision, references, changed fields, and workflow status.
6. Designer opens the version and workflow details.
   Expected: the designer can inspect inputs, sources, node state, and the difference between V1 and V2.
7. Designer exports the proposal.
   Expected: the package contains the concept image, structured brief, source list, version summary, and a clear “concept design / not production technical documentation” label.

## Current Code Alignment

### Already aligned

- Client switching and project-like workspace state.
- Local CC0 material entries and reference image entries.
- A three-area workbench with activity, workflow, and result surfaces.
- Prompt editing and a visible multi-node generation flow.
- V1/V2 presentation and a simulated generation sequence.
- FastAPI endpoints for health, clients, materials, references, workflow, runs, events, and image proxying.
- MemoryStore fallback and local demo assets.

### Partially aligned or simulated

- Real-time meeting input is represented by simulated speech rather than production ASR.
- The brief is mainly represented through prompt text and UI state, rather than a first-class revisioned brief.
- Reference `usage` exists, but binding to garment attributes is not yet the primary interaction.
- V1/V2 state exists, but constrained patches, stale results, and downstream invalidation need verification.
- Export is represented in the interface but must be verified as a real downloadable package.

### Not yet aligned

- Automatic generation after stable intent without requiring a normal “run node” action.
- Explicit confirmed, tentative, conflict, and missing brief states.
- Per-field provenance from transcript segment to brief patch to artifact version.
- Preservation constraints for local edits.
- Real upload validation and EXIF removal.
- Meeting consent, reconnect behavior, and failure/retry acceptance.
- Complete proposal export with all required files and non-production labeling.

## Product Decisions for the Next Phase

1. Treat the structured fashion brief as the central product object.
2. Treat reference-purpose binding as a first-class action.
3. Keep manual node execution for retry, override, and debugging only.
4. Implement one reliable V1-to-V2 constrained-edit path before adding more canvas features.
5. Keep production pattern-making, supplier truth, pricing, inventory, and precise 3D simulation out of the MVP.

## Verification Order

The next implementation and test order is:

1. Brief schema and visible brief revision.
2. Reference-purpose binding and correction.
3. Constrained V1-to-V2 patch flow.
4. Automatic trigger after stable intent.
5. Real export package.
6. Failure, stale-task, and recovery behavior.

