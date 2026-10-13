import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "../lib/utils";
import { useTheme, type ThemeMode } from "../lib/theme";

export const ThemeToggle = ({ className }: { className?: string }): JSX.Element => {
  const { mode, resolved, setMode, toggle } = useTheme();

  return (
    <div className={cn("theme-picker theme-picker--compact", className)}>
      <button
        type="button"
        onClick={toggle}
        className="theme-picker__btn"
        title={`Switch to ${resolved === "dark" ? "light" : "dark"} mode`}
        aria-label="Toggle theme"
      >
        {resolved === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as ThemeMode)}
        className="sr-only"
        aria-label="Theme preference"
        tabIndex={-1}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
};

export const ThemeModeSelect = (): JSX.Element => {
  const { mode, setMode } = useTheme();
  const options: { value: ThemeMode; icon: JSX.Element; label: string }[] = [
    { value: "system", icon: <Monitor size={14} />, label: "System" },
    { value: "light", icon: <Sun size={14} />, label: "Light" },
    { value: "dark", icon: <Moon size={14} />, label: "Dark" }
  ];

  return (
    <div className="theme-picker">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setMode(opt.value)}
          className={mode === opt.value ? "theme-picker__btn is-active" : "theme-picker__btn"}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
};
