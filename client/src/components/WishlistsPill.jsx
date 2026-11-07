import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ListChecks } from "lucide-react";

// Small pill that shows, on hover/focus/tap, which named wishlists a card is on.
// `lists` is [{ name, qty }]; qty is optional.
export function WishlistsPill({ lists, title }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!pos) return undefined;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  if (!lists?.length) return null;

  function open() {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 220;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = rect.bottom + 6;
    const fitsBelow = below + 36 + lists.length * 30 < window.innerHeight;
    setPos(fitsBelow ? { left, top: below } : { left, bottom: window.innerHeight - rect.top + 6 });
  }

  const label = lists.length === 1 ? lists[0].name : `${lists.length} lists`;

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`be-owners__pill be-wl-pill${pos ? " is-open" : ""}`}
        data-testid="wishlists-pill"
        aria-label={`${title}: ${lists.map((l) => l.name).join(", ")}`}
        aria-expanded={!!pos}
        onMouseEnter={open}
        onMouseLeave={() => setPos(null)}
        onFocus={open}
        onBlur={() => setPos(null)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open();
        }}
      >
        <ListChecks size={12} strokeWidth={2.4} />
        <span>{label}</span>
      </button>
      {pos &&
        createPortal(
          <div className="be-owners__pop be-wl-pop" style={pos} role="tooltip">
            <div className="be-owners__head">{title}</div>
            {lists.map((l) => (
              <div key={l.name} className="be-owners__row">
                <span>{l.name}</span>
                {l.qty != null && <span className="be-owners__qty">×{l.qty}</span>}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
