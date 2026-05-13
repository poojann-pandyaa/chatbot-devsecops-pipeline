import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.BACKEND_URL || 'http://chatbot-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'POST') {
      // Save a key
      const response = await fetch(`${BACKEND_URL}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    if (req.method === 'GET') {
      // Get keys for a user
      const { user_id } = req.query;
      const response = await fetch(`${BACKEND_URL}/keys/${user_id}`);
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    if (req.method === 'DELETE') {
      const { user_id, provider } = req.query;
      const response = await fetch(`${BACKEND_URL}/keys/${user_id}/${provider}`, { method: 'DELETE' });
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
