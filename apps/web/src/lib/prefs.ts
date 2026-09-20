import { create } from "zustand";

const MIN = 60;
const MAX = 150;
const STEP = 12;

function load(): number {
  try {
    const v = Number(localStorage.getItem("bfCardWidth"));
    return v >= MIN && v <= MAX ? v : 96;
  } catch {
    return 96;
  }
}

/** Per-browser table preferences. Battlefield zoom = card width in px; positions are relative so it just scales. */
export const usePrefs = create<{ bfCardWidth: number; zoom: (dir: -1 | 1) => void }>((set, get) => ({
  bfCardWidth: load(),
  zoom: (dir) => {
    const w = Math.max(MIN, Math.min(MAX, get().bfCardWidth + dir * STEP));
    try {
      localStorage.setItem("bfCardWidth", String(w));
    } catch {
      /* ignore */
    }
    set({ bfCardWidth: w });
  },
}));
