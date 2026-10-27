/** Shared design tokens. Apps: `presets: [require('@gharka/ui/tailwind-preset')]` and scan packages/ui/src. */
/** Linear clamp(): minPx at a 360px viewport, maxPx at 640px and above. */
const fluid = (minPx, maxPx, minVw = 360, maxVw = 640) => {
  const slope = (maxPx - minPx) / (maxVw - minVw);
  const r = (n) => Number(n.toFixed(4));
  const intercept = r((minPx - slope * minVw) / 16);
  return `clamp(${r(minPx / 16)}rem, ${intercept}rem + ${r(slope * 100)}vw, ${r(maxPx / 16)}rem)`;
};

module.exports = {
  theme: {
    extend: {
      colors: {
        turmeric: {
          50: '#FFF8E1', 100: '#FEEFB8', 200: '#FCE084', 300: '#F8CC4A', 400: '#EDB420',
          500: '#E3A008', 600: '#C48506', 700: '#9C6406', 800: '#7D500B', 900: '#66420E',
        },
        terracotta: {
          50: '#FBF0EC', 100: '#F5DACF', 200: '#EBB7A3', 300: '#DE8D70', 400: '#D0714E',
          500: '#C2603E', 600: '#A94B2E', 700: '#8A3C26', 800: '#6F3223', 900: '#5B2B21',
        },
        leaf: {
          50: '#F1F7EE', 100: '#DDEBD6', 200: '#BDD7B1', 300: '#94BB84', 400: '#6F9D5F',
          500: '#4F7942', 600: '#3E6034', 700: '#324D2C', 800: '#2A3E26', 900: '#233422',
        },
        cream: { DEFAULT: '#FBF6EC', 100: '#F5EDDA', 200: '#EDE0C4', 300: '#E0CFA8' },
        ink: { DEFAULT: '#2B2118', soft: '#5C4D3F', muted: '#8A7B6B' },
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'Hind', 'system-ui', 'sans-serif'],
        hand: ['Caveat', 'cursive'],
        devanagari: ['Hind', 'Noto Sans Devanagari', 'sans-serif'],
      },
      borderRadius: { xl: '1rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      boxShadow: {
        soft: '0 1px 2px rgba(43,33,24,.06), 0 6px 18px -6px rgba(43,33,24,.14)',
        lift: '0 2px 4px rgba(43,33,24,.08), 0 14px 30px -10px rgba(43,33,24,.22)',
      },
      // Bilingual labels double text length, so larger sizes shrink on phones (same as Tailwind defaults from 640px up).
      fontSize: {
        lg: [fluid(16, 18), { lineHeight: '1.55' }],
        xl: [fluid(17, 20), { lineHeight: '1.4' }],
        '2xl': [fluid(19, 24), { lineHeight: '1.3' }],
        '3xl': [fluid(22, 30), { lineHeight: '1.2' }],
        '4xl': [fluid(26, 36), { lineHeight: '1.12' }],
        '5xl': [fluid(30, 48), { lineHeight: '1' }],
      },
      minHeight: { tap: '3rem', 'tap-lg': '3.5rem' },
    },
  },
};
