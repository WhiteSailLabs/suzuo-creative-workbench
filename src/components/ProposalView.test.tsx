import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProposalView } from './ProposalView'
import type { Proposal } from '../types/workbench'

const proposal: Proposal = {
  project: { id: 'p1', name: '园林项目', product_type: '桌面香插' }, audience: 'internal',
  brief: { product_type: '桌面香插' }, culture: [{ id: 'c1', kind: 'to_verify', original_kind: 'fact', title: '漏景', statement: '虚实相生', source_title: '园林志', source_url: '', verified: false, warning: '待核验，不可作为确定文化事实' }],
  version: { id: 'v1', label: '漏景 V1', changed_fields: { 比例: '更轻' }, preserved_fields: ['漏景关系'], constraints: ['概念模型'], artifacts: [{ id: 'image1', kind: 'image', url: '/api/workbench/assets/image1', media_type: 'image/png', role: 'primary' }] },
  disclaimer: '概念设计，不是生产 CAD。',
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('ProposalView', () => {
  it('shows internal pending-verification warning, switches audience, and renders a download manifest', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/manifest')) return { ok: true, json: async () => ({ project_id: 'p1', audience: 'internal', candidate_version_id: 'v1', assets: [{ asset_id: 'image1', asset_type: 'image', title: '漏景二维', status: 'selected', project_id: 'p1', direction_id: 'd1', version_id: 'v1', source_asset_ids: [], source_culture_ids: [], url: '/api/workbench/assets/image1', media_type: 'image/png', material_status: null, role: 'primary', version_label: '漏景 V1' }], brief: { revision: 1, confirmed: {}, assumptions: {}, conflicts: [], missing: [], source_turn_id: null, created_at: '' }, culture_sources: [], version_history: [] }) }
      return { ok: true, json: async () => proposal }
    })
    vi.stubGlobal('fetch', fetcher)
    render(<ProposalView projectId="p1" proposal={proposal} onClose={vi.fn()} />)
    expect(screen.getByText('待核验，不可作为确定文化事实')).toBeInTheDocument()
    expect(screen.getByText('内部提案')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '下载 漏景二维' })).toHaveAttribute('href', 'http://127.0.0.1:8000/api/workbench/assets/image1')
    await userEvent.click(screen.getByRole('button', { name: '客户提案' }))
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8000/api/workbench/projects/p1/proposal?audience=customer', expect.anything())
  })

  it('renders structured 409 gate details and a culture verification entry point', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('audience=customer')) return { ok: false, status: 409, json: async () => ({ detail: { stage: 'customer_proposal', missing: ['verified_culture'], reason: '存在未核验文化事实', action: '在文化依据中补齐类型并核验对外文化事实' } }) }
      if (url.includes('/manifest')) return { ok: true, json: async () => ({ project_id: 'p1', audience: 'internal', candidate_version_id: 'v1', assets: [], brief: { revision: 1, confirmed: {}, assumptions: {}, conflicts: [], missing: [], source_turn_id: null, created_at: '' }, culture_sources: [], version_history: [] }) }
      return { ok: true, json: async () => proposal }
    })
    vi.stubGlobal('fetch', fetcher)
    render(<ProposalView projectId="p1" proposal={proposal} onClose={vi.fn()} onGoToCulture={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '客户提案' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('存在未核验文化事实')
    expect(screen.getByText('verified_culture')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '去核验文化资料' })).toBeInTheDocument()
  })
})
