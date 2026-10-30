# HuichuangAI workflow sources

These two workflow templates are copied from the official ComfyUI template repository:

- https://github.com/Comfy-Org/workflow_templates
- Source files: `api_openai_gpt_image_2_t2i.json` and `api_openai_gpt_image_2_image_edit.json`
- Repository license: MIT (see the upstream repository license)

They are source references for the editable HuichuangAI workflow. The product maps the nodes to its OpenAI-compatible `/v1/images/generations` and `/v1/images/edits` provider, then adds material resolution, reference binding, a constraint quality gate, and versioned artifact delivery. HuichuangAI stores these optimized workflow revisions separately.
