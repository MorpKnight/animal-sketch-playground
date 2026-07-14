import { useCallback, useEffect, useRef } from 'react'
import type { Point, Stroke } from '../../model/types'

type DrawingCanvasProps = {
  strokes: Stroke[]
  onChange: (strokes: Stroke[]) => void
  disabled?: boolean
}

function normalizedPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
  }
}

function draw(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const bounds = canvas.getBoundingClientRect()
  const pixelRatio = window.devicePixelRatio || 1
  const width = Math.round(bounds.width * pixelRatio)
  const height = Math.round(bounds.height * pixelRatio)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, width, height)
  context.save()
  context.scale(pixelRatio, pixelRatio)
  context.strokeStyle = '#1a2932'
  context.fillStyle = '#1a2932'
  context.lineWidth = 4.5
  context.lineCap = 'round'
  context.lineJoin = 'round'

  for (const stroke of strokes) {
    if (stroke.length === 0) continue
    context.beginPath()
    context.moveTo(stroke[0].x * bounds.width, stroke[0].y * bounds.height)
    for (const point of stroke.slice(1)) {
      context.lineTo(point.x * bounds.width, point.y * bounds.height)
    }
    if (stroke.length === 1) {
      context.arc(stroke[0].x * bounds.width, stroke[0].y * bounds.height, 2.25, 0, Math.PI * 2)
      context.fill()
    } else {
      context.stroke()
    }
  }
  context.restore()
}

export function DrawingCanvas({ strokes, onChange, disabled = false }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activePointerRef = useRef<number | null>(null)
  const strokesRef = useRef(strokes)

  useEffect(() => {
    strokesRef.current = strokes
  }, [strokes])

  const commit = (next: Stroke[]) => {
    strokesRef.current = next
    onChange(next)
  }

  const redraw = useCallback(() => {
    if (canvasRef.current) draw(canvasRef.current, strokes)
  }, [strokes])

  useEffect(() => {
    redraw()
    const observer = new ResizeObserver(redraw)
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [redraw])

  const appendPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const next = normalizedPoint(event)
    const currentStrokes = strokesRef.current
    const currentStroke = currentStrokes.at(-1)
    const previous = currentStroke?.at(-1)
    if (previous && Math.hypot(next.x - previous.x, next.y - previous.y) < 0.0015) return
    commit([...currentStrokes.slice(0, -1), [...(currentStroke ?? []), next]])
  }

  return (
    <canvas
      ref={canvasRef}
      className="drawing-canvas"
      aria-label="Animal drawing canvas"
      role="img"
      tabIndex={0}
      onPointerDown={(event) => {
        if (disabled) return
        event.currentTarget.setPointerCapture(event.pointerId)
        activePointerRef.current = event.pointerId
        commit([...strokesRef.current, [normalizedPoint(event)]])
      }}
      onPointerMove={(event) => {
        if (!disabled && activePointerRef.current === event.pointerId) appendPoint(event)
      }}
      onPointerUp={(event) => {
        if (activePointerRef.current === event.pointerId) activePointerRef.current = null
      }}
      onPointerCancel={() => { activePointerRef.current = null }}
    />
  )
}
