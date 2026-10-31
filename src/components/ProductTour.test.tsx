import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductTour } from './ProductTour'

describe('ProductTour', () => {
  it('walks through five areas, can be skipped, and never creates a task', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(<ProductTour open onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: '产品导览' })).toBeInTheDocument()
    expect(screen.getByText('说想法')).toBeInTheDocument()
    expect(screen.getByText('第 1 步，共 5 步')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('看 AI 理解')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '跳过导览' }))
    expect(onClose).toHaveBeenCalledOnce()
    rerender(<ProductTour open={false} onClose={onClose} />)
    expect(screen.queryByRole('dialog', { name: '产品导览' })).not.toBeInTheDocument()
  })

  it('supports reopening from the first step and closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(<ProductTour open onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: '下一步' }))
    rerender(<ProductTour open={false} onClose={onClose} />)
    rerender(<ProductTour open onClose={onClose} />)
    expect(screen.getByText('说想法')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
