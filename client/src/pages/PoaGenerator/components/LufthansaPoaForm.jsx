import { SIGNATURE_PROCESSING_OPTIONS } from '../poaConstants.js';
import { Field, Select, TextArea, TextInput } from './Field.jsx';
import SignatureDropzone from './SignatureDropzone.jsx';

export default function LufthansaPoaForm({ form, onChange, onSignaturesChange, onSubmit, signatures, submitting }) {
  return (
    <form className="poa-react-form" onSubmit={onSubmit}>
      <h3>Lufthansa Form Details</h3>

      <div className="poa-react-grid poa-react-grid--3">
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
          <TextInput name="flightDate" onChange={onChange} required type="date" value={form.flightDate} />
        </Field>
      </div>

      <div className="poa-react-split">
        <section className="poa-react-panel">
          <h4>Passenger Details</h4>
          {[1, 2, 3, 4].map((index) => (
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
          <Field label="Main Claimer Address *">
            <TextArea name="address1" onChange={onChange} required rows="2" value={form.address1} />
          </Field>
        </section>

        <section className="poa-react-panel">
          <h4>Signatures</h4>
          <Field label="Claim Submission Date *">
            <TextInput name="claimDate" onChange={onChange} required type="date" value={form.claimDate} />
          </Field>
          <Field label="Signature Images">
            <SignatureDropzone files={signatures} maxFiles={4} multiple onFilesChange={onSignaturesChange} />
          </Field>
          <div className="poa-processing-list">
            <span>Processing Method per Signature</span>
            {[1, 2, 3, 4].map((index) => (
              <Field key={index} label={`Sig ${index}`}>
                <Select name={`sigProcessing${index}`} onChange={onChange} value={form[`sigProcessing${index}`]}>
                  {SIGNATURE_PROCESSING_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </section>
      </div>

      <button className="poa-react-submit" disabled={submitting} type="submit">
        {submitting ? 'Generating...' : 'Generate Lufthansa PDF'}
      </button>
    </form>
  );
}
