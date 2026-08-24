import React from "react";

export function Button({ variant = "secondary", type = "button", className = "", children, ...props }) {
  const variantClass =
    variant === "primary"
      ? "btn btn--primary"
      : variant === "ghost"
        ? "btn btn--ghost"
        : variant === "danger"
          ? "btn btn--danger"
          : "btn btn--secondary";
  return (
    <button type={type} className={`${variantClass} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function IconButton({ bare, className = "", children, type = "button", ...props }) {
  return (
    <button type={type} className={`icon-btn ${bare ? "icon-btn--bare" : ""} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function TextField({ compact, className = "", ...props }) {
  return <input className={`field ${compact ? "field--compact" : ""} ${className}`.trim()} {...props} />;
}

export function Panel({ className = "", children, style }) {
  return (
    <div className={`panel ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

export function Badge({ children }) {
  return <span className="badge">{children}</span>;
}
