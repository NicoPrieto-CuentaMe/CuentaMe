import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ─── Colors ───────────────────────────────────────────────────────────
      colors: {
        // Surfaces (luminance stack) — CSS var refs so globals.css drives the values
        background:          "var(--bg-base)",
        panel:               "var(--bg-panel)",
        "surface-1":         "var(--surface-1)",
        "surface-2":         "var(--surface-2)",

        // Legacy aliases — existing components use these; keep them working
        surface:             "var(--surface-1)",
        "surface-elevated":  "var(--surface-2)",

        // Semi-transparent surfaces (use as bg-surface-t1, etc.)
        "surface-t1":        "var(--surface-t1)",
        "surface-t2":        "var(--surface-t2)",
        "surface-t3":        "var(--surface-t3)",

        // Text hierarchy
        "fg-1":              "var(--fg-1)",
        "fg-2":              "var(--fg-2)",
        "fg-3":              "var(--fg-3)",
        "fg-4":              "var(--fg-4)",

        // Legacy text aliases
        "text-primary":      "var(--fg-1)",
        "text-secondary":    "var(--fg-2)",
        "text-tertiary":     "var(--fg-3)",

        // Brand & accent
        brand:               "var(--brand)",
        accent:              "var(--accent)",
        "accent-hover":      "var(--accent-hover)",
        "accent-light":      "rgba(113, 112, 255, 0.16)",
        "danger-light":      "rgba(224, 82, 82, 0.14)",
        "warning-light":     "rgba(217, 119, 6, 0.14)",

        // Status
        success:             "var(--success)",
        "success-strong":    "var(--success-strong)",
        danger:              "var(--danger)",
        warning:             "var(--warning)",

        // Borders
        border:              "var(--border)",
        "border-subtle":     "var(--border-subtle)",
        "border-solid":      "var(--border-solid-1)",
        "border-solid-2":    "var(--border-solid-2)",
        "border-solid-3":    "var(--border-solid-3)",
      },

      // ─── Border radius ────────────────────────────────────────────────────
      borderRadius: {
        micro:  "var(--r-micro)",   // 2px
        sm:     "var(--r-sm)",      // 4px
        md:     "var(--r-md)",      // 6px  — buttons, inputs
        lg:     "var(--r-lg)",      // 8px  — cards, dropdowns
        xl:     "var(--r-xl)",      // 12px — panels, bubbles
        "2xl":  "var(--r-2xl)",     // 22px — large panels
        pill:   "var(--r-pill)",    // 9999px
        circle: "var(--r-circle)",  // 50%
      },

      // ─── Box shadows ──────────────────────────────────────────────────────
      boxShadow: {
        subtle:   "var(--shadow-subtle)",
        ring:     "var(--shadow-ring)",
        inset:    "var(--shadow-inset)",
        elevated: "var(--shadow-elevated)",
        focus:    "var(--shadow-focus)",
        dialog:   "var(--shadow-dialog)",
      },

      // ─── Typography ───────────────────────────────────────────────────────
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },

      // ─── Transitions ──────────────────────────────────────────────────────
      transitionTimingFunction: {
        "ease-out": "var(--ease-out)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
      },

      // ─── Keyframes ────────────────────────────────────────────────────────
      keyframes: {
        "flash-in": {
          "0%":   { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%":   { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-left": {
          "0%":   { opacity: "0", transform: "translateX(-20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulse: {
          "0%, 100%": { transform: "scale(1)", boxShadow: "var(--shadow-ring)" },
          "50%":      { transform: "scale(0.997)", boxShadow: "0 0 0 1px rgba(113,112,255,0.45), 0 24px 60px rgba(94,106,210,0.18)" },
        },
      },
      animation: {
        "flash-in":        "flash-in 480ms var(--ease-out) both",
        "slide-in-right":  "slide-in-right 240ms var(--ease-out) both",
        "slide-in-left":   "slide-in-left 240ms var(--ease-out) both",
        "fade-in":         "fade-in 220ms var(--ease-out) both",
        "hero-pulse":      "pulse 240ms var(--ease-out) both",
      },
    },
  },
  plugins: [],
};

export default config;
