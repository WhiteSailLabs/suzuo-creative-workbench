import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectDashboard } from './ProjectDashboard'
import type { ProjectSummary } from '../types/workbench'
import { createProject } from '../lib/api'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, createProject: vi.fn() }
})

const mockedCreateProject = vi.mocked(createProject)

beforeEach(() => mockedCreateProject.mockReset())

const projects: ProjectSummary[] = ['苏州园林 · 漏景香插', '苏州丝绸 · 桌面收纳盒', '昆曲水袖 · 桌面灯'].map((name, index) => ({
  id: `prj_${index}`, name, product_type: ['香插', '收纳盒', '桌面灯'][index], stage: 'concepting', stage_status: 'awaiting_confirmation', owner: '', collaborators: [], target_user: '', use_scene: '', brief_revision: 1, active_direction_id: null, candidate_version_id: null,
  created_at: '2026-10-31T00:00:00Z', updated_at: '2026-10-31T01:00:00Z', latest_version_id: 'v3', latest_version_label: 'A-V3', image_count: 3, model_count: 1, pending_count: 2,
}))

describe('ProjectDashboard', () => {
  it('creates a project from one natural-language idea and opens the new project', async () => {
    mockedCreateProject.mockResolvedValueOnce({ project: { id: 'prj_new' } } as never)
    const onOpenProject = vi.fn()
    render(<ProjectDashboard projects={projects} onOpenProject={onOpenProject} onProjectCreated={onOpenProject} />)

    await userEvent.type(screen.getByRole('textbox', { name: '一句话创建项目' }), '做一个年轻人放在书桌上的苏州园林香插')
    await userEvent.click(screen.getByRole('button', { name: '创建项目' }))

    expect(mockedCreateProject).toHaveBeenCalledWith({
      name: '做一个年轻人放在书桌上的苏州园林香插',
      product_type: '香插',
      target_user: '年轻人',
      use_scene: '书桌',
    })
    expect(onOpenProject).toHaveBeenCalledWith('prj_new')
    expect(screen.getByRole('status')).toHaveTextContent('项目已创建')
  })

  it('rejects an empty idea without calling the API', async () => {
    const onOpenProject = vi.fn()
    render(<ProjectDashboard projects={projects} onOpenProject={onOpenProject} />)

    await userEvent.click(screen.getByRole('button', { name: '创建项目' }))

    expect(mockedCreateProject).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('先说说你想做什么')
  })

  it('keeps the idea and shows the API error when creation fails', async () => {
    mockedCreateProject.mockRejectedValueOnce(new Error('服务暂时不可用'))
    render(<ProjectDashboard projects={projects} onOpenProject={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: '一句话创建项目' })

    await userEvent.type(input, '做一个苏州丝绸桌面收纳盒')
    await userEvent.click(screen.getByRole('button', { name: '创建项目' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('服务暂时不可用')
    expect(input).toHaveValue('做一个苏州丝绸桌面收纳盒')
  })

  it('shows all three demos with project-specific summary data and opens a chosen project', async () => {
    const onOpenProject = vi.fn()
    render(<ProjectDashboard projects={projects} onOpenProject={onOpenProject} />)
    for (const project of projects) {
      const card = screen.getByRole('article', { name: project.name })
      expect(within(card).getByText(project.product_type)).toBeInTheDocument()
      expect(within(card).getByText('二维概念')).toBeInTheDocument()
      expect(within(card).getByText('A-V3')).toBeInTheDocument()
      expect(within(card).getByText('二维 3 · 三维 1')).toBeInTheDocument()
      expect(within(card).getByText('待处理 2')).toBeInTheDocument()
      expect(card.querySelector('time')).toHaveAttribute('dateTime', '2026-10-31T01:00:00Z')
    }
    await userEvent.click(screen.getByRole('button', { name: /进入工作台.*苏州丝绸/ }))
    expect(onOpenProject).toHaveBeenCalledWith('prj_1')
  })

  it('provides a start action for a project with no versions', async () => {
    const onOpenProject = vi.fn()
    render(<ProjectDashboard projects={[{ ...projects[0], latest_version_id: null, latest_version_label: null, image_count: 0, model_count: 0 }]} onOpenProject={onOpenProject} />)
    await userEvent.click(screen.getByRole('button', { name: /开始设计/ }))
    expect(onOpenProject).toHaveBeenCalledWith('prj_0')
    expect(screen.getByText('尚无版本')).toBeInTheDocument()
  })
})
