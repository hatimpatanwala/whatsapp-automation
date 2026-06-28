export const environment = {
  production: false,
  // Local dev proxies /api → staging (see proxy.conf.json) so the app runs
  // locally against the deployed staging backend with cookies intact.
  apiUrl: '/api',
};
