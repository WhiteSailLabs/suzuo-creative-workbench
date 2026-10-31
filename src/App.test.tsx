import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const workspace = {
  project: { id: 'prj_suzhou_incense', name: '园林一隅', product_type: '桌面香插', stage: 'capturing', candidate_version_id: null },
  brief_revisions: [{ revision: 1, confirmed: { product: '桌面香插' }, assumptions: { material: '哑光陶瓷' }, conflicts: [], missing: ['尺寸'], source_turn_id: null, created_at: '2026-10-30T00:00:00Z' }],
  culture: [{ id: 'culture_1', title: '漏景', kind: 'translation', statement: '通过虚实开口形成观看层次。', source_title: '', source_url: '', note: '', verified: true }],
  turns: [],
  versions: [],
  jobs: [],
  stage_gates: [],
}

describe('App', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('renders a cultural product workspace without fashion workflow copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => workspace }))
    render(<App />)

    expect(await screen.findByText('苏作创意台')).toBeInTheDocument()
    expect(screen.getByText('园林一隅')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/服装|面料|领口/)
    await userEvent.click(screen.getByRole('button', { name: '工作台' }))
    expect(screen.getAllByText('桌面香插').length).toBeGreaterThan(0)
    expect(screen.getByText('已确认')).toBeInTheDocument()
    expect(screen.getByText('设计假设')).toBeInTheDocument()
    expect(screen.getByText('待验证')).toBeInTheDocument()
  })

  it('shows a recoverable offline state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<App />)

    await waitFor(() => expect(screen.getByText('暂时无法连接本地服务')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '重新连接' })).toBeInTheDocument()
  })

  it('uses the displayed version as the parent when chat starts a new image', async () => {
    const version = {
      id: 'version_v1', label: 'V1', parent_version_id: null, brief_revision: 1,
      source_turn_id: 'turn_old', changed_fields: {}, preserved_fields: [], constraints: [],
      artifacts: [{ id: 'image_v1', kind: 'image', url: 'data:image/png;base64,cG5n' }],
      status: 'draft', created_at: '2026-10-30T00:00:00Z',
    }
    const workspaceWithVersion = { ...workspace, versions: [version] }
    const turn = {
      id: 'turn_generate', text: '生成一版更轻的方案', intent: 'GENERATE', restatement: '生成更轻的二维方案。',
      change_patch: { changes: { visual_weight: 'lighter' }, preserve: [], constraints: [] },
      brief_revision: 2, interpreter_mode: 'provider', created_at: '2026-10-31T00:00:00Z',
    }
    const completedJob = { id: 'job_image', kind: 'image', status: 'completed', version_id: 'version_v2', artifact_id: 'image_v2', message: '图片已生成', prompt: '', updated_at: '' }
    const response = (value: unknown) => ({ ok: true, json: async () => value })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(workspaceWithVersion))
      .mockResolvedValueOnce(response(turn))
      .mockResolvedValueOnce(response({ ...workspaceWithVersion, turns: [turn] }))
      .mockResolvedValueOnce(response(completedJob))
      .mockResolvedValueOnce(response({ ...workspaceWithVersion, turns: [turn], jobs: [completedJob] }))
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => url.endsWith('/projects') ? Promise.resolve(response([])) : fetchMock(url, init))
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '工作台' }))
    await screen.findByText('V1')

    await userEvent.type(screen.getByLabelText('描述或修改设计'), '生成一版更轻的方案')
    await userEvent.click(screen.getByRole('button', { name: '发送设计想法' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    const imageRequest = fetchMock.mock.calls[3][1] as RequestInit
    expect(JSON.parse(String(imageRequest.body))).toEqual({
      source_turn_id: 'turn_generate',
      base_version_id: 'version_v1',
    })
  })

  it('selects the newly generated 2D version for review without approving it', async () => {
    const v1 = {
      id: 'version_v1', label: 'V1', parent_version_id: null, brief_revision: 1,
      source_turn_id: 'turn_old', changed_fields: {}, preserved_fields: [], constraints: [],
      artifacts: [{ id: 'image_v1', kind: 'image', url: 'data:image/png;base64,cG5n' }],
      status: 'selected', created_at: '2026-10-30T00:00:00Z',
    }
    const v2 = {
      ...v1, id: 'version_v2', label: 'V2', parent_version_id: 'version_v1',
      source_turn_id: 'turn_generate', status: 'draft',
      artifacts: [{ id: 'image_v2', kind: 'image', url: 'data:image/png;base64,djI=' }],
    }
    const initial = { ...workspace, project: { ...workspace.project, candidate_version_id: 'version_v1' }, versions: [v1] }
    const turn = {
      id: 'turn_generate', text: '确认修改并生成新版', intent: 'GENERATE', restatement: '开始生成新版。',
      change_patch: { changes: {}, preserve: [], constraints: [] }, brief_revision: 2,
      interpreter_mode: 'fallback', created_at: '2026-10-31T00:00:00Z',
    }
    const completed = { id: 'job_image', kind: 'image', status: 'completed', version_id: 'version_v2', artifact_id: 'image_v2', message: '图片已生成', prompt: '', updated_at: '' }
    const finalWorkspace = { ...initial, turns: [turn], versions: [v1, v2], jobs: [completed] }
    const response = (value: unknown) => ({ ok: true, json: async () => value })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(initial))
      .mockResolvedValueOnce(response(turn))
      .mockResolvedValueOnce(response({ ...initial, turns: [turn] }))
      .mockResolvedValueOnce(response(completed))
      .mockResolvedValueOnce(response(finalWorkspace))
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => url.endsWith('/projects') ? Promise.resolve(response([])) : fetchMock(url, init))
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '工作台' }))
    await screen.findByText('V1')

    await userEvent.type(screen.getByLabelText('描述或修改设计'), '确认修改并生成新版')
    await userEvent.click(screen.getByRole('button', { name: '发送设计想法' }))

    await waitFor(() => expect(screen.getByText('V2').closest('button')).toHaveClass('active'))
    expect(screen.getByRole('button', { name: '锁定为候选版本' })).toBeEnabled()
  })
})


describe('project navigation', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('opens the selected project, uses its ID for reads and mutations, and exposes keyboard navigation', async () => {
    const second = { ...workspace.project, id: 'prj_silk', name: '苏州丝绸 · 桌面收纳盒', product_type: '收纳盒', stage_status: 'active', created_at: '', updated_at: '', owner: '', collaborators: [], target_user: '', use_scene: '', brief_revision: 0, active_direction_id: null, latest_version_id: null, latest_version_label: null, image_count: 0, model_count: 0, pending_count: 0 }
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/projects')) return { ok: true, json: async () => [second] }
      if (url.endsWith('/turns')) return { ok: true, json: async () => ({ id: 't_silk', intent: 'DISCUSS' }) }
      return { ok: true, json: async () => ({ ...workspace, project: url.endsWith('prj_silk') ? second : workspace.project }) }
    }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /开始设计.*苏州丝绸/ }))
    await screen.findByRole('combobox', { name: '当前项目' })
    await waitFor(() => expect(calls.some(call => call.endsWith('/projects/prj_silk'))).toBe(true))
    await user.type(screen.getByLabelText('描述或修改设计'), '讨论收纳结构')
    await user.click(screen.getByRole('button', { name: '发送设计想法' }))
    await waitFor(() => expect(calls.some(call => call.endsWith('POST http://127.0.0.1:8000/api/workbench/projects/prj_silk/turns'))).toBe(true))
    const works = screen.getByRole('button', { name: '作品' })
    works.focus()
    await user.keyboard('{Enter}')
    expect(works).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: '作品' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '项目' }))
    expect(screen.getByRole('heading', { name: '我的项目' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '全局导航' }).querySelectorAll('button')).toHaveLength(6)
  })

  it('does not fall back to the default workspace when a project switch fails', async () => {
    const selected = { ...workspace.project, id: 'prj_missing', name: '不可用项目', image_count: 0, model_count: 0, pending_count: 0 }
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      if (url.endsWith('/projects')) return { ok: true, json: async () => [selected] }
      if (url.endsWith('prj_missing')) return { ok: false, status: 404 }
      return { ok: true, json: async () => workspace }
    }))
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /开始设计.*不可用项目/ }))
    await screen.findByText('暂时无法连接本地服务')
    expect(urls.filter(url => url.endsWith('prj_suzhou_incense'))).toHaveLength(1)
    expect(screen.queryByLabelText('描述或修改设计')).not.toBeInTheDocument()
  })
})


it('ignores a stale workspace response after switching away and back to the same project', async () => {
  let resolveInitial!: (value: unknown) => void
  const initial = new Promise(resolve => { resolveInitial = resolve })
  let defaultLoads = 0
  const card = { ...workspace.project, latest_version_id: null, latest_version_label: null, image_count: 0, model_count: 0, pending_count: 0 }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/projects')) return { ok: true, json: async () => [card, { ...card, id: 'second', name: '另一个项目' }] }
    if (url.endsWith('prj_suzhou_incense') && ++defaultLoads === 1) return initial
    return { ok: true, json: async () => ({ ...workspace, brief_revisions: [{ ...workspace.brief_revisions[0], confirmed: { material: '新状态材质' } }] }) }
  }))
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /开始设计.*另一个项目/ }))
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前项目' }), 'prj_suzhou_incense')
  await screen.findByText('新状态材质')
  await act(async () => { resolveInitial({ ok: true, json: async () => ({ ...workspace, brief_revisions: [{ ...workspace.brief_revisions[0], confirmed: { material: '旧状态材质' } }] }) }) })
  await waitFor(() => expect(screen.queryByText('旧状态材质')).not.toBeInTheDocument())
  expect(screen.getByText('新状态材质')).toBeInTheDocument()
  vi.unstubAllGlobals()
})

it('cancels the old speech session on project switch and ignores queued callbacks while keeping new speech functional', async () => {
  type ResultEvent = { results: ArrayLike<{ 0: { transcript: string } }> }
  class Recognition {
    static instances: Recognition[] = []
    lang = ''; interimResults = false; continuous = false
    onresult: ((event: ResultEvent) => void) | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    start = vi.fn()
    stop = vi.fn()
    abort = vi.fn()
    constructor() { Recognition.instances.push(this) }
  }
  vi.stubGlobal('SpeechRecognition', Recognition)
  const card = { ...workspace.project, latest_version_id: null, latest_version_label: null, image_count: 0, model_count: 0, pending_count: 0 }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/projects')) return { ok: true, json: async () => [card, { ...card, id: 'second', name: '另一个项目' }] }
    return { ok: true, json: async () => ({ ...workspace, project: url.endsWith('/second') ? { ...workspace.project, id: 'second', name: '另一个项目' } : workspace.project }) }
  }))
  try {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '工作台' }))
    await userEvent.click(await screen.findByRole('button', { name: '开始语音输入' }))
    const old = Recognition.instances[0]
    // Keep the queued callback itself: removing the handler alone cannot invalidate it.
    const lateResult = old.onresult!
    const lateEnd = old.onend!
    const lateError = old.onerror!
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前项目' }), 'second')
    await screen.findByLabelText('描述或修改设计')
    await act(async () => { lateResult({ results: [{ 0: { transcript: '旧项目的迟到语音' } }] }) })
    expect(screen.getByLabelText('描述或修改设计')).toHaveValue('')
    expect(old.abort).toHaveBeenCalledOnce()
    expect(old.onresult).toBeNull()
    expect(old.onend).toBeNull()
    expect(old.onerror).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '开始语音输入' }))
    const current = Recognition.instances[1]
    await act(async () => { lateEnd(); lateError() })
    expect(screen.getByRole('button', { name: '停止语音输入' })).toBeInTheDocument()
    const stoppedResult = current.onresult!
    await userEvent.click(screen.getByRole('button', { name: '停止语音输入' }))
    await act(async () => { stoppedResult({ results: [{ 0: { transcript: '停止后的迟到语音' } }] }) })
    expect(screen.getByLabelText('描述或修改设计')).toHaveValue('')
    expect(current.stop).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: '开始语音输入' }))
    await act(async () => { Recognition.instances[2].onresult!({ results: [{ 0: { transcript: '新项目的有效语音' } }] }) })
    expect(screen.getByLabelText('描述或修改设计')).toHaveValue('新项目的有效语音')
  } finally { vi.unstubAllGlobals() }
})
