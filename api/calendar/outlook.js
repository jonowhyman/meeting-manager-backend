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
    
    // DEBUG: Log a sample event to see what data is actually available
    const firstEventMatch = icsData.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/);
    if (firstEventMatch) {
      console.log('=== SAMPLE EVENT DATA ===');
      console.log(firstEventMatch[0]);
      console.log('=== END SAMPLE ===');
    }

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
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        if (event.start >= thirtyDaysAgo && event.start <= thirtyDaysFromNow) {
          events.push(event);
        }
      }
    }

    const meetings = events.map((event, index) => ({
      id: `outlook-${event.uid || index}`,
      title: event.summary || 'Untitled Event',
      start: event.start,
      end: event.end,
      description: event.description || '',
      location: event.location || '',
      attendees: event.attendees || [],
      organizer: event.organizer || '',
      source: 'outlook',
      // DEBUG: Include raw event data
      debugInfo: {
        hasAttendees: (event.attendees || []).length > 0,
        hasOrganizer: !!event.organizer,
        rawFields: Object.keys(event)
      }
    }));

    // DEBUG: Log summary
    console.log(`Total events parsed: ${events.length}`);
    console.log(`Events with attendees: ${events.filter(e => e.attendees && e.attendees.length > 0).length}`);
    console.log(`Events with organizer: ${events.filter(e => e.organizer).length}`);

    return res.status(200).json({
      success: true,
      meetings,
      totalEvents: meetings.length,
      source: 'outlook-ics',
      debug: {
        hasAttendeeData: meetings.some(m => m.attendees.length > 0),
        sampleEventFields: meetings[0] ? Object.keys(meetings[0]) : []
      }
    });

  } catch (error) {
    console.error('Calendar error:', error);
    return res.status(500).json({ 
      error: 'Failed to process calendar data',
      details: error.message 
    });
  }
}

function parseEvent(eventContent) {
  const event = { attendees: [], organizer: '' };
  const lines = eventContent.split('\n');
  
  // Track what fields we find
  const foundFields = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || !line.includes(':')) continue;

    const colonIndex = line.indexOf(':');
    const property = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);

    foundFields.push(property);

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
    } else if (property.startsWith('ATTENDEE')) {
      const attendee = parseAttendee(line);
      if (attendee) {
        event.attendees.push(attendee);
      }
    } else if (property.startsWith('ORGANIZER')) {
      event.organizer = parseOrganizer(line);
    }
  }

  // DEBUG: Log fields found for first few events
  event._debugFields = foundFields;

  return event;
}

// ... rest of parsing functions stay the same
function parseAttendee(line) {
  try {
    const emailMatch = line.match(/mailto:([^;?\s]+)/i);
    const nameMatch = line.match(/CN=([^;]+)/i);
    
    if (emailMatch) {
      const email = emailMatch[1];
      const name = nameMatch ? cleanText(nameMatch[1]) : email.split('@')[0];
      return { name, email };
    }
  } catch (error) {
    console.error('Error parsing attendee:', error);
  }
  return null;
}

function parseOrganizer(line) {
  try {
    const emailMatch = line.match(/mailto:([^;?\s]+)/i);
    const nameMatch = line.match(/CN=([^;]+)/i);
    
    if (emailMatch) {
      const email = emailMatch[1];
      const name = nameMatch ? cleanText(nameMatch[1]) : email.split('@')[0];
      return `${name} <${email}>`;
    }
  } catch (error) {
    console.error('Error parsing organizer:', error);
  }
  return '';
}

function parseDate(dateString) {
  if (!dateString) return null;
  
  try {
    const cleanDate = dateString.replace(/[TZ]/g, '').replace(/\+.*$/, '');
    
    if (cleanDate.length >= 14) {
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      const hour = cleanDate.substring(8, 10);
      const minute = cleanDate.substring(10, 12);
      
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
    }
  } catch (error) {
    console.error('Date parsing error:', error);
  }
  
  return null;
}

function cleanText(text) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\t/g, '\t')
    .replace(/"/g, '');
}
