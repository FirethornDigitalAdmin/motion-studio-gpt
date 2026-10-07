import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
if (location.pathname === "/render") void import("./render-page");
else
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
