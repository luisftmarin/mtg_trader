import React, { useRef } from "react";
import { useCards } from "./CardPreview.jsx";

// Any card name in the app. Dotted underline marks it as a hover target and
// tabIndex 0 means keyboard users get the same preview on focus.
export function CardName({ name, className = "", ...props }) {
  const { openPreview, closePreview } = useCards();
  const ref = useRef(null);
  return (
    <button
      type="button"
      ref={ref}
      tabIndex={0}
      className={`card-name ${className}`.trim()}
      data-testid="card-name"
      onMouseEnter={() => openPreview(name, ref.current)}
      onMouseLeave={closePreview}
      onFocus={() => openPreview(name, ref.current)}
      onBlur={closePreview}
      {...props}
    >
      {name}
    </button>
  );
}
