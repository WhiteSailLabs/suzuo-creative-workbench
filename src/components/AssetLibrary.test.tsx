import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetLibrary } from './AssetLibrary'
import type { AssetRecord, DesignVersion } from '../types/workbench'

const asset = (patch: Partial<AssetRecord> = {}): AssetRecord => ({ asset_id: 'image1', asset_type: 'image', project_id: 'p1', direction_id: 'd1', version_id: 'v2', title: '漏景香插', status: 'completed', source_asset_ids: [], source_turn_id: 'turn1', source_culture_ids: ['culture1'], tags: ['陶瓷'], created_at: '', updated_at: '', owner: '设计师', rights_note: '内部使用', url: '/api/workbench/assets/image1', media_type: 'image/png', material_status: 'ceramic', role: null, ...patch })
const versions: DesignVersion[] = [{ id: 'v1', label: 'A-V1', direction_id: 'd1', parent_version_id: null, brief_revision: 1, source_turn_id: null, changed_fields: {}, preserved_fields: [], constraints: [], artifacts: [], status: 'draft', created_at: '' }, { id: 'v2', label: 'A-V2', direction_id: 'd1', parent_version_id: 'v1', brief_revision: 1, source_turn_id: 'turn1', changed_fields: {}, preserved_fields: [], constraints: [], artifacts: [], status: 'draft', created_at: '' }]
const model = asset({ asset_id: 'model1', asset_type: 'model_glb', title: '漏景三维', source_asset_ids: ['image1'], material_status: 'pbr', media_type: 'model/gltf-binary' })
const props = { projectId: 'p1', projectName: '园林项目', versions, directions: [{ id: 'd1', name: '漏景方向', concept: '', status: 'draft' as const, culture_ids: [], material_ids: [], created_at: '', updated_at: '' }], culture: [{ id: 'culture1', title: '园林漏景', kind: 'translation' as const, statement: '', source_title: '', source_url: '', note: '', verified: true }], jobs: [] }
const response = (body: unknown) => ({ ok: true, json: async () => body })
function load(items = [asset(), model]) { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(items))); return render(<AssetLibrary {...props} />) }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('asset library filters and cards', () => {
  it('shows parent, linked model, status, culture and both grouped views', async () => {
    load()
    const card = await screen.findByRole('article', { name: '漏景香插' })
    expect(within(card).getByText('父版本：A-V1')).toBeInTheDocument()
    expect(within(card).getByText('关联三维：1')).toBeInTheDocument()
    expect(within(card).getByText('已完成')).toBeInTheDocument()
    expect(within(card).getByText('园林漏景')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '园林项目 / 漏景方向 / A-V2' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '资产视图' }))
    expect(screen.getByRole('heading', { name: '二维图' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '三维模型' })).toBeInTheDocument()
  })
  it.each([['类型', 'model_glb'], ['状态', 'archived'], ['方向', 'd2'], ['文化元素', 'culture2'], ['材质', 'metal']])('filters exactly by %s', async (name, value) => {
    load([asset(), asset({ asset_id: 'other', title: '另一资产', asset_type: 'model_glb', status: 'archived', direction_id: 'd2', source_culture_ids: ['culture2'], material_status: 'metal' })])
    await screen.findByRole('article', { name: '漏景香插' })
    await userEvent.selectOptions(screen.getByLabelText(name), value)
    expect(screen.queryByRole('article', { name: '漏景香插' })).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: '另一资产' })).toBeInTheDocument()
  })
  it('searches title and tags and shows empty results', async () => {
    load(); await screen.findByRole('article', { name: '漏景香插' })
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索资产' }), '不存在')
    expect(screen.getByText('没有符合条件的资产')).toBeInTheDocument()
    await userEvent.clear(screen.getByRole('searchbox', { name: '搜索资产' }))
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索资产' }), '陶瓷')
    expect(screen.getByRole('article', { name: '漏景香插' })).toBeInTheDocument()
  })
})

describe('asset relations and safe operations', () => {
  it('traces model inputs, versions, culture and task in an accessible relation view', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => response(url.endsWith('/relations') ? { asset: model, version: versions[1], parent_version: versions[0], input_assets: [asset()], downstream_models: [] } : [asset(), model])))
    render(<AssetLibrary {...props} jobs={[{ id: 'job3d', kind: 'rodin', status: 'completed', version_id: 'v2', artifact_id: 'model1', message: '完成', prompt: '', updated_at: '' }]} />)
    await userEvent.click(await screen.findByRole('button', { name: '查看漏景三维' }))
    const dialog = screen.getByRole('dialog', { name: '资产详情' })
    expect(await within(dialog).findByRole('region', { name: '资产关系图' })).toBeInTheDocument()
    expect(within(dialog).getByText('输入二维 → 漏景香插')).toBeInTheDocument()
    expect(within(dialog).getByText('来源版本：A-V2')).toBeInTheDocument()
    expect(within(dialog).getByText('父版本：A-V1')).toBeInTheDocument()
    expect(within(dialog).getByText('文化来源 → 园林漏景')).toBeInTheDocument()
    expect(within(dialog).getByText('生成任务 → job3d（已完成）')).toBeInTheDocument()
    expect(within(dialog).getByText('所有者：设计师')).toBeInTheDocument()
    expect(within(dialog).getByText('权利说明：内部使用')).toBeInTheDocument()
    expect(within(dialog).getByText('材质状态：pbr')).toBeInTheDocument()
  })
  it('archives only after explicit confirmation through project PATCH; does not delete', async () => {
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => response(init?.method === 'PATCH' ? asset({ status: 'archived' }) : [asset()]))
    vi.stubGlobal('fetch', fetcher); render(<AssetLibrary {...props} />)
    const card = await screen.findByRole('article', { name: '漏景香插' })
    await userEvent.click(within(card).getByRole('button', { name: '更多' }))
    await userEvent.click(within(card).getByRole('button', { name: '归档' }))
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
    expect(screen.getByRole('alertdialog', { name: '确认归档' })).toHaveTextContent('保留本地文件')
    await userEvent.click(screen.getByRole('button', { name: '确认归档' }))
    expect(await within(card).findByText('已归档')).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8000/api/workbench/projects/p1/assets/image1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'archived' }) }))
    expect(within(card).queryByRole('button', { name: '设为候选' })).not.toBeInTheDocument()
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })
  it('hides candidate for archived, failed, stale, processing, untextured models and foreign projects', async () => {
    load(['archived', 'failed', 'stale', 'processing'].map(status => asset({ asset_id: status, title: status, status: status as AssetRecord['status'] })).concat([asset({ project_id: 'p2', title: '外部资产' }), { ...model, material_status: 'unverified' }]))
    await screen.findByRole('article', { name: 'archived' })
    expect(screen.queryByRole('button', { name: '设为候选' })).not.toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '外部资产' })).not.toBeInTheDocument()
  })
  it('selects through scoped PATCH and surfaces server rejection without success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'PATCH' ? { ok: false, status: 409, json: async () => ({ detail: '需要确认设计方向' }) } : response([asset()])))
    render(<AssetLibrary {...props} />)
    await userEvent.click(await screen.findByRole('button', { name: '设为候选' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('需要确认设计方向')
    expect(screen.queryByText('已设为候选')).not.toBeInTheDocument()
  })
  it('adds assets to an explicitly session-only proposal selection and uses actual download URLs', async () => {
    load(); const card = await screen.findByRole('article', { name: '漏景香插' })
    await userEvent.click(within(card).getByRole('button', { name: '加入提案' }))
    expect(screen.getByText('提案选材（当前会话）：漏景香插')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: '下载' })).toHaveAttribute('href', 'http://127.0.0.1:8000/api/workbench/assets/image1')
  })
  it('shows recoverable load and relation errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('连接中断')))
    render(<AssetLibrary {...props} />)
    expect(screen.getByRole('status')).toHaveTextContent('正在加载资产')
    expect(await screen.findByRole('alert')).toHaveTextContent('连接中断')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
