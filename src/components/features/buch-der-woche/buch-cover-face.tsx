/**
 * Book-face image: public path via next/image, or data-URL cover via img.
 */

import Image from "next/image";
import { cn } from "@/lib/utils";

type BuchCoverFaceProps = {
  src: string;
  alt: string;
  className?: string;
  /** object-fit / position for crops („parts of the cover“). */
  objectPosition?: string;
  priority?: boolean;
  sizes?: string;
};

function isDataUrl(src: string): boolean {
  return src.startsWith("data:image/");
}

/**
 * Renders cover / marketing art as a fill image inside a sized parent.
 */
export function BuchCoverFace({
  src,
  alt,
  className,
  objectPosition = "center",
  priority = false,
  sizes = "(max-width: 768px) 80vw, 360px",
}: BuchCoverFaceProps) {
  if (isDataUrl(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- roman cover is a data URL
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn("h-full w-full object-cover", className)}
        style={{ objectPosition }}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className={cn("object-cover", className)}
      style={{ objectPosition }}
    />
  );
}
