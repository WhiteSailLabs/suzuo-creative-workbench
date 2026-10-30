from __future__ import annotations
import json
import shutil
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "materials"
CACHE = ROOT / "vendor" / "material-downloads"
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)

# These IDs are CC0 fabric materials published by ambientCG. The GitHub
# mat-vis catalog is kept in vendor/mat-vis-index and records the upstream
# source/metadata used by this seed pack.
MATERIALS = [
    {"id": "Fabric081C", "name": "Cotton Weave / 081C", "type": "cotton", "tags": ["cotton", "woven", "soft", "neutral"]},
    {"id": "Fabric085", "name": "Fine Woven / 085", "type": "woven", "tags": ["woven", "matte", "suiting"]},
    {"id": "Fabric082A", "name": "Textured Cloth / 082A", "type": "woven", "tags": ["woven", "texture", "light"]},
    {"id": "Fabric083", "name": "Textured Cloth / 083", "type": "woven", "tags": ["woven", "texture", "matte"]},
    {"id": "Fabric080", "name": "Fine Knit / 080", "type": "knit", "tags": ["knit", "soft", "stretch"]},
]


def download(url: str, target: Path) -> None:
    if target.exists() and target.stat().st_size > 1000:
        return
    req = Request(url, headers={"User-Agent": "HuichuangAI-material-seed/0.1"})
    with urlopen(req, timeout=90) as resp, target.open("wb") as f:
        shutil.copyfileobj(resp, f)


def main() -> None:
    stamp = datetime.now(timezone.utc).isoformat()
    entries = []
    for item in MATERIALS:
        asset_id = item["id"]
        archive = CACHE / f"{asset_id}_1K-JPG.zip"
        url = f"https://ambientcg.com/get?file={asset_id}_1K-JPG.zip"
        print(f"fetching {asset_id}")
        download(url, archive)
        with zipfile.ZipFile(archive) as z:
            color_name = next(n for n in z.namelist() if n.endswith("_Color.jpg"))
            color_target = OUT / f"{asset_id.lower()}-color.jpg"
            if not color_target.exists():
                color_target.write_bytes(z.read(color_name))
            preview_name = next((n for n in z.namelist() if n.endswith(".png") and "/" not in n), None)
            preview_target = OUT / f"{asset_id.lower()}-preview.png"
            if preview_name and not preview_target.exists():
                preview_target.write_bytes(z.read(preview_name))
        entries.append({
            **item,
            "asset_id": asset_id,
            "file": f"data/materials/{color_target.name}",
            "preview_file": f"data/materials/{preview_target.name}" if preview_target.exists() else None,
            "source_repo": "https://github.com/MorePET/mat-vis",
            "source_repo_ref": "dev",
            "source_url": f"https://ambientcg.com/a/{asset_id}",
            "download_url": url,
            "upstream": "ambientCG",
            "license": "CC0-1.0",
            "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
            "material_type": item["type"],
            "tags": item["tags"],
            "downloaded_at": stamp,
            "verification_status": "source-listed-cc0",
        })
    manifest = {
        "name": "HuichuangAI demo fabric library",
        "version": "0.1.0",
        "generated_at": stamp,
        "license_policy": "CC0-only seed assets",
        "catalog_source": "https://github.com/MorePET/mat-vis",
        "catalog_source_note": "GitHub catalog/index used to identify open PBR material sources; image archives are fetched from the listed upstream CC0 source URLs.",
        "materials": entries,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(entries)} materials")

if __name__ == "__main__":
    main()
