export function Field({ children, label }) {
  return (
    <label className="poa-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props) {
  return <input className="poa-react-input" {...props} />;
}

export function TextArea(props) {
  return <textarea className="poa-react-textarea" {...props} />;
}

export function Select({ children, ...props }) {
  return (
    <select className="poa-react-select" {...props}>
      {children}
    </select>
  );
}
