import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/** Small, boring primitives so pages don't each reinvent the same Tailwind strings. */

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const base = "rounded px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";
  const v =
    variant === "primary"
      ? "bg-brass text-ink hover:brightness-110"
      : variant === "danger"
        ? "bg-felt-700 text-chalk hover:bg-red-900/60"
        : "bg-felt-700 text-chalk hover:bg-felt-700/70";
  return <button className={`${base} ${v} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded border border-felt-700 bg-felt-800 px-3 py-2 text-chalk placeholder:text-chalk-dim/70 ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-chalk-dim">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-chalk-dim/80">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-300">{children}</p>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg bg-felt-800 p-5 ${className}`}>{children}</div>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-display text-3xl font-medium tracking-tight">{children}</h1>;
}
