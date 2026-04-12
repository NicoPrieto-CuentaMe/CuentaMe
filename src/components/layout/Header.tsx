import { signOutAction } from "@/app/actions/auth";

export function Header({ restaurantName }: { restaurantName: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-6">
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-text-primary">
        {restaurantName}
      </h1>
      <form action={signOutAction}>
        <button
          type="submit"
          className="shrink-0 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-border"
        >
          Cerrar sesión
        </button>
      </form>
    </header>
  );
}
