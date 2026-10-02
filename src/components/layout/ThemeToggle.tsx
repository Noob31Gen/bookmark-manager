import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "../ui/Button";
import { getSavedTheme, saveTheme } from "../../lib/metadataStore";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<"dark" | "light">("dark");

  useEffect(() => {
    getSavedTheme().then((saved) => {
      setThemeState(saved);
      if (saved === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    });
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setThemeState(nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    saveTheme(nextTheme);
  };

  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle Theme"
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-primary" />
      ) : (
        <Moon className="w-4 h-4 text-foreground" />
      )}
    </Button>
  );
}
