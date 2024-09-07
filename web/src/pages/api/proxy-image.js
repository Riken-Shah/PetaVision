import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type');
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error proxying image:', error);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
}