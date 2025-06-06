// File: /api/calendar/fetch-ics.js
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
          return event.start >= startDate && event.start <= endDate;
        });
      }

      // Transform to our meeting format
      const meetings = filteredEvents.map((event, index) => ({
        id: `ics-${event.uid || index}`,
        title: event.summary || 'Untitled Event',
        start: event.start,
        end: event.end,
        description: event.description || '',
        location: event.location || '',
        organizer: event.organizer || '',
        attendees: event.attendees || [],
        isRecurring: !!event.rrule,
        created: event.created,
        updated: event.lastModified
      }));

      return res.status(200).json({
        success: true,
        meetings,
        totalEvents: meetings.length,
        source: 'outlook-ics'
      });

    } catch (error) {
      console.error('ICS fetch error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch calendar data',
        details: error.message 
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ICS Parser function
function parseICS(icsData) {
  const lines = icsData.split(/\r?\n/);
  const events = [];
  let currentEvent = null;
  let currentProperty = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Handle line continuations (lines starting with space or tab)
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      i++;
      line += lines[i].substring(1); // Remove the leading space/tab
    }

    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      events.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent && line.includes(':')) {
      const colonIndex = line.indexOf(':');
      const property = line.substring(0, colonIndex);
      const value = line.substring(colonIndex + 1);

      // Parse different property types
      if (property.startsWith('DTSTART')) {
        currentEvent.start = parseICSDate(value, property);
      } else if (property.startsWith('DTEND')) {
        currentEvent.end = parseICSDate(value, property);
      } else if (property === 'SUMMARY') {
        currentEvent.summary = unescapeICSText(value);
      } else if (property === 'DESCRIPTION') {
        currentEvent.description = unescapeICSText(value);
      } else if (property === 'LOCATION') {
        currentEvent.location = unescapeICSText(value);
      } else if (property.startsWith('ORGANIZER')) {
        currentEvent.organizer = extractEmailFromProperty(value);
      } else if (property.startsWith('ATTENDEE')) {
        if (!currentEvent.attendees) currentEvent.attendees = [];
        const email = extractEmailFromProperty(value);
        if (email) currentEvent.attendees.push(email);
      } else if (property === 'UID') {
        currentEvent.uid = value;
      } else if (property === 'CREATED') {
        currentEvent.created = parseICSDate(value, property);
      } else if (property === 'LAST-MODIFIED') {
        currentEvent.lastModified = parseICSDate(value, property);
      } else if (property === 'RRULE') {
        currentEvent.rrule = value;
      }
    }
  }

  return events;
}

function parseICSDate(dateString, property = '') {
  if (!dateString) return null;

  try {
    // Remove any timezone info from the property
    const cleanDate = dateString.replace(/[TZ]/g, '');
    
    if (cleanDate.length === 8) {
      // Date only: YYYYMMDD
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      return new Date(`${year}-${month}-${day}`);
    } else if (cleanDate.length >= 14) {
      // DateTime: YYYYMMDDTHHMMSS
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      const hour = cleanDate.substring(8, 10);
      const minute = cleanDate.substring(10, 12);
      const second = cleanDate.substring(12, 14) || '00';
      
      // Check if it's UTC (ends with Z) or has timezone info
      if (dateString.endsWith('Z')) {
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
      } else {
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      }
    }
  } catch (error) {
    console.error('Date parsing error:', error, 'for date:', dateString);
  }

  return null;
}

function unescapeICSText(text) {
  if (!text) return '';
  
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function extractEmailFromProperty(value) {
  // Extract email from ORGANIZER/ATTENDEE property
  // Format might be: mailto:email@example.com or CN=Name:mailto:email@example.com
  const mailtoMatch = value.match(/mailto:([^;]+)/i);
  if (mailtoMatch) {
    return mailtoMatch[1];
  }
  
  // If no mailto, try to extract CN (Common Name)
  const cnMatch = value.match(/CN=([^:;]+)/i);
  if (cnMatch) {
    return cnMatch[1];
  }
  
  return value;
}
