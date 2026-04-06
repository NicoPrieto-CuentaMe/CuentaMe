import { signOutAction } from "@/app/actions/auth";

export function Header({ restaurantName }: { restaurantName: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-6">
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--foreground)]">
        {restaurantName}
      </h1>
      <form action={signOutAction}>
        <button
          type="submit"
          className="shrink-0 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)]/80 transition-colors hover:bg-gray-50 hover:text-[var(--foreground)]"
        >
          Cerrar sesión
        </button>
      </form>
    </header>
  );
}
