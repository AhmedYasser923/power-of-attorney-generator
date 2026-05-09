import { LANGUAGE_OPTIONS, SIGNATURE_PROCESSING_OPTIONS } from '../poaConstants.js';
import { Field, Select, TextInput } from './Field.jsx';
import SignatureDropzone from './SignatureDropzone.jsx';

export default function StandardPoaForm({ form, onChange, onSignatureChange, onSubmit, signature, submitting }) {
  return (
    <form className="poa-react-form" onSubmit={onSubmit}>
      <div className="poa-form-main">
        <h3>Standard Form Details</h3>

        <div className="poa-react-grid poa-react-grid--2">
          <Field label="Document Language">
            <Select name="lang" onChange={onChange} value={form.lang}>
              {LANGUAGE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="PNR Number *">
            <TextInput
              minLength="5"
              name="pnr"
              onChange={onChange}
              pattern="[A-Za-z0-9]{5,}"
              placeholder="e.g. TGFX69"
              required
              type="text"
              value={form.pnr}
            />
          </Field>
        </div>

        <div className="poa-react-grid poa-react-grid--2">
          <Field label="First Name *">
            <TextInput name="firstName" onChange={onChange} placeholder="First name" required type="text" value={form.firstName} />
          </Field>
          <Field label="Last Name *">
            <TextInput name="lastName" onChange={onChange} placeholder="Last name" required type="text" value={form.lastName} />
          </Field>
        </div>

        <div className="poa-react-grid poa-react-grid--2">
          <Field label="Date *">
            <TextInput name="date" onChange={onChange} required type="date" value={form.date} />
          </Field>
          <Field label="Address *">
            <TextInput name="address" onChange={onChange} placeholder="Full address" required type="text" value={form.address} />
          </Field>
        </div>
      </div>

      <aside className="poa-form-aside">
        <Field label="Signature Image (optional)">
          <SignatureDropzone files={signature} onFilesChange={onSignatureChange} />
        </Field>

        {signature && (
          <div className="poa-processing-box">
            <Field label="Signature Processing Option">
              <Select name="sigProcessing" onChange={onChange} value={form.sigProcessing}>
                {SIGNATURE_PROCESSING_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <button className="poa-react-submit" disabled={submitting} type="submit">
          {submitting ? 'Generating...' : 'Generate Standard PDF'}
        </button>
      </aside>
    </form>
  );
}
