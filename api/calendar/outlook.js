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
    
    // Enhanced parsing with recurring event expansion and exception handling
    const events = [];
    const eventBlocks = icsData.split('BEGIN:VEVENT');
    
    console.log(`\n🔍 PARSING ${eventBlocks.length - 1} event blocks from ICS data`);
    
    // Define our date range for filtering
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const sixMonthsFromNow = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    
    // First pass: collect all events and group by UID
    const eventsByUID = new Map();
    const modifiedInstances = new Map();
    
    for (let i = 1; i < eventBlocks.length; i++) {
      const eventData = eventBlocks[i];
      const endIndex = eventData.indexOf('END:VEVENT');
      if (endIndex === -1) continue;
      
      const eventContent = eventData.substring(0, endIndex);
      const parsedEvent = parseEvent(eventContent);
      
      // DEBUG: Log all events with their end times
      if (parsedEvent && parsedEvent.summary) {
        console.log(`🔍 PARSED EVENT: "${parsedEvent.summary}"`);
        console.log(`  Start: ${parsedEvent.start}`);
        console.log(`  End: ${parsedEvent.end}`);
        console.log(`  DTEND raw: ${parsedEvent.dtend}`);
        console.log(`  Has end time: ${!!parsedEvent.end}`);
        
        if (parsedEvent.summary.toLowerCase().includes('rubz') || parsedEvent.summary.toLowerCase().includes('bday')) {
          console.log(`🎂 FOUND BIRTHDAY EVENT:`, {
            title: parsedEvent.summary,
            start: parsedEvent.start,
            end: parsedEvent.end,
            dtstart: parsedEvent.dtstart,
            dtend: parsedEvent.dtend
          });
        }
      }
      
      if (parsedEvent && parsedEvent.uid) {
        if (parsedEvent.recurrenceId) {
          // This is a modified instance of a recurring event
          if (!modifiedInstances.has(parsedEvent.uid)) {
            modifiedInstances.set(parsedEvent.uid, new Map());
          }
          modifiedInstances.get(parsedEvent.uid).set(parsedEvent.recurrenceId, parsedEvent);
        } else {
          // This is a base event (either single or recurring master)
          eventsByUID.set(parsedEvent.uid, parsedEvent);
        }
      }
    }
    
    console.log(`📊 PARSING SUMMARY:`);
    console.log(`  Base events parsed: ${eventsByUID.size}`);
    console.log(`  Modified recurring instances: ${modifiedInstances.size}`);
    
    // Second pass: process events with exception handling
    for (const [uid, baseEvent] of eventsByUID) {
      if (baseEvent.start) {
        if (baseEvent.isRecurring && baseEvent.rrule) {
          // Expand recurring event into individual instances
          const exceptionDates = baseEvent.exdates || [];
          const modifiedInstancesForUID = modifiedInstances.get(uid) || new Map();
          
          const recurringInstances = expandRecurringEventWithExceptions(
            baseEvent, 
            sixMonthsAgo, 
            sixMonthsFromNow,
            exceptionDates,
            modifiedInstancesForUID
          );
          
          events.push(...recurringInstances);
        } else {
          // Single event - check if it's in our date range
          const eventDate = new Date(baseEvent.start);
          const isRelevant = eventDate >= sixMonthsAgo && eventDate <= sixMonthsFromNow;
          
          if (isRelevant) {
            console.log(`✅ Including single event: "${baseEvent.summary}"`);
            console.log(`  Start: ${baseEvent.start}`);
            console.log(`  End: ${baseEvent.end}`);
            events.push(baseEvent);
          }
        }
      }
    }
    
    // Sort events by start time
    events.sort((a, b) => a.start - b.start);
    
    const meetings = events.map((event, index) => {
      const meeting = {
        id: `custom-${event.uid || index}-${event.instanceId || ''}`,
        title: event.summary || 'Untitled Event',
        start: event.start,
        end: event.end, // CRITICAL: Preserve the end time
        description: event.description || '',
        location: event.location || '',
        attendees: event.attendees || [],
        organizer: event.organizer || '',
        source: 'custom-ics',
        isAllDay: event.isAllDay || false,
        isRecurring: event.isRecurring || false,
        recurringInstanceDate: event.recurringInstanceDate || null,
        originalUid: event.originalUid || event.uid,
        rawDtstart: event.dtstart,
        rawDtend: event.dtend
      };
      
      // DEBUG: Log the meeting object creation
      if (event.summary && (event.summary.toLowerCase().includes('rubz') || event.summary.toLowerCase().includes('bday'))) {
        console.log(`🎂 CREATING MEETING OBJECT:`, {
          title: meeting.title,
          start: meeting.start,
          end: meeting.end,
          rawDtend: meeting.rawDtend
        });
      }
      
      return meeting;
    });

    console.log(`📈 FINAL RESULTS:`);
    console.log(`  Total meetings: ${meetings.length}`);
    console.log(`  Meetings with end times: ${meetings.filter(m => m.end).length}`);
    console.log(`  Meetings without end times: ${meetings.filter(m => !m.end).length}`);

    return res.status(200).json({
      success: true,
      meetings,
      totalEvents: meetings.length,
      source: 'custom-ics',
      sourceUrl: icsUrl,
      dateRange: {
        from: sixMonthsAgo.toISOString(),
        to: sixMonthsFromNow.toISOString()
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

function expandRecurringEventWithExceptions(baseEvent, startRange, endRange, exceptionDates, modifiedInstances) {
  const instances = [];
  
  if (!baseEvent.rrule) {
    return [baseEvent];
  }
  
  try {
    const rrule = parseRRule(baseEvent.rrule);
    
    if (!rrule.freq) {
      return [baseEvent];
    }
    
    const startDate = new Date(baseEvent.start);
    const eventDuration = baseEvent.end ? new Date(baseEvent.end) - new Date(baseEvent.start) : 30 * 60 * 1000;
    
    let currentDate = new Date(startDate);
    let instanceCount = 0;
    const maxInstances = 500;
    
    let untilDate = endRange;
    if (rrule.until) {
      untilDate = new Date(Math.min(rrule.until.getTime(), endRange.getTime()));
    }
    
    while (currentDate <= untilDate && instanceCount < maxInstances) {
      if (currentDate >= startRange && currentDate <= endRange) {
        const currentDateStr = formatDateForComparison(currentDate);
        
        const isCancelled = exceptionDates.some(exDate => {
          const exDateStr = formatDateForComparison(exDate);
          return exDateStr === currentDateStr;
        });
        
        if (!isCancelled) {
          const modifiedInstance = modifiedInstances.get(currentDateStr);
          
          if (modifiedInstance) {
            const instance = {
              ...modifiedInstance,
              isRecurring: true,
              recurringInstanceDate: currentDate.toISOString(),
              instanceId: `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`,
              originalUid: baseEvent.uid,
              isModified: true
            };
            instances.push(instance);
          } else {
            const instance = {
              ...baseEvent,
              start: new Date(currentDate),
              end: new Date(currentDate.getTime() + eventDuration), // Preserve duration
              isRecurring: true,
              recurringInstanceDate: currentDate.toISOString(),
              instanceId: `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`,
              originalUid: baseEvent.uid,
              isModified: false
            };
            
            instances.push(instance);
          }
        }
      }
      
      // Calculate next occurrence
      switch (rrule.freq.toUpperCase()) {
        case 'DAILY':
          currentDate.setDate(currentDate.getDate() + (rrule.interval || 1));
          break;
        case 'WEEKLY':
          if (rrule.byday && rrule.byday.length > 0) {
            currentDate = getNextWeeklyOccurrence(currentDate, rrule.byday, rrule.interval || 1);
          } else {
            currentDate.setDate(currentDate.getDate() + (7 * (rrule.interval || 1)));
          }
          break;
        case 'MONTHLY':
          currentDate.setMonth(currentDate.getMonth() + (rrule.interval || 1));
          break;
        case 'YEARLY':
          currentDate.setFullYear(currentDate.getFullYear() + (rrule.interval || 1));
          break;
        default:
          console.log('Unsupported frequency:', rrule.freq);
          break;
      }
      
      instanceCount++;
      
      if (rrule.count && instanceCount >= rrule.count) {
        break;
      }
    }
    
    // Add any modified instances that don't fall on regular recurrence dates
    for (const [recurrenceId, modifiedInstance] of modifiedInstances) {
      const modifiedDate = new Date(modifiedInstance.start);
      if (modifiedDate >= startRange && modifiedDate <= endRange) {
        const alreadyIncluded = instances.some(inst => 
          Math.abs(new Date(inst.start) - modifiedDate) < 1000 * 60 * 60
        );
        
        if (!alreadyIncluded) {
          const instance = {
            ...modifiedInstance,
            isRecurring: true,
            recurringInstanceDate: modifiedDate.toISOString(),
            instanceId: `mod-${Date.now()}`,
            originalUid: baseEvent.uid,
            isModified: true,
            isMovedInstance: true
          };
          instances.push(instance);
        }
      }
    }
    
    return instances;
    
  } catch (error) {
    console.error('Error expanding recurring event with exceptions:', error);
    return [baseEvent];
  }
}

function formatDateForComparison(date) {
  if (!date) return null;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hour}${minute}${second}`;
}

function parseRRule(rruleString) {
  const rrule = {};
  const parts = rruleString.split(';');
  
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!key || !value) continue;
    
    switch (key.toUpperCase()) {
      case 'FREQ':
        rrule.freq = value;
        break;
      case 'INTERVAL':
        rrule.interval = parseInt(value);
        break;
      case 'COUNT':
        rrule.count = parseInt(value);
        break;
      case 'UNTIL':
        rrule.until = parseDate(value);
        break;
      case 'BYDAY':
        rrule.byday = value.split(',');
        break;
      case 'BYMONTHDAY':
        rrule.bymonthday = value.split(',').map(d => parseInt(d));
        break;
      case 'BYMONTH':
        rrule.bymonth = value.split(',').map(m => parseInt(m));
        break;
      case 'WKST':
        rrule.wkst = value;
        break;
    }
  }
  
  return rrule;
}

function getNextWeeklyOccurrence(currentDate, byday, interval) {
  const dayMap = {
    'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6
  };
  
  const targetDays = byday.map(day => {
    const dayCode = day.replace(/[+-]?\d+/, '');
    return dayMap[dayCode.toUpperCase()];
  }).filter(day => day !== undefined).sort((a, b) => a - b);
  
  if (targetDays.length === 0) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + (7 * interval));
    return nextDate;
  }
  
  const currentDay = currentDate.getDay();
  const nextDate = new Date(currentDate);
  
  if (targetDays.length > 1) {
    for (const targetDay of targetDays) {
      if (targetDay > currentDay) {
        nextDate.setDate(nextDate.getDate() + (targetDay - currentDay));
        return nextDate;
      }
    }
    
    const weeksToAdd = interval;
    const daysToAdd = (7 - currentDay) + (7 * (weeksToAdd - 1)) + targetDays[0];
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    return nextDate;
  } else {
    const targetDay = targetDays[0];
    if (targetDay > currentDay) {
      nextDate.setDate(nextDate.getDate() + (targetDay - currentDay));
    } else {
      const daysToNextWeek = 7 - currentDay + (7 * (interval - 1));
      nextDate.setDate(nextDate.getDate() + daysToNextWeek + targetDay);
    }
    return nextDate;
  }
}

function parseEvent(eventContent) {
  const event = { attendees: [], organizer: '', isAllDay: false, isRecurring: false, exdates: [] };
  const lines = eventContent.split('\n');
  
  // Handle line continuations
  const consolidatedLines = [];
  let currentLine = '';
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    
    if (lines[i].match(/^\s/) || (currentLine && !line.includes(':'))) {
      currentLine += line.replace(/^\s+/, '');
    } else {
      if (currentLine) {
        consolidatedLines.push(currentLine);
      }
      currentLine = line;
    }
  }
  
  if (currentLine) {
    consolidatedLines.push(currentLine);
  }
  
  for (let line of consolidatedLines) {
    if (!line.includes(':')) continue;
    
    const colonIndex = line.indexOf(':');
    const property = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);
    
    if (property.startsWith('DTSTART')) {
      event.start = parseDate(value, property);
      event.dtstart = value;
      event.dtstartProperty = property;
      
      if (property.includes('VALUE=DATE') || (!value.includes('T') && value.length === 8)) {
        event.isAllDay = true;
      }
    } else if (property.startsWith('DTEND')) {
      event.end = parseDate(value, property);
      event.dtend = value;
      event.dtendProperty = property;
      
      // DEBUG: Log DTEND parsing
      console.log(`📅 DTEND PARSING: "${value}" -> ${event.end}`);
    } else if (property.startsWith('RECURRENCE-ID')) {
      const recurrenceDate = parseDate(value, property);
      event.recurrenceId = formatDateForComparison(recurrenceDate);
      event.isModifiedInstance = true;
    } else if (property.startsWith('EXDATE')) {
      const dateStrings = value.split(',');
      for (let dateStr of dateStrings) {
        dateStr = dateStr.trim();
        if (dateStr) {
          const parsedDate = parseDate(dateStr, property);
          if (parsedDate) {
            event.exdates.push(parsedDate);
          }
        }
      }
    } else if (property === 'SUMMARY') {
      event.summary = cleanText(value);
    } else if (property === 'DESCRIPTION') {
      event.description = cleanText(value);
    } else if (property === 'LOCATION') {
      event.location = cleanText(value);
    } else if (property === 'UID') {
      event.uid = value;
    } else if (property === 'RRULE') {
      event.isRecurring = true;
      event.rrule = value;
    } else if (property.startsWith('ORGANIZER')) {
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

function parseDate(dateString, property = '') {
  if (!dateString) return null;
  
  try {
    let cleanDate = dateString.trim();
    
    if (cleanDate.includes(';')) {
      cleanDate = cleanDate.split(':').pop();
    }
    
    const isAllDay = property.includes('VALUE=DATE') || (!cleanDate.includes('T') && cleanDate.length === 8);
    
    if (isAllDay) {
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      
      const result = new Date(`${year}-${month}-${day}T00:00:00`);
      return result;
    } else {
      cleanDate = cleanDate.replace(/[+-]\d{4}$/, '').replace(/Z$/, '');
      
      if (cleanDate.length >= 14 && cleanDate.includes('T')) {
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
        return result;
      } else if (cleanDate.length >= 14) {
        const year = cleanDate.substring(0, 4);
        const month = cleanDate.substring(4, 6);
        const day = cleanDate.substring(6, 8);
        const hour = cleanDate.substring(8, 10);
        const minute = cleanDate.substring(10, 12);
        const second = cleanDate.substring(12, 14) || '00';
        
        const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        const result = new Date(dateStr);
        return result;
      } else if (cleanDate.length === 8) {
        const year = cleanDate.substring(0, 4);
        const month = cleanDate.substring(4, 6);
        const day = cleanDate.substring(6, 8);
        
        const dateStr = `${year}-${month}-${day}T00:00:00`;
        const result = new Date(dateStr);
        return result;
      }
    }
    
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
