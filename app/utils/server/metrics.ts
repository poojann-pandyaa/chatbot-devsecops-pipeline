let activeRequests = 0;
let totalRequests = 0;
let requestTimestamps: number[] = [];

const WINDOW_MS = 60_000;

const pruneRequestWindow = (now: number) => {
  requestTimestamps = requestTimestamps.filter((timestamp) => now - timestamp <= WINDOW_MS);
};

export const recordHttpRequest = () => {
  const now = Date.now();

  totalRequests += 1;
  activeRequests += 1;
  requestTimestamps.push(now);
  pruneRequestWindow(now);

  return () => {
    activeRequests = Math.max(0, activeRequests - 1);
  };
};

export const getMetricsSnapshot = () => {
  const now = Date.now();
  pruneRequestWindow(now);

  return {
    activeRequests,
    totalRequests,
    requestsPerSecond: requestTimestamps.length / (WINDOW_MS / 1000),
  };
};

export const renderPrometheusMetrics = () => {
  const snapshot = getMetricsSnapshot();

  return [
    '# HELP http_requests_per_second Rolling average HTTP request rate over the last minute.',
    '# TYPE http_requests_per_second gauge',
    `http_requests_per_second ${snapshot.requestsPerSecond.toFixed(4)}`,
    '# HELP http_active_requests Current in-flight HTTP requests.',
    '# TYPE http_active_requests gauge',
    `http_active_requests ${snapshot.activeRequests}`,
    '# HELP http_requests_total Total HTTP requests handled by this process.',
    '# TYPE http_requests_total counter',
    `http_requests_total ${snapshot.totalRequests}`,
    '',
  ].join('\n');
};
