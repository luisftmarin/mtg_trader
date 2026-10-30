import React from "react";
import { MessageCircle } from "lucide-react";
import { useAuth, useData } from "../context.jsx";
import { displayName } from "../lib/format.js";

export function whatsappUrl(phone, text) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function useHasWhatsApp(friendId) {
  const { contacts } = useData();
  return !!contacts?.[String(friendId)];
}

export function WhatsAppButton({ friendId, name, compact = false, details = "" }) {
  const { identity } = useAuth();
  const { contacts, friends } = useData();
  if (!friendId || String(friendId) === String(identity?.id)) return null;
  const phone = contacts?.[String(friendId)];
  if (!phone) return null;
  const self = friends.find((f) => String(f.id) === String(identity.id));
  const me = (self && displayName(self)) || identity.displayName || identity.name;
  const intro = `Hi ${name}, it's ${me} from Binder Exchange.`;
  const href = whatsappUrl(phone, details ? `${intro} ${details}` : `${intro} Want to trade?`);
  return (
    <a
      className={`be-btn be-btn--outline be-wa-btn${compact ? " be-wa-btn--compact" : ""}`}
      href={href}
      target="_blank"
      rel="noreferrer"
      data-testid="whatsapp-link"
      aria-label={`Message ${name} on WhatsApp`}
      title={`Message ${name} on WhatsApp`}
    >
      <MessageCircle size={15} strokeWidth={2.2} />
      {!compact && <span>WhatsApp</span>}
    </a>
  );
}
