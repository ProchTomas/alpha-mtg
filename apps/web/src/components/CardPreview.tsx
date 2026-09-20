import { create } from "zustand";
import type { CardSummary } from "@playtest/shared";
import { CardImage } from "./CardImage";

type PreviewState = {
  card: Pick<CardSummary, "id" | "name" | "layout"> | null;
  face: "front" | "back";
  show: (card: Pick<CardSummary, "id" | "name" | "layout">, face?: "front" | "back") => void;
  hide: () => void;
};

/** Global hover-preview target. Any element can call show()/hide() from mouse events. */
export const usePreview = create<PreviewState>((set) => ({
  card: null,
  face: "front",
  show: (card, face = "front") => set({ card, face }),
  hide: () => set({ card: null }),
}));

/** Mount once. Sits in the bottom-right corner; the large image is already cached by the time you hover most things. */
export function CardPreviewLayer({ className = "right-4 bottom-4" }: { className?: string }) {
  const { card, face } = usePreview();
  if (!card) return null;
  return (
    <div className={`card-preview ${className}`}>
      <CardImage card={card} size="normal" face={face} className="shadow-2xl" />
    </div>
  );
}

/** Spread onto any element to make it drive the preview. */
export function previewProps(card: Pick<CardSummary, "id" | "name" | "layout">, face: "front" | "back" = "front") {
  return {
    onMouseEnter: () => usePreview.getState().show(card, face),
    onMouseLeave: () => usePreview.getState().hide(),
    onFocus: () => usePreview.getState().show(card, face),
    onBlur: () => usePreview.getState().hide(),
  };
}
