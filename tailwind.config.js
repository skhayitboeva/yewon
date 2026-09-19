/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#fcfcfb",
        plane: "#f9f9f7",
        ink: "#0b0b0b",
        ink2: "#52514e",
        muted: "#898781",
        line: "#e1e0d9",
        rule: "#c3c2b7",
        brand: "#2a78d6",
        brandDark: "#184f95",
        good: "#0ca30c",
        warning: "#fab219",
        serious: "#ec835a",
        critical: "#d03b3b",
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Apple SD Gothic Neo",
          "Malgun Gothic",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
