export function ResizeHandle({ onMouseDown, ariaLabel }: { onMouseDown: (e: React.MouseEvent) => void; ariaLabel?: string }) {
  return (
    <span
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel ?? 'Resize column'}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none group"
      style={{ touchAction: 'none' }}
    >
      <span className="absolute top-1/4 right-0 h-1/2 w-[2px] bg-transparent group-hover:bg-accent-strong transition-colors" />
    </span>
  );
}
