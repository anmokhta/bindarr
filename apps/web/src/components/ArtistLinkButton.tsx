export default function ArtistLinkButton({
  artist,
  onClick,
  className = "",
}: {
  artist: string;
  onClick: (name: string) => void;
  className?: string;
}) {
  const tip = `More by ${artist}`;
  return (
    <button
      type="button"
      className={`icon-btn ${className}`.trim()}
      aria-label={tip}
      title={tip}
      data-tip={tip}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick(artist);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r="2" />
        <circle cx="17.5" cy="10.5" r="2" />
        <circle cx="8.5" cy="7.5" r="2" />
        <circle cx="6.5" cy="12.5" r="2" />
        <path d="M12 22a8 8 0 0 1-8-8c0-3.5 2.5-6 5-8 1 3 4 5 7 5a5 5 0 0 1 4 8c-1.5 1.5-4 3-8 3Z" />
      </svg>
    </button>
  );
}
