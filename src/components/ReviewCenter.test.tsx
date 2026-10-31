import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewCenter } from './ReviewCenter'
import type { AssetRecord, DesignVersion, ReviewRecord } from '../types/workbench'

const version: DesignVersion = {
  id: 'v1', direction_id: 'd1', label: '漏景 V1', parent_version_id: null, brief_revision: 1,
  source_turn_id: 'turn1', changed_fields: { 比例: '更轻' }, preserved_fields: ['漏景关系'], constraints: ['概念模型'],
  artifacts: [{ id: 'image1', kind: 'image' }], status: 'selected', created_at: '',
}
const image: AssetRecord = {
  asset_id: 'image1', asset_type: 'image', project_id: 'p1', direction_id: 'd1', version_id: 'v1', title: '漏景香插二维', status: 'selected', source_asset_ids: [], source_turn_id: 'turn1', source_culture_ids: [], tags: [], created_at: '', updated_at: '', owner: '设计师', rights_note: '', url: '/api/workbench/assets/image1', media_type: 'image/png', material_status: null, role: 'primary',
}
const review: ReviewRecord = { id: 'r1', project_id: 'p1', version_id: 'v1', asset_id: 'image1', direction_id: 'd1', region: '底座', comment: '底座再稳一些', status: 'pending', created_at: '', updated_at: '' }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('ReviewCenter', () => {
  it('binds a review to version, asset and region, then shows the pending count', async () => {
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, json: async () => ({ ...review, id: 'r2', comment: '比例需要再收敛' }) }
      return { ok: true, json: async () => ({ project: { id: 'p1', name: '园林项目' }, versions: [version], assets: [image], reviews: [review] }) }
    })
    vi.stubGlobal('fetch', fetcher)
    render(<ReviewCenter projectId="p1" versions={[version]} assets={[image]} reviews={[review]} onBackToWorkbench={vi.fn()} />)
    expect(screen.getByText('待处理 1')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('评审版本'), 'v1')
    await userEvent.selectOptions(screen.getByLabelText('评审资产'), 'image1')
    await userEvent.type(screen.getByLabelText('评审意见'), '比例需要再收敛')
    await userEvent.click(screen.getByRole('button', { name: '提交评审' }))
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8000/api/workbench/projects/p1/reviews', expect.objectContaining({ method: 'POST', body: JSON.stringify({ version_id: 'v1', asset_id: 'image1', direction_id: 'd1', region: '整体', comment: '比例需要再收敛' }) }))
  })

  it.each([
    ['通过', 'passed'], ['需要修改', 'needs_changes'], ['保留备选', 'alternative'], ['淘汰', 'rejected'],
  ])('resolves a pending review as %s', async (label, status) => {
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return { ok: true, json: async () => ({ ...review, status }) }
      return { ok: true, json: async () => ({ project: { id: 'p1', name: '园林项目' }, versions: [version], assets: [image], reviews: [review] }) }
    })
    vi.stubGlobal('fetch', fetcher)
    const onBack = vi.fn()
    render(<ReviewCenter projectId="p1" versions={[version]} assets={[image]} reviews={[review]} onBackToWorkbench={onBack} />)
    const card = screen.getByRole('article', { name: /底座再稳一些/ })
    await userEvent.click(within(card).getByRole('button', { name: label }))
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8000/api/workbench/projects/p1/reviews/r1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status, comment: undefined }) }))
    await userEvent.click(screen.getByRole('button', { name: '返回工作台' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
