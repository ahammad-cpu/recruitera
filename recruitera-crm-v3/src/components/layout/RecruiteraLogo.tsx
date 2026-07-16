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
