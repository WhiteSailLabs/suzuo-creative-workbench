import { useState } from 'react'

const demos: Record<string, { title: string; idea: string; features: string[]; translation: string; images: string[]; inspiration: string; inspirationImage: string }> = {
  prj_suzhou_incense: { title: '苏州园林 · 漏景香插', idea: '从园林漏景中提取框景与层次', features: ['框景', '层叠', '留白', '灰墙黛瓦'], translation: '框景 → 镂空结构；层叠 → 前后错落；灰墙黛瓦 → 青灰陶瓷。', inspiration: '框景感', inspirationImage: '/assets/suzhou/inspiration-garden.svg', images: ['/assets/suzhou/real/suzhou-garden-leak-window.jpg', '/assets/suzhou/real/suzhou-garden-window-detail.jpg'] },
  prj_suzhou_silk_box: { title: '苏州丝绸 · 丝绸收纳盒', idea: '从苏绣工艺中提取丝线与绣面关系', features: ['丝线方向', '针法节奏', '绣面构图', '柔性包覆'], translation: '丝线方向 → 表面纹理；绣面构图 → 盒盖图案；柔性包覆 → 圆角包边。', inspiration: '丝线感', inspirationImage: '/assets/suzhou/inspiration-silk.svg', images: ['/assets/suzhou/real/suzhou-embroidery.jpg', '/assets/suzhou/real/suzhou-embroidery-artisan.jpg'] },
  prj_kunqu_lamp: { title: '昆曲水袖 · 水袖桌面灯', idea: '从水袖动作中提取流线与摆幅', features: ['流线', '摆幅', '袖口结构', '动态曲面'], translation: '流线 → 灯罩轮廓；摆幅 → 外扩曲面；袖口结构 → 灯口收束。', inspiration: '水袖感', inspirationImage: '/assets/suzhou/inspiration-kunqu.svg', images: ['/assets/suzhou/real/kunqu-water-sleeves.jpg', '/assets/suzhou/real/kunqu-solo-sleeve.jpg'] },
}

export function OfflineDemoPanel({ projectId }: { projectId: string }) {
  const [analyzed, setAnalyzed] = useState(false)
  const demo = demos[projectId] ?? demos.prj_suzhou_incense
  const productImage = projectId === 'prj_suzhou_incense' ? '/assets/suzhou/garden-project.png' : projectId === 'prj_suzhou_silk_box' ? '/assets/suzhou/silk-project.png' : '/assets/suzhou/kunqu-project.png'
  return <section className="offline-demo panel-card" aria-label="离线文化到文创展示">
    <div className="offline-demo-head"><div><span className="eyebrow">CULTURE TO CREATION</span><h3>文化到文创</h3></div><span className="offline-badge">离线展示</span></div>
    <div className="offline-flow-step"><span className="offline-flow-index">01</span><div><strong>文化原型</strong><small>真实苏州文化图片</small></div></div>
    <strong>{demo.title}</strong><p>{demo.idea}</p><div className="offline-reference-grid">{demo.images.map(src => <img key={src} src={src} alt="文化原型" />)}</div>
    <div className="offline-flow-step"><span className="offline-flow-index">02</span><div><strong>文化特征</strong><small>AI 从文化中提炼设计语言</small></div></div>
    <div className="feature-chips">{demo.features.map(feature => <span key={feature}>{feature}</span>)}</div>
    <div className="offline-flow-step"><span className="offline-flow-index">03</span><div><strong>文创转译</strong><small>{demo.translation}</small></div></div>
    <button onClick={() => setAnalyzed(true)}>{analyzed ? '已完成文化转译' : '查看文化转译'}</button>
    <div className={`offline-product-result${analyzed ? ' is-visible' : ''}`}><div><strong>03 · 灵感概念</strong><small>文化意象抽象出的设计方向</small></div><div className="offline-inspiration-row"><img src={demo.inspirationImage} alt={`${demo.inspiration}灵感概念图`} /><div><strong>{demo.inspiration}</strong><p>把文化动作与气质抽象成可用于造型的视觉语言。</p></div></div><div className="offline-flow-step"><span className="offline-flow-index">04</span><div><strong>文创结果</strong><small>进入二维设计与三维作品深化</small></div></div><img src={productImage} alt="文创作品结果" /><div className="offline-result-pills"><span>二维设计</span><span>三维模型</span></div></div>
  </section>
}
