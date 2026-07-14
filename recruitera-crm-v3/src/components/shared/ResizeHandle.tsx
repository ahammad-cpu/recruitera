export function ResizeHandle({ onMouseDown, ariaLabel }: { onMouseDown: (e: React.MouseEvent) => void; ariaLabel?: string }) {
  return (
    <span
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel ?? 'Resize column'}
      className="absolute top-0 right-0 bottom-0 w-1.5 -mr-[3px] cursor-col-resize z-10 select-none hover:bg-accent-strong/40 active:bg-accent-strong/60"
      style={{ touchAction: 'none' }}
      title="Drag to resize column"
    />
  );
}
