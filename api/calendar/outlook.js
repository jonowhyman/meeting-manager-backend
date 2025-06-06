export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // HARDCODED: Your specific ICS URL
    const icsUrl = "https://outlook.office365.com/owa/calendar/9c463b80649a40c28918f07f03562595@sxswsydney.com/2ca3e48f938e4b41bb0c939fd98314804887869706492204640/calendar.ics";

    console.log('Fetching ICS from:', icsUrl);

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
