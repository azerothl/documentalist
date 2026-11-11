/**
 * Motif de points du Groupe FASST : cercles blancs translucides, petits près
 * du bord gauche et plus grands vers le centre, disposés en arc.
 */
const DOTS = Array.from({ length: 5 }, (_, ring) => {
  const radius = 70 + ring * 52;
  const size = 3 + ring * 2.6;
  const count = 5 + ring * 2;
  return Array.from({ length: count }, (_, i) => {
    const angle = ((-65 + (130 * i) / (count - 1)) * Math.PI) / 180;
    return {
      cx: Math.round((-20 + radius * Math.cos(angle)) * 10) / 10,
      cy: Math.round((200 + radius * Math.sin(angle)) * 10) / 10,
      r: size,
    };
  });
}).flat();

export function FasstDots({ className = "fasst-dots" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 300 400"
      aria-hidden="true"
      focusable="false"
    >
      {DOTS.map((dot, i) => (
        <circle key={i} {...dot} fill="#ffffff" fillOpacity="0.1" />
      ))}
    </svg>
  );
}
