import { Bounds, Center, Environment, Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react'
import { ACESFilmicToneMapping, Mesh, MeshStandardMaterial, SRGBColorSpace, Vector3 } from 'three'
import { prepareTexturedScene } from './modelMaterials'

type MaterialInfo = { materialCount: number; textureCount: number }
export type ModelViewMode = 'perspective' | 'front' | 'side'

export const modelViewLabels: Record<ModelViewMode, string> = { perspective: '透视', front: '正视图', side: '侧视图' }

function CameraView({ mode }: { mode: ModelViewMode }) {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    const positions: Record<ModelViewMode, [number, number, number]> = { perspective: [2.8, 2.2, 3.6], front: [0, 0, 4.5], side: [4.5, 0, 0] }
    camera.position.copy(new Vector3(...positions[mode]))
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, mode])
  return null
}

function Scene({ url, wireframe, onReady }: { url: string; wireframe: boolean; onReady: (info: MaterialInfo) => void }) {
  const { scene } = useGLTF(url)
  const prepared = useMemo(() => prepareTexturedScene(scene), [scene])
  useEffect(() => {
    prepared.scene.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((material) => { (material as MeshStandardMaterial).wireframe = wireframe })
    })
  }, [prepared.scene, wireframe])
  useEffect(() => onReady({ materialCount: prepared.materialCount, textureCount: prepared.textureCount }), [onReady, prepared.materialCount, prepared.textureCount])
  return <Bounds fit clip observe margin={1.25}><Center><primitive object={prepared.scene} /></Center></Bounds>
}
class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* rendered as a safe UI state */ }
  render() { return this.state.failed ? <div className="viewer-error">三维模型加载失败，请重试生成或切换版本。</div> : this.props.children }
}
function TexturedModel({ url, referenceImageUrl }: { url: string; referenceImageUrl?: string }) {
  const [materialInfo, setMaterialInfo] = useState<MaterialInfo | null>(null)
  const [viewMode, setViewMode] = useState<ModelViewMode>('perspective')
  const [wireframe, setWireframe] = useState(false)
  const [showReference, setShowReference] = useState(false)
  return <div className="model-viewer" aria-label="三维概念模型预览">
    <div className="model-viewer-controls" role="toolbar" aria-label="三维查看控制"><span>视图</span>{(Object.keys(modelViewLabels) as ModelViewMode[]).map(mode => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)}>{modelViewLabels[mode]}</button>)}<button type="button" aria-pressed={wireframe} onClick={() => setWireframe(value => !value)}>{wireframe ? '关闭线框' : '线框'}</button><span aria-live="polite">{wireframe ? '线框查看' : '材质查看'}</span>{referenceImageUrl && <button type="button" aria-pressed={showReference} onClick={() => setShowReference(value => !value)}>二维对照</button>}<a href={url} download>下载 GLB</a></div>
    {showReference && referenceImageUrl && <figure className="model-reference-compare"><img src={referenceImageUrl} alt="二维来源对照" /><figcaption>锁定二维来源</figcaption></figure>}
    <Canvas camera={{ position: [2.8, 2.2, 3.6], fov: 42 }} dpr={[1, 1.5]} gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.82, outputColorSpace: SRGBColorSpace }}>
      <color attach="background" args={['#c8cec7']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 3]} intensity={1.4} />
      <directionalLight position={[-3, 2, -2]} intensity={0.45} />
      <Suspense fallback={<Html center><span className="viewer-loading">正在加载 PBR 材质模型…</span></Html>}>
        <CameraView mode={viewMode} />
        <Scene url={url} wireframe={wireframe} onReady={setMaterialInfo} />
        <Environment preset="studio" environmentIntensity={0.7} />
      </Suspense>
      <OrbitControls makeDefault enablePan={false} minDistance={1.5} maxDistance={8} />
    </Canvas>
    {materialInfo && <span className="material-ready">PBR 材质已加载 · {materialInfo.textureCount} 张贴图</span>}
  </div>
}
export function ModelViewer({ url, referenceImageUrl }: { url: string; referenceImageUrl?: string }) {
  return <ModelErrorBoundary key={url}><TexturedModel key={url} url={url} referenceImageUrl={referenceImageUrl} /></ModelErrorBoundary>
}
