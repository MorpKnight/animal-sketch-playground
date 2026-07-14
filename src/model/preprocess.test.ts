import { describe, expect, it } from 'vitest'
import { hasDrawableInk, modelTransform } from './preprocess'

describe('modelTransform', () => {
  it('centers a square drawing inside the 10 percent padded model area', () => {
    const transform = modelTransform([[{ x: 0, y: 0 }, { x: 1, y: 1 }]])
    expect(transform).not.toBeNull()
    expect(transform?.scale).toBeCloseTo(204.8)
    expect(transform?.offsetX).toBeCloseTo(25.6)
    expect(transform?.offsetY).toBeCloseTo(25.6)
  })

  it('keeps aspect ratio and centers a wide drawing vertically', () => {
    const transform = modelTransform([[{ x: 0, y: 0 }, { x: 1, y: 0.5 }]])
    expect(transform).not.toBeNull()
    expect(transform?.scale).toBeCloseTo(204.8)
    expect(transform?.offsetX).toBeCloseTo(25.6)
    expect(transform?.offsetY).toBeCloseTo(76.8)
  })
})

describe('hasDrawableInk', () => {
  it('requires a stroke with at least two points', () => {
    expect(hasDrawableInk([])).toBe(false)
    expect(hasDrawableInk([[{ x: 0.5, y: 0.5 }]])).toBe(false)
    expect(hasDrawableInk([[{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]])).toBe(true)
  })
})
