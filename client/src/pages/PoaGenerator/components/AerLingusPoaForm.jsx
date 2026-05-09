import { CLAIM_TYPE_OPTIONS, SIGNATURE_PROCESSING_OPTIONS } from '../poaConstants.js';
import { Field, Select, TextArea, TextInput } from './Field.jsx';
import SignatureDropzone from './SignatureDropzone.jsx';

export default function AerLingusPoaForm({ form, onChange, onSignatureChange, onSubmit, signature, submitting }) {
  return (
    <form className="poa-react-form" onSubmit={onSubmit}>
      <h3>Aer Lingus Form Details</h3>

      <div className="poa-react-grid poa-react-grid--2">
        <Field label="Type of Claim *">
          <Select name="claimType" onChange={onChange} required value={form.claimType}>
            {CLAIM_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Case Number (Optional)">
          <TextInput name="caseNumber" onChange={onChange} type="text" value={form.caseNumber} />
        </Field>
      </div>

      <div className="poa-react-grid poa-react-grid--2">
        <Field label="Passenger First Name *">
          <TextInput name="firstName" onChange={onChange} required type="text" value={form.firstName} />
        </Field>
        <Field label="Passenger Last Name *">
          <TextInput name="lastName" onChange={onChange} required type="text" value={form.lastName} />
        </Field>
      </div>

      <Field label="Passenger Address *">
        <TextArea name="address" onChange={onChange} required rows="2" value={form.address} />
      </Field>

      <div className="poa-react-grid poa-react-grid--3">
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
        <Field label="Flight Number">
          <TextInput name="flightNumber" onChange={onChange} type="text" value={form.flightNumber} />
        </Field>
        <Field label="Flight Date *">
          <TextInput name="flightDate" onChange={onChange} required type="date" value={form.flightDate} />
        </Field>
      </div>

      <Field label="Route">
        <TextInput name="route" onChange={onChange} placeholder="e.g. DUB - JFK" type="text" value={form.route} />
      </Field>

      <Field label="Signature Image *">
        <SignatureDropzone files={signature} onFilesChange={onSignatureChange} required />
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

      <button className="poa-react-submit poa-react-submit--aerlingus" disabled={submitting} type="submit">
        {submitting ? 'Generating...' : 'Generate Aer Lingus PDF'}
      </button>
    </form>
  );
}
