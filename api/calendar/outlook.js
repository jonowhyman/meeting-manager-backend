export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { icsUrl } = req.body;

      if (!icsUrl) {
        return res.status(400).json({ error: 'ICS URL is required' });
      }

      // Fetch the ICS file
      const response = await fetch(icsUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const icsData = await response.text();

      return res.status(200).json({
        success: true,
        message: 'ICS fetch successful',
        dataLength: icsData.length,
        preview: icsData.substring(0, 500)
      });

    } catch (error) {
      return res.status(500).json({ 
        error: 'Failed to fetch calendar data',
        details: error.message 
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
