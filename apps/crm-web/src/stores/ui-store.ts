import { create } from "zustand";

/** Ephemeral UI — server state lives in React Query only */
type UiState = {
  activeStep: string;
  callModeOpen: boolean;
  setActiveStep: (s: string) => void;
  setCallModeOpen: (v: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeStep: "new",
  callModeOpen: false,
  setActiveStep: (s) => set({ activeStep: s }),
  setCallModeOpen: (v) => set({ callModeOpen: v }),
}));
