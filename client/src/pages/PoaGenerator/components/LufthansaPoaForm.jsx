import { SIGNATURE_PROCESSING_OPTIONS } from '../poaConstants.js';
import { DateInput, Field, Select, TextArea, TextInput } from './Field.jsx';
import SignatureDropzone from './SignatureDropzone.jsx';

function getFilledPassengerCount(form) {
  return [4, 3, 2, 1].find((index) => form[`fullName${index}`].trim()) || 1;
}

export default function LufthansaPoaForm({ form, onChange, onSignaturesChange, onSubmit, signatures, submitting }) {
  const visiblePassengerCount = getFilledPassengerCount(form);

  return (
    <form className="poa-react-form" onSubmit={onSubmit}>
      <div className="poa-form-main">
        <h3>Lufthansa Form Details</h3>

        <div className="poa-react-grid poa-react-grid--4">
          <Field label="Flight Number">
            <TextInput name="flightNumber" onChange={onChange} type="text" value={form.flightNumber} />
          </Field>
          <Field label="PNR / Booking Code *">
            <TextInput
              maxLength="9"
              minLength="5"
              name="pnr"
              onChange={onChange}
              pattern="[A-Za-z0-9]{5,9}"
              required
              type="text"
              value={form.pnr}
            />
          </Field>
          <Field label="Flight Date *">
            <DateInput name="flightDate" onChange={onChange} required value={form.flightDate} />
          </Field>
          <Field label="Claim Submission Date *">
            <DateInput name="claimDate" onChange={onChange} required value={form.claimDate} />
          </Field>
        </div>

        <section className="poa-react-panel">
          <h4>Passenger Details</h4>
          <div className="poa-passenger-grid">
            {Array.from({ length: visiblePassengerCount }, (_, index) => index + 1).map((index) => (
              <Field key={index} label={`Passenger ${index} Full Name ${index === 1 ? '*' : '(Optional)'}`}>
                <TextInput
                  name={`fullName${index}`}
                  onChange={onChange}
                  placeholder="e.g. Pamela Nelson"
                  required={index === 1}
                  type="text"
                  value={form[`fullName${index}`]}
                />
              </Field>
            ))}
          </div>
          <Field label="Main Claimer Address *">
            <TextArea name="address1" onChange={onChange} required rows="2" value={form.address1} />
          </Field>
        </section>
      </div>

      <aside className="poa-form-aside">
        <section className="poa-react-panel">
          <h4>Signatures</h4>
          <Field label="Signature Images">
            <SignatureDropzone files={signatures} maxFiles={4} multiple onFilesChange={onSignaturesChange} />
          </Field>
          {signatures.length > 0 && (
            <div className="poa-processing-list">
              <span>Processing Method per Signature</span>
              {signatures.map((_, i) => i + 1).map((index) => (
                <Field key={index} label={`Sig ${index}`}>
                  <Select name={`sigProcessing${index}`} onChange={onChange} value={form[`sigProcessing${index}`]}>
                    {SIGNATURE_PROCESSING_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          )}
        </section>

        <button className="poa-react-submit" disabled={submitting} type="submit">
          {submitting ? 'Generating...' : 'Generate Lufthansa PDF'}
        </button>
      </aside>
    </form>
  );
}
