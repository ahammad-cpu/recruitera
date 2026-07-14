export function ResizeHandle({ onMouseDown, ariaLabel }: { onMouseDown: (e: React.MouseEvent) => void; ariaLabel?: string }) {
  return (
    <span
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel ?? 'Resize column'}
      className="group absolute top-0 right-0 h-full w-2 cursor-col-resize select-none flex items-center justify-center"
      style={{ touchAction: 'none' }}
      title="Drag to resize column"
    >
      {/* always-visible faint divider */}
      <span className="h-1/2 w-px bg-border-2 group-hover:bg-accent-strong group-hover:w-[3px] group-active:bg-accent-strong group-active:w-[3px] transition-all rounded-full" />
    </span>
  );
}
