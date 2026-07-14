import { Check, CircleAlert, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { animalGroups, displayLabel, labelsForGroup, supportedAnimalLabels } from '../../model/taxonomy'
import type { Classification, Stroke } from '../../model/types'

type DatasetFeedbackProps = {
  classification: Classification
  strokes: Stroke[]
}

type Step = 'ask' | 'choose' | 'consent' | 'saved' | 'skipped'

const modelVersion = 'animal-species-v4'
const preprocessVersion = 'normalized-64x64-white-on-black-v1'

export function DatasetFeedback({ classification, strokes }: DatasetFeedbackProps) {
  const predicted = classification.predictions[0]?.label
  const predictedIsSupported = predicted ? supportedAnimalLabels.includes(predicted) : false
  const [step, setStep] = useState<Step>(predictedIsSupported ? 'ask' : 'choose')
  const [group, setGroup] = useState(animalGroups[0]?.id ?? '')
  const [label, setLabel] = useState(predictedIsSupported ? predicted : '')
  const [feedback, setFeedback] = useState<'confirmed' | 'corrected'>(predictedIsSupported ? 'confirmed' : 'corrected')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const labels = useMemo(() => labelsForGroup(group), [group])

  const selectGroup = (nextGroup: string) => {
    setGroup(nextGroup)
    setLabel('')
  }

  const beginSave = () => {
    if (!label) {
      setError('Choose the animal you drew.')
      return
    }
    setError(null)
    setStep('consent')
  }

  const submit = async () => {
    if (!consent || !label) return
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          feedback,
          userLabel: label,
          predictions: classification.predictions,
          strokes,
          inputPreview: classification.inputPreview,
          modelVersion,
          preprocessVersion,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Contribution could not be saved.')
      setStep('saved')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Contribution could not be saved.')
    } finally {
      setIsSaving(false)
    }
  }

  if (step === 'saved') {
    return <section className="dataset-feedback feedback-success"><Check size={18} aria-hidden="true" /><p>Thank you. Your anonymous sketch is pending review.</p></section>
  }

  if (step === 'skipped') {
    return <section className="dataset-feedback"><p>Thanks for checking the result.</p></section>
  }

  return (
    <section className="dataset-feedback" aria-labelledby="feedback-title">
      <p className="section-kicker">Help improve the model</p>
      {step === 'ask' && predicted ? (
        <>
          <h3 id="feedback-title">Is this {displayLabel(predicted)}?</h3>
          <div className="feedback-actions">
            <button className="feedback-button positive" type="button" onClick={() => { setFeedback('confirmed'); setLabel(predicted); setStep('consent') }}><ThumbsUp size={16} aria-hidden="true" /> Yes</button>
            <button className="feedback-button" type="button" onClick={() => { setFeedback('corrected'); setLabel(''); setStep('choose') }}><ThumbsDown size={16} aria-hidden="true" /> No</button>
            <button className="text-button" type="button" onClick={() => setStep('skipped')}>Not sure</button>
          </div>
        </>
      ) : step === 'choose' ? (
        <>
          <h3 id="feedback-title">What animal did you draw?</h3>
          <div className="feedback-fields">
            <label>Group
              <select value={group} onChange={(event) => selectGroup(event.target.value)}>
                {animalGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>Animal
              <select value={label} onChange={(event) => setLabel(event.target.value)}>
                <option value="">Choose an animal</option>
                {labels.map((item) => <option key={item} value={item}>{displayLabel(item)}</option>)}
              </select>
            </label>
          </div>
          <div className="feedback-actions">
            <button className="feedback-button positive" type="button" onClick={beginSave}>Continue</button>
            <button className="text-button" type="button" onClick={() => setStep('skipped')}>Not sure</button>
          </div>
        </>
      ) : (
        <>
          <h3 id="feedback-title">Share this anonymous sketch?</h3>
          <p className="feedback-copy">It includes the normalized model image, drawing strokes, your selected label, and model result. No account or personal details are collected.</p>
          <label className="consent-control"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I agree to share this sketch for model improvement.</label>
          <div className="feedback-actions">
            <button className="feedback-button positive" type="button" disabled={!consent || isSaving} onClick={submit}><Send size={16} aria-hidden="true" /> {isSaving ? 'Saving' : 'Share sketch'}</button>
            <button className="text-button" type="button" disabled={isSaving} onClick={() => setStep('skipped')}>No thanks</button>
          </div>
        </>
      )}
      {error && <p className="feedback-error" role="alert"><CircleAlert size={15} aria-hidden="true" /> {error}</p>}
    </section>
  )
}
