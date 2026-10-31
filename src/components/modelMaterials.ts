import { Mesh, MeshStandardMaterial, Object3D, SRGBColorSpace, Texture } from 'three'

const textureSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const

export function prepareTexturedScene(source: Object3D) {
  const scene = source.clone(true)
  const textures = new Set<string>()
  let materialCount = 0
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material]
    const materials = sourceMaterials.map((sourceMaterial) => {
      const material = sourceMaterial.clone() as MeshStandardMaterial
      materialCount += 1
      for (const slot of textureSlots) {
        const texture = material[slot] as Texture | null
        if (!texture?.isTexture) continue
        textures.add(texture.uuid)
        if (slot === 'map' || slot === 'emissiveMap') texture.colorSpace = SRGBColorSpace
      }
      material.needsUpdate = true
      return material
    })
    object.material = Array.isArray(object.material) ? materials : materials[0]
  })
  if (textures.size === 0) throw new Error('模型未包含可展示的 PBR 贴图')
  return { scene, materialCount, textureCount: textures.size }
}
