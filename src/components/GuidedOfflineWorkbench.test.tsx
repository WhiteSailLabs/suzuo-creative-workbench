import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GuidedOfflineWorkbench, guidedProjectIds } from './GuidedOfflineWorkbench'
import type { Workspace } from '../types/workbench'
vi.mock('./DesignCanvas', () => ({ DesignCanvas: () => <div>已加载作品画布</div> }))
afterEach(() => { cleanup(); vi.useRealTimers() })
for (const id of guidedProjectIds) it(`${id} progressively reveals three stages and resets`, () => {
  vi.useFakeTimers()
  render(<GuidedOfflineWorkbench workspace={{ project: { id, name: id }, versions: [] } as unknown as Workspace} />)
  expect(screen.queryByText('01 · 文化原型')).not.toBeInTheDocument()
  for (let step = 0; step < 3; step++) {
    expect(screen.getByRole('combobox', { name: '当前发言角色' })).toHaveValue(step === 1 ? '设计师' : '负责人')
    fireEvent.click(screen.getByRole('button', { name: /试试这样说/ }))
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText(['01 · 文化原型', '02 · 特征提取与转译', '03 · 文创作品'][step])).toBeInTheDocument()
    if (step < 2) expect(screen.queryByText('已加载作品画布')).not.toBeInTheDocument()
  }
  expect(screen.getByText('方向确认')).toBeInTheDocument()
  expect(screen.queryByText('我的想法')).not.toBeInTheDocument()
  expect(screen.getByText('已加载作品画布')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: '设计需求' }), { target: { value: '底座再稳一些' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(screen.getByText('底座再稳一些')).toBeInTheDocument()
  expect(screen.getByText('已加载作品画布')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新演示' }))
  expect(screen.queryByText('01 · 文化原型')).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '设计需求' })).toHaveValue('')
})
