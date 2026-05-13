export const config = {
  runtime: 'edge',
};

const handler = async (): Promise<Response> => {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};

export default handler;
