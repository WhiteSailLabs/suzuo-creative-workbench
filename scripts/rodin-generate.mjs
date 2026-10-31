import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const node = process.execPath
const cli = resolve(process.env.HYPER3D_CLI ?? `${process.env.HOME}/.local/share/node-v24.21.0/lib/node_modules/@hyper3d/cli/dist/index.js`)
const outputDir = resolve(process.env.RODIN_OUTPUT_DIR ?? 'outputs/rodin')
const inputArgs = process.argv.slice(2)
const images = []
const positionalPrompt = []
let namedPrompt = ''
for (let index = 0; index < inputArgs.length; index += 1) {
  const argument = inputArgs[index]
  if (argument === '--image') {
    const value = inputArgs[index + 1]
    if (!value) throw new Error('--image requires a path')
    images.push(resolve(value))
    index += 1
  } else if (argument === '--prompt') {
    const value = inputArgs[index + 1]
    if (!value) throw new Error('--prompt requires text')
    namedPrompt = value.trim()
    index += 1
  } else {
    positionalPrompt.push(argument)
  }
}
const prompt = namedPrompt || positionalPrompt.join(' ').trim()

if (images.length > 5 || (!images.length && !prompt)) {
  console.error('Usage: node scripts/rodin-generate.mjs [--prompt "description"] [--image reference.png ...]')
  process.exit(2)
}

async function run(args) {
  const { stdout } = await execFileAsync(node, [cli, ...args], { maxBuffer: 1024 * 1024 })
  return JSON.parse(stdout)
}

const generationArgs = ['generate']
if (images.length) {
  for (const image of images) generationArgs.push('--image', image)
} else {
  generationArgs.push('--prompt', prompt)
}
generationArgs.push(
  '--tier', process.env.RODIN_TIER ?? 'Gen-2.5-Extreme-Low',
  '--format', process.env.RODIN_FORMAT ?? 'glb', '--output', 'json',
)
const generation = await run(generationArgs)
const completed = await run(['poll', '--timeout', process.env.RODIN_TIMEOUT ?? '600', '--output', 'json', generation.generation_id])
if (completed.status !== 'completed') {
  throw new Error(`Rodin generation did not complete: ${completed.status}`)
}

const result = await run(['result', '--output', 'json', generation.generation_id])
await mkdir(outputDir, { recursive: true })
const files = []
for (const file of result.files ?? []) {
  const response = await fetch(file.url)
  if (!response.ok) throw new Error(`Download failed for ${file.name}: ${response.status}`)
  const target = join(outputDir, `${generation.generation_id}-${basename(file.name)}`)
  await writeFile(target, Buffer.from(await response.arrayBuffer()))
  files.push({ name: file.name, role: file.role, path: target })
}

console.log(JSON.stringify({ generation_id: generation.generation_id, status: completed.status, files }, null, 2))
