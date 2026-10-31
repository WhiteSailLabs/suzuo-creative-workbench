import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { DesignVersion, Workspace } from '../types/workbench'

const version = (id: string, direction_id: string): DesignVersion => ({ id, direction_id, label: id, parent_version_id: null, brief_revision: 1, source_turn_id: 'idea', changed_fields: {}, preserved_fields: [], constraints: [], artifacts: [{ id: `image_${id}`, kind: 'image' }], status: 'draft', created_at: '' })
const workspace: Workspace = {
  project: { id: 'second', name: '丝绸盒', product_type: '盒', stage: 'concepting', stage_status: 'active', active_direction_id: 'a', candidate_version_id: null, owner: '', collaborators: [], target_user: '', use_scene: '', brief_revision: 1, created_at: '', updated_at: '' },
  active_direction_id: 'a', directions: ['a', 'b'].map(id => ({ id, name: `方向${id}`, concept: '', status: 'draft', culture_ids: [], material_ids: [], created_at: '', updated_at: '' })),
  versions: [version('A1', 'a'), version('B1', 'b')], jobs: [], turns: [], brief_revisions: [], culture: [], stage_gates: [],
}
const response = (value: unknown) => ({ ok: true, json: async () => value })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function open() {
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /进入工作台.*丝绸盒/ }))
  await screen.findByAltText('A1 二维概念图')
}

describe('workbench directions and tasks', () => {
  it('switches direction without showing versions from another direction', async () => {
    generationServer()
    await open()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前方向' }), 'b')
    expect(screen.getByAltText('B1 二维概念图')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'A1' })).not.toBeInTheDocument()
    expect(screen.queryByAltText('A1 二维概念图')).not.toBeInTheDocument()
  })

  it('keeps tasks running when the task center closes and blocks same-kind retries', async () => {
    const active = { id: 'running', kind: 'rodin', status: 'processing', version_id: null, artifact_id: null, message: '建模中', prompt: '', updated_at: '' }
    const failed = { ...active, id: 'failed', status: 'failed', message: '服务失败' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/projects') ? [{ ...workspace.project, latest_version_id: 'A1', image_count: 2 }] : { ...workspace, jobs: [active, failed] })))
    await open()
    await userEvent.click(screen.getByRole('button', { name: /任务中心/ }))
    const center = screen.getByRole('region', { name: '生成任务' })
    expect(within(center).getByText('处理中')).toBeInTheDocument()
    expect(within(center).getByRole('button', { name: '重试' })).toBeDisabled()
    expect(within(center).getByText('当前项目已有同类生成任务正在进行')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '关闭任务中心' }))
    expect(screen.queryByRole('region', { name: '生成任务' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /任务中心/ }))
    expect(screen.getByText('建模中')).toBeInTheDocument()
  })
})

const patch = { changes: { shape: '简化镂空' }, preserve: ['丝绸质感'], constraints: ['稳定底座'] }
function generationServer() {
  let current = structuredClone(workspace)
  const calls: Array<{ url: string; body: Record<string, unknown>; method: string }> = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ url, body, method: init?.method ?? 'GET' })
    if (url.endsWith('/activate')) { const id = url.includes('/directions/b/') ? 'b' : 'a'; current.active_direction_id = id; current.project.active_direction_id = id; return response(structuredClone(current)) }
    if (url.endsWith('/projects')) return response([{ ...current.project, latest_version_id: 'A1', image_count: 2, model_count: 0, pending_count: 0 }])
    if (url.endsWith('/turns')) {
      const turn = { id: `turn${current.turns.length}`, text: body.text, intent: 'GENERATE' as const, restatement: '简化镂空并保留丝绸', change_patch: patch, brief_revision: 1, interpreter_mode: 'fallback' as const, created_at: '' }
      current.turns.push(turn)
      return response(turn)
    }
    if (url.endsWith('/candidate')) {
      current.project.candidate_version_id = 'A1'
      return response(current.versions[0])
    }
    if (url.endsWith('/image-jobs') || url.endsWith('/rodin-jobs') || url.endsWith('/retry')) return response({ id: 'done', kind: url.endsWith('/rodin-jobs') ? 'rodin' : 'image', status: 'completed', version_id: 'A1', artifact_id: null, message: '完成', prompt: '', updated_at: '' })
    return response(structuredClone(current))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, setCandidate: (id: string) => { current.project.candidate_version_id = id }, setJobs: (jobs: Workspace['jobs']) => { current = { ...current, jobs } } }
}
async function send(text: string) {
  await userEvent.type(screen.getByLabelText('描述或修改设计'), text)
  await userEvent.click(screen.getByRole('button', { name: '发送设计想法' }))
}

it('requires changes/preserve/constraints confirmation and binds every mutation to the current project', async () => {
  const { calls, setJobs } = generationServer()
  await open()
  await send('生成一版')
  const card = await screen.findByRole('region', { name: '生成确认卡' })
  expect(card).toHaveTextContent('简化镂空')
  expect(card).toHaveTextContent('丝绸质感')
  expect(card).toHaveTextContent('稳定底座')
  expect(calls.filter(c => c.url.endsWith('/image-jobs'))).toHaveLength(0)
  await userEvent.click(within(card).getByRole('button', { name: '暂不生成' }))
  expect(screen.queryByRole('region', { name: '生成确认卡' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('描述或修改设计')).toHaveValue('生成一版')
  await userEvent.click(screen.getByRole('button', { name: '发送设计想法' }))
  await userEvent.click(within(await screen.findByRole('region', { name: '生成确认卡' })).getByRole('button', { name: '确认并生成' }))
  await waitFor(() => expect(calls.some(c => c.url.endsWith('/image-jobs'))).toBe(true))
  expect(calls.find(c => c.url.endsWith('/image-jobs'))?.body).toMatchObject({ base_version_id: 'A1', changes: patch.changes, preserve: patch.preserve })
  await userEvent.click(screen.getByRole('button', { name: '锁定为候选版本' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '用候选版本生成 3D' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: '用候选版本生成 3D' }))
  await waitFor(() => expect(calls.some(c => c.url.endsWith('/rodin-jobs'))).toBe(true))
  setJobs([{ id: 'failed', kind: 'image', status: 'failed', version_id: null, artifact_id: null, message: '失败待重试', prompt: '原始 prompt', updated_at: '' }])
  await send('确认修改并生成新版')
  await screen.findByText('失败待重试')
  await userEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => expect(calls.some(c => c.url.endsWith('/retry'))).toBe(true))
  const mutations = calls.filter(c => /\/(turns|image-jobs|candidate|rodin-jobs|retry)$/.test(c.url))
  expect(mutations.length).toBeGreaterThanOrEqual(7)
  expect(mutations.every(c => c.url.includes('/projects/second/'))).toBe(true)
  expect(calls.find(c => c.url.endsWith('/retry'))?.body).toEqual({})
})

it('PATCHes the current project direction before allowing generation in the activated direction', async () => {
  const { calls } = generationServer()
  await open()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前方向' }), 'b')
  await screen.findByAltText('B1 二维概念图')
  await waitFor(() => expect(calls.some(c => c.url.endsWith('/projects/second/directions/b/activate') && c.method === 'PATCH')).toBe(true))
  await send('确认修改并生成新版')
  await waitFor(() => expect(calls.filter(c => c.url.endsWith('/image-jobs'))).toHaveLength(1))
  expect(calls.find(c => c.url.endsWith('/image-jobs'))?.body.base_version_id).toBe('B1')
  expect(screen.queryByRole('region', { name: '生成确认卡' })).not.toBeInTheDocument()
})

it('blocks generation while activation is pending and retains the original active direction on failure', async () => {
  const { calls } = generationServer()
  const originalFetch = globalThis.fetch
  let rejectActivation!: (value: unknown) => void
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => url.endsWith('/directions/b/activate') ? new Promise(resolve => { rejectActivation = resolve }) : originalFetch(url, init)))
  await open()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前方向' }), 'b')
  expect(screen.getByRole('combobox', { name: '当前方向' })).toBeDisabled()
  expect(await screen.findByText('正在切换方向，请等待成功激活后再生成')).toBeInTheDocument()
  await send('确认修改并生成新版')
  expect(calls.filter(c => c.url.endsWith('/image-jobs'))).toHaveLength(0)
  rejectActivation({ ok: false, status: 404, json: async () => ({ detail: '方向不存在或不属于当前项目' }) })
  expect(await screen.findByText('方向不存在或不属于当前项目')).toBeInTheDocument()
  await send('确认修改并生成新版')
  expect(calls.filter(c => c.url.endsWith('/image-jobs'))).toHaveLength(0)
  await screen.findByText('请先成功激活当前方向后再生成')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前方向' }), 'a')
  await waitFor(() => expect(screen.getByRole('combobox', { name: '当前方向' })).toBeEnabled())
  await send('确认修改并生成新版')
  await waitFor(() => expect(calls.filter(c => c.url.endsWith('/image-jobs'))).toHaveLength(1))
})

it('labels the five cultural evidence types independently', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/projects') ? [{ ...workspace.project, latest_version_id: 'A1', image_count: 2 }] : { ...workspace, culture: ['fact', 'translation', 'designer_judgment', 'generated', 'to_verify'].map(kind => ({ id: kind, kind, title: kind, statement: '依据', verified: false })) })))
  await open()
  for (const label of ['文化事实', '设计转译', '设计师判断', 'AI 推断', '待核验']) expect(screen.getByText(label)).toBeInTheDocument()
})

it('keeps canvas actions and the task center accessible when side panels collapse', async () => {
  generationServer()
  await open()
  await userEvent.click(screen.getByRole('button', { name: '收起对话' }))
  expect(screen.getByLabelText('描述或修改设计')).not.toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: '收起设计状态' }))
  expect(screen.getByRole('button', { name: /任务中心/ })).toBeVisible()
  expect(screen.getByRole('button', { name: '锁定为候选版本' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: '展开对话' }))
  expect(screen.getByLabelText('描述或修改设计')).toBeVisible()
})

it('shows a generation gate failure with its actual reason', async () => {
  generationServer()
  const originalFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => url.endsWith('/image-jobs') ? { ok: false, status: 409, json: async () => ({ detail: { reason: '请先确认产品功能和保留项' } }) } : originalFetch(url, init)))
  await open()
  await send('确认修改并生成新版')
  expect(await screen.findByText('请先确认产品功能和保留项')).toBeInTheDocument()
})


it('blocks Rodin and Rodin retry while activation is pending or failed, then restores them after activation succeeds', async () => {
  const { calls, setCandidate, setJobs } = generationServer()
  setCandidate('B1')
  setJobs([{ id: 'failed_rodin', direction_id: 'b', kind: 'rodin', status: 'failed', version_id: 'B1', artifact_id: null, message: '三维失败可重试', prompt: '', updated_at: '' }])
  const originalFetch = globalThis.fetch
  let finishActivation!: (value: unknown) => void
  let failFirst = true
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/directions/b/activate') && failFirst) {
      failFirst = false
      return new Promise(resolve => { finishActivation = resolve })
    }
    return originalFetch(url, init)
  }))
  await open()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前方向' }), 'b')
  await userEvent.click(screen.getByRole('button', { name: '三维模型' }))
  await userEvent.click(screen.getByRole('button', { name: '用候选版本生成 3D' }))
  await userEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(calls.filter(c => /\/(rodin-jobs|retry)$/.test(c.url))).toHaveLength(0)
  await act(async () => { finishActivation({ ok: false, status: 404, json: async () => ({ detail: '无法激活 B 方向' }) }) })
  await screen.findByText('无法激活 B 方向')
  await userEvent.click(screen.getByRole('button', { name: '用候选版本生成 3D' }))
  await userEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(calls.filter(c => /\/(rodin-jobs|retry)$/.test(c.url))).toHaveLength(0)
  expect(screen.getByText('请先成功激活当前方向后再生成')).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前方向' }), 'a')
  await waitFor(() => expect(screen.getByRole('combobox', { name: '当前方向' })).toBeEnabled())
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前方向' }), 'b')
  await waitFor(() => expect(screen.getByRole('combobox', { name: '当前方向' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: '用候选版本生成 3D' }))
  await waitFor(() => expect(calls.filter(c => c.url.endsWith('/rodin-jobs'))).toHaveLength(1))
  await userEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => expect(calls.filter(c => c.url.endsWith('/retry'))).toHaveLength(1))
  expect(calls.filter(c => /\/(rodin-jobs|retry)$/.test(c.url)).every(c => c.url.includes('/projects/second/'))).toBe(true)
})

it('ignores an old activation response after switching projects', async () => {
  generationServer()
  const originalFetch = globalThis.fetch
  const nextWorkspace = { ...structuredClone(workspace), project: { ...workspace.project, id: 'third', name: '新项目', active_direction_id: 'c' }, active_direction_id: 'c', directions: [{ ...workspace.directions![0], id: 'c', name: '新项目方向' }], versions: [version('C1', 'c')] }
  let finishOldActivation!: (value: unknown) => void
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/projects')) return response([workspace, nextWorkspace].map(w => ({ ...w.project, latest_version_id: 'any', image_count: 1, model_count: 0, pending_count: 0 })))
    if (url.endsWith('/third')) return response(nextWorkspace)
    if (url.endsWith('/directions/b/activate')) return new Promise(resolve => { finishOldActivation = resolve })
    return originalFetch(url, init)
  }))
  await open()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前方向' }), 'b')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前项目' }), 'third')
  await screen.findByAltText('C1 二维概念图')
  await act(async () => { finishOldActivation(response({ ...workspace, project: { ...workspace.project, active_direction_id: 'b' }, active_direction_id: 'b' })) })
  expect(screen.getByRole('combobox', { name: '当前项目' })).toHaveValue('third')
  expect(screen.getByRole('combobox', { name: '当前方向' })).toHaveValue('c')
  expect(screen.getByAltText('C1 二维概念图')).toBeInTheDocument()
  expect(screen.queryByAltText('B1 二维概念图')).not.toBeInTheDocument()
})
