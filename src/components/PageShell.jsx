import React from "react";

/**
 * Consistent page chrome: optional ambient glow + max-width container.
 */
export function PageShell({
  children,
  className = "",
  glow = "default",
  width = "default",
}) {
  const widths = {
    default: "max-w-7xl",
    narrow: "max-w-5xl",
    wide: "max-w-[90rem]",
  };
  return (
    <div className={`relative min-h-screen bg-zinc-950 text-zinc-100 ${className}`}>
      {glow !== "none" && (
        <>
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 h-[32rem] ${
              glow === "subtle"
                ? "bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.08),transparent_60%)]"
                : "bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.14),rgba(244,63,94,0.06)_40%,transparent_70%)]"
            }`}
          />
          <div className="pointer-events-none absolute -right-24 top-24 h-[28rem] w-[28rem] rounded-full bg-rose-500/10 blur-[100px]" />
        </>
      )}
      <div className={`relative z-10 mx-auto ${widths[width] || widths.default} px-4 sm:px-6 lg:px-8`}>
        {children}
      </div>
    </div>
  );
}

export function SectionHeader({ kicker, title, description, action }) {
  return (
    <div className="mb-10 flex flex-col gap-6 sm:mb-14 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {kicker && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-400/90">
            {kicker}
          </p>
        )}
        <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
          {title}
        </h2>
        {description && (
          <p className="mt-4 text-base leading-relaxed text-zinc-400 font-light sm:text-lg">
            {description}
          </p>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
