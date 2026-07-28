import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // --- Fondo ---
        base:     "#070B14",
        surface:  "#0D1525",
        elevated: "#152033",

        // --- Bordes ---
        border: {
          DEFAULT: "#1E2D45",
          muted:   "#131F33",
        },

        // --- Texto ---
        text: {
          primary:   "#E8EDF5",
          secondary: "#8B9FC0",
          muted:     "#4A5E7A",
        },

        // --- Semántica financiera ---
        gain: {
          DEFAULT: "#10B981",
          subtle:  "rgba(16,185,129,0.12)",
          dim:     "rgba(16,185,129,0.06)",
        },
        loss: {
          DEFAULT: "#EF4444",
          subtle:  "rgba(239,68,68,0.12)",
          dim:     "rgba(239,68,68,0.06)",
        },

        // --- Acento (interactivo, no financiero) ---
        accent: {
          DEFAULT: "#3B82F6",
          subtle:  "rgba(59,130,246,0.12)",
        },
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },

      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
      },

      // Números tabulares evitan saltos de layout en datos financieros
      fontVariantNumeric: {
        tabular: "tabular-nums",
      },
    },
  },
  plugins: [],
};

export default config;
