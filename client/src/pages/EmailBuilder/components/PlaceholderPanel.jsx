import PlaceholderInput from './PlaceholderInput.jsx';

export default function PlaceholderPanel({ placeholders, values, onChange }) {
  if (!placeholders.length) return null;

  return (
    <section className="email-placeholder-panel">
      <h3>Fill in the details</h3>
      <div>
        {placeholders.map((p) => (
          <PlaceholderInput
            key={p.name}
            label={p.label}
            name={p.name}
            onChange={onChange}
            value={values[p.name]}
          />
        ))}
      </div>
    </section>
  );
}
