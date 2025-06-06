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
    
    // Handle multiline properties (lines that start with space or tab)
    while (lines.indexOf(line) + 1 < lines.length && 
           /^\s/.test(lines[lines.indexOf(line) + 1])) {
      const nextLineIndex = lines.indexOf(line) + 1;
      line += lines[nextLineIndex].trim();
      lines.splice(nextLineIndex, 1);
    }
    
    const colonIndex = line.indexOf(':');
    const property = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);
    
    console.log('Parsing property:', property, 'Value:', value);
    
    if (property.startsWith('DTSTART')) {
      console.log('Found DTSTART:', property, value);
      event.start = parseDate(value);
      event.dtstart = value; // Keep original for debugging
      event.dtstartProperty = property; // Keep property for debugging
    } else if (property.startsWith('DTEND')) {
      console.log('Found DTEND:', property, value);
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
  
  console.log('Parsed event:', {
    summary: event.summary,
    start: event.start,
    dtstart: event.dtstart,
    dtstartProperty: event.dtstartProperty
  });
  
  return event;
}

function parseDate(dateString) {
  if (!dateString) return null;
  
  try {
    console.log('Parsing date:', dateString);
    
    // Handle different ICS date formats
    let cleanDate = dateString.trim();
    
    // Remove any timezone identifiers that might be in the property line
    // Example: DTSTART;TZID=Australia/Sydney:20250607T140000
    if (cleanDate.includes(';')) {
      cleanDate = cleanDate.split(':').pop();
    }
    
    // Remove timezone suffixes like +1000, -0500, Z
    cleanDate = cleanDate.replace(/[+-]\d{4}$/, '').replace(/Z$/, '');
    
    console.log('Cleaned date string:', cleanDate);
    
    if (cleanDate.length === 8) {
      // All-day event format: YYYYMMDD (e.g., 20250607)
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      
      const result = new Date(`${year}-${month}-${day}T09:00:00Z`);
      console.log('All-day event parsed as:', result);
      return result;
      
    } else if (cleanDate.length >= 14 && cleanDate.includes('T')) {
      // Timed event format: YYYYMMDDTHHMMSS (e.g., 20250607T140000)
      const datePart = cleanDate.substring(0, 8);
      const timePart = cleanDate.substring(9);
      
      const year = datePart.substring(0, 4);
      const month = datePart.substring(4, 6);
      const day = datePart.substring(6, 8);
      
      const hour = timePart.substring(0, 2);
      const minute = timePart.substring(2, 4);
      const second = timePart.substring(4, 2) || '00';
      
      const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
      const result = new Date(dateStr);
      console.log('Timed event parsed as:', result);
      return result;
      
    } else if (cleanDate.length >= 14) {
      // Handle format without T separator: YYYYMMDDHHMMSS
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      const hour = cleanDate.substring(8, 10);
      const minute = cleanDate.substring(10, 12);
      const second = cleanDate.substring(12, 2) || '00';
      
      const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
      const result = new Date(dateStr);
      console.log('No-T format parsed as:', result);
      return result;
    }
    
    console.log('Could not parse date format:', cleanDate);
    return null;
    
  } catch (error) {
    console.error('Date parsing error:', error, 'for date:', dateString);
    return null;
  }
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
