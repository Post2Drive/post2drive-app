"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** The question to ask. The dialog is shown while this is set. */
  message: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  onAnswer: (confirmed: boolean) => void;
};

/*
 * An in-page replacement for window.confirm. It uses the native <dialog>
 * element, so the browser provides the modal behaviour for free: focus is
 * trapped inside, Escape cancels, the page behind is inert, and focus returns
 * to the button that opened it. It is shown for actions that change a job, so
 * it has no motion (Emil: rare, deliberate moments are not animated) and the
 * safer answer, Cancel, has initial focus. Unlike window.confirm it also works
 * in embedded browsers and webviews that suppress native pop-ups.
 */
export default function ConfirmDialog({ message, confirmLabel = "Continue", cancelLabel = "Cancel", onAnswer }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (message !== null && !dialog.open) dialog.showModal();
    if (message === null && dialog.open) dialog.close();
  }, [message]);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby="confirm-dialog-message"
      onCancel={(event) => {
        // Escape: answer "no" ourselves so the parent state stays in step.
        event.preventDefault();
        onAnswer(false);
      }}
    >
      {message !== null && (
        <form method="dialog" onSubmit={(event) => { event.preventDefault(); onAnswer(true); }}>
          <p id="confirm-dialog-message" className="confirm-dialog-message">{message}</p>
          <div className="confirm-dialog-actions">
            <button type="button" autoFocus className="button-link-secondary confirm-dialog-button" onClick={() => onAnswer(false)}>
              {cancelLabel}
            </button>
            <button type="submit" className="confirm-dialog-button">{confirmLabel}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
