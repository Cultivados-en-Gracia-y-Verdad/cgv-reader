import React from "react";
import ReactDOM from "react-dom/client";
import ReaderApp from "./ReaderApp";
import { initializeTheme } from "./core/ThemeContext";
import "./observer/book-assets";
import "./styles.css";

initializeTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ReaderApp />
  </React.StrictMode>
);
