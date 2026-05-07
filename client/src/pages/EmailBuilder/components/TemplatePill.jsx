export default function TemplatePill({ checked, isRejection, label, onChange }) {
  return (
    <label className={`email-builder-pill${checked ? ' is-selected' : ''}${isRejection ? ' is-rejection' : ''}`}>
      <input checked={checked} onChange={onChange} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
