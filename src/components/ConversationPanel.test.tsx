import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConversationPanel } from './ConversationPanel'

describe('ConversationPanel', () => {
  it('keeps the complete text flow available when speech recognition is unavailable', async () => {
    const onSubmit = vi.fn()
    render(<ConversationPanel turns={[]} speechSupported={false} onSubmit={onSubmit} />)

    expect(screen.getByText('当前浏览器无法使用语音，可继续输入文字')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: '描述或修改设计' }), '做一个年轻人用的苏州园林香插')
    await userEvent.click(screen.getByRole('button', { name: '发送设计想法' }))

    expect(onSubmit).toHaveBeenCalledWith('做一个年轻人用的苏州园林香插')
  })

  it('presents the assistant restatement and controlled patch', () => {
    render(<ConversationPanel turns={[{
      id: 'turn_1',
      role: 'assistant',
      text: '我理解为现代、克制的桌面香插。',
      intent: 'MODIFY',
      changePatch: {
        changes: { hollow_structure: '简化', visual_language: { primary: '漏景', secondary: '留白' } },
        preserve: ['漏景关系'],
        constraints: ['不要太传统'],
      },
    }]} speechSupported onSubmit={vi.fn()} />)

    expect(screen.getByText('我理解为现代、克制的桌面香插。')).toBeInTheDocument()
    expect(screen.getByText('本轮修改')).toBeInTheDocument()
    expect(screen.getByText('保留')).toBeInTheDocument()
    expect(screen.getByText('约束')).toBeInTheDocument()
    expect(document.body.textContent).toContain('漏景')
    expect(document.body.textContent).toContain('留白')
    expect(document.body.textContent).not.toContain('[object Object]')
  })

  it('shows that a modification is waiting for chat confirmation before generation', () => {
    render(<ConversationPanel turns={[{
      id: 'turn_pending',
      role: 'assistant',
      text: '修改已整理。',
      intent: 'MODIFY',
      pendingConfirmation: true,
      changePatch: { changes: { base: 'thinner' }, preserve: [], constraints: [] },
    }]} speechSupported onSubmit={vi.fn()} />)

    expect(screen.queryByText('修改已记录，等待你确认')).not.toBeInTheDocument()
    expect(screen.queryByText(/确认修改并生成新版/)).not.toBeInTheDocument()
  })
})

it('offers a simple generation button without a confirmation card', async () => {
  const generate = vi.fn()
  render(<ConversationPanel turns={[]} speechSupported onSubmit={vi.fn()} pendingGeneration={{ changes: {}, preserve: [], constraints: [] }} onConfirmGeneration={generate} />)
  expect(screen.queryByRole('region', { name: '生成确认卡' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '生成二维' }))
  expect(generate).toHaveBeenCalledOnce()
})
