import { useEffect, useRef, useState } from 'react'

const steps = [
  { title: '说想法', description: '从语音或文字输入开始，把灵感和目标告诉工作台。' },
  { title: '看 AI 理解', description: '查看复述、变化、保留项和待核验内容，再决定是否继续。' },
  { title: '看作品', description: '在画布中查看当前二维概念、三维预览和来源信息。' },
  { title: '确认版本', description: '比较版本变化，确认一个候选版本后再进入下一阶段。' },
  { title: '进入三维', description: '锁定二维候选后生成概念模型，并保留二维来源。' },
] as const

type ProductTourProps = {
  open: boolean
  onClose: (reason?: 'skip' | 'complete' | 'escape' | 'close') => void
}

export function ProductTour({ open, onClose }: ProductTourProps) {
  const [step, setStep] = useState(0)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    setStep(0)
    const timer = window.setTimeout(() => closeButton.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose('escape')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const current = steps[step]
  const last = step === steps.length - 1
  const finish = () => onClose('complete')

  return <div className="product-tour-backdrop" data-testid="product-tour-backdrop">
    <section className="product-tour" role="dialog" aria-modal="true" aria-label="产品导览" aria-describedby="product-tour-description">
      <header className="product-tour-header">
        <div>
          <span className="eyebrow">苏作创意台</span>
          <p className="product-tour-progress">第 {step + 1} 步，共 {steps.length} 步</p>
        </div>
        <button ref={closeButton} className="icon-button" type="button" aria-label="关闭导览" onClick={() => onClose('close')}>×</button>
      </header>
      <div className="product-tour-body">
        <div className="product-tour-marker" aria-hidden="true">{String(step + 1).padStart(2, '0')}</div>
        <div>
          <h2>{current.title}</h2>
          <p id="product-tour-description">{current.description}</p>
          <p className="product-tour-note">使用当前 Demo 数据演示，不会创建生成任务。</p>
        </div>
      </div>
      <footer className="product-tour-actions">
        <button className="tour-skip" type="button" onClick={() => onClose('skip')}>跳过导览</button>
        {last ? <button className="tour-primary" type="button" onClick={finish}>完成导览</button> : <button className="tour-primary" type="button" onClick={() => setStep(value => value + 1)}>下一步</button>}
      </footer>
    </section>
  </div>
}

