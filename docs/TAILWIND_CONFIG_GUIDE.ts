/**
 * TAILWIND CSS THEME CONFIGURATION FOR TRADING UI
 *
 * This file contains the recommended Tailwind configuration for
 * the professional trading UI components to achieve the polished,
 * professional look shown in the reference images.
 *
 * Add this to your tailwind.config.ts
 */

import type { Config } from "tailwindcss";

const tradingThemeConfig: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // Primary brand color (gold/accent)
        primary: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706", // Primary (gold)
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },

        // Bull color (green for uptrends/wins)
        bull: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#145231",
        },

        // Bear color (red for downtrends/losses)
        bear: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
        },

        // Background colors
        background: "#0a0a0a",
        foreground: "#fafafa",
        card: "#0f0f0f",
        surface: "#1a1a1a",
        border: "#27272a",

        // Semantic colors
        success: "#10b981",
        warning: "#f59e0b",
        error: "#ef4444",
        info: "#3b82f6",

        // Neutral grays
        muted: {
          foreground: "#a1a1aa",
          background: "#27272a",
        },
      },

      backgroundColor: {
        surface: "#1a1a1a",
        "surface-soft": "rgba(26, 26, 26, 0.5)",
      },

      borderColor: {
        border: "#27272a",
      },

      // Custom glow effects for buttons
      boxShadow: {
        "glow-primary": "0 0 20px rgba(245, 158, 11, 0.5)",
        "glow-bull": "0 0 20px rgba(16, 185, 129, 0.5)",
        "glow-bear": "0 0 20px rgba(239, 68, 68, 0.5)",
        "glow-subtle": "0 0 10px rgba(245, 158, 11, 0.2)",
      },

      // Smooth transitions
      transitionDuration: {
        fast: "150ms",
        normal: "300ms",
        slow: "500ms",
      },

      // Typography enhancements
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
      },

      // Custom utility classes
      backdropBlur: {
        xs: "blur(2px)",
        sm: "blur(4px)",
        md: "blur(8px)",
        lg: "blur(12px)",
      },

      // Animation enhancements
      animation: {
        "pulse-slow": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-in": "slideIn 0.3s ease-out",
        "fade-in": "fadeIn 0.2s ease-in",
      },

      keyframes: {
        slideIn: {
          from: { transform: "translateX(-100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },

      // Spacing for trading layout
      spacing: {
        header: "4rem", // 64px
        toolbar: "4rem", // 64px
        panel: "20rem", // 320px
      },

      // Z-index layers for trading UI
      zIndex: {
        background: "0",
        surface: "10",
        modal: "40",
        header: "40",
        toolbar: "30",
        panel: "30",
        tooltip: "50",
        dropdown: "50",
      },
    },
  },

  safelist: [
    // Chart type classes
    "bg-bull",
    "bg-bear",
    "text-bull",
    "text-bear",
    "border-bull",
    "border-bear",
    "shadow-glow-bull",
    "shadow-glow-bear",
    "shadow-glow-primary",

    // Responsive display classes
    "hidden",
    "sm:inline",
    "md:flex",
    "lg:block",
  ],
};

export default tradingThemeConfig;

/**
 * KEY TAILWIND UTILITIES FOR TRADING UI
 * 
 * Use these utility classes throughout the components:
 * 
 * 1. DARK MODE
 *    dark:bg-background  - Use for dark theme backgrounds
 *    dark:text-foreground - Use for dark theme text
 * 
 * 2. GLOWING EFFECTS
 *    glow-primary - Gold glow for primary action
 *    glow-bull    - Green glow for bullish/win actions
 *    glow-bear    - Red glow for bearish/lose actions
 * 
 * 3. SPACING & LAYOUT
 *    ml-16 / ml-toolbar  - Left margin for chart area
 *    mr-80 / mr-panel    - Right margin for chart area
 *    h-16 / h-header     - Header height
 * 
 * 4. COLOR SEMANTIC
 *    text-bull/bear/primary - Text colors
 *    border-bull/bear       - Border colors
 *    bg-bull/bear/primary   - Background colors
 * 
 * 5. ANIMATIONS
 *    animate-pulse-slow - Gentle continuous pulse
 *    animate-slide-in   - Slide animation for modals
 *    transition-all     - Smooth transitions on all properties
 * 
 * 6. OPACITY & LAYERS
 *    bg-background/90   - Semi-transparent background
 *    backdrop-blur      - Blur effect for headers
 *    z-40 / z-30 / z-50 - Z-index layering
 * 
 * EXAMPLE USAGE:
 * ───────────────────────────────────────────────────────
 * 
 * // Trading action button
 * <button className="
 *   px-4 py-2 
 *   bg-bull hover:bg-bull/90 
 *   text-white font-bold 
 *   rounded-lg 
 *   shadow-glow-bull
 *   transition-all
 *   disabled:opacity-50
 * ">
 *   BUY
 * </button>
 * 
 * // Chart toolbar icon
 * <button className="
 *   h-10 w-10 
 *   rounded-lg 
 *   flex items-center justify-center
 *   hover:bg-surface 
 *   border border-border 
 *   transition-colors
 *   group
 * ">
 *   <Icon className=\"h-4 w-4 text-primary group-hover:text-foreground\" />
 * </button>
 * 
 * // Statistics badge (highest)
 * <div className=\"
 *   h-8 w-8 
 *   rounded-full 
 *   flex items-center justify-center
 *   bg-primary text-primary-foreground 
 *   border border-primary
 *   shadow-glow-primary
 *   font-bold
 * \">
 *   3
 * </div>
 * 
 * // Card with hover effect
 * <div className=\"
 *   rounded-lg 
 *   border border-border 
 *   bg-surface/50 
n *   hover:border-primary/50
 *   transition-all
 *   cursor-pointer
 * \">
 *   Content here
 * </div>
 */
