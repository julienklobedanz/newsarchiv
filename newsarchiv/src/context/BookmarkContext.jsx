import { createContext, useContext, useState, useCallback } from "react";

const BookmarkContext = createContext({ revision: 0, bumpBookmarks: () => {} });

export function BookmarkProvider({ children }) {
  const [revision, setRevision] = useState(0);
  const bumpBookmarks = useCallback(() => setRevision((n) => n + 1), []);
  return (
    <BookmarkContext.Provider value={{ revision, bumpBookmarks }}>
      {children}
    </BookmarkContext.Provider>
  );
}

export function useBookmarks() {
  return useContext(BookmarkContext);
}
