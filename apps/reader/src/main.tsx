import React from "react";
import ReactDOM from "react-dom/client";
import ReaderApp from "./ReaderApp";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ReaderApp />
  </React.StrictMode>
);
