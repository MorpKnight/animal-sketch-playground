type DatasetConsentModalProps = {
  onChoose: (choice: 'share' | 'local') => void
}

export function DatasetConsentModal({ onChoose }: DatasetConsentModalProps) {
  return (
    <div className="consent-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <section className="consent-modal">
        <p className="eyebrow">Improve Animal Sketch</p>
        <h2 id="consent-title">Help make the model smarter.</h2>
        <p>Shared sketches are stored anonymously with model predictions and may be reviewed to improve future versions. No account or personal details are collected.</p>
        <div className="consent-actions">
          <button className="button button-primary" type="button" onClick={() => onChoose('share')}>Continue and share sketches</button>
          <button className="button button-secondary" type="button" onClick={() => onChoose('local')}>Continue without sharing</button>
        </div>
      </section>
    </div>
  )
}
