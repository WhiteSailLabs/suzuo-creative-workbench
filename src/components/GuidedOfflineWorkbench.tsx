import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '../types/workbench'
import { DesignCanvas } from './DesignCanvas'

type Speaker = '负责人' | '设计师'
type MeetingTurn = { id: string; role: 'user' | 'assistant'; text: string; speaker?: Speaker; decision?: boolean }
const meetingRoles: Speaker[] = ['负责人', '设计师', '负责人']
const scripts = {
  prj_suzhou_incense: {
    prompts: ['我们需要一个苏州园林主题的桌面香插，用于文创礼赠，要安静、有地方特色。', '建议提取框景和前后层次，保留园林的空间体验，不直接复制建筑。', '这个方向可以，采用青灰陶瓷，造型简洁、底座稳一些，先出方案。'],
    replies: ['先从苏州园林中寻找适合香插设计的文化原型。', '保留园林“透过一层看见另一层”的空间体验，将它转成产品的镂空与层叠关系。', '结合框景、层叠与青灰陶瓷方向，加载已保存的香插方案。'],
    images: ['suzhou-garden-leak-window.jpg', 'suzhou-garden-window-detail.jpg'], names: ['苏州园林 · 月洞门', '苏州留园 · 窗景'],
    features: ['框景 → 镂空边界', '叠景 → 前后错落', '留白 → 虚实关系'], inspiration: 'garden', name: '框景与层次', product: 'garden',
  },
  prj_suzhou_silk_box: {
    prompts: ['我们需要一个苏州丝绸主题的桌面收纳盒，体现地方工艺和细腻的手工气质。', '建议提取丝线的秩序和柔软感，以质感体现苏绣，避免堆叠纹样。', '这个方向可以，做成圆角收纳盒，表面细腻、整体干净，先出方案。'],
    replies: ['先寻找苏绣与丝绸工艺中的文化依据。', '从苏绣中保留丝线走向和细密节奏，让文化进入表面质感与包覆方式。', '结合有序纹理、柔和包覆与圆角盒体，加载已保存的收纳盒方案。'],
    images: ['suzhou-embroidery.jpg', 'suzhou-embroidery-artisan.jpg'], names: ['苏绣 · 展品纹样', '苏绣 · 绷架刺绣'],
    features: ['丝线方向 → 有序纹理', '针法节奏 → 疏密变化', '柔性包覆 → 柔和边界'], inspiration: 'silk', name: '丝线与包覆', product: 'silk',
  },
  prj_kunqu_lamp: {
    prompts: ['我们需要一个昆曲主题的桌面灯，适合日常使用，轻盈、有流动感。', '建议提取水袖扬起再收拢的动态，用曲面表达，不直接使用人物和戏服装饰。', '这个方向可以，将水袖感用于灯罩，光柔和一些，先出桌面灯方案。'],
    replies: ['先寻找昆曲水袖的舞台动作与形态依据。', '提取水袖从舒展到收束的动态，让灯罩具有流动的轮廓和轻盈的边缘。', '结合连续曲面、收束边缘与柔和光线，加载已保存的水袖灯方案。'],
    images: ['kunqu-water-sleeves.jpg', 'kunqu-solo-sleeve.jpg'], names: ['昆曲 · 水袖动作', '昆曲 · 舞台身段'],
    features: ['舒展 → 连续曲面', '回旋 → 外扩轮廓', '收束 → 收拢边缘'], inspiration: 'kunqu', name: '水袖的流动感', product: 'kunqu',
  },
}
export function GuidedOfflineWorkbench({ workspace }: { workspace: Workspace }) {
  const script = scripts[workspace.project.id as keyof typeof scripts]
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [turns, setTurns] = useState<MeetingTurn[]>([])
  const [speaker, setSpeaker] = useState<Speaker>('负责人')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  function reset() { if (timer.current) clearTimeout(timer.current); setStep(0); setSpeaker('负责人'); setBusy(false); setText(''); setTurns([]) }
  function submit() {
    if (!text.trim() || busy) return
    if (step >= 3) {
      setTurns(items => [...items,
        { id: `u${items.length}`, role: 'user', text: text.trim(), speaker },
        { id: `a${items.length}`, role: 'assistant', text: '已记录这条补充讨论。当前为离线展示，已保存的二维与三维作品保持不变。' },
      ])
      setText('')
      return
    }
    const current = step
    setTurns(items => [...items, { id: `u${current}`, role: 'user', text: text.trim(), speaker, decision: current === 2 && speaker === '负责人' }])
    setText(''); setBusy(true)
    timer.current = setTimeout(() => {
      setTurns(items => [...items, { id: `a${current}`, role: 'assistant', text: script.replies[current] }])
      setStep(current + 1); setSpeaker(meetingRoles[current + 1] ?? '负责人'); setBusy(false)
    }, 950)
  }
  const version = workspace.versions.find(v => v.id === workspace.project.candidate_version_id) ?? workspace.versions.at(-1)
  return <main className="guided-workbench">
    <header className="guided-header"><div><span className="eyebrow">CULTURE TO CREATION</span><h2>{workspace.project.name}</h2></div><div><span className="offline-badge">离线演示</span><button onClick={reset}>重新演示</button></div></header>
    <section className="guided-chat panel-card"><h3>设计讨论</h3><p>负责人明确目标 · 设计师提出方向 · AI 辅助转译</p><div className="guided-messages" aria-live="polite">{!turns.length && <p className="guided-welcome">从项目需求开始讨论，一起确定文化灵感与设计方向。</p>}{turns.map(turn => <div key={turn.id} className={`guided-message ${turn.role} ${turn.speaker === '负责人' ? 'meeting-lead' : turn.speaker === '设计师' ? 'meeting-designer' : 'meeting-assistant'}`} ><div className="meeting-speaker"><span className="meeting-avatar">{turn.role === 'assistant' ? '苏' : turn.speaker === '负责人' ? '负' : '设'}</span><strong>{turn.role === 'assistant' ? '苏作助手' : turn.speaker === '负责人' ? '项目负责人' : '设计师'}</strong>{turn.decision && <span className="meeting-decision">方向确认</span>}</div><p>{turn.text}</p></div>)}{busy && <p role="status">{['正在寻找文化原型…', '正在提炼设计语言…', '正在加载预置方案…'][step]}</p>}</div>{<form onSubmit={e => { e.preventDefault(); submit() }}><label className="meeting-role-select">当前发言<select aria-label="当前发言角色" value={speaker} disabled={busy} onChange={e => setSpeaker(e.target.value as Speaker)}><option value="负责人">项目负责人</option><option value="设计师">设计师</option></select></label>{step < 3 && <button type="button" className="guided-suggestion" disabled={busy} onClick={() => setText(script.prompts[step])}>试试这样说：{script.prompts[step]}</button>}<textarea aria-label="设计需求" placeholder="说说你的设计想法…" value={text} disabled={busy} onChange={e => setText(e.target.value)} /><button disabled={busy || !text.trim()}>发送</button></form>}{step >= 3 && <p className="guided-finished">文化灵感已进入作品，可切换二维与三维查看。</p>}</section>
    <section className="guided-stage">{step === 3 ? <DesignCanvas versions={version ? [version] : []} jobs={[]} selectedVersionId={version?.id ?? null} candidateVersionId={version?.id ?? null} onSelectVersion={() => {}} onLockCandidate={() => {}} /> : step === 2 ? <div className="guided-inspiration panel-card"><span className="eyebrow">DESIGN INSPIRATION</span><h2>{script.name}</h2><img src={`/assets/suzhou/inspiration-${script.inspiration}.svg`} alt={`${script.name}灵感概念图`} /><p>文化意象 → 设计语言 → 形态探索</p></div> : <div className="guided-empty panel-card"><span className="eyebrow">SUZHOU CULTURAL DESIGN</span><h2>{step === 0 ? '从苏州文化开始' : '文化原型已找到'}</h2><p>{step === 0 ? '提出需求后，文化图片、灵感和作品会随对话逐步出现。' : '继续描述你喜欢的文化特征，探索产品的设计语言。'}</p>{step === 1 && <img src={`/assets/suzhou/real/${script.images[0]}`} alt={script.names[0]} />}</div>}</section>
    <aside className="guided-evidence panel-card"><h3>文化到文创</h3><div className="guided-progress">{['文化原型', '设计灵感', '文创作品'].map((label, i) => <span key={label} className={step > i ? 'complete' : ''}>{i + 1} · {label}</span>)}</div>{step === 0 && <p className="guided-welcome">等待你的第一句创意</p>}{step >= 1 && <section className="guided-reveal"><h4>01 · 文化原型</h4>{script.images.map((image, i) => <figure key={image} style={{ animationDelay: `${i * 180}ms` }}><img src={`/assets/suzhou/real/${image}`} alt={script.names[i]} /><figcaption>{script.names[i]}</figcaption></figure>)}</section>}{step >= 2 && <section className="guided-reveal"><h4>02 · 特征提取与转译</h4>{script.features.map((feature, i) => <p className="guided-feature" key={feature} style={{ animationDelay: `${i * 140}ms` }}>{feature}</p>)}<img className="guided-concept-thumb" src={`/assets/suzhou/inspiration-${script.inspiration}.svg`} alt="灵感方向" /><strong>{script.name}</strong></section>}{step >= 3 && <section className="guided-reveal"><h4>03 · 文创作品</h4><img className="guided-concept-thumb" src={`/assets/suzhou/${script.product}-project.png`} alt="预置作品缩略图" /><p>当前画布可切换二维设计与三维模型</p></section>}</aside>
  </main>
}
export const guidedProjectIds = Object.keys(scripts)
