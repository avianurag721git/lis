import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ModalSize = "sm" | "md" | "lg" | "xl";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  className?: string;
  panelClassName?: string;
  /** When true, clicking the backdrop closes the modal. */
  closeOnBackdrop?: boolean;
  role?: "dialog" | "alertdialog";
  hideCloseButton?: boolean;
};

export const Modal = ({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  className,
  panelClassName,
  closeOnBackdrop = true,
  role = "dialog",
  hideCloseButton = false
}: Props): JSX.Element | null => {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const onBackdropClick = (): void => {
    if (closeOnBackdrop) onClose();
  };

  return createPortal(
    <div
      className={["modal-backdrop", className].filter(Boolean).join(" ")}
      role={role}
      aria-modal="true"
      onClick={onBackdropClick}
    >
      <div
        className={["modal-panel", `modal-panel--${size}`, panelClassName].filter(Boolean).join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        {title || !hideCloseButton ? (
          <header className="modal-header">
            {title ? <h2 className="modal-title">{title}</h2> : <span />}
            {!hideCloseButton ? (
              <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            ) : null}
          </header>
        ) : null}
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
};
