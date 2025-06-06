export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.MOTION_API_KEY || 'l47aDyIRyaRY1fXIOsFZmCjMzP3+4mnhO8UU13EGpok=';

  try {
    const response = await fetch('https://api.usemotion.com/v1/users/me', {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Motion User Error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Motion API Error: ${response.status}`,
        details: errorText 
      });
    }

    const user = await response.json();
    return res.status(200).json({ 
      success: true, 
      user: user 
    });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
