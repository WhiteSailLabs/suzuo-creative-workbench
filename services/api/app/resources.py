"""Search project evidence and Met public-domain objects; never invent results."""
import json
from pathlib import Path
import httpx

registry = {}

SUZHOU_CATALOG = [
    ('suzhou:suxiu', '苏绣纹样', '苏绣的细密针法与留白关系，可转译为边缘纹样、局部开孔或柔和装饰。', '/assets/ref-texture.svg', ('苏绣', '刺绣', '纹样', '丝绸')),
    ('suzhou:leak_window', '园林漏窗', '通过遮挡与透出形成层次，可转译为产品开孔、框景和前后叠层结构。', '/assets/ref-silhouette.svg', ('园林', '漏窗', '漏景', '框景')),
    ('suzhou:water_sleeve', '昆曲水袖', '连续流动的曲线，可转译为灯罩、边缘和柔性曲面造型。', '/assets/coat-v1.svg', ('昆曲', '水袖', '曲线', '戏曲')),
    ('suzhou:silk', '苏州丝绸', '细腻的织物光泽和柔和垂坠感，可转译为表面材质与圆润边界。', '/assets/material-silk.svg', ('丝绸', '织物', '缎面', '柔和')),
    ('suzhou:grey_tile', '黛瓦灰墙', '克制的青灰色调与安静的材质关系，可作为产品主色和背景气质。', '/assets/material-cream.svg', ('黛瓦', '灰墙', '青灰', '陶瓷')),
]

def find_real_project_resources(query, project_id=''):
    root = Path(__file__).resolve().parents[3]
    manifest = root / 'public/assets/suzhou/manifest.json'
    if not manifest.is_file(): return []
    q = query.lower()
    entries = json.loads(manifest.read_text())
    results = []
    groups = {
        'garden': ('园林', '漏景', '香插', '陶瓷'),
        'silk': ('丝绸', '收纳', '织物', '苏绣'),
        'kunqu': ('昆曲', '水袖', '灯'),
    }
    project_key = {
        'prj_suzhou_incense': 'incense',
        'prj_suzhou_silk_box': 'silk',
        'prj_kunqu_lamp': 'kunqu',
    }.get(project_id, '')
    for item in entries:
        if project_key and item.get('project') != project_key: continue
        haystack = ' '.join([item.get('title', ''), item.get('description', ''), item.get('tags', '')]).lower()
        group = next((terms for terms in groups.values() if any(term in haystack for term in terms)), ())
        if not q or any(term in q for term in group): results.append(item)
    return results

def find_catalog_resources(query):
    q = query.lower()
    results = []
    for rid, title, description, image_url, tags in SUZHOU_CATALOG:
        if not q or any(tag.lower() in q for tag in tags) or any(tag.lower() in q for tag in title):
            results.append({'id': rid, 'title': title, 'description': description, 'source_url': '', 'image_url': image_url, 'license': '苏作素材库 · 本地', 'source': '苏州素材引擎', 'agent_reason': f'与“{query}”中的文化或材质线索相关', 'design_translation': description})
    return results

def find_local_resources(workspace, query):
    results = []
    for item in workspace.get('culture', []):
        if query and not any(word in query for word in [item['title'], *item['title'].split()]):
            continue
        results.append({'id': 'culture:' + item['id'], 'title': item['title'], 'description': item['statement'], 'source_url': item.get('source_url', ''), 'image_url': '', 'license': '文化依据 · 图片未引用', 'source': '项目资料'})
    return results

def find_material_resources(query):
    if not any(term in query.lower() for term in ['织物', '布料', '棉', '针织', 'fabric', 'woven', 'cotton']):
        return []
    root = Path(__file__).resolve().parents[3]
    manifest = root / 'data/materials/manifest.json'
    if not manifest.is_file(): return []
    results = []
    for item in json.loads(manifest.read_text()).get('materials', []):
        preview = Path(item.get('preview_file') or '').name
        if not preview or not (root / 'public/assets' / preview).is_file(): continue
        results.append({'id': 'material:' + item['asset_id'], 'title': item['name'], 'description': '织物表面参考；' + ', '.join(item['tags']), 'source_url': item['source_url'], 'image_url': '/assets/' + preview, 'license': item['license'], 'source': 'ambientCG · 本地素材'})
    return results

def resource_prompt(resources):
    return '\n'.join(f"参考依据：{r['title']}；设计参考：{r['description']}；来源：{r.get('source_url', '')}" for r in resources)

async def search_resources(workspace, query):
    # Real raster references are the default catalog. The older SVG sketches
    # remain in the repository for legacy UI tests but are not recommended by
    # the material engine.
    project_id = workspace.get('project', {}).get('id', '')
    catalog = find_real_project_resources(query, project_id)
    local = catalog + find_local_resources(workspace, query) + find_material_resources(query)
    if not query.strip():
        # The first screen must be useful offline: show the project-linked
        # raster references before text-only cultural notes.
        results = [resource for resource in local if resource.get('image_url')]
        for resource in results: registry[resource['id']] = resource
        return {'resources': results, 'warning': '离线素材库 · 选择素材后会参与设计生成。'}
    terms = [('园林', 'Chinese garden'), ('漏窗', 'Chinese architecture'), ('漏景', 'Chinese garden'), ('陶瓷', 'Chinese ceramics'), ('丝绸', 'Chinese silk'), ('苏绣', 'Chinese embroidery'), ('年画', 'Chinese woodblock print'), ('香', 'Chinese incense burner')]
    term = next((en for zh, en in terms if zh in query), query)
    warning = ''
    remote = []
    try:
        openverse_terms = {'园林': 'Suzhou garden architecture', '漏景': 'Chinese garden window', '香插': 'incense holder ceramic', '丝绸': 'Suzhou silk textile', '苏绣': 'Suzhou embroidery', '水袖': 'Kunqu water sleeves', '昆曲': 'Kunqu opera costume'}
        openverse_query = next((value for key, value in openverse_terms.items() if key in query), query)
        async with httpx.AsyncClient(timeout=4) as client:
            response = await client.get('https://api.openverse.org/v1/images/', params={'q': openverse_query, 'license_type': 'commercial', 'page_size': 8})
            response.raise_for_status()
            for item in response.json().get('results', []):
                image_url = item.get('thumbnail') or item.get('url')
                if not image_url or not item.get('foreign_landing_url'): continue
                remote.append({'id': f"openverse:{item.get('id')}", 'title': item.get('title') or '未命名素材', 'description': ' / '.join(filter(None, [item.get('creator'), item.get('tags', [{}])[0].get('name') if item.get('tags') else ''])), 'image_url': image_url, 'source_url': item['foreign_landing_url'], 'license': f"{item.get('license','').upper()} · {item.get('license_version','')}", 'source': f"Openverse · {item.get('source','')}", 'agent_reason': f'公开素材搜索：{openverse_query}'})
    except (httpx.HTTPError, ValueError, KeyError):
            warning = '真实图片搜索暂时无法连接，当前显示已标注的本地项目参考；网络恢复后可重试。'
    # When the real search succeeds, show those indexed images first. Project
    # reference renders are only an offline fallback, so they are never mixed
    # into a successful external search and mistaken for source material.
    # Keep the verified, project-matched offline photos first. External
    # results are supplementary and may be broader than the project brief.
    results = [resource for resource in local + remote if resource.get('image_url')]
    if not remote:
        results = local
        if not warning:
            warning = '没有返回外部图片，当前显示已标注的本地项目参考。'
    for resource in results: registry[resource['id']] = resource
    return {'resources': results, 'warning': warning}
