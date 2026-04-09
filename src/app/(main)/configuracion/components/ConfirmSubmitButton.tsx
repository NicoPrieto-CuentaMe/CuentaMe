"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  className,
}: {
  children: React.ReactNode;
  confirmMessage: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
      className={className}
    >
      {pending ? "Procesando..." : children}
    </button>
  );
}

