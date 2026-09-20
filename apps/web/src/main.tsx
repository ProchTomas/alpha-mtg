import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { Shell } from "./components/Shell";
import { LandingPage } from "./pages/LandingPage";
import { CardSearchPage } from "./pages/CardSearchPage";

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/cards", element: <CardSearchPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
