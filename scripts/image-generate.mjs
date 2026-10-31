import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

const args = process.argv.slice(2)
const value = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}
const prompt = value('--prompt')
const imagePath = value('--image')
const outputDir = resolve(value('--out') ?? process.env.IMAGE_OUTPUT_DIR ?? 'outputs/images')
const baseUrl = (process.env.CHENGYING_BASE_URL ?? 'https://sub2api.chengying-she.top/v1').replace(/\/$/, '')
// Text/reasoning models cannot be sent to /v1/images; use an image-capable model.
const model = process.env.IMAGE_MODEL ?? 'gpt-image-2'
const apiKey = process.env.CHENGYING_API_KEY

if (!prompt || !apiKey || (!imagePath && args.includes('--edit'))) {
  console.error('Usage: CHENGYING_API_KEY=... node scripts/image-generate.mjs --prompt "..." [--image path --edit]')
  process.exit(2)
}

const headers = { Authorization: `Bearer ${apiKey}` }
let response
if (imagePath) {
  const form = new FormData()
  form.set('model', model)
  form.set('prompt', prompt)
  form.set('image', new Blob([await (await import('node:fs/promises')).readFile(imagePath)]), basename(imagePath))
  response = await fetch(`${baseUrl}/images/edits`, { method: 'POST', headers, body: form })
} else {
  response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, size: process.env.IMAGE_SIZE ?? '1024x1280', quality: process.env.IMAGE_QUALITY ?? 'high', n: 1 }),
  })
}
if (!response.ok) throw new Error(`Image API failed: ${response.status} ${await response.text()}`)
const payload = await response.json()
const items = payload.data ?? payload.images ?? []
await mkdir(outputDir, { recursive: true })
const files = []
for (const [index, item] of items.entries()) {
  const url = item.url
  const b64 = item.b64_json
  let bytes
  let extension = '.png'
  if (url) {
    const result = await fetch(url)
    if (!result.ok) throw new Error(`Image download failed: ${result.status}`)
    bytes = Buffer.from(await result.arrayBuffer())
    extension = extname(new URL(url).pathname) || '.png'
  } else if (b64) {
    bytes = Buffer.from(b64, 'base64')
  } else if (typeof item === 'string' && item.startsWith('data:')) {
    bytes = Buffer.from(item.split(',', 2)[1], 'base64')
  }
  if (!bytes) continue
  const target = resolve(outputDir, `image-${Date.now()}-${index + 1}${extension}`)
  await writeFile(target, bytes)
  files.push(target)
}
console.log(JSON.stringify({ model, files }, null, 2))
