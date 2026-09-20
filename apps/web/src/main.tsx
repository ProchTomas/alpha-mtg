import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router-dom";
import "./index.css";
import { Shell } from "./components/Shell";
import { LandingPage } from "./pages/LandingPage";
import { CardSearchPage } from "./pages/CardSearchPage";
import { LoginPage, RecoverPage, RegisterPage } from "./pages/AuthPages";
import { ProfilePage } from "./pages/ProfilePage";
import { DecksPage, NewDeckPage } from "./pages/DecksPage";
import { DeckPage } from "./pages/DeckPage";
import { useAuth } from "./lib/auth";

/** Waits for the initial /auth/me, then either renders or bounces to /login. */
function RequireAuth() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

function Root() {
  const load = useAuth((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  return <Shell />;
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/recover", element: <RecoverPage /> },
      { path: "/cards", element: <CardSearchPage /> },
      { path: "/u/:handle", element: <ProfilePage /> },
      { path: "/decks/:id", element: <DeckPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "/decks", element: <DecksPage /> },
          { path: "/decks/new", element: <NewDeckPage /> },
          { path: "/decks/:id/edit", element: <DeckPage /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
