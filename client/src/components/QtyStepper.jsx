import React from "react";

export const LANGS = ["EN", "DE", "PT", "ES", "FR", "IT", "JP"];

export function QtyStepper({ value, onDec, onInc, compact }) {
  return (
    <div className={`be-stepper${compact ? " be-stepper--compact" : ""}`}>
      <button type="button" onClick={onDec} aria-label="Decrease quantity">
        −
      </button>
      <span>{value}</span>
      <button type="button" onClick={onInc} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}

export function LangSelect({ value, onChange }) {
  return (
    <select className="be-lang" value={value || "EN"} onChange={(e) => onChange(e.target.value)}>
      {LANGS.map((l) => (
        <option key={l}>{l}</option>
      ))}
    </select>
  );
}

export function ManaDots({ colors }) {
  const list = colors?.length ? colors : ["var(--mana-c)"];
  return (
    <div className="be-mana">
      {list.map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </div>
  );
}
