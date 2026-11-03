"""Offline integrity check; no external providers or credentials required."""
from pathlib import Path
from app.store import MemoryStore

store = MemoryStore()
for project_id, workspace in store.workspaces.items():
    assert workspace['versions'], project_id
    artifacts = [a for v in workspace['versions'] for a in v['artifacts']]
    assert any(a['kind'] == 'image' for a in artifacts), project_id
    assert any(a['kind'] == 'model_glb' for a in artifacts), project_id
    for artifact in artifacts:
        assert Path(artifact['path']).is_file(), artifact['id']
    print(project_id, len(workspace['versions']), 'versions; all assets present')
