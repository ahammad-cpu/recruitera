export function RecruiteraLogo({ size = 30 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo.webp`}
      alt="Recruitera"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: 8, display: 'block', flexShrink: 0 }}
    />
  );
}

/** Full icon + wordmark lockup — used in the sidebar header when it's
 * expanded (the icon-only RecruiteraLogo above is used when collapsed,
 * since there's no room for the wordmark at 60px wide). */
export function RecruiteraFullLogo({ height = 28 }: { height?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo-full.svg`}
      alt="Recruitera"
      height={height}
      style={{ height, width: 'auto', display: 'block' }}
    />
  );
}
