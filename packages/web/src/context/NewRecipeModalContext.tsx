import { createContext, useContext, useState, type ReactNode } from 'react';

interface NewRecipeModalContextValue {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const NewRecipeModalContext = createContext<NewRecipeModalContextValue>({
  open: false,
  openModal: () => {},
  closeModal: () => {},
});

export function NewRecipeModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <NewRecipeModalContext.Provider
      value={{
        open,
        openModal: () => setOpen(true),
        closeModal: () => setOpen(false),
      }}
    >
      {children}
    </NewRecipeModalContext.Provider>
  );
}

export function useNewRecipeModal() {
  return useContext(NewRecipeModalContext);
}
