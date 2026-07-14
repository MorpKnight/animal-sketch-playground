import { Check, CircleAlert, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { animalGroups, displayLabel, labelsForGroup, supportedAnimalLabels } from '../../model/taxonomy'
import type { Classification } from '../../model/types'
import { type DatasetSubmission, updateDatasetFeedback } from './submissions'

type DatasetFeedbackProps = {
  classification: Classification
  submission: DatasetSubmission | null
  isSavingCandidate: boolean
  saveError: string | null
}

type Step = 'ask' | 'choose' | 'saved' | 'skipped'

export function DatasetFeedback({ classification, submission, isSavingCandidate, saveError }: DatasetFeedbackProps) {
  const predicted = classification.predictions[0]?.label
  const predictedIsSupported = predicted ? supportedAnimalLabels.includes(predicted) : false
  const [step, setStep] = useState<Step>(predictedIsSupported ? 'ask' : 'choose')
  const [group, setGroup] = useState(animalGroups[0]?.id ?? '')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSavingFeedback, setIsSavingFeedback] = useState(false)
  const labels = useMemo(() => labelsForGroup(group), [group])

  const saveFeedback = async (action: 'confirmed' | 'corrected' | 'rejected', userLabel?: string) => {
    if (!submission) return
    setIsSavingFeedback(true)
    setError(null)
    try {
      await updateDatasetFeedback(submission, action, userLabel)
      setStep('saved')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Feedback could not be saved.')
    } finally {
      setIsSavingFeedback(false)
    }
  }

  const chooseAnimal = () => {
    if (!label) {
      setError('Choose the animal you drew.')
      return
    }
    void saveFeedback('corrected', label)
  }

  if (isSavingCandidate) return <section className="dataset-feedback"><p>Saving anonymous sketch for review...</p></section>
  if (saveError) return <section className="dataset-feedback"><p className="feedback-error" role="alert"><CircleAlert size={15} aria-hidden="true" /> {saveError}</p></section>
  if (!submission) return null
  if (step === 'saved') return <section className="dataset-feedback feedback-success"><Check size={18} aria-hidden="true" /><p>Thanks. Your feedback has been saved for review.</p></section>
  if (step === 'skipped') return <section className="dataset-feedback"><p>Model prediction saved for developer review.</p></section>

  return (
    <section className="dataset-feedback" aria-labelledby="feedback-title">
      <p className="section-kicker">Quick feedback</p>
      {step === 'ask' && predicted ? (
        <>
          <h3 id="feedback-title">Is this {displayLabel(predicted)}?</h3>
          <div className="feedback-actions">
            <button className="feedback-button positive" type="button" disabled={isSavingFeedback} onClick={() => void saveFeedback('confirmed')}><ThumbsUp size={16} aria-hidden="true" /> Yes</button>
            <button className="feedback-button" type="button" disabled={isSavingFeedback} onClick={() => setStep('choose')}><ThumbsDown size={16} aria-hidden="true" /> No</button>
            <button className="text-button" type="button" disabled={isSavingFeedback} onClick={() => setStep('skipped')}>Skip</button>
          </div>
        </>
      ) : (
        <>
          <h3 id="feedback-title">What animal did you draw?</h3>
          <div className="feedback-fields">
            <label>Group<select value={group} onChange={(event) => { setGroup(event.target.value); setLabel('') }}>{animalGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Animal<select value={label} onChange={(event) => setLabel(event.target.value)}><option value="">Choose an animal</option>{labels.map((item) => <option key={item} value={item}>{displayLabel(item)}</option>)}</select></label>
          </div>
          <div className="feedback-actions">
            <button className="feedback-button positive" type="button" disabled={isSavingFeedback} onClick={chooseAnimal}>{isSavingFeedback ? 'Saving' : 'Save answer'}</button>
            <button className="text-button" type="button" disabled={isSavingFeedback} onClick={() => setStep('skipped')}>Skip</button>
          </div>
        </>
      )}
      {error && <p className="feedback-error" role="alert"><CircleAlert size={15} aria-hidden="true" /> {error}</p>}
    </section>
  )
}
