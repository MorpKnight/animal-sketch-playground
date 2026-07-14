export type Point = {
  x: number
  y: number
}

export type Stroke = Point[]

export type ModelManifest = {
  model_name: string
  model_version: string
  file: string
  input: {
    name: string
    shape: number[]
  }
  output: {
    name: string
    labels: string[]
  }
}

export type Prediction = {
  label: string
  confidence: number
}

export type Classification = {
  predictions: Prediction[]
  accepted: Prediction | null
  inputPreview: string
}
