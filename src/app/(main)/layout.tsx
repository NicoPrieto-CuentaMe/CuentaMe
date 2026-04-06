import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";

export default async function MainLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await auth();
  if (!session?.user?.restaurantName) redirect("/login");

  return (
    <AppShell restaurantName={session.user.restaurantName}>{children}</AppShell>
  );
}
