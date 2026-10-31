# Connected Demo Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing chat, 2D generation, and Rodin 3D capabilities into one stateful demo flow whose later outputs are explicitly derived from earlier approved work.

**Architecture:** Keep the existing React/FastAPI/MemoryStore architecture. Add server-side stage transitions and candidate gates as the source of truth, then make the React canvas expose only the valid next action. Preserve immutable version and artifact provenance so every 3D result points to the locked 2D candidate used to create it.

**Tech Stack:** React 19, TypeScript, Vitest, FastAPI, Python unittest, OpenAI-compatible image API, Hyper3D Rodin.

**Spec:** `docs/superpowers/specs/2026-10-30-suzhou-cultural-workbench-prd.md`

## Global Constraints

- The primary interaction stays conversational; no questionnaire or node editor.
- 3D generation requires a locked 2D candidate and uses that candidate's image artifact.
- Generated 3D is a textured concept model, not production CAD.
- Existing user changes and generated assets must be preserved.
- Local refinement and masks are outside this increment.

## Review Focus

- A non-candidate version must not start Rodin generation.
- Candidate selection must advance the project without changing immutable artifacts.
- Failed or stale jobs must not silently advance the stage.
- A completed 3D job must remain attached to the exact candidate version and frozen reference image.
- The frontend must not use stale workspace state when choosing a parent version after chat interpretation.

---

### Task 1: Server-side workflow gates

**Files:**
- Modify: `services/api/app/store.py`
- Test: `services/api/test_cultural_workbench.py`

**Interfaces:**
- Consumes: existing `transition_stage(workspace, stage, status, reason)` and immutable job/version records.
- Produces: enforced chat → 2D review → candidate → 3D review transitions in `MemoryStore`.

- [x] Add failing lifecycle tests for image stage transitions, candidate-only Rodin submission, and Rodin completion returning to review.
- [x] Run the focused backend tests and confirm the new assertions fail.
- [x] Add the minimal transitions and candidate validation to `MemoryStore`.
- [x] Run all backend tests and confirm they pass.

### Task 2: Progressive canvas interaction

**Files:**
- Modify: `src/components/DesignCanvas.tsx`
- Modify: `src/components/DesignCanvas.test.tsx`
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `project.candidate_version_id`, version image/model artifacts, interpreted turn id.
- Produces: a single next-action path where 3D is unavailable until the displayed 2D version is locked.

- [x] Add failing component tests for the locked-candidate gate and progressive guidance.
- [x] Run the focused frontend tests and confirm the new assertions fail.
- [x] Implement the candidate gate, next-step copy, automatic model-tab transition after locking, and remove stale parent lookup after chat submission.
- [x] Run all frontend tests and confirm they pass.

### Task 3: Current image model and end-to-end verification

**Files:**
- Modify: `services/api/app/config.py`
- Modify: `scripts/image-generate.mjs`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `README_BACKEND.md`
- Modify: `docs/image-generation-integration.md`

**Interfaces:**
- Consumes: securely injected compatible API credential and existing Rodin OAuth session.
- Produces: one verified real chat → image → candidate → textured GLB run using `gpt-image-2`.

- [x] Change the default compatible image model from retired `gpt-image-1` to `gpt-image-2` in runtime configuration and documentation.
- [x] Run backend tests, frontend tests, build, and lint.
- [x] Restart the local backend with text, image, and Rodin providers configured through secure credential injection.
- [x] Use local Google Chrome to run one complete user journey and verify provenance, stage progression, image rendering, and textured model rendering.
- [x] Record any remaining external-provider or in-memory persistence risk in the handoff.

