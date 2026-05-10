import { renderPrometheusMetrics } from '@/utils/server/metrics';

export const config = {
  runtime: 'edge',
};

const handler = async (): Promise<Response> => {
  return new Response(renderPrometheusMetrics(), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};

export default handler;
