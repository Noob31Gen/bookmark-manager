import React from "react";
import ReactDOM from "react-dom/client";
import { ManagerApp } from "../pages/ManagerApp";
import "../styles/index.css";

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ManagerApp />
    </React.StrictMode>
  );
}
