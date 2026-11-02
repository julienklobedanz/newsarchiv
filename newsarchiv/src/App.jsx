import { Routes, Route } from "react-router-dom";
import AppLayout from "./layouts/AppLayout.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import ArticlePage from "./pages/ArticlePage.jsx";
import BookmarksPage from "./pages/BookmarksPage.jsx";
import InsightsPage from "./pages/InsightsPage.jsx";
import { BookmarkProvider } from "./context/BookmarkContext.jsx";

export default function App() {
  return (
    <BookmarkProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="suche" element={<SearchPage />} />
          <Route path="artikel/:urlId" element={<ArticlePage />} />
          <Route path="lesezeichen" element={<BookmarksPage />} />
          <Route path="insights" element={<InsightsPage />} />
        </Route>
      </Routes>
    </BookmarkProvider>
  );
}
