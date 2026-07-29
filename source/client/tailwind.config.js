/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Wire Tailwind's default spacing/radius scale to the theme system's
      // CSS variables (source/client/src/styles.css) so ordinary utility
      // classes (p-3, gap-2, rounded-md, ...) respond to the Density and
      // Sharpness settings instead of only the ui/ primitives that spell
      // out rounded-[var(--radius-md)] explicitly.
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        6: "var(--space-6)",
        8: "var(--space-8)",
      },
      borderRadius: {
        DEFAULT: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
    },
  },
  plugins: [],
};
