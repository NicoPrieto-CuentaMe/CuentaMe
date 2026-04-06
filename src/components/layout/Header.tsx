import { PLACEHOLDER_RESTAURANT_NAME } from "@/lib/config";

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)] px-6">
      <h1 className="text-base font-semibold text-[var(--foreground)]">
        {PLACEHOLDER_RESTAURANT_NAME}
      </h1>
    </header>
  );
}
