import { Group, Mesh, MeshStandardMaterial, SRGBColorSpace, Texture } from 'three'
import * as ModelMaterialsModule from './modelMaterials'
import { modelViewLabels } from './ModelViewer'

describe('PBR model preparation', () => {
  it('exposes explicit model inspection modes for the P0 viewer', () => {
    expect(modelViewLabels).toEqual({ perspective: '透视', front: '正视图', side: '侧视图' })
  })
  it('keeps embedded texture maps and prepares their display color space', () => {
    const prepareTexturedScene = (ModelMaterialsModule as Record<string, unknown>).prepareTexturedScene
    expect(typeof prepareTexturedScene).toBe('function')
    if (typeof prepareTexturedScene !== 'function') return

    const diffuse = new Texture()
    const normal = new Texture()
    const packedMetalRoughness = new Texture()
    const material = new MeshStandardMaterial({
      map: diffuse,
      normalMap: normal,
      metalnessMap: packedMetalRoughness,
      roughnessMap: packedMetalRoughness,
    })
    const source = new Group()
    source.add(new Mesh(undefined, material))

    const prepared = prepareTexturedScene(source) as {
      scene: Group
      materialCount: number
      textureCount: number
    }
    const preparedMaterial = (prepared.scene.children[0] as Mesh).material as MeshStandardMaterial

    expect(prepared.materialCount).toBe(1)
    expect(prepared.textureCount).toBe(3)
    expect(preparedMaterial.map).toBe(diffuse)
    expect(preparedMaterial.normalMap).toBe(normal)
    expect(preparedMaterial.map?.colorSpace).toBe(SRGBColorSpace)
  })

  it('rejects an untextured model instead of presenting a white mesh as final', () => {
    const prepareTexturedScene = (ModelMaterialsModule as Record<string, unknown>).prepareTexturedScene
    expect(typeof prepareTexturedScene).toBe('function')
    if (typeof prepareTexturedScene !== 'function') return

    const source = new Group()
    source.add(new Mesh(undefined, new MeshStandardMaterial()))

    expect(() => prepareTexturedScene(source)).toThrow('模型未包含可展示的 PBR 贴图')
  })
})
