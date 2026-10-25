import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import type { SessionStatus } from "@/lib/types";

type Variant = "primary" | "dark" | "secondary" | "ghost" | "onNight" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-marigold text-night hover:bg-marigold-deep disabled:bg-line disabled:text-muted",
  dark: "bg-night text-white hover:bg-night-raised disabled:opacity-50",
  secondary: "bg-white text-night ring-1 ring-line hover:ring-night/40 disabled:text-muted disabled:hover:ring-line",
  ghost: "text-muted hover:bg-night/5 hover:text-night disabled:opacity-40",
  onNight: "text-white ring-1 ring-night-line hover:bg-night-raised disabled:opacity-40 disabled:hover:bg-transparent",
  danger: "text-[#b3203f] hover:bg-rose/10",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-night placeholder:text-muted/70 focus:border-night focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-sm font-bold text-night">{children}</span>;
}

export function ErrorText({ children, onNight = false }: { children: ReactNode; onNight?: boolean }) {
  if (!children) return null;
  return (
    <p role="alert" className={`text-sm font-bold ${onNight ? "text-rose" : "text-[#b3203f]"}`}>
      {children}
    </p>
  );
}

const statusStyles: Record<SessionStatus, { label: string; light: string; dark: string; dot: string }> = {
  draft: { label: "Draft", light: "bg-night/5 text-muted", dark: "bg-night-raised text-haze", dot: "bg-muted" },
  open: { label: "Live", light: "bg-teal/15 text-[#0d5c57]", dark: "bg-teal/20 text-[#7fe0d8]", dot: "bg-teal" },
  closed: { label: "Closed", light: "bg-rose/15 text-[#9c1c39]", dark: "bg-rose/20 text-[#ffb3c4]", dot: "bg-rose" },
};

export function StatusPill({ status, onNight = false }: { status: SessionStatus; onNight?: boolean }) {
  const s = statusStyles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${onNight ? s.dark : s.light}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** Three rising bars: a poll result in miniature. */
export function Logo({ href = "/", onNight = false }: { href?: string; onNight?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight ${onNight ? "text-white" : "text-night"}`}
    >
      <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
        <rect x="1" y="12" width="6" height="11" rx="2" fill="#4ea8de" />
        <rect x="9" y="6" width="6" height="17" rx="2" fill="#ffb703" />
        <rect x="17" y="1" width="6" height="22" rx="2" fill="#f05d7e" />
      </svg>
      Live Poll
    </Link>
  );
}
