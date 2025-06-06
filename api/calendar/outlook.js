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
    
    // Filter to recent/upcoming events (last 7 days to next 30 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const recentEvents = events.filter(event => {
      if (!event.start) return false;
      return event.start >= weekAgo && event.start <= monthFromNow;
    });

    // Transform to meeting format
    const meetings = recentEvents.map((event, index) => ({
      id: `outlook-${event.uid || index}`,
      title: event.summary || 'Untitled Event',
      start: event.start,
      end: event.end,
      description: event.description || '',
      location: event.location || '',
      organizer: event.organizer || '',
      attendees: event.attendees || [],
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

function parseICS(icsData) {
  const lines = icsData.split(/\r?\n/);
  const events = [];
  let currentEvent = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Handle line continuations
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      i++;
      line += lines[i].substring(1);
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

      if (property.startsWith('DTSTART')) {
        currentEvent.start = parseICSDate(value);
      } else if (property.startsWith('DTEND')) {
        currentEvent.end = parseICSDate(value);
      } else if (property === 'SUMMARY') {
        currentEvent.summary = unescapeText(value);
      } else if (property === 'DESCRIPTION') {
        currentEvent.description = unescapeText(value);
      } else if (property === 'LOCATION') {
        currentEvent.location = unescapeText(value);
      } else if (property === 'UID') {
        currentEvent.uid = value;
      }
    }
  }

  return events;
}

function parseICSDate(dateString) {
  if (!dateString) return null;
  
  const cleanDate = dateString.replace(/[TZ]/g, '');
  
  if (cleanDate.length >= 14) {
    const year = cleanDate.substring(0, 4);
    const month = cleanDate.substring(4, 6);
    const day = cleanDate.substring(6, 8);
    const hour = cleanDate.substring(8, 10);
    const minute = cleanDate.substring(10, 12);
    
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
  }
  
  return null;
}

function unescapeText(text) {
  return text.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';');
}
