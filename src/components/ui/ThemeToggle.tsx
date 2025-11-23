import React, { useState, useEffect } from 'react';

export const ThemeToggle: React.FC = () => {
  // List of available themes
  const themes = ["light", "dark"] as const;
  type Theme = typeof themes[number];
  
  // Initialize theme state from localStorage
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme && themes.includes(savedTheme as Theme)) ? (savedTheme as Theme) : "light";
  });

  // Update theme in localStorage and apply to document
  const setTheme = (theme: Theme) => {
    setCurrentTheme(theme);
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove(...themes);
    document.documentElement.classList.add(theme);
  };

  // Initialize theme on component mount
  useEffect(() => {
    setTheme(currentTheme);
  }, []);

  // Handle theme change
  const handleThemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTheme(e.target.value as Theme);
  };

  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-circle">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{
              backgroundColor: currentTheme === "dark" ? "#38bdf8" : "#f97316",
            }}
          />
        </span>
      </div>
      <ul
        tabIndex={0}
        className="dropdown-content z-[1] p-2 shadow-2xl bg-base-300 rounded-box w-52"
      >
        {themes.map((theme) => (
          <li key={theme} className="form-control">
            <label className="label cursor-pointer justify-between">
              <span className="label-text text-sm capitalize">
                {theme === "dark" ? "Dark" : "Light"}
              </span>
              <input
                type="radio"
                name="theme-dropdown"
                className="radio theme-controller"
                value={theme}
                checked={currentTheme === theme}
                onChange={handleThemeChange}
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ThemeToggle;

