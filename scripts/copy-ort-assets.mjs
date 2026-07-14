import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const source = join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist')
const destination = join(process.cwd(), 'public', 'ort')

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
const runtimeFiles = [
  'ort.wasm.min.js',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
]
await Promise.all(runtimeFiles.map((file) => cp(join(source, file), join(destination, file))))
console.log(`Copied ${runtimeFiles.length} ONNX Runtime WASM assets.`)
