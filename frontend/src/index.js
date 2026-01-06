import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './index.css'; // global overrides
import './components/layouts/FormLayout.css'; // global form layout styles
import './components/layouts/Layout.css'; // global layout styles
import './components/layouts/Buttons.css'; // global button styles
import './i18n';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import baseTheme from './theme';

const theme = createTheme(baseTheme, {
  components: {
    MuiModal: {
      defaultProps: {
        disableRestoreFocus: true,
        disableAutoFocus: true,
        disableEnforceFocus: true,
        keepMounted: true,
      },
    },
    MuiDrawer: {
      defaultProps: {
        ModalProps: {
          keepMounted: true,
          disableRestoreFocus: true,
          disableAutoFocus: true,
          disableEnforceFocus: true,
        },
      },
      styleOverrides: {
        paper: {
          width: '90%',
          '@media (min-width:600px)': {
            width: '400px',
          },
          // Uncomment to remove heavy shadow if desired
          // boxShadow: 'none',
        },
      },
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <App />
      <ToastContainer position="top-right" autoClose={1000} hideProgressBar />
    </ThemeProvider>
  </React.StrictMode>
);

reportWebVitals();
