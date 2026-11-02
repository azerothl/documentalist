import Image from "next/image";
import logo from "@/assets/brand/documentalist-logo.webp";
import logoDark from "@/assets/brand/documentalist-logo-dark.webp";

/**
 * Documentalist logo. The wordmark is dark, so the dark theme swaps in a
 * light-text variant; only the visible image is exposed to assistive tech.
 */
export function BrandLogo({
  height = 32,
  priority = false,
}: {
  height?: number;
  priority?: boolean;
}) {
  const width = Math.round((height * logo.width) / logo.height);
  return (
    <span className="brand-logo">
      <Image
        src={logo}
        alt="Documentalist"
        width={width}
        height={height}
        priority={priority}
        className="brand-logo-light"
        style={{ maxWidth: "100%", height: "auto" }}
      />
      <Image
        src={logoDark}
        alt="Documentalist"
        width={width}
        height={height}
        priority={priority}
        className="brand-logo-dark"
        style={{ maxWidth: "100%", height: "auto" }}
      />
    </span>
  );
}
