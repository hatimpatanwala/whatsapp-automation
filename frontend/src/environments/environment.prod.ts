export const environment = {
  production: true,
  // Relative: the SPA is always served same-origin with the API (EC2 nginx, and the
  // desktop's local backend). The old absolute Render URL was a legacy trap — it sent
  // desktop logins to a dead deployment.
  apiUrl: '/api',
};
