export function TuloyMark({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0 text-brand-text">
      <path d="M11 37V10a3 3 0 0 1 3-3h20a3 3 0 0 1 3 3v27" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M5 41h13c5 0 6-4 6-9V19m-5 5 5-5 5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
