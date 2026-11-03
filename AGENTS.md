# mock branch deployment instructions

Read MOCK_DEPLOY.md first. This branch is a saved, deterministic demo, not a live AI generation service.
Keep mock-data/ in deployments. Never request API keys for the demo or regenerate its assets.
Use Node.js 22.12+ and Python 3.10+. Run commands from repository root.
Do not commit .env, credentials, node_modules, .venv, dist or generated outputs.
The three built-in projects use GuidedOfflineWorkbench: complete three turns to reveal saved 2D/3D results; subsequent discussion is page-local and does not alter assets.
Python MemoryStore restores snapshots from mock-data at startup; mutable changes reset on restart.
For production serve dist and proxy /api to 127.0.0.1:8000 on the same origin. Do not expose the backend directly to the internet; demo has no authentication.
Validate npm run build, npm test -- --run, and all snapshot artifact files before shipping. Verify the browser journey separately from API checks.
