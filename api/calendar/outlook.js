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
    
    // Enhanced parsing with recurring event support
    const events = [];
    const eventBlocks = icsData.split('BEGIN:VEVENT');
    
    console.log(`Found ${eventBlocks.length - 1} event blocks in ICS`);
    
    for (let i = 1; i < eventBlocks.length; i++) {
      const eventData = eventBlocks[i];
      const endIndex = eventData.indexOf('END:VEVENT');
      if (endIndex === -1) continue;
      
      const eventContent = eventData.substring(0, endIndex);
      const event = parseEvent(eventContent);
      
      if (event && event.start) {
        // EXPANDED FILTERING: Much wider time window for recurring events
        const now = new Date();
        const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year back
        const sixMonthsFromNow = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 6 months forward
        
        const eventDate = new Date(event.start);
        
        // For recurring events, we need to check if they have future occurrences
        if (event.isRecurring) {
          console.log(`Found recurring event: "${event.summary}" starting ${eventDate.toISOString()}`);
          
          // Expand recurring events to generate future occurrences
          const expandedEvents = expandRecurringEvent(event, now, sixMonthsFromNow);
          console.log(`Expanded to ${expandedEvents.length} occurrences`);
          events.push(...expandedEvents);
        } else {
          // For non-recurring events, use a more generous window
          const isRelevant = eventDate >= oneYearAgo && eventDate <= sixMonthsFromNow;
          
          if (isRelevant) {
            console.log(`Including non-recurring event: "${event.summary}" on ${eventDate.toISOString()}`);
            events.push(event);
          } else {
            console.log(`Filtering out non-recurring event: "${event.summary}" on ${eventDate.toISOString()} (outside range)`);
          }
        }
      } else {
        console.log('Skipping event with invalid/missing start time');
      }
    }
    
    // Sort events by start time
    events.sort((a, b) => a.start - b.start);
    
    // Filter to only include events from today forward (after expansion)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureEvents = events.filter(event => new Date(event.start) >= today);
    
    const meetings = futureEvents.map((event, index) => ({
      id: `custom-${event.uid || index}-${event.start.getTime()}`,
      title: event.summary || 'Untitled Event',
      start: event.start,
      end: event.end,
      description: event.description || '',
      location: event.location || '',
      attendees: event.attendees || [],
      organizer: event.organizer || '',
      source: 'custom-ics',
      isAllDay: event.isAllDay || false,
      isRecurring: event.isRecurring || false,
      rawDtstart: event.dtstart,
      originalProperty: event.dtstartProperty
    }));

    console.log(`Processed ${meetings.length} meetings from ${events.length} total events`);
    
    // Enhanced logging for debugging
    const todayMeetings = meetings.filter(m => {
      const today = new Date().toISOString().split('T')[0];
      const meetingDate = new Date(m.start).toISOString().split('T')[0];
      return meetingDate === today;
    });
    
    const recurringMeetings = meetings.filter(m => m.isRecurring);
    
    console.log(`Today's meetings: ${todayMeetings.length}`);
    console.log(`Recurring meetings: ${recurringMeetings.length}`);

    return res.status(200).json({
      success: true,
      meetings,
      totalEvents: meetings.length,
      source: 'custom-ics',
      sourceUrl: icsUrl,
      stats: {
        todayMeetings: todayMeetings.length,
        recurringMeetings: recurringMeetings.length,
        totalExpanded: events.length,
        totalFiltered: futureEvents.length
      },
      dateRange: {
        from: new Date().toISOString(),
        to: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
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

// Function to expand recurring events
function expandRecurringEvent(event, startDate, endDate) {
  const expandedEvents = [];
  
  if (!event.rrule) {
    // No recurrence rule, just return the original event if it's in range
    if (event.start >= startDate && event.start <= endDate) {
      expandedEvents.push(event);
    }
    return expandedEvents;
  }
  
  try {
    // Parse the RRULE to understand the recurrence pattern
    const rruleParams = parseRRule(event.rrule);
    console.log('Parsed RRULE:', rruleParams);
    
    // Generate occurrences based on the rule
    const occurrences = generateOccurrences(event, rruleParams, startDate, endDate);
    console.log(`Generated ${occurrences.length} occurrences for "${event.summary}"`);
    
    expandedEvents.push(...occurrences);
  } catch (error) {
    console.error('Error expanding recurring event:', error);
    // Fallback: just include the original event if it's in range
    if (event.start >= startDate && event.start <= endDate) {
      expandedEvents.push(event);
    }
  }
  
  return expandedEvents;
}

// Simple RRULE parser
function parseRRule(rruleString) {
  const params = {};
  const parts = rruleString.split(';');
  
  parts.forEach(part => {
    const [key, value] = part.split('=');
    if (key && value) {
      params[key] = value;
    }
  });
  
  return params;
}

// Generate occurrences for recurring events
function generateOccurrences(event, rruleParams, startDate, endDate) {
  const occurrences = [];
  const originalStart = new Date(event.start);
  const originalEnd = new Date(event.end || event.start);
  const duration = originalEnd.getTime() - originalStart.getTime();
  
  let currentDate = new Date(originalStart);
  let count = 0;
  const maxOccurrences = 100; // Safety limit
  
  // Determine the interval
  let intervalDays = 1;
  if (rruleParams.FREQ === 'WEEKLY') {
    intervalDays = 7;
  } else if (rruleParams.FREQ === 'DAILY') {
    intervalDays = 1;
  } else if (rruleParams.FREQ === 'MONTHLY') {
    intervalDays = 30; // Approximate for now
  } else {
    console.log('Unsupported frequency:', rruleParams.FREQ);
    return [event]; // Return original event
  }
  
  // Apply interval multiplier if specified
  if (rruleParams.INTERVAL) {
    intervalDays *= parseInt(rruleParams.INTERVAL);
  }
  
  console.log(`Generating ${rruleParams.FREQ} occurrences every ${intervalDays} days`);
  
  while (currentDate <= endDate && count < maxOccurrences) {
    // Check if this occurrence is within our desired range
    if (currentDate >= startDate) {
      const occurrenceEnd = new Date(currentDate.getTime() + duration);
      
      occurrences.push({
        ...event,
        start: new Date(currentDate),
        end: occurrenceEnd,
        uid: `${event.uid}-${currentDate.getTime()}`, // Unique ID for each occurrence
        isRecurring: true
      });
    }
    
    // Move to next occurrence
    currentDate.setDate(currentDate.getDate() + intervalDays);
    count++;
  }
  
  return occurrences;
}

function parseEvent(eventContent) {
  const event = { attendees: [], organizer: '', isAllDay: false, isRecurring: false };
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
    
    if (property.startsWith('DTSTART')) {
      console.log('Found DTSTART:', property, value);
      
      // Check if it's an all-day event (no time component)
      if (property.includes('VALUE=DATE') || (!value.includes('T') && value.length === 8)) {
        event.isAllDay = true;
        console.log('Detected all-day event');
      }
      
      event.start = parseDate(value, property);
      event.dtstart = value;
      event.dtstartProperty = property;
    } else if (property.startsWith('DTEND')) {
      console.log('Found DTEND:', property, value);
      event.end = parseDate(value, property);
    } else if (property === 'SUMMARY') {
      event.summary = cleanText(value);
    } else if (property === 'DESCRIPTION') {
      event.description = cleanText(value);
    } else if (property === 'LOCATION') {
      event.location = cleanText(value);
    } else if (property === 'UID') {
      event.uid = value;
    } else if (property === 'RRULE') {
      // Detect recurring events
      event.isRecurring = true;
      event.rrule = value;
      console.log('Detected recurring event with RRULE:', value);
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
    isAllDay: event.isAllDay,
    isRecurring: event.isRecurring,
    dtstart: event.dtstart,
    dtstartProperty: event.dtstartProperty
  });
  
  return event;
}

function parseDate(dateString, property = '') {
  if (!dateString) return null;
  
  try {
    console.log('Parsing date:', dateString, 'with property:', property);
    
    // Handle different ICS date formats
    let cleanDate = dateString.trim();
    
    // Remove any timezone identifiers that might be in the property line
    if (cleanDate.includes(';')) {
      cleanDate = cleanDate.split(':').pop();
    }
    
    // Check if this is an all-day event
    const isAllDay = property.includes('VALUE=DATE') || (!cleanDate.includes('T') && cleanDate.length === 8);
    
    if (isAllDay) {
      // All-day event format: YYYYMMDD
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      
      const result = new Date(`${year}-${month}-${day}T00:00:00`);
      console.log('All-day event parsed as local midnight:', result);
      return result;
      
    } else {
      // Remove timezone suffixes for timed events
      cleanDate = cleanDate.replace(/[+-]\d{4}$/, '').replace(/Z$/, '');
      
      if (cleanDate.length >= 14 && cleanDate.includes('T')) {
        // Timed event format: YYYYMMDDTHHMMSS
        const datePart = cleanDate.substring(0, 8);
        const timePart = cleanDate.substring(9);
        
        const year = datePart.substring(0, 4);
        const month = datePart.substring(4, 6);
        const day = datePart.substring(6, 8);
        
        const hour = timePart.substring(0, 2);
        const minute = timePart.substring(2, 4);
        const second = timePart.substring(4, 6) || '00';
        
        const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        const result = new Date(dateStr);
        console.log('Timed event parsed as local time:', result);
        return result;
        
      } else if (cleanDate.length >= 14) {
        // Handle format without T separator
        const year = cleanDate.substring(0, 4);
        const month = cleanDate.substring(4, 6);
        const day = cleanDate.substring(6, 8);
        const hour = cleanDate.substring(8, 10);
        const minute = cleanDate.substring(10, 12);
        const second = cleanDate.substring(12, 14) || '00';
        
        const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        const result = new Date(dateStr);
        console.log('No-T format parsed as local time:', result);
        return result;
      }
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
}export default async function handler(req, res) {
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
    
    // Enhanced parsing with better filtering
    const events = [];
    const eventBlocks = icsData.split('BEGIN:VEVENT');
    
    console.log(`Found ${eventBlocks.length - 1} event blocks in ICS`);
    
    for (let i = 1; i < eventBlocks.length; i++) {
      const eventData = eventBlocks[i];
      const endIndex = eventData.indexOf('END:VEVENT');
      if (endIndex === -1) continue;
      
      const eventContent = eventData.substring(0, endIndex);
      const event = parseEvent(eventContent);
      
      if (event && event.start) {
        // ENHANCED FILTERING: More generous time window
        const now = new Date();
        const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days back
        const threeMonthsFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days forward
        
        // For all-day events, check if they fall on relevant dates
        const eventDate = new Date(event.start);
        const isRelevant = eventDate >= twoMonthsAgo && eventDate <= threeMonthsFromNow;
        
        if (isRelevant) {
          console.log(`Including event: "${event.summary}" on ${eventDate.toISOString()}`);
          events.push(event);
        } else {
          console.log(`Filtering out event: "${event.summary}" on ${eventDate.toISOString()} (outside range)`);
        }
      } else {
        console.log('Skipping event with invalid/missing start time');
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
      source: 'custom-ics',
      isAllDay: event.isAllDay || false,
      isRecurring: event.isRecurring || false,
      rawDtstart: event.dtstart, // Keep for debugging
      originalProperty: event.dtstartProperty // Keep for debugging
    }));

    console.log(`Processed ${meetings.length} meetings from ${events.length} total events`);
    
    // Enhanced logging for debugging
    const todayMeetings = meetings.filter(m => {
      const today = new Date().toISOString().split('T')[0];
      const meetingDate = new Date(m.start).toISOString().split('T')[0];
      return meetingDate === today;
    });
    
    const allDayMeetings = meetings.filter(m => m.isAllDay);
    const recurringMeetings = meetings.filter(m => m.isRecurring);
    
    console.log(`Today's meetings: ${todayMeetings.length}`);
    console.log(`All-day meetings: ${allDayMeetings.length}`);
    console.log(`Recurring meetings: ${recurringMeetings.length}`);

    return res.status(200).json({
      success: true,
      meetings,
      totalEvents: meetings.length,
      source: 'custom-ics',
      sourceUrl: icsUrl,
      stats: {
        todayMeetings: todayMeetings.length,
        allDayMeetings: allDayMeetings.length,
        recurringMeetings: recurringMeetings.length
      },
      dateRange: {
        from: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
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
  const event = { attendees: [], organizer: '', isAllDay: false, isRecurring: false };
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
    
    if (property.startsWith('DTSTART')) {
      console.log('Found DTSTART:', property, value);
      
      // Check if it's an all-day event (no time component)
      if (property.includes('VALUE=DATE') || (!value.includes('T') && value.length === 8)) {
        event.isAllDay = true;
        console.log('Detected all-day event');
      }
      
      event.start = parseDate(value, property);
      event.dtstart = value; // Keep original for debugging
      event.dtstartProperty = property; // Keep property for debugging
    } else if (property.startsWith('DTEND')) {
      console.log('Found DTEND:', property, value);
      event.end = parseDate(value, property);
    } else if (property === 'SUMMARY') {
      event.summary = cleanText(value);
    } else if (property === 'DESCRIPTION') {
      event.description = cleanText(value);
    } else if (property === 'LOCATION') {
      event.location = cleanText(value);
    } else if (property === 'UID') {
      event.uid = value;
    } else if (property === 'RRULE') {
      // Detect recurring events
      event.isRecurring = true;
      event.rrule = value;
      console.log('Detected recurring event with RRULE:', value);
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
    isAllDay: event.isAllDay,
    isRecurring: event.isRecurring,
    dtstart: event.dtstart,
    dtstartProperty: event.dtstartProperty
  });
  
  return event;
}

function parseDate(dateString, property = '') {
  if (!dateString) return null;
  
  try {
    console.log('Parsing date:', dateString, 'with property:', property);
    
    // Handle different ICS date formats
    let cleanDate = dateString.trim();
    
    // Remove any timezone identifiers that might be in the property line
    // Example: DTSTART;TZID=Australia/Sydney:20250607T140000
    if (cleanDate.includes(';')) {
      cleanDate = cleanDate.split(':').pop();
    }
    
    // Check if this is an all-day event
    const isAllDay = property.includes('VALUE=DATE') || (!cleanDate.includes('T') && cleanDate.length === 8);
    
    if (isAllDay) {
      // All-day event format: YYYYMMDD (e.g., 20250607)
      // IMPORTANT: For all-day events, use local midnight instead of UTC 9 AM
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      
      // Use local time midnight for all-day events
      const result = new Date(`${year}-${month}-${day}T00:00:00`);
      console.log('All-day event parsed as local midnight:', result);
      return result;
      
    } else {
      // Remove timezone suffixes like +1000, -0500, Z for timed events
      cleanDate = cleanDate.replace(/[+-]\d{4}$/, '').replace(/Z$/, '');
      
      if (cleanDate.length >= 14 && cleanDate.includes('T')) {
        // Timed event format: YYYYMMDDTHHMMSS (e.g., 20250607T140000)
        const datePart = cleanDate.substring(0, 8);
        const timePart = cleanDate.substring(9);
        
        const year = datePart.substring(0, 4);
        const month = datePart.substring(4, 6);
        const day = datePart.substring(6, 8);
        
        const hour = timePart.substring(0, 2);
        const minute = timePart.substring(2, 4);
        const second = timePart.substring(4, 6) || '00';
        
        // For timed events, treat as local time (this may need timezone adjustment)
        const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        const result = new Date(dateStr);
        console.log('Timed event parsed as local time:', result);
        return result;
        
      } else if (cleanDate.length >= 14) {
        // Handle format without T separator: YYYYMMDDHHMMSS
        const year = cleanDate.substring(0, 4);
        const month = cleanDate.substring(4, 6);
        const day = cleanDate.substring(6, 8);
        const hour = cleanDate.substring(8, 10);
        const minute = cleanDate.substring(10, 12);
        const second = cleanDate.substring(12, 14) || '00';
        
        const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        const result = new Date(dateStr);
        console.log('No-T format parsed as local time:', result);
        return result;
      }
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
