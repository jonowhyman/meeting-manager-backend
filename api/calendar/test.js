// File: /api/calendar/test.js
// Backend endpoint to fetch and parse ICS calendar data

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
      const { icsUrl, dateRange } = req.body;

      if (!icsUrl) {
        return res.status(400).json({ error: 'ICS URL is required' });
      }

      console.log('Fetching ICS from:', icsUrl);

      // Fetch the ICS file from the server side (no CORS issues)
      const response = await fetch(icsUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Meeting-Manager/1.0',
          'Accept': 'text/calendar, text/plain, */*',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const icsData = await response.text();
      console.log('ICS data length:', icsData.length);
      console.log('ICS preview:', icsData.substring(0, 200));

      // Validate ICS format
      if (!icsData.includes('BEGIN:VCALENDAR')) {
        throw new Error('Invalid ICS format - no VCALENDAR found');
      }

      // Parse the ICS data
      const events = parseICS(icsData);
      console.log('Parsed events count:', events.length);

      // Filter events by date range if provided
      let filteredEvents = events;
      if (dateRange?.start && dateRange?.end) {
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        
        filteredEvents = events.filter(event => {
          if (!event.start) return false;
          return event.start >= startDate && event.start <=
