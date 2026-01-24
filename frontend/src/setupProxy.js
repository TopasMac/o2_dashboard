/**
 * Dynamic dev proxy for CRA (react-scripts).
 *
 * We proxy ONLY /api/* to the Symfony backend.
 * Target selection order:
 *   1) O2_API_TARGET (recommended)
 *   2) REACT_APP_BACKEND_BASE
 *   3) fallback: http://127.0.0.1:8001  (local Symfony dev server on EC2)
 *
 * Examples:
 *   O2_API_TARGET=http://127.0.0.1:8001 npm start
 *   O2_API_TARGET=https://dashboard.owners2.com npm start
 */

const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  const target =
    process.env.O2_API_TARGET ||
    process.env.REACT_APP_BACKEND_BASE ||
    'http://127.0.0.1:8001';

  // eslint-disable-next-line no-console
  console.log('[proxy] /api ->', target);

  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      // Preserve /api prefix
      pathRewrite: {},
      // Useful when you have ngrok / port-forwarding in front
      xfwd: true,
      // Symfony doesn't use websockets here, but CRA dev server does.
      ws: false,
      logLevel: 'warn',
      onProxyReq: (proxyReq) => {
        // Avoid stale keep-alive issues when the backend restarts
        proxyReq.setHeader('Connection', 'keep-alive');
      },
    })
  );
};