import { useState, useEffect } from "react";

interface ProductImageProps {
  src?: string | null;
  alt: string;
  fallbackEmoji?: string;
  className?: string;
  containerClassName?: string;
  loadingClassName?: string;
  crossOrigin?: "anonymous" | "use-credentials";
}

/**
 * Reusable Product Image Component
 *
 * Requirements:
 * - Uses object-fit: contain (enforced via 'object-contain')
 * - Provides loading state with smooth placeholder shimmer
 * - Provides graceful broken-image fallback to product emoji or generic icon
 * - Products without images display normal emoji without visual degradation
 */
export function ProductImage({
  src,
  alt,
  fallbackEmoji = "🛍️",
  className = "",
  containerClassName = "",
  crossOrigin,
}: ProductImageProps) {
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(src && src.trim().length > 0));
  const [hasError, setHasError] = useState<boolean>(false);

  // Reset state if image source changes
  useEffect(() => {
    if (src && src.trim().length > 0) {
      setIsLoading(true);
      setHasError(false);
    } else {
      setIsLoading(false);
      setHasError(false);
    }
  }, [src]);

  const cleanSrc = src?.trim();
  const shouldRenderImage = Boolean(cleanSrc && !hasError);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden select-none ${containerClassName}`}
    >
      {shouldRenderImage ? (
        <>
          {/* Skeleton Shimmer while Image is Loading */}
          {isLoading && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-gray-100 animate-pulse text-xs text-gray-400 z-10"
              aria-hidden="true"
            >
              <span className="text-base opacity-40">{fallbackEmoji}</span>
            </div>
          )}

          {/* Core Product Image with strictly enforced object-fit: contain */}
          <img
            src={cleanSrc}
            alt={alt || "Product image"}
            loading="lazy"
            crossOrigin={crossOrigin}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setHasError(true);
              setIsLoading(false);
            }}
            className={`w-full h-full object-contain transition-opacity duration-200 ${
              isLoading ? "opacity-0" : "opacity-100"
            } ${className}`}
            style={{ objectFit: "contain" }}
          />
        </>
      ) : (
        /* Fallback Emoji Display when Image is Unavailable or Failed to Load */
        <span
          className="flex items-center justify-center text-center leading-none"
          role="img"
          aria-label={alt || "Product icon"}
        >
          {fallbackEmoji}
        </span>
      )}
    </div>
  );
}
