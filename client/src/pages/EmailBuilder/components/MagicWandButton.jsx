export default function MagicWandButton({ onClick, refining }) {
  return (
    <button
      aria-label="Refine with Gemini"
      className={`email-magic-wand${refining ? ' is-refining' : ''}`}
      disabled={refining}
      onClick={onClick}
      title="Refine with Gemini"
      type="button"
    >
      <img alt="" src="/images/gemini-color.svg" />
    </button>
  );
}
