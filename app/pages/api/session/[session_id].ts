import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.BACKEND_URL || 'http://chatbot-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { session_id } = req.query;

  if (!session_id || Array.isArray(session_id)) {
    return res.status(400).json({ error: 'Invalid session id' });
  }

  try {
    if (req.method === 'GET') {
      const response = await fetch(`${BACKEND_URL}/session/${session_id}`);
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    if (req.method === 'DELETE') {
      const response = await fetch(`${BACKEND_URL}/session/${session_id}`, { method: 'DELETE' });
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
