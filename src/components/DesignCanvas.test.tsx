import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DesignCanvas } from './DesignCanvas'
import type { DesignVersion, GenerationJob } from '../types/workbench'

vi.mock('./ModelViewer', () => ({
  ModelViewer: () => <div data-testid="model-viewer">3D viewer</div>,
}))

const version: DesignVersion = {
  id: 'version_v2', label: 'V2', parent_version_id: 'version_v1', brief_revision: 2,
  source_turn_id: 'turn_2', changed_fields: { hollow_structure: 'simplified' },
  preserved_fields: ['leak_view'], constraints: ['stable_base'], status: 'draft',
  created_at: '2026-10-30T00:00:00Z',
  artifacts: [
    { id: 'image_1', kind: 'image', media_type: 'image/png' },
    { id: 'glb_1', kind: 'concept_model', media_type: 'model/gltf-binary', disclaimer: '概念模型，不是生产 CAD', input_mode: 'image', reference_artifact_ids: ['image_1'], consistency_status: 'pending' },
  ],
}

describe('DesignCanvas', () => {
  it('shows image, 3D concept disclaimer, and version changes', async () => {
    render(<DesignCanvas versions={[version]} jobs={[]} selectedVersionId="version_v2" candidateVersionId={null} onSelectVersion={vi.fn()} onLockCandidate={vi.fn()} />)
    expect(screen.getByAltText('V2 二维概念图')).toHaveAttribute('src', expect.stringContaining('image_1'))
    expect(screen.getByText('镂空结构')).toBeInTheDocument()
    expect(screen.getByText('保留漏景关系')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '三维模型' }))
    expect(screen.getByText('概念模型，不是生产 CAD')).toBeInTheDocument()
    expect(screen.getByText('由二维图生成')).toBeInTheDocument()
    expect(screen.getByText('1 张参考图')).toBeInTheDocument()
    expect(screen.getByText('待一致性检查')).toBeInTheDocument()
  })

  it('labels an explicit text fallback without claiming image provenance', async () => {
    const textVersion: DesignVersion = {
      ...version,
      id: 'version_text',
      artifacts: [
        version.artifacts[0],
        { id: 'glb_text', kind: 'model_glb', input_mode: 'text', reference_artifact_ids: [], consistency_status: 'not_applicable' },
      ],
    }
    render(<DesignCanvas versions={[textVersion]} jobs={[]} selectedVersionId="version_text" candidateVersionId={null} onSelectVersion={vi.fn()} onLockCandidate={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '三维模型' }))
    expect(screen.getByText('文字降级生成')).toBeInTheDocument()
    expect(screen.queryByText('由二维图生成')).not.toBeInTheDocument()
  })

  it('does not submit image-to-3d before a 2d reference exists', async () => {
    const onGenerate3d = vi.fn()
    const noImageVersion: DesignVersion = { ...version, id: 'version_empty', artifacts: [] }
    render(<DesignCanvas versions={[noImageVersion]} jobs={[]} selectedVersionId="version_empty" candidateVersionId={null} onSelectVersion={vi.fn()} onLockCandidate={vi.fn()} onGenerate3d={onGenerate3d} />)
    await userEvent.click(screen.getByRole('button', { name: '三维模型' }))
    expect(screen.getByText('先生成或导入二维概念图')).toBeInTheDocument()
    const generate = screen.getByRole('button', { name: '用候选版本生成 3D' })
    expect(generate).toBeDisabled()
    await userEvent.click(generate)
    expect(onGenerate3d).not.toHaveBeenCalled()
  })

  it('requires the displayed 2d version to be locked before 3d generation', async () => {
    const onGenerate3d = vi.fn()
    const imageOnlyVersion: DesignVersion = {
      ...version,
      id: 'version_image_only',
      artifacts: [version.artifacts[0]],
    }
    const { rerender } = render(<DesignCanvas versions={[imageOnlyVersion]} jobs={[]} selectedVersionId="version_image_only" candidateVersionId={null} onSelectVersion={vi.fn()} onLockCandidate={vi.fn()} onGenerate3d={onGenerate3d} />)

    await userEvent.click(screen.getByRole('button', { name: '三维模型' }))
    expect(screen.getByText('先锁定这个二维版本为候选')).toBeInTheDocument()
    const generate = screen.getByRole('button', { name: '用候选版本生成 3D' })
    expect(generate).toBeDisabled()

    rerender(<DesignCanvas versions={[imageOnlyVersion]} jobs={[]} selectedVersionId="version_image_only" candidateVersionId="version_image_only" onSelectVersion={vi.fn()} onLockCandidate={vi.fn()} onGenerate3d={onGenerate3d} />)
    expect(screen.getByRole('button', { name: '用候选版本生成 3D' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: '用候选版本生成 3D' }))
    expect(onGenerate3d).toHaveBeenCalledWith('version_image_only')
  })

  it('moves to the 3d next step after locking a candidate', async () => {
    const onLockCandidate = vi.fn().mockResolvedValue(undefined)
    const imageOnlyVersion: DesignVersion = {
      ...version,
      id: 'version_to_lock',
      artifacts: [version.artifacts[0]],
    }
    render(<DesignCanvas versions={[imageOnlyVersion]} jobs={[]} selectedVersionId="version_to_lock" candidateVersionId={null} onSelectVersion={vi.fn()} onLockCandidate={onLockCandidate} />)

    await userEvent.click(screen.getByRole('button', { name: '锁定为候选版本' }))

    expect(onLockCandidate).toHaveBeenCalledWith('version_to_lock')
    expect(screen.getByRole('button', { name: '三维模型' })).toHaveClass('active')
  })

  it('directs first generation through conversation instead of an independent button', () => {
    render(<DesignCanvas versions={[]} jobs={[]} selectedVersionId={null} candidateVersionId={null} onSelectVersion={vi.fn()} onLockCandidate={vi.fn()} />)

    expect(screen.getByText('在左侧对话中说“生成一版”')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '生成第一版二维概念' })).not.toBeInTheDocument()
  })

  it('renders structured design fields as readable values', () => {
    const structuredVersion: DesignVersion = {
      ...version,
      id: 'version_structured',
      changed_fields: {
        visual_language: { primary: '漏景', secondary: '留白' },
        structure: { perforation: '简洁镂空', base: '稳定' },
      },
    }
    render(<DesignCanvas versions={[structuredVersion]} jobs={[]} selectedVersionId="version_structured" candidateVersionId={null} onSelectVersion={vi.fn()} onLockCandidate={vi.fn()} />)

    expect(document.body.textContent).toContain('漏景')
    expect(document.body.textContent).toContain('简洁镂空')
    expect(document.body.textContent).not.toContain('[object Object]')
  })

  it('keeps failed and stale jobs visible without replacing the selected version', () => {
    const jobs: GenerationJob[] = [
      { id: 'failed', kind: 'image', status: 'failed', version_id: null, artifact_id: null, message: '图片生成失败，可重试', prompt: '', updated_at: '' },
      { id: 'stale', kind: 'rodin', status: 'stale', version_id: 'old_version', artifact_id: 'old_glb', message: '基于旧版本完成', prompt: '', updated_at: '' },
    ]
    render(<DesignCanvas versions={[version]} jobs={jobs} selectedVersionId="version_v2" candidateVersionId={null} onSelectVersion={vi.fn()} onLockCandidate={vi.fn()} />)
    expect(screen.getByText('图片生成失败，可重试')).toBeInTheDocument()
    expect(screen.getByText('旧任务结果已保留，不会替换当前版本')).toBeInTheDocument()
    expect(screen.getByText('V2')).toBeInTheDocument()
  })
})

it('offers all four modes, a 2d return, comparison changes and source relations', async () => {
  const v1 = { ...version, id: 'version_v1', label: 'V1', parent_version_id: null, artifacts: [version.artifacts[0]] }
  const v2 = { ...version, artifacts: [version.artifacts[0]] }
  render(<DesignCanvas versions={[v1, v2]} jobs={[]} selectedVersionId={v2.id} candidateVersionId={null} onSelectVersion={vi.fn()} onLockCandidate={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: '三维模型' }))
  expect(screen.getByText('先锁定这个二维版本为候选')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '返回二维' }))
  expect(screen.getByAltText('V2 二维概念图')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '版本对比' }))
  expect(screen.getByRole('combobox', { name: '对比左侧版本' })).toHaveValue(v1.id)
  expect(screen.getByRole('combobox', { name: '对比右侧版本' })).toHaveValue(v2.id)
  expect(screen.getByRole('region', { name: '版本对比结果' })).toHaveTextContent('变化')
  expect(screen.getByRole('region', { name: '版本对比结果' })).toHaveTextContent('leak_view')
  await userEvent.click(screen.getByRole('button', { name: '来源关系' }))
  expect(screen.getByRole('region', { name: '来源链' })).toHaveTextContent('Brief 第 2 版')
  expect(screen.getByRole('region', { name: '来源链' })).toHaveTextContent('turn_2')
  expect(screen.getByRole('region', { name: '来源链' })).toHaveTextContent('version_v1')
})

it('traces culture and input assets through a version to jobs and proposals', async () => {
  render(<DesignCanvas versions={[version]} jobs={[{ id: 'job_source', kind: 'image', status: 'completed', version_id: version.id, artifact_id: 'image_1', prompt: '', message: '完成', updated_at: '' }]} selectedVersionId={version.id} candidateVersionId={null} onSelectVersion={vi.fn()} onLockCandidate={vi.fn()} culture={[{ id: 'culture', kind: 'translation', title: '漏景来源', statement: '', source_title: '', source_url: '', note: '', verified: true }]} proposals={[{ id: 'proposal_1', version_id: version.id }]} />)
  await userEvent.click(screen.getByRole('button', { name: '来源关系' }))
  const chain = screen.getByRole('region', { name: '来源链' })
  expect(chain).toHaveTextContent('漏景来源')
  expect(chain).toHaveTextContent('job_source')
  expect(chain).toHaveTextContent('proposal_1')
})
