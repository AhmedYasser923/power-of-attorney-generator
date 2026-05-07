const WAND_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 4V2" />
    <path d="M15 16v-2" />
    <path d="M8 9h2" />
    <path d="M20 9h2" />
    <path d="M17.8 11.8 19 13" />
    <path d="M15 9h.01" />
    <path d="M17.8 6.2 19 5" />
    <path d="m3 21 9-9" />
    <path d="M12.2 6.2 11 5" />
  </svg>
);

export default function MagicWandButton({ onClick, refining }) {
  return (
    <button
      className="email-magic-wand"
      disabled={refining}
      onClick={onClick}
      title="Refine with AI"
      type="button"
    >
      {refining ? <span className="email-magic-wand__spinner" /> : WAND_SVG}
    </button>
  );
}
