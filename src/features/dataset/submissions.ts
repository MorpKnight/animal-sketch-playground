import type { Classification, Stroke } from '../../model/types'

export type DatasetSubmission = {
  id: string
  feedbackToken: string
}

const modelVersion = 'animal-species-v4'
const preprocessVersion = 'normalized-64x64-white-on-black-v1'

async function responseJson(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error ?? 'Dataset request could not be completed.')
  return payload
}

export async function createDatasetCandidate(classification: Classification, strokes: Stroke[]): Promise<DatasetSubmission> {
  const response = await fetch('/api/submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      predictions: classification.predictions,
      strokes,
      inputPreview: classification.inputPreview,
      modelVersion,
      preprocessVersion,
    }),
  })
  return responseJson(response) as Promise<DatasetSubmission>
}

export async function updateDatasetFeedback(submission: DatasetSubmission, action: 'confirmed' | 'corrected' | 'rejected', userLabel?: string) {
  const response = await fetch(`/api/submissions/${submission.id}/feedback`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, userLabel, feedbackToken: submission.feedbackToken }),
  })
  return responseJson(response)
}
