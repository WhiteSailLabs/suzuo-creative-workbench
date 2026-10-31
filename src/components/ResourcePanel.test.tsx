import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ResourcePanel } from './ResourcePanel'
import * as api from '../lib/api'
afterEach(() => vi.restoreAllMocks())
it('automatically searches and selects references without creating a generation task', async () => {
  const item = { id: 'culture:1', title: '漏景', description: '虚实关系', image_url: '', source_url: '', source: '项目资料', license: '文化依据' }
  vi.spyOn(api, 'searchResources').mockResolvedValue({ resources: [item], warning: '' })
  const select = vi.fn()
  render(<ResourcePanel projectId="a" query="漏景香插" selected={[]} onSelect={select} onBusy={vi.fn()} />)
  await screen.findAllByText('虚实关系')
  expect(api.searchResources).toHaveBeenCalledWith('a', '漏景香插')
  expect(select).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '选择素材' }))
  expect(select).toHaveBeenCalledWith([item])
  expect(screen.queryByRole('button', { name: '生成二维' })).not.toBeInTheDocument()
})
it('does not apply an older search after the user searches again', async () => {
  let finish!: (value: { resources: api.DesignResource[]; warning: string }) => void
  vi.spyOn(api, 'searchResources').mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ resources: [], warning: '第二次结果' })
  const { rerender } = render(<ResourcePanel projectId="a" query="旧" selected={[]} onSelect={vi.fn()} onBusy={vi.fn()} />)
  rerender(<ResourcePanel projectId="b" query="新" selected={[]} onSelect={vi.fn()} onBusy={vi.fn()} />)
  await screen.findByText('第二次结果')
  finish({ resources: [], warning: '过期结果' })
  await waitFor(() => expect(screen.queryByText('过期结果')).not.toBeInTheDocument())
  await userEvent.clear(screen.getByLabelText('搜索设计资源'))
})
