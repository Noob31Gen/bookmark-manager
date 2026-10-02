import React from "react";
import ReactDOM from "react-dom/client";
import { SidePanelApp } from "../pages/SidePanelApp";
import "../styles/index.css";

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <SidePanelApp />
    </React.StrictMode>
  );
}
