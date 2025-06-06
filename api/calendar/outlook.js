export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get custom ICS URL from query parameter or request body
    let icsUrl;
    
    if (req.method === 'GET') {
      icsUrl = req.query.url;
    } else if (req.method === 'POST') {
      const body = req.body;
      icsUrl = body.url;
    }

    // Validate that a URL was provided
    if (!icsUrl) {
      return res.status(400).json({ 
        error: 'ICS URL is required',
        details: 'Please provide an ICS URL via query parameter (?url=...) or request body',
        usage: 'GET /api/calendar/outlook.js?url=YOUR_ICS_URL'
      });
    }

    // Validate URL format
    try {
      new URL(icsUrl);
    } catch (urlError) {
      return res.status(400).json({ 
        error: 'Invalid URL format',
        details: 'Please provide a valid ICS URL',
        provided: icsUrl
      });
    }

    console.log('Fetching ICS from:', icsUrl);

    // Fetch ICS data with proper headers
    const response = await fetch(icsUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/calendar, text/plain, */*',
        'User-Agent': 'Calendar-Sync-Bot/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const icsData = await response.text();
    console.log('ICS data length:', icsData.length);
    
    // Simple parsing
    const events = [];
    const eventBlocks = icsData.split('BEGIN:VEVENT');
    
    for (let i = 1; i < eventBlocks.length; i++) {
      const eventData = eventBlocks[i];
      const endIndex = eventData.indexOf('END:VEVENT');
      if (endIndex === -1) continue;
      
      const eventContent = eventData.substring(0, endIndex);
      const event = parseEvent(eventContent);
      
      if (event && event.start) {
        // Filter for events within 30 days range
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        if (event.start >= thirtyDaysAgo && event.start <= thirtyDaysFromNow) {
          events.push(event);
        }
      }
    }
    
    // Sort events by start time
    events.sort((a, b) => a.start - b.start);
    
    const meetings = events.map((event, index) => ({
      id: `custom-${event.uid || index}`,
      title: event.summary || 'Untitled Event',
      start: event.start,
      end: event.end,
      description: event.description || '',
      location: event.location || '',
      attendees: event.attendees || [],
      organizer: event.organizer || '',
      source: 'custom-ics'
    }));

    console.log(`Processed ${meetings.length} meetings from ${events.length} total events`);

    return res.status(200).json({
      success: true,
      meetings,
      totalEvents: meetings.length,
      source: 'custom-ics',
      sourceUrl: icsUrl,
      dateRange: {
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    });

  } catch (error) {
    console.error('Calendar error:', error);
    return res.status(500).json({ 
      error: 'Failed to process calendar data',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

function parseEvent(eventContent) {
  const event = { attendees: [], organizer: '' };
  const lines = eventContent.split('\n');
  
  for (let line of lines) {
    line = line.trim();
    if (!line || !line.includes(':')) continue;
    
    const colonIndex = line.indexOf(':');
    const property = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);
    
    if (property.startsWith('DTSTART')) {
      event.start = parseDate(value);
    } else if (property.startsWith('DTEND')) {
      event.end = parseDate(value);
    } else if (property === 'SUMMARY') {
      event.summary = cleanText(value);
    } else if (property === 'DESCRIPTION') {
      event.description = cleanText(value);
    } else if (property === 'LOCATION') {
      event.location = cleanText(value);
    } else if (property === 'UID') {
      event.uid = value;
    } else if (property.startsWith('ORGANIZER')) {
      // Extract organizer info
      if (value.includes('CN=')) {
        const cnMatch = value.match(/CN=([^:;]+)/);
        if (cnMatch) {
          event.organizer = cleanText(cnMatch[1]);
        }
      } else if (value.includes('MAILTO:')) {
        event.organizer = value.replace('MAILTO:', '');
      } else {
        event.organizer = cleanText(value);
      }
    } else if (property.startsWith('ATTENDEE')) {
      // Extract attendee info
      let attendee = { email: '', name: '' };
      
      if (value.includes('CN=')) {
        const cnMatch = value.match(/CN=([^:;]+)/);
        if (cnMatch) {
          attendee.name = cleanText(cnMatch[1]);
        }
      }
      
      if (value.includes('MAILTO:')) {
        attendee.email = value.replace(/.*MAILTO:/, '');
      }
      
      if (attendee.name || attendee.email) {
        event.attendees.push(attendee);
      }
    }
  }
  
  return event;
}

function parseDate(dateString) {
  if (!dateString) return null;
  
  try {
    // Handle timezone information in the property line
    let cleanDate = dateString;
    
    // Remove any timezone info that might be appended
    cleanDate = cleanDate.replace(/[TZ]/g, '').replace(/\+.*$/, '').replace(/-.*$/, '');
    
    if (cleanDate.length >= 14) {
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      const hour = cleanDate.substring(8, 10);
      const minute = cleanDate.substring(10, 12);
      const second = cleanDate.substring(12, 2) || '00';
      
      // Create the date - treat as UTC to avoid timezone shifts
      const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
      return new Date(dateStr);
    } else if (cleanDate.length === 8) {
      // All-day event (YYYYMMDD format)
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      
      // Set to 9 AM for all-day events
      return new Date(`${year}-${month}-${day}T09:00:00Z`);
    }
  } catch (error) {
    console.error('Date parsing error:', error, 'for date:', dateString);
  }
  
  return null;
}

function cleanText(text) {
  if (!text) return '';
  
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
}
