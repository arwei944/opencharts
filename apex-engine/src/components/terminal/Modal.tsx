import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  wide?: boolean;
}

/**
 * Accessible modal shell: wrapper gets role="dialog" + aria-modal + the
 * labelledBy id (which must live on a heading INSIDE children); Escape closes,
 * backdrop click closes, and focus moves into the dialog on open.
 */
export function Modal({ open, onClose, labelledBy, children, wide = false }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-999 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`max-h-[90dvh] overflow-hidden rounded-lg border border-border bg-bg shadow-xl outline-none ${
          wide ? "w-[800px]" : "w-[min(520px,94vw)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}