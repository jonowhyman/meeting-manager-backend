export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const icsUrl = "https://outlook.office365.com/owa/calendar/9c463b80649a40c28918f07f03562595@sxswsydney.com/2ca3e48f938e4b41bb0c939fd98314804887869706492204640/calendar.ics";

    const response = await fetch(icsUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const icsData = await response.text();
    
    // Parse the ICS data into events
    const events = parseICS(icsData);
    
    // NEW: Filter to last 30 days + next 30 days (60 days total)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const recentEvents = events.filter(event => {
      if (!event.start) return false;
      return event.start >= thirtyDaysAgo && event.start <= thirtyDaysFromNow;
    });

    // Transform to meeting format
    const meetings = recentEvents.map((event, index) => ({
      id: `outlook-${event.uid || index}`,
      title: event.summary || 'Untitled Event',
      start: event.start,
      end: event.end,
      description: event.description || '',
      location: event.location || '',
      source: 'outlook'
    }));

    return res.status(200).json({
      success: true,
      meetings,
      totalEvents: meetings.length,
      source: 'outlook-ics'
    });

  } catch (error) {
    console.error('Calendar error:', error);
    return res.status(500).json({ 
      error: 'Failed to process calendar data',
      details: error.message 
    });
  }
}

// ... rest of your parsing functions stay the same
