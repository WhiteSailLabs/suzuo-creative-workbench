# 苏作创意台 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing fashion workbench with a new Suzhou cultural-creative workspace whose real end-to-end path is conversation → Brief → 2D image → Rodin 3D → version review → proposal.

**Architecture:** Keep the existing React/Vite and FastAPI foundations, but replace all fashion-domain UI and seed data. FastAPI owns project state, cultural grounding, immutable versions, image jobs, Rodin jobs, and proposal output; React consumes those APIs and never receives provider credentials. Image and Rodin providers remain replaceable adapters, with real-provider verification performed separately from deterministic unit tests.

**Tech Stack:** React 19, TypeScript, Vite, Three.js via `@react-three/fiber`/`@react-three/drei`, FastAPI, Pydantic, httpx, Python unittest, Vitest/Testing Library, Chrome E2E.

**Spec:** `docs/superpowers/specs/2026-10-30-suzhou-cultural-workbench-prd.md`

## Global Constraints

- Replace the fashion workbench rather than preserving fashion navigation, material cards, collar examples, or garment copy.
- Keep the current repository and reusable provider infrastructure; do not delete existing generated outputs or credentials.
- MVP is single-user, local, Simplified Chinese, desktop Chrome.
- Voice is primary and editable text is the fallback; original audio is not persisted by default.
- Culture entries are exactly one of `fact`, `translation`, `generated`, `to_verify`.
- Every generation is traceable to a conversation turn, Brief revision, prompt, provider job, and immutable design version.
- Image generation uses an image-capable model; text reasoning and image generation models remain separate.
- Rodin output is a concept GLB and must be labeled as not production CAD.
- Provider credentials remain server-side and must not be written to source, logs, artifacts, or proposals.
- Old or stale jobs may never replace the selected candidate version.
- All file edits use `apply_patch`; preserve unrelated user changes.

## Review Focus

- A stale image or Rodin job completing late must be retained as history and must not replace the current candidate; pinned by Task 4 and Task 5 tests.
- A voice correction such as “只改镂空，保留底座” must produce explicit `changes`, `preserve`, and `constraints`; pinned by Task 2 tests.
- Unverified cultural claims must not enter the customer proposal as facts; pinned by Task 3 and Task 7 tests.
- Provider failure or empty output must remain visible and retryable without creating an empty version; pinned by Task 4 and Task 5 tests.
- Chrome without speech recognition permission must retain the complete text-input flow; pinned by Task 6 component tests and Task 9 E2E.

---

## File Structure

### Backend domain

- `services/api/app/cultural_workbench.py`: domain constants, seed project, stage transitions, Brief revisions, cultural entries, conversation turns, versions, and proposal projection.
- `services/api/app/intent.py`: deterministic intent/Patch interpreter plus optional OpenAI-compatible structured-output adapter.
- `services/api/app/providers/rodin.py`: Rodin CLI adapter, subprocess boundary, result validation, and GLB file metadata.
- `services/api/app/schemas.py`: request/response schemas for workspace, conversation, culture, versions, image jobs, Rodin jobs, and proposal.
- `services/api/app/store.py`: MemoryStore persistence of the new domain and job lifecycle; remove fashion seeds and workflows.
- `services/api/app/main.py`: REST/SSE routes and static asset responses for the new workbench.
- `services/api/app/config.py`: text-provider, image-provider, Rodin, and output-directory settings.

### Frontend

- `src/types/workbench.ts`: shared frontend data types.
- `src/lib/api.ts`: typed FastAPI client.
- `src/hooks/useSpeechInput.ts`: Chrome speech recognition with editable text fallback.
- `src/components/StageRail.tsx`: project stages and gates.
- `src/components/ConversationPanel.tsx`: transcript, AI restatement, intent, Patch, and microphone input.
- `src/components/DesignCanvas.tsx`: 2D/3D tabs, loading/failure states, and version comparison.
- `src/components/ModelViewer.tsx`: GLB rendering and camera controls.
- `src/components/DesignTruthPanel.tsx`: confirmed/assumption/to-verify fields and cultural provenance.
- `src/components/VersionTimeline.tsx`: immutable version selection and differences.
- `src/components/ProposalView.tsx`: customer-safe proposal preview/export.
- `src/App.tsx`: project orchestration only; replace the fashion UI completely.
- `src/App.css`, `src/index.css`: new visual system and responsive desktop layout.

### Tests

- `services/api/test_cultural_workbench.py`: domain and API behavior.
- `services/api/test_image_provider.py`: real response normalization through mocked HTTP.
- `services/api/test_rodin_provider.py`: CLI lifecycle and invalid/missing GLB behavior.
- `src/components/ConversationPanel.test.tsx`: voice fallback and Patch presentation.
- `src/components/DesignCanvas.test.tsx`: image/3D job states and stale results.
- `src/App.test.tsx`: primary project journey with mocked API.
- `e2e/cultural-workbench.spec.ts`: Chrome end-to-end happy path and recovery path.

---

### Task 1: Replace fashion domain with the cultural-workbench project model

**Files:**
- Create: `services/api/app/cultural_workbench.py`
- Modify: `services/api/app/schemas.py`
- Modify: `services/api/app/store.py`
- Modify: `services/api/app/main.py`
- Create: `services/api/test_cultural_workbench.py`

**Interfaces:**
- Produces: `GET /api/workbench/projects/{project_id}` returning `WorkspaceOut`.
- Produces: `ProjectState`, `BriefRevision`, `CulturalReference`, `DesignVersion`, `GenerationJob`, `StageGate` Pydantic models.
- Produces: seeded project ID `prj_suzhou_incense` with no fashion fields or copy.

- [ ] **Step 1: Write failing domain/API tests**

Add tests named `test_seed_workspace_contains_only_cultural_product_domain`, `test_brief_revision_is_immutable`, `test_stage_can_return_from_review_to_concept`, and `test_unknown_project_is_404`. Assert the seed product is `桌面香插`, stage is `capturing`, cultural types use the four allowed values, and serialized output contains none of `garment_type`, `collar`, `fabric_reference`, `服装`, `面料`, or `领口`.

- [ ] **Step 2: Run the tests and verify failure**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services.api.test_cultural_workbench -v`

Expected: FAIL because the cultural-workbench module/routes do not exist.

- [ ] **Step 3: Implement the new domain and seed**

Create focused dataclasses/helpers in `cultural_workbench.py`; update schemas and MemoryStore with `workspace_for_project(project_id: str) -> dict[str, Any]`, `append_brief_revision(...)`, and `transition_stage(...)`. Remove fashion seed creation from the default startup path while leaving generic legacy endpoints temporarily callable until Task 8 cleanup.

- [ ] **Step 4: Add the workspace route and pass tests**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services.api.test_cultural_workbench -v`

Expected: all Task 1 tests PASS.

- [ ] **Step 5: Commit scoped files**

`git add services/api/app/cultural_workbench.py services/api/app/schemas.py services/api/app/store.py services/api/app/main.py services/api/test_cultural_workbench.py && git commit -m "feat: add cultural workbench domain"`

### Task 2: Add conversation interpretation, Brief revision, and controlled Patch behavior

**Files:**
- Create: `services/api/app/intent.py`
- Modify: `services/api/app/config.py`
- Modify: `services/api/app/schemas.py`
- Modify: `services/api/app/store.py`
- Modify: `services/api/app/main.py`
- Modify: `services/api/test_cultural_workbench.py`

**Interfaces:**
- Consumes: `append_brief_revision` from Task 1.
- Produces: `POST /api/workbench/projects/{project_id}/turns` with `ConversationTurnCreate`.
- Produces: `interpret_turn(text: str, workspace: dict[str, Any]) -> InterpretedTurn`.
- Produces: `InterpretedTurn.intent` in `DISCUSS|GENERATE|MODIFY|CONFIRM|EXPORT` and `change_patch` with `changes`, `preserve`, `constraints`.

- [ ] **Step 1: Write failing interpreter tests**

Add `test_initial_idea_creates_restatement_and_brief_revision`, `test_modify_turn_extracts_change_preserve_constraint`, `test_discuss_only_does_not_create_job`, and `test_corrected_transcript_keeps_original_turn_history`.

- [ ] **Step 2: Verify failure**

Run the four tests with unittest `-v`; expect missing `intent.py` or route failures.

- [ ] **Step 3: Implement deterministic MVP interpreter**

Implement explicit handling for the acceptance phrases in the PRD, including `镂空简单`, `底座更稳`, `保留漏景`, `不要太传统`, `只是讨论`, and generation/export verbs. Unknown values remain assumptions or `to_verify`; they do not block low-risk progress.

- [ ] **Step 4: Add optional text-provider adapter**

Add `TEXT_API_BASE_URL`, `TEXT_API_KEY`, `TEXT_MODEL` settings and a structured JSON request adapter. Provider failure falls back to deterministic interpretation and records `interpreter_mode="fallback"`; never expose the key.

- [ ] **Step 5: Add the conversation route and pass tests**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services.api.test_cultural_workbench -v`

Expected: Task 1–2 tests PASS.

- [ ] **Step 6: Commit scoped files**

`git add services/api/app/intent.py services/api/app/config.py services/api/app/schemas.py services/api/app/store.py services/api/app/main.py services/api/test_cultural_workbench.py && git commit -m "feat: interpret cultural design conversations"`

### Task 3: Add cultural grounding and customer-safe provenance

**Files:**
- Modify: `services/api/app/cultural_workbench.py`
- Modify: `services/api/app/schemas.py`
- Modify: `services/api/app/store.py`
- Modify: `services/api/app/main.py`
- Modify: `services/api/test_cultural_workbench.py`

**Interfaces:**
- Produces: `GET/POST/PATCH /api/workbench/projects/{project_id}/culture`.
- Produces: `CulturalReference.kind` exactly `fact|translation|generated|to_verify`.
- Produces: `customer_safe_culture(project_id: str) -> list[dict[str, Any]]` excluding unverified fact claims.

- [ ] **Step 1: Write failing culture/provenance tests**

Test allowed-kind validation, source requirement for `fact`, manual downgrade from `fact` to `to_verify`, and exclusion of `generated`/`to_verify` claims from the proposal fact section.

- [ ] **Step 2: Verify failure**

Run the named tests; expect missing culture routes or validation.

- [ ] **Step 3: Implement seed grounding and CRUD**

Seed `漏景`, `框景`, `借景`, `层次`, and `留白` as a small curated dataset; include source title/URL/note fields and a separate design-translation statement.

- [ ] **Step 4: Pass culture tests**

Run the complete backend test suite; expect all tests PASS.

- [ ] **Step 5: Commit scoped files**

`git add services/api/app/cultural_workbench.py services/api/app/schemas.py services/api/app/store.py services/api/app/main.py services/api/test_cultural_workbench.py && git commit -m "feat: add traceable cultural grounding"`

### Task 4: Integrate real image generation as a tracked design-version job

**Files:**
- Modify: `services/api/app/providers/image.py`
- Modify: `services/api/app/config.py`
- Modify: `services/api/app/schemas.py`
- Modify: `services/api/app/store.py`
- Modify: `services/api/app/main.py`
- Create: `services/api/test_image_provider.py`
- Modify: `services/api/test_cultural_workbench.py`
- Modify: `.env.example`

**Interfaces:**
- Produces: `POST /api/workbench/projects/{project_id}/image-jobs`.
- Produces: `GET /api/workbench/projects/{project_id}/jobs/{job_id}`.
- Produces: `GET /api/workbench/projects/{project_id}/versions`.
- Produces: job states `submitted|processing|completed|failed|stale`.
- Produces: immutable `DesignVersion` only when a non-empty image artifact is saved.

- [ ] **Step 1: Write failing provider and lifecycle tests**

Test URL, `b64_json`, and data-URL normalization; empty output; HTTP failure; retry; V1 creation; V2 parent link; and stale completion not replacing `candidate_version_id`.

- [ ] **Step 2: Verify failure**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services.api.test_image_provider services.api.test_cultural_workbench -v`

Expected: new route/lifecycle tests FAIL.

- [ ] **Step 3: Implement image job lifecycle**

Use the existing `OpenAICompatibleImageProvider`, but default `IMAGE_MODEL` to `gpt-image-1`. Compose the prompt from current Brief, cultural translations, Patch, and preservation constraints. Store image files under `outputs/images/` or inline storage without exposing credentials.

- [ ] **Step 4: Implement immutable version creation and stale protection**

Set `parent_version_id`, `changed_fields`, `preserved_fields`, `source_turn_id`, `brief_revision`, and artifact metadata. Candidate selection is explicit after V1; stale jobs never auto-select.

- [ ] **Step 5: Pass all backend tests**

Run the complete unittest discovery command; expect zero failures.

- [ ] **Step 6: Perform real provider smoke test securely**

Run the backend or existing script through `/Users/Admin/.codex/skills/private-credentials/scripts/with-secret` using the Keychain mapping, then create one image job with the acceptance prompt. Verify a non-empty PNG exists and is decodable; do not print the key.

- [ ] **Step 7: Commit scoped files**

Commit only the provider, API, tests, and `.env.example`; do not add generated images.

### Task 5: Integrate Rodin as an asynchronous GLB job and serve the model safely

**Files:**
- Create: `services/api/app/providers/rodin.py`
- Modify: `services/api/app/config.py`
- Modify: `services/api/app/schemas.py`
- Modify: `services/api/app/store.py`
- Modify: `services/api/app/main.py`
- Create: `services/api/test_rodin_provider.py`
- Modify: `services/api/test_cultural_workbench.py`
- Modify: `scripts/rodin-generate.mjs`
- Modify: `.env.example`

**Interfaces:**
- Produces: `POST /api/workbench/projects/{project_id}/rodin-jobs` with `version_id`.
- Produces: `RodinProvider.generate(prompt: str, output_dir: Path) -> RodinResult`.
- Produces: `GET /api/workbench/assets/{artifact_id}` returning only validated files below configured output roots.
- Attaches GLB artifacts to an existing `DesignVersion`; does not create duplicate versions.

- [ ] **Step 1: Write failing Rodin adapter tests**

Test `submitted → processing → completed`, CLI nonzero exit, invalid JSON, completed-without-GLB, retry, path traversal rejection, and late stale job behavior.

- [ ] **Step 2: Verify failure**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services.api.test_rodin_provider services.api.test_cultural_workbench -v`

Expected: FAIL because the adapter/routes do not exist.

- [ ] **Step 3: Implement the adapter and routes**

Wrap the existing Node script with `asyncio.create_subprocess_exec`; use argument arrays rather than shell commands. Capture JSON stdout, map stderr to a safe error message, validate `.glb` output paths, and preserve `generation_id`.

- [ ] **Step 4: Attach GLB to versions and pass tests**

The Rodin prompt must derive from the selected version's Brief and cultural translations. Attach `concept_model` disclaimer metadata and never treat the asset as production CAD.

- [ ] **Step 5: Perform real Rodin smoke test**

Submit the acceptance prompt through the API, poll the exact job handle until terminal, download the returned GLB, and verify the file starts with the binary glTF magic `glTF` and has nonzero size.

- [ ] **Step 6: Commit scoped files**

Commit provider/API/tests/script changes; do not add generated GLB files.

### Task 6: Build the new voice-first three-column workbench UI

**Files:**
- Create: `src/types/workbench.ts`
- Create: `src/lib/api.ts`
- Create: `src/hooks/useSpeechInput.ts`
- Create: `src/components/StageRail.tsx`
- Create: `src/components/ConversationPanel.tsx`
- Create: `src/components/DesignTruthPanel.tsx`
- Create: `src/components/VersionTimeline.tsx`
- Replace: `src/App.tsx`
- Replace: `src/App.css`
- Modify: `src/index.css`
- Modify: `package.json`
- Create: `src/components/ConversationPanel.test.tsx`
- Create: `src/App.test.tsx`

**Interfaces:**
- Consumes: workspace/turn/culture/version/job routes from Tasks 1–5.
- Produces: UI states `listening|transcribing|interpreting|generating_2d|generating_3d|ready|failed`.
- Produces: text fallback with the same submit path as recognized speech.

- [ ] **Step 1: Add Vitest/Testing Library and write failing UI tests**

Test initial cultural workspace copy, absence of fashion terminology, microphone-unavailable text flow, visible AI restatement, Patch sections, confirmed/assumption/to-verify groups, and recoverable offline state.

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run`

Expected: FAIL because the new components do not exist.

- [ ] **Step 3: Implement types, API client, and speech hook**

`useSpeechInput` must feature-detect Chrome recognition, expose `supported`, `state`, `transcript`, `start`, `stop`, and `reset`, and never block text input.

- [ ] **Step 4: Replace the fashion UI**

Create the stage rail, left conversation panel, central design canvas placeholder, right truth panel, and bottom voice composer. Remove all fashion/material/collar/client-switcher code and copy from `App.tsx` and rendered UI.

- [ ] **Step 5: Pass component tests and build**

Run: `npm test -- --run && npm run build && npm run lint`

Expected: all exit 0.

- [ ] **Step 6: Commit scoped files**

Commit the new frontend structure and dependency lock changes.

### Task 7: Add 2D/3D canvas, version comparison, and proposal export

**Files:**
- Create: `src/components/DesignCanvas.tsx`
- Create: `src/components/ModelViewer.tsx`
- Create: `src/components/ProposalView.tsx`
- Create: `src/components/DesignCanvas.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/lib/api.ts`
- Modify: `package.json`
- Modify: `services/api/app/cultural_workbench.py`
- Modify: `services/api/app/schemas.py`
- Modify: `services/api/app/store.py`
- Modify: `services/api/app/main.py`
- Modify: `services/api/test_cultural_workbench.py`

**Interfaces:**
- Consumes: image/Rodin jobs and immutable versions.
- Produces: 2D/3D tabs, GLB camera controls, V1/V2 comparison, explicit candidate lock.
- Produces: `GET /api/workbench/projects/{project_id}/proposal` and printable single-page HTML.

- [ ] **Step 1: Write failing canvas/proposal tests**

Test image loading/error, GLB loading/error, concept-model disclaimer, V1/V2 changed/preserved fields, candidate lock, unverified-culture exclusion, and internal-note exclusion.

- [ ] **Step 2: Verify failure**

Run frontend and backend named tests; expect missing components/routes.

- [ ] **Step 3: Add Three.js viewer and version comparison**

Install `three`, `@react-three/fiber`, `@react-three/drei`, and required types. Keep provider names in technical details only, not primary UI.

- [ ] **Step 4: Implement customer-safe proposal projection**

Generate proposal data only from the selected candidate, confirmed Brief fields, sourced culture facts, design translations, chosen assets, risks, and mandatory concept-design disclaimer.

- [ ] **Step 5: Pass tests/build/lint**

Run backend unittest discovery and frontend test/build/lint; expect all exit 0.

- [ ] **Step 6: Commit scoped files**

Commit canvas, proposal, API, tests, and lockfile changes.

### Task 8: Remove remaining fashion workflow surface and update operations documentation

**Files:**
- Modify: `services/api/app/store.py`
- Modify: `services/api/app/main.py`
- Modify: `services/api/app/schemas.py`
- Modify: `README.md`
- Modify: `README_BACKEND.md`
- Modify: `docs/image-generation-integration.md`
- Modify: `docs/rodin-integration.md`
- Modify: `.gitignore`
- Modify: `services/api/test_cultural_workbench.py`

**Interfaces:**
- Removes: fashion seed, garment workflow, material/collar demo from the default application path.
- Documents: secure local startup, image model separation, Rodin OAuth prerequisite, output locations, and retry behavior.

- [ ] **Step 1: Add a repository-level fashion-surface regression test**

Assert default workspace API and built frontend assets contain none of the prohibited fashion terms. Do not scan historical PRD/spec files because they intentionally document the pivot.

- [ ] **Step 2: Remove obsolete runtime paths**

Delete or disconnect fashion-only endpoints/data only after the new frontend has no consumers. Preserve generic client, storage, image, event, and database utilities if still used.

- [ ] **Step 3: Update documentation and ignores**

Ignore `.venv/` and `outputs/`; document that credentials stay in Keychain/env and generated assets are local/network-uploaded according to the provider flow.

- [ ] **Step 4: Run complete static verification**

Run `rg` over runtime source, build output, and API seed for prohibited fashion terms; run backend tests, frontend tests, build, and lint.

- [ ] **Step 5: Commit scoped files**

Commit runtime cleanup and docs; never add `.venv/` or generated outputs.

### Task 9: Verify the complete Chrome journey with real image and Rodin providers

**Files:**
- Create: `e2e/cultural-workbench.spec.ts`
- Modify: `package.json`
- Create: `docs/verification/2026-10-30-cultural-workbench-mvp.md`

**Interfaces:**
- Consumes: all P0 routes and UI.
- Produces: evidence for PRD gates G1–G8.

- [ ] **Step 1: Write the E2E happy path**

Automate in local Google Chrome: submit “我想做一个年轻人用的苏州园林香插，不要太传统”, verify Brief/cultural grounding, generate real 2D, generate real Rodin 3D, submit “保留漏景，镂空简单一点，底座更稳”, verify V2 diff, lock candidate, and open proposal.

- [ ] **Step 2: Write the recovery path**

Verify text fallback when microphone permission is unavailable and visible recovery after a mocked failed job. Never fake the final real-provider happy path.

- [ ] **Step 3: Run unit/static verification**

Run:

```bash
PYTHONPATH=services/api .venv/bin/python -m unittest discover -s services/api -p 'test_*.py' -v
npm test -- --run
npm run build
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 4: Run the real-provider E2E in local Chrome**

Start FastAPI with credentials injected securely, start Vite, and execute the complete user journey in the user's local Google Chrome. Poll exact job IDs; do not restart on observation timeout.

- [ ] **Step 5: Validate generated media**

Verify the image is a decodable non-empty PNG/JPEG and the model is a non-empty binary GLB with `glTF` magic. Capture artifact paths and job IDs without credentials.

- [ ] **Step 6: Record the G1–G8 evidence**

Write commands, timestamps, job IDs, artifact paths, screenshots, and pass/fail status to the verification document. Any unproven gate remains incomplete.

- [ ] **Step 7: Final scoped commit**

Commit E2E code and verification documentation, excluding generated media and secrets.

---

## Self-Review Result

- **Spec coverage:** Tasks 1–9 cover project state, voice/text conversation, Brief, cultural provenance, real 2D, real Rodin 3D, immutable versions, review, proposal, recovery, and G1–G8 verification. P1/P2 collaboration and production features remain intentionally out of scope.
- **Step scan:** Each task has a failing-test step, implementation boundary, passing verification, and scoped commit. Provider smoke tests are separate from deterministic tests.
- **Type consistency:** `project_id`, `turn_id`, `brief_revision`, `version_id`, `job_id`, `artifact_id`, `parent_version_id`, and `candidate_version_id` remain consistent across backend and frontend.
- **Review focus coverage:** Stale jobs, constrained changes, cultural safety, provider failure, and microphone fallback are each assigned to named tests.
- **Proportion:** The plan specifies interfaces and test evidence without transcribing implementation bodies.
