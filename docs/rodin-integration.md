# Rodin Integration

## Authentication

The repository does not store a Rodin API key. The reusable script uses the Hyper3D CLI OAuth session.

```bash
npm install --global @hyper3d/cli
hyper3d auth login
hyper3d auth status
```

The current Codex configuration already contains the MCP server named `hyper3d` at `https://api.hyper3d.com/api/mcp`. OAuth authorization completed successfully in the browser, so no other MCP settings were changed.

## Generate a model from a 2D concept

The workbench defaults to Image-to-3D. One to five images can be supplied; repeated `--image` arguments keep the references separate and no text prompt is injected in image mode.

```bash
npm run rodin:generate -- \
  --image /absolute/path/front.png \
  --image /absolute/path/side.png
```

When the workbench creates a Rodin job it freezes the selected version's image artifact IDs, local paths, media types, and view labels into `reference_snapshot`. Retries reuse this same snapshot, so later image versions cannot silently change an existing job's input. The completed GLB stores `input_mode`, `reference_artifact_ids`, and `consistency_status` for frontend provenance.

## Explicit text fallback

```bash
npm run rodin:generate -- "A small modern Suzhou garden window inspired desk ornament, matte ceramic, white and dark gray"
```

Text-to-3D remains an explicit fallback, not the workbench default. The script polls until completion, downloads the returned files, and writes them to `outputs/rodin/`. It defaults to `Gen-2.5-Extreme-Low` and GLB to keep the first integration inexpensive.

Useful environment overrides:

```bash
RODIN_TIER=Gen-2.5-Medium
RODIN_FORMAT=glb
RODIN_TIMEOUT=600
RODIN_OUTPUT_DIR=outputs/rodin
```

The generated asset is a concept model for review and presentation. It is not a production CAD or manufacturing model.

The workbench backend wraps the script with an argument-array subprocess and validates that every returned `.glb` stays below `RODIN_OUTPUT_DIR`, is non-empty, and begins with the binary glTF magic `glTF`. The model is attached to the existing immutable design version; Rodin never creates a duplicate version. Failed jobs can be retried from the same tracked job history.

## Verified Image-to-3D evidence

- Rodin job: `job_rodin_525bee3608`
- Generation ID: `98e81c29-eb34-40ea-af09-f2935bc0399a`
- Reference count: 1 frozen PNG
- Output: `outputs/rodin/98e81c29-eb34-40ea-af09-f2935bc0399a-base_basic_pbr.glb`
- Validation: 22,065,588 bytes, glTF 2 binary, magic bytes `67 6c 54 46`
- Chrome: Three.js canvas rendered successfully and showed image-derived provenance with no viewer error.

This provenance guarantees which 2D artifact conditioned the Rodin request. It does not yet claim automatic silhouette or geometry equivalence; the current `pending` consistency state is intentional.

## PBR delivery requirement

For Image-to-3D jobs, the provider now requires and prioritizes Rodin's `_pbr.glb` asset. A shaded-only result is rejected instead of being attached to a design version as a finished model. The viewer then verifies that the loaded scene contains real texture maps before rendering it as the final 3D result.

Verified generation `2d9fa760-bb9f-4417-8eaa-ce155bd3ff62` returned a 21,813,096-byte PBR GLB containing diffuse, normal, and packed metallic/roughness textures. Local Chrome rendered the asset with sRGB texture color, ACES tone mapping, studio environment lighting, and the visible status “PBR 材质已加载 · 3 张贴图”.
