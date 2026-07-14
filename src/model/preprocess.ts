import type { Stroke } from './types'

export const MODEL_SIZE = 64
const SUPERSAMPLE = 4
const PADDING_FRACTION = 0.1
const STROKE_WIDTH = 4

type Transform = {
  scale: number
  offsetX: number
  offsetY: number
}

export function hasDrawableInk(strokes: Stroke[]): boolean {
  return strokes.some((stroke) => stroke.length >= 2)
}

export function modelTransform(strokes: Stroke[]): Transform | null {
  const points = strokes.flat()
  if (points.length === 0) return null

  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const boundsWidth = Math.max(maxX - minX, 0.0001)
  const boundsHeight = Math.max(maxY - minY, 0.0001)
  const highSize = MODEL_SIZE * SUPERSAMPLE
  const available = highSize * (1 - PADDING_FRACTION * 2)
  const scale = Math.min(available / boundsWidth, available / boundsHeight)
  const renderedWidth = (maxX - minX) * scale
  const renderedHeight = (maxY - minY) * scale

  return {
    scale,
    offsetX: (highSize - renderedWidth) / 2 - minX * scale,
    offsetY: (highSize - renderedHeight) / 2 - minY * scale,
  }
}

export function rasterizeStrokes(strokes: Stroke[]): HTMLCanvasElement {
  const transform = modelTransform(strokes)
  if (!transform) throw new Error('No drawing points are available.')

  const highSize = MODEL_SIZE * SUPERSAMPLE
  const highCanvas = document.createElement('canvas')
  highCanvas.width = highSize
  highCanvas.height = highSize
  const highContext = highCanvas.getContext('2d')
  if (!highContext) throw new Error('Canvas rendering is unavailable.')

  highContext.fillStyle = '#000000'
  highContext.fillRect(0, 0, highSize, highSize)
  highContext.strokeStyle = '#ffffff'
  highContext.fillStyle = '#ffffff'
  highContext.lineWidth = STROKE_WIDTH * SUPERSAMPLE
  highContext.lineCap = 'round'
  highContext.lineJoin = 'round'

  for (const stroke of strokes) {
    if (stroke.length === 0) continue
    const first = stroke[0]
    highContext.beginPath()
    highContext.moveTo(first.x * transform.scale + transform.offsetX, first.y * transform.scale + transform.offsetY)
    for (const point of stroke.slice(1)) {
      highContext.lineTo(point.x * transform.scale + transform.offsetX, point.y * transform.scale + transform.offsetY)
    }
    if (stroke.length === 1) {
      highContext.arc(
        first.x * transform.scale + transform.offsetX,
        first.y * transform.scale + transform.offsetY,
        (STROKE_WIDTH * SUPERSAMPLE) / 2,
        0,
        Math.PI * 2,
      )
      highContext.fill()
    } else {
      highContext.stroke()
    }
  }

  const output = document.createElement('canvas')
  output.width = MODEL_SIZE
  output.height = MODEL_SIZE
  const outputContext = output.getContext('2d')
  if (!outputContext) throw new Error('Canvas rendering is unavailable.')
  outputContext.imageSmoothingEnabled = true
  outputContext.imageSmoothingQuality = 'high'
  outputContext.drawImage(highCanvas, 0, 0, MODEL_SIZE, MODEL_SIZE)
  return output
}

export function canvasToTensor(canvas: HTMLCanvasElement): Float32Array {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas pixel data is unavailable.')
  const pixels = context.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
  const tensor = new Float32Array(MODEL_SIZE * MODEL_SIZE)
  for (let index = 0; index < tensor.length; index += 1) {
    tensor[index] = pixels[index * 4] / 255
  }
  return tensor
}
