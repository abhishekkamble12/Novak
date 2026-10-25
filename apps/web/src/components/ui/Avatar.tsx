import React, { useState } from "react";
import { cn } from "../../lib/cn";

const SIZES = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-20 h-20 text-2xl",
  xl: "w-28 h-28 text-4xl",
};

interface AvatarProps {
  src?: string;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Profile picture, or the user's initial on a gradient when there is none (or it fails to load). */
export const Avatar: React.FC<AvatarProps> = ({ src, name, size = "md", className }) => {
  const [failed, setFailed] = useState(false);
  const base = cn("rounded-full object-cover shrink-0 ring-2 ring-brand-500/30", SIZES[size], className);

  if (src && !failed) {
    return <img src={src} alt={name} className={base} onError={() => setFailed(true)} loading="lazy" />;
  }
  return (
    <div
      className={cn(
        base,
        "bg-gradient-brand flex items-center justify-center font-heading font-bold text-white"
      )}
      aria-label={name}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
};
