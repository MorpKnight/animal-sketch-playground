import type * as Ort from 'onnxruntime-web'
import { animalContext } from './taxonomy'
import { canvasToTensor, rasterizeStrokes } from './preprocess'
import type { Classification, ModelManifest, Prediction, Stroke } from './types'

const minimumConfidence = 0.3

declare global {
  interface Window {
    ort?: typeof Ort
  }
}

function getOrt(): typeof Ort {
  if (!window.ort) throw new Error('The ONNX Runtime browser asset did not load.')
  return window.ort
}

export class SketchModelRuntime {
  private session: Ort.InferenceSession | null = null
  private manifest: ModelManifest | null = null

  async prepare(): Promise<ModelManifest> {
    if (this.session && this.manifest) return this.manifest

    const ort = getOrt()
    ort.env.wasm.wasmPaths = '/ort/'
    ort.env.wasm.numThreads = 1
    const response = await fetch('/models/model-manifest.json')
    if (!response.ok) throw new Error('The model manifest could not be loaded.')
    const manifest = (await response.json()) as ModelManifest
    const session = await ort.InferenceSession.create(`/models/${manifest.file}`, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
    this.manifest = manifest
    this.session = session
    return manifest
  }

  async classify(strokes: Stroke[]): Promise<Classification> {
    const manifest = await this.prepare()
    if (!this.session) throw new Error('The model session is not ready.')
    const inputCanvas = rasterizeStrokes(strokes)
    const ort = getOrt()
    const tensor = new ort.Tensor('float32', canvasToTensor(inputCanvas), manifest.input.shape)
    const outputs = await this.session.run({ [manifest.input.name]: tensor })
    const values = outputs[manifest.output.name].data as Float32Array
    const predictions = manifest.output.labels
      .map((label, index): Prediction => ({ label, confidence: values[index] ?? 0 }))
      .sort((first, second) => second.confidence - first.confidence)
      .slice(0, 3)
    const first = predictions[0]
    const accepted = first && first.label !== 'other' && first.confidence >= minimumConfidence && animalContext(first.label)
      ? first
      : null

    return {
      predictions,
      accepted,
      inputPreview: inputCanvas.toDataURL('image/png'),
    }
  }
}
