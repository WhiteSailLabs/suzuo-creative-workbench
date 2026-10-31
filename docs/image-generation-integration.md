# Image Generation Integration

The reusable image script targets the OpenAI-compatible image endpoints and keeps the API key in the macOS Keychain mapping `chengying-image-api-key`. The key is injected only into the child process and is never written to the repository.

`gpt-5.6-sol` is a text/reasoning model and cannot be sent to `/v1/images/*`. The script defaults to the image-capable `gpt-image-2`; override it with `IMAGE_MODEL` if the provider exposes another image model.

## Text to image

```bash
npm run image:generate -- --prompt "A modern Suzhou garden inspired desk ornament, matte ceramic, restrained geometry"
```

## Image edit

```bash
npm run image:generate -- --edit --image /absolute/path/reference.png --prompt "Make the hollow pattern simpler while preserving the overall silhouette"
```

Results are written to `outputs/images/`. Override `CHENGYING_BASE_URL`, `IMAGE_MODEL`, `IMAGE_SIZE`, `IMAGE_QUALITY`, or `IMAGE_OUTPUT_DIR` when needed. The default values are the configured OpenAI-compatible v1 endpoint and `gpt-image-2`.

The workbench backend creates tracked jobs at `POST /api/workbench/projects/{project_id}/image-jobs`. It records the exact Brief revision and source turn, saves a non-empty result before creating a version, and marks late results as `stale`. A failed or empty response stays retryable and does not create an empty design version.

## Import recovery

If the external image provider is unavailable, an already generated or designer-owned PNG, JPEG, or WebP can enter the same version flow through `POST /api/workbench/projects/{project_id}/image-imports` as a base64 data URL. The backend validates the declared format against the file signature, stores it under `outputs/images/`, and records `source=imported`. Imported media is never presented as a new model generation.
