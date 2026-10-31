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
  it('shows editable evidence fields for cultural facts and disables verification until evidence is complete', async () => {
    const culture = [{ id: 'culture1', title: '园林漏景', kind: 'fact' as const, statement: '', source_title: '', source_url: '', note: '', verified: false }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([asset({ source_culture_ids: ['culture1'] })])))
    render(<AssetLibrary {...props} culture={culture} />)
    expect(await screen.findByRole('heading', { name: '文化资料核验' })).toBeInTheDocument()
    const panel = screen.getByRole('region', { name: '文化资料核验' })
    expect(within(panel).getByText('文化事实')).toBeInTheDocument()
    expect(within(panel).getByLabelText('来源标题-园林漏景')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '标记为已核验-园林漏景' })).toBeDisabled()
  })

  it('patches complete cultural evidence and refreshes the card as verified', async () => {
    const culture = [{ id: 'culture1', title: '园林漏景', kind: 'fact' as const, statement: '', source_title: '', source_url: '', note: '', verified: false }]
    const fetcher = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && url.endsWith('/culture/culture1')) return response({ ...culture[0], statement: '园林借景通过框景形成层次', source_title: '苏州园林志', source_url: 'file://园林志.pdf', note: '核验时间：2026-10-31', verified: true })
      return response([asset({ source_culture_ids: ['culture1'] })])
    })
    vi.stubGlobal('fetch', fetcher)
    render(<AssetLibrary {...props} culture={culture} />)
    const panel = await screen.findByRole('region', { name: '文化资料核验' })
    await userEvent.type(within(panel).getByLabelText('来源标题-园林漏景'), '苏州园林志')
    await userEvent.type(within(panel).getByLabelText('来源 URL 或文件标识-园林漏景'), 'file://园林志.pdf')
    await userEvent.type(within(panel).getByLabelText('摘要/说明-园林漏景'), '园林借景通过框景形成层次')
    await userEvent.type(within(panel).getByLabelText('核验时间-园林漏景'), '2026-10-31')
    const verify = within(panel).getByRole('button', { name: '标记为已核验-园林漏景' })
    expect(verify).toBeEnabled()
    await userEvent.click(verify)
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8000/api/workbench/projects/p1/culture/culture1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ statement: '园林借景通过框景形成层次', source_title: '苏州园林志', source_url: 'file://园林志.pdf', note: '核验时间：2026-10-31', verified: true }) }))
    expect(await within(panel).findByText('已核验')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('文化资料已更新')
  })

  it('refreshes the full asset collection after candidate selection so old image/model become ineligible', async () => {
    const oldImage = asset({ status: 'reviewing', title: '旧二维' })
    const newImage = asset({ asset_id: 'image2', title: '新二维', status: 'completed', version_id: 'v3' })
    const oldModel = { ...model, status: 'completed' as const, title: '旧三维' }
    const refreshed = [
      { ...oldImage, status: 'reviewing' as const },
      { ...newImage, status: 'selected' as const },
      { ...oldModel, status: 'stale' as const, role: 'preview' },
    ]
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return response({ ...newImage, status: 'selected' })
      return response(fetcher.mock.calls.length > 1 ? refreshed : [oldImage, oldModel, newImage])
    })
    vi.stubGlobal('fetch', fetcher)
    render(<AssetLibrary {...props} />)
    const oldCard = await screen.findByRole('article', { name: '旧二维' })
    await userEvent.click(within(oldCard).getByRole('button', { name: '设为候选' }))
    expect(await screen.findByRole('article', { name: '旧三维' })).toHaveTextContent('已过期')
    expect(within(screen.getByRole('article', { name: '旧二维' })).queryByRole('button', { name: '设为候选' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '旧三维' })).queryByRole('button', { name: '加入提案' })).not.toBeInTheDocument()
    expect(fetcher.mock.calls.filter(([, init]) => !init?.method || init.method === 'GET').length).toBeGreaterThanOrEqual(2)
  })

  it('renders explicit cultural kind and verification labels from linked source ids only', async () => {
    const linked = [
      { id: 'culture1', title: '同名', kind: 'fact' as const, statement: '', source_title: '史料', source_url: '', note: '', verified: true },
      { id: 'culture2', title: '同名', kind: 'generated' as const, statement: '', source_title: '', source_url: '', note: '', verified: false },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([asset({ source_culture_ids: ['culture1', 'culture2'] })])))
    render(<AssetLibrary {...props} culture={linked} />)
    const card = await screen.findByRole('article', { name: '漏景香插' })
    expect(within(card).getByText(/文化事实/)).toBeInTheDocument()
    expect(within(card).getByText(/已核验/)).toBeInTheDocument()
    expect(within(card).getByText(/生成内容/)).toBeInTheDocument()
    expect(within(card).getByText(/待核验/)).toBeInTheDocument()
  })

  it('combines all six filters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([asset({ asset_id: 'match', title: '组合命中', status: 'completed', direction_id: 'd1', source_culture_ids: ['culture1'], material_status: 'ceramic', tags: ['陶瓷'] }), asset({ asset_id: 'miss', title: '组合排除', status: 'reviewing', direction_id: 'd1', source_culture_ids: ['culture1'], material_status: 'metal', tags: ['金属'] })])))
    render(<AssetLibrary {...props} />)
    await screen.findByRole('article', { name: '组合命中' })
    await userEvent.selectOptions(screen.getByLabelText('类型'), 'image')
    await userEvent.selectOptions(screen.getByLabelText('状态'), 'completed')
    await userEvent.selectOptions(screen.getByLabelText('方向'), 'd1')
    await userEvent.selectOptions(screen.getByLabelText('文化元素'), 'culture1')
    await userEvent.selectOptions(screen.getByLabelText('材质'), 'ceramic')
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索资产' }), '组合')
    expect(screen.getByRole('article', { name: '组合命中' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '组合排除' })).not.toBeInTheDocument()
  })
  it('traces model inputs, versions, culture and task in an accessible relation view', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => response(url.endsWith('/relations') ? { asset: model, version: versions[1], parent_version: versions[0], input_assets: [asset()], downstream_models: [] } : [asset(), model])))
    render(<AssetLibrary {...props} jobs={[{ id: 'job3d', kind: 'rodin', status: 'completed', version_id: 'v2', artifact_id: 'model1', message: '完成', prompt: '', updated_at: '' }]} />)
    await userEvent.click(await screen.findByRole('button', { name: '查看漏景三维' }))
    const dialog = screen.getByRole('dialog', { name: '资产详情' })
    await userEvent.click(within(dialog).getByRole('tab', { name: '来源关系' }))
    expect(await within(dialog).findByRole('region', { name: '资产关系图' })).toBeInTheDocument()
    expect(within(dialog).getByText('输入二维 → 漏景香插')).toBeInTheDocument()
    expect(within(dialog).getByText('来源版本：A-V2')).toBeInTheDocument()
    expect(within(dialog).getByText('父版本：A-V1')).toBeInTheDocument()
    expect(within(dialog).getByText('文化来源 → 园林漏景')).toBeInTheDocument()
    expect(within(dialog).getByText('生成任务 → job3d（已完成）')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('tab', { name: '设计说明' }))
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
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? response({ proposal_asset_ids: ['image1'] }) : response([asset(), model]))
    vi.stubGlobal('fetch', fetcher); render(<AssetLibrary {...props} />); const card = await screen.findByRole('article', { name: '漏景香插' })
    await userEvent.click(within(card).getByRole('button', { name: '加入提案' }))
    expect(await screen.findByText('提案选材：漏景香插')).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8000/api/workbench/projects/p1/proposal-assets/image1', expect.objectContaining({ method: 'POST' }))
    expect(within(card).getByRole('link', { name: '下载' })).toHaveAttribute('href', 'http://127.0.0.1:8000/api/workbench/assets/image1')
  })

  it('does not show proposal success when the server rejects selection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? { ok: false, status: 422, json: async () => ({ detail: '资产不符合提案选材条件' }) } : response([asset()])))
    render(<AssetLibrary {...props} />)
    const card = await screen.findByRole('article', { name: '漏景香插' })
    await userEvent.click(within(card).getByRole('button', { name: '加入提案' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('资产不符合提案选材条件')
    expect(screen.queryByText('提案选材：漏景香插')).not.toBeInTheDocument()
  })

  it('uses a native modal for archive confirmation and restores focus after cancel', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([asset()])))
    render(<AssetLibrary {...props} />)
    const card = await screen.findByRole('article', { name: '漏景香插' })
    await userEvent.click(within(card).getByRole('button', { name: '更多' }))
    const trigger = within(card).getByRole('button', { name: '归档' })
    await userEvent.click(trigger)
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', { name: '确认归档' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await userEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(trigger).toHaveFocus()
  })
  it('shows recoverable load and relation errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('连接中断')))
    render(<AssetLibrary {...props} />)
    expect(screen.getByRole('status')).toHaveTextContent('正在加载资产')
    expect(await screen.findByRole('alert')).toHaveTextContent('连接中断')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
