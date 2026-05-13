import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.BACKEND_URL || 'http://chatbot-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { user_id } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!user_id || Array.isArray(user_id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/sessions/${user_id}`);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
