import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14, // Base font size
    h1: { fontSize: '2rem', fontWeight: 600 },
    h2: { fontSize: '1.5rem', fontWeight: 600 },
    h3: { fontSize: '1.25rem', fontWeight: 600 },
    h4: { fontSize: '1.125rem', fontWeight: 600 },
    h5: { fontSize: '1rem', fontWeight: 600 },
    h6: { fontSize: '0.875rem', fontWeight: 600 },
    body1: { fontSize: '0.875rem' }, // ~14px
    body2: { fontSize: '0.8125rem' }, // ~13px
    caption: { fontSize: '0.75rem' }, // ~12px
    variantMapping: {
      // Normalize DOM heading levels & defaults
      h1: 'h2',
      h2: 'h3',
      h3: 'h4',
      h4: 'h5',
      h5: 'h6',
      h6: 'p',
      body1: 'p',
      body2: 'p',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem', // 13px
          textTransform: 'none',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem', // 13px
          paddingTop: '6px',
          paddingBottom: '6px',
        },
        head: {
          fontSize: '0.875rem', // 14px
          fontWeight: 600,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        label: {
          fontSize: '0.75rem', // 12px
        },
      },
    },
  },
});

export default theme;