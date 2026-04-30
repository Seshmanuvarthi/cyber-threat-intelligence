/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        darkBg:      "#050810",
        panelBg:     "rgba(10, 16, 28, 0.82)",
        neonRed:     "#ff3b30",
        neonYellow:  "#ffcc00",
        neonGreen:   "#34c759",
        critical:    "#ff1744",
        high:        "#ff6d00",
        medium:      "#ffd600",
        low:         "#00e676",
        neonCyan:    "#00b4d8",
        graphPurple: "#7c3aed",
      },
      boxShadow: {
        glowRed:      "0 0 20px rgba(255,59,48,0.55)",
        glowOrange:   "0 0 20px rgba(255,109,0,0.55)",
        glowYellow:   "0 0 20px rgba(255,204,0,0.55)",
        glowGreen:    "0 0 20px rgba(0,230,118,0.45)",
        glowCyan:     "0 0 20px rgba(0,180,216,0.45)",
        glowPurple:   "0 0 20px rgba(124,58,237,0.45)",
        glowCritical: "0 0 30px rgba(255,23,68,0.7)",
        glowPanel:    "0 4px 30px rgba(0,0,0,0.6)",
      },
      animation: {
        "pulse-fast": "pulse 0.8s cubic-bezier(0.4,0,0.6,1) infinite",
        "scan":       "scan 3s linear infinite",
      },
      keyframes: {
        scan: {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
    },
  },
  plugins: [],
}
