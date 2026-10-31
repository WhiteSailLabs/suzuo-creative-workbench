# Image-to-3D Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an immutable 2D design version the default, auditable input to Rodin while preserving an explicit text-only fallback.

**Architecture:** Extend the existing DesignVersion → GenerationJob → Artifact handoff rather than introducing another workflow. The store freezes up to five image artifacts into a Rodin reference snapshot; the provider passes those local paths to the existing Hyper3D CLI adapter; the frontend exposes provenance and consistency state.

**Tech Stack:** Python 3.9, FastAPI, React 19, TypeScript, Hyper3D CLI, Vitest, unittest

**Spec:** `docs/superpowers/specs/2026-10-31-image-to-3d-consistency-design.md`

## Global Constraints

- Default Rodin mode is `image`; text generation requires explicit `input_mode=text`.
- One to five non-empty image artifacts from the same immutable version may be sent.
- Credentials remain in the existing OAuth session; no token or API key enters project files or browser payloads.
- GLB remains a concept model and must retain the non-CAD disclaimer.
- Preserve all existing user changes in the dirty main worktree; do not make automatic commits.

## Review Focus

- A version with no local image path must fail before external submission and must not create an empty model artifact.
- More than five images must deterministically select the documented first five view labels.
- Image mode must not silently include the old creative text prompt and change the locked shape.
- Retried Rodin jobs must retain the original reference snapshot rather than pick up later references.
- A late Image-to-3D result must attach to its original version and be marked stale.

---

### Task 1: Freeze the 2D-to-3D handoff in the domain model

**Files:**
- Modify: `services/api/app/schemas.py`
- Modify: `services/api/app/store.py`
- Modify: `services/api/test_cultural_workbench.py`

**Interfaces:**
- Produces: `create_rodin_job(project_id, payload)` with `input_mode`, `reference_artifact_ids`, `reference_snapshot`, and `consistency_status`.
- Consumes: image artifacts already attached to one `DesignVersion`.

- [ ] Write failing tests for default image mode, missing-image rejection, deterministic five-view selection, and retry snapshot preservation.
- [ ] Run the focused lifecycle tests and verify the new assertions fail for missing fields/behavior.
- [ ] Add `RodinJobCreate.input_mode: Literal["image", "text"] = "image"` and optional short `prompt`.
- [ ] Implement snapshot creation and explicit text fallback in `MemoryStore`.
- [ ] Run focused and complete backend suites.

### Task 2: Send reference images through the Rodin adapter

**Files:**
- Modify: `services/api/app/providers/rodin.py`
- Modify: `services/api/test_rodin_provider.py`
- Modify: `scripts/rodin-generate.mjs`

**Interfaces:**
- Consumes: `RodinProvider.generate(prompt, output_dir, image_paths=...)`.
- Produces: existing validated `RodinResult` with the same download and GLB checks.

- [ ] Write failing provider tests asserting repeated `--image` arguments and omission of `--prompt` in image mode; keep a text-mode compatibility test.
- [ ] Run tests and verify RED.
- [ ] Extend provider signature and command construction with path validation and a maximum of five images.
- [ ] Extend the script argument parser while preserving positional prompt compatibility.
- [ ] Run focused and complete backend suites.

### Task 3: Orchestrate image mode and persist model provenance

**Files:**
- Modify: `services/api/app/main.py`
- Modify: `services/api/app/store.py`
- Modify: `services/api/test_cultural_workbench.py`

**Interfaces:**
- Consumes: Task 1 snapshot and Task 2 `image_paths` provider argument.
- Produces: model artifact fields `input_mode`, `reference_artifact_ids`, `consistency_status`.

- [ ] Write a failing API/orchestration test proving image paths are forwarded and provenance is attached.
- [ ] Run the test and verify RED.
- [ ] Pass frozen paths to the provider and copy provenance to the GLB artifact.
- [ ] Ensure retry and stale completion preserve provenance.
- [ ] Run the full backend suite.

### Task 4: Expose provenance and readiness in the workbench

**Files:**
- Modify: `src/types/workbench.ts`
- Modify: `src/components/DesignCanvas.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: model artifact/job provenance fields from Task 3.
- Produces: user-visible “由二维图生成 / 文字降级”、reference count, and “待一致性检查”.

- [ ] Write failing component tests for image-derived and text-fallback labels.
- [ ] Run Vitest and verify RED.
- [ ] Render provenance next to the 3D disclaimer without exposing local paths.
- [ ] Keep the generate action unavailable when the selected version has no image artifact.
- [ ] Run frontend tests, build, and lint.

### Task 5: Real provider verification

**Files:**
- Modify: `docs/verification/2026-10-30-cultural-workbench-mvp.md`
- Modify: `docs/rodin-integration.md`

**Interfaces:**
- Consumes: the newly generated verified 2D PNG and the complete Image-to-3D flow.
- Produces: a real generation ID, validated GLB, and Chrome evidence showing image-derived provenance.

- [ ] Start the backend with existing secure credential/OAuth handling and current frontend.
- [ ] Create or import a version using the verified 1536×1024 PNG.
- [ ] Submit Rodin in default image mode and poll the exact job ID.
- [ ] Validate the downloaded GLB is non-empty and begins with `glTF`.
- [ ] Verify local Google Chrome renders the model and provenance label.
- [ ] Record exact non-secret evidence and run all backend/frontend/build/lint commands.

## Self-Review Result

- Spec coverage: tasks cover immutable reference selection, default Image-to-3D, explicit text fallback, provenance, retry/stale behavior, UI visibility, and real-provider verification. Automated reprojection scoring remains the next planned phase, with its schema state reserved here rather than faked.
- Type consistency: `input_mode`, `reference_artifact_ids`, `reference_snapshot`, and `consistency_status` retain the same names from store through schema, provider orchestration, artifact, and frontend.
- Scope ruling: P0 proves the real image-conditioned handoff and auditable consistency source. It does not claim automated silhouette scoring before a calibrated renderer/camera contract exists.
