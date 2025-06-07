<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meeting Manager - Claude AI Integration</title>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect } = React;

        const MeetingManager = () => {
            const [selectedMeeting, setSelectedMeeting] = useState(null);
            const [meetings, setMeetings] = useState([]);
            const [showCalendarSync, setShowCalendarSync] = useState(false);
            const [isSyncing, setSyncing] = useState(false);
            const [syncStatus, setSyncStatus] = useState("");
            const [selectedCalendar, setSelectedCalendar] = useState("");
            
            // Custom ICS URL state
            const [customIcsUrl, setCustomIcsUrl] = useState("https://outlook.office365.com/owa/calendar/9c463b80649a40c28918f07f03562595@sxswsydney.com/2ca3e48f938e4b41bb0c939fd98314804887869706492204640/calendar.ics");
            const [showIcsSettings, setShowIcsSettings] = useState(false);
            
            // Claude API Integration State - UPDATED: Full API URL instead of domain
            const [claudeApiKey, setClaudeApiKey] = useState("");
            const [showClaudeSettings, setShowClaudeSettings] = useState(false);
            const [isGeneratingAI, setIsGeneratingAI] = useState(false);
            const [aiGenerationStatus, setAiGenerationStatus] = useState("");
            const [backendApiUrl, setBackendApiUrl] = useState(""); // CHANGED: Full API URL instead of domain
            
            // UNIFIED date handling - one source of truth
            const getToday = () => {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            // Function to check if a meeting is suppressed
            const isMeetingSuppressed = (meetingTitle) => {
                const cleanTitle = meetingTitle.replace(/^\[CANCELLED\]\s*/i, '').trim();
                return suppressedMeetings.has(cleanTitle);
            };

            // Function to manually delete a meeting
            const deleteMeeting = (meetingId) => {
                setMeetings(prev => prev.filter(m => m.id !== meetingId));
            };

            const getCurrentDate = () => {
                const now = new Date();
                return now.toLocaleDateString('en-AU', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            };

            const [selectedDate, setSelectedDate] = useState(getToday());
            const [viewMode, setViewMode] = useState('today');
            const [showDatePicker, setShowDatePicker] = useState(false);
            const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
            const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
            
            const [userTimezone, setUserTimezone] = useState('Australia/Sydney');
            const [showTimezoneSettings, setShowTimezoneSettings] = useState(false);
            const [lastSyncTime, setLastSyncTime] = useState(null);
            const [suppressedMeetings, setSuppressedMeetings] = useState(new Set());
            const [showSuppressionManager, setShowSuppressionManager] = useState(false);
            


            const backendUrl = "https://meeting-manager-backend-9yom.vercel.app";

            // Load meetings from localStorage on component mount
            useEffect(() => {
                try {
                    const savedMeetings = localStorage.getItem('meeting-manager-meetings');
                    const savedLastSync = localStorage.getItem('meeting-manager-last-sync');
                    const savedCustomUrl = localStorage.getItem('meeting-manager-custom-url');
                    const savedTimezone = localStorage.getItem('meeting-manager-timezone');
                    const savedClaudeKey = localStorage.getItem('meeting-manager-claude-key'); 
                    const savedBackendApiUrl = localStorage.getItem('meeting-manager-backend-api-url'); // CHANGED: New localStorage key
                    
                    if (savedMeetings) {
                        const parsedMeetings = JSON.parse(savedMeetings);
                        const restoredMeetings = parsedMeetings.map(meeting => ({
                            ...meeting,
                            startDateTime: meeting.startDateTime ? new Date(meeting.startDateTime) : null,
                            end: meeting.end ? new Date(meeting.end) : null
                        }));
                        setMeetings(restoredMeetings);
                    }
                    
                    if (savedLastSync) {
                        setLastSyncTime(new Date(savedLastSync));
                    }
                    
                    if (savedCustomUrl) {
                        setCustomIcsUrl(savedCustomUrl);
                    }
                    
                    if (savedTimezone) {
                        setUserTimezone(savedTimezone);
                    }
                    
                    if (savedClaudeKey) {
                        setClaudeApiKey(savedClaudeKey);
                    }
                    
                    if (savedBackendApiUrl) { // CHANGED: Load full API URL
                        setBackendApiUrl(savedBackendApiUrl);
                    }
                    
                    // Load suppressed meetings
                    const savedSuppressed = localStorage.getItem('meeting-manager-suppressed');
                    if (savedSuppressed) {
                        setSuppressedMeetings(new Set(JSON.parse(savedSuppressed)));
                    }
                } catch (error) {
                    console.error('Error loading saved data:', error);
                }
            }, []);

            // Save meetings to localStorage whenever meetings change
            useEffect(() => {
                try {
                    localStorage.setItem('meeting-manager-meetings', JSON.stringify(meetings));
                } catch (error) {
                    console.error('Error saving meetings:', error);
                }
            }, [meetings]);

            // Save other settings when they change
            useEffect(() => {
                localStorage.setItem('meeting-manager-custom-url', customIcsUrl);
            }, [customIcsUrl]);

            useEffect(() => {
                localStorage.setItem('meeting-manager-timezone', userTimezone);
            }, [userTimezone]);

            useEffect(() => {
                localStorage.setItem('meeting-manager-claude-key', claudeApiKey);
            }, [claudeApiKey]);

            useEffect(() => { // CHANGED: Save full API URL
                localStorage.setItem('meeting-manager-backend-api-url', backendApiUrl);
            }, [backendApiUrl]);

            // Save suppressed meetings when they change
            useEffect(() => {
                localStorage.setItem('meeting-manager-suppressed', JSON.stringify(Array.from(suppressedMeetings)));
            }, [suppressedMeetings]);

            // Claude API Integration Function - UPDATED: Enhanced prompt for better formatting
            const generateAISummary = async (meetingNotes, meetingTitle, meetingDescription) => {
                if (!claudeApiKey || !claudeApiKey.trim()) {
                    setAiGenerationStatus("❌ Claude API key required. Please configure in settings.");
                    return null;
                }

                if (!backendApiUrl || !backendApiUrl.trim()) {
                    setAiGenerationStatus("❌ Backend API URL required. Please set your complete API URL in settings.");
                    return null;
                }

                if (!meetingNotes || meetingNotes.trim().length === 0) {
                    setAiGenerationStatus("❌ No meeting notes to summarize. Please add notes first.");
                    return null;
                }

                try {
                    setIsGeneratingAI(true);
                    setAiGenerationStatus("🤖 Generating AI summary via backend...");

                    // UPDATED: Clear separation between existing actions and suggested actions
                    const enhancedPrompt = `TASK: Convert meeting notes into a professional summary using exact formatting codes. Do not be conversational.

CRITICAL FORMATTING REQUIREMENTS:
1. Use **text** for bold subheadings only
2. Convert "// IMPORTANT:" to exactly: [RED]**IMPORTANT:**[/RED] followed by the content
3. Keep "**ACTION:**" items exactly as: **ACTION:** followed by content under "**Action Items**"
4. For additional actions you identify that were NOT marked as "**ACTION:**", put them under: "**SUGGESTED ACTIONS**"
5. Use • for bullet points
6. NO emojis, NO conversational language, NO questions
7. Output should be a clean summary only

IMPORTANT: Separate existing marked actions from new suggested actions:
- Existing "**ACTION:**" items → under "**Action Items**"  
- New actions you identify → under "**SUGGESTED ACTIONS**"

EXAMPLE:
Meeting Notes: "/ Follow up with Sarah" and "Schedule the review meeting"
Output:
**Action Items:**
**ACTION:** Follow up with Sarah

**SUGGESTED ACTIONS**
• Schedule the review meeting

Meeting Title: ${meetingTitle || 'N/A'}
Meeting Description: ${meetingDescription || 'N/A'}

Meeting Notes:
${meetingNotes}

Output only the formatted summary with clear separation between existing and suggested actions.`;

                    // CHANGED: Use the full API URL directly
                    const apiUrl = backendApiUrl;

                    console.log('Calling API at:', apiUrl);

                    // Call your Vercel API endpoint with enhanced prompt
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            notes: enhancedPrompt, // Send the complete enhanced prompt
                            title: meetingTitle,
                            description: meetingDescription,
                            apiKey: claudeApiKey
                        })
                    });

                    console.log('API Response status:', response.status);

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
                    }

                    const data = await response.json();
                    
                    setAiGenerationStatus("✅ AI summary generated successfully!");
                    
                    // Clear status after 3 seconds
                    setTimeout(() => {
                        setAiGenerationStatus("");
                    }, 3000);

                    return data.summary;

                } catch (error) {
                    console.error('Backend API Error:', error);
                    
                    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
                        setAiGenerationStatus("❌ Connection Error: Cannot reach backend. Check your API URL setting and deployment.");
                    } else if (error.message.includes('404')) {
                        setAiGenerationStatus("❌ API Not Found: Make sure your API endpoint is deployed and the URL is correct.");
                    } else {
                        setAiGenerationStatus(`❌ Error: ${error.message}`);
                    }
                    
                    // Clear error after 8 seconds for better debugging
                    setTimeout(() => {
                        setAiGenerationStatus("");
                    }, 8000);
                    
                    return null;
                } finally {
                    setIsGeneratingAI(false);
                }
            };

            // Function to trigger AI summary generation for current meeting
            const handleGenerateAISummary = async () => {
                if (!selectedMeeting) return;

                const aiSummary = await generateAISummary(
                    selectedMeeting.notes, 
                    selectedMeeting.title,
                    selectedMeeting.agenda
                );

                if (aiSummary) {
                    const updatedMeeting = { 
                        ...selectedMeeting, 
                        aiSummary: aiSummary,
                        aiGeneratedAt: new Date().toISOString()
                    };
                    
                    setSelectedMeeting(updatedMeeting);
                    setMeetings(prev => prev.map(m => 
                        m.id === selectedMeeting.id ? updatedMeeting : m
                    ));
                }
            };

            // Sync height of Meeting Description and AI Summary fields - UPDATED: Auto-expand with 20 line max
            useEffect(() => {
                if (selectedMeeting) {
                    setTimeout(() => {
                        const descBox = document.querySelector('#meeting-description-box');
                        const aiBox = document.querySelector('#ai-summary-container');
                        const aiTextarea = document.querySelector('#ai-summary-textarea');
                        
                        if (descBox && aiBox && aiTextarea) {
                            // Calculate line height (assuming 1.5 line-height and 14px font)
                            const lineHeight = 21; // 14px * 1.5
                            const maxLines = 20;
                            const minLines = 7; // About 150px minimum
                            const maxHeight = (maxLines * lineHeight) + 32; // +32 for padding
                            const minHeight = (minLines * lineHeight) + 32;
                            
                            // Auto-resize AI textarea based on content
                            aiTextarea.style.height = 'auto';
                            const aiContentHeight = Math.max(aiTextarea.scrollHeight + 32, minHeight);
                            const aiLimitedHeight = Math.min(aiContentHeight, maxHeight);
                            
                            // Get description box current height
                            const descHeight = Math.max(descBox.offsetHeight, minHeight);
                            const descLimitedHeight = Math.min(descHeight, maxHeight);
                            
                            // Use the larger of the two, but respect the 20-line maximum
                            const finalHeight = Math.min(Math.max(aiLimitedHeight, descLimitedHeight), maxHeight);
                            
                            // Apply the height to both boxes
                            descBox.style.height = finalHeight + 'px';
                            aiBox.style.height = finalHeight + 'px';
                            
                            // Adjust inner content heights to match
                            const descContent = descBox.querySelector('div');
                            if (descContent) {
                                const innerHeight = finalHeight - 32; // Account for outer padding (16px * 2)
                                descContent.style.height = innerHeight + 'px';
                                aiTextarea.style.height = innerHeight + 'px';
                            }
                        }
                    }, 100);
                }
            }, [selectedMeeting, selectedMeeting?.aiSummary]); // Also trigger when AI summary changes

            // Function to clear all data and start fresh
            const clearAllData = () => {
                if (confirm('⚠️ Are you sure you want to clear ALL meetings and start fresh?\n\nThis will:\n• Delete all meetings and notes\n• Clear sync history\n• Reset to a clean state\n\nThis action cannot be undone!')) {
                    console.log('🧹 CLEARING ALL DATA - Starting fresh');
                    
                    setMeetings([]);
                    setSelectedMeeting(null);
                    setLastSyncTime(null);
                    
                    localStorage.removeItem('meeting-manager-meetings');
                    localStorage.removeItem('meeting-manager-last-sync');
                    localStorage.removeItem('meeting-manager-suppressed');
                    
                    setSuppressedMeetings(new Set());
                    
                    console.log('✅ All meeting data cleared - ready for fresh sync');
                    alert('✅ Database cleared! You can now sync fresh data from your calendar.');
                }
            };

            // Function to suppress a meeting by title
            const suppressMeeting = (meetingTitle) => {
                setSuppressedMeetings(prev => {
                    const newSet = new Set(prev);
                    newSet.add(meetingTitle);
                    return newSet;
                });
            };

            // Function to unsuppress a meeting by title
            const unsuppressMeeting = (meetingTitle) => {
                setSuppressedMeetings(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(meetingTitle);
                    return newSet;
                });
            };

            // Function to check if a meeting should be auto-hidden (Motion events)
            const shouldAutoHideMeeting = (meeting) => {
                const description = meeting.agenda || meeting.description || '';
                return description.includes('This event was created by Motion');
            };

            const performSmartSync = (newMeetings) => {
                setMeetings(prevMeetings => {
                    const nonIcsMeetings = prevMeetings.filter(m => m.source !== 'custom-ics');
                    const existingIcsMeetings = prevMeetings.filter(m => m.source === 'custom-ics');
                    
                    const meetingsWithNotes = existingIcsMeetings.filter(m => m.notes && m.notes.trim().length > 0);
                    const meetingsWithoutNotes = existingIcsMeetings.filter(m => !m.notes || m.notes.trim().length === 0);
                    const cancelledMeetings = existingIcsMeetings.filter(m => m.title.startsWith('[CANCELLED]'));
                    
                    const finalMeetings = [];
                    const processedNewMeetingIds = new Set();
                    
                    const findMatchingMeeting = (existingMeeting, newMeetings) => {
                        const existingTitleClean = existingMeeting.title.replace(/^\[CANCELLED\]\s*/i, '').toLowerCase().trim();
                        
                        // Try ID-based matching first
                        let match = newMeetings.find(newM => newM.id === existingMeeting.id);
                        if (match) return match;
                        
                        // Try exact title match
                        match = newMeetings.find(newM => {
                            const newTitleNormalized = newM.title.toLowerCase().trim();
                            return newTitleNormalized === existingTitleClean;
                        });
                        
                        return match || null;
                    };
                    
                    // STEP 1: Process ALL cancelled meetings - KEEP THEM FOREVER
                    cancelledMeetings.forEach((cancelledMeeting) => {
                        finalMeetings.push(cancelledMeeting);
                    });
                    
                    // STEP 2: Process meetings WITH notes (preserve them)
                    meetingsWithNotes.forEach((existingMeeting) => {
                        if (existingMeeting.title.startsWith('[CANCELLED]')) {
                            return; // Skip - already processed
                        }
                        
                        const matchingNewMeeting = findMatchingMeeting(existingMeeting, newMeetings);
                        
                        if (matchingNewMeeting) {
                            const preservedMeeting = {
                                ...matchingNewMeeting,
                                notes: existingMeeting.notes, // PRESERVE NOTES
                                aiSummary: existingMeeting.aiSummary, // PRESERVE AI SUMMARY
                                aiGeneratedAt: existingMeeting.aiGeneratedAt, // PRESERVE AI TIMESTAMP
                                actions: existingMeeting.actions || [],
                                id: existingMeeting.id,
                                isRecurring: matchingNewMeeting.isRecurring || existingMeeting.isRecurring || false
                            };
                            
                            finalMeetings.push(preservedMeeting);
                            processedNewMeetingIds.add(matchingNewMeeting.id);
                        } else {
                            const cancelledMeeting = {
                                ...existingMeeting,
                                title: `[CANCELLED] ${existingMeeting.title}`,
                                agenda: (existingMeeting.agenda || '') + 
                                       '\n\n⚠️ This meeting was not found in the latest calendar sync and may have been cancelled or removed.',
                                notes: existingMeeting.notes,
                                aiSummary: existingMeeting.aiSummary, // PRESERVE AI SUMMARY
                                aiGeneratedAt: existingMeeting.aiGeneratedAt, // PRESERVE AI TIMESTAMP
                                actions: existingMeeting.actions || []
                            };
                            
                            finalMeetings.push(cancelledMeeting);
                        }
                    });
                    
                    // STEP 3: Process meetings WITHOUT notes
                    meetingsWithoutNotes.forEach((existingMeeting) => {
                        if (existingMeeting.title.startsWith('[CANCELLED]')) {
                            return; // Skip - already processed
                        }
                        
                        const matchingNewMeeting = findMatchingMeeting(existingMeeting, newMeetings);
                        
                        if (matchingNewMeeting) {
                            const updatedMeeting = {
                                ...matchingNewMeeting,
                                actions: existingMeeting.actions || [],
                                id: existingMeeting.id,
                                notes: "",
                                aiSummary: existingMeeting.aiSummary || "", // PRESERVE AI SUMMARY
                                aiGeneratedAt: existingMeeting.aiGeneratedAt, // PRESERVE AI TIMESTAMP
                                isRecurring: matchingNewMeeting.isRecurring || existingMeeting.isRecurring || false
                            };
                            
                            finalMeetings.push(updatedMeeting);
                            processedNewMeetingIds.add(matchingNewMeeting.id);
                        }
                    });
                    
                    // STEP 4: Add completely new meetings
                    newMeetings.forEach(newMeeting => {
                        if (!processedNewMeetingIds.has(newMeeting.id)) {
                            const isDuplicate = finalMeetings.some(existing => {
                                const sameTitle = existing.title.toLowerCase().replace(/^\[cancelled\]\s*/i, '') === 
                                                newMeeting.title.toLowerCase();
                                const sameDate = existing.date === newMeeting.date;
                                const sameTime = existing.time === newMeeting.time;
                                return sameTitle && sameDate && sameTime;
                            });
                            
                            if (!isDuplicate) {
                                const cleanNewMeeting = {
                                    ...newMeeting,
                                    notes: "",
                                    aiSummary: "",
                                    actions: [],
                                    isRecurring: newMeeting.isRecurring || false
                                };
                                
                                finalMeetings.push(cleanNewMeeting);
                            }
                        }
                    });
                    
                    const result = [...nonIcsMeetings, ...finalMeetings];
                    return result;
                });
                
                const now = new Date();
                setLastSyncTime(now);
                localStorage.setItem('meeting-manager-last-sync', now.toISOString());
            };

            const syncCalendarMeetings = async () => {
                if (!selectedCalendar) return;
                
                try {
                    setSyncing(true);
                    setSyncStatus("Fetching meetings via API...");
                    
                    if (selectedCalendar === 'custom-ics') {
                        if (!customIcsUrl || !customIcsUrl.trim()) {
                            throw new Error('Please set a custom ICS URL first');
                        }
                        
                        const apiUrl = `${backendUrl}/api/calendar/outlook.js?url=${encodeURIComponent(customIcsUrl)}`;
                        
                        const response = await fetch(apiUrl, {
                            method: 'GET',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        
                        if (!response.ok) {
                            throw new Error(`API failed: ${response.status} ${response.statusText}`);
                        }
                        
                        const data = await response.json();
                        setSyncStatus(`Found ${data.meetings.length} meetings from your calendar`);
                        
                        const calendarMeetings = data.meetings.map((meeting, index) => {
                            const originalString = meeting.start;
                            
                            let correctedStartDate;
                            const dateMatch = originalString.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
                            if (dateMatch) {
                                const [, year, month, day, hour, minute, second] = dateMatch;
                                correctedStartDate = new Date(
                                    parseInt(year), 
                                    parseInt(month) - 1,
                                    parseInt(day), 
                                    parseInt(hour), 
                                    parseInt(minute), 
                                    parseInt(second) || 0
                                );
                            } else {
                                correctedStartDate = new Date(meeting.start);
                            }
                            
                            // Process the end time properly
                            let correctedEndDate = null;
                            if (meeting.end) {
                                if (meeting.end instanceof Date) {
                                    correctedEndDate = meeting.end;
                                } else if (typeof meeting.end === 'string') {
                                    const endDateMatch = meeting.end.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
                                    if (endDateMatch) {
                                        const [, year, month, day, hour, minute, second] = endDateMatch;
                                        correctedEndDate = new Date(
                                            parseInt(year), 
                                            parseInt(month) - 1,
                                            parseInt(day), 
                                            parseInt(hour), 
                                            parseInt(minute), 
                                            parseInt(second) || 0
                                        );
                                    } else {
                                        correctedEndDate = new Date(meeting.end);
                                    }
                                }
                            }
                            
                            const formattedTime = correctedStartDate.toLocaleTimeString('en-AU', { 
                                hour: 'numeric', 
                                minute: '2-digit',
                                hour12: true,
                                timeZone: userTimezone
                            });
                            
                            const formattedDate = correctedStartDate.getFullYear() + '-' + 
                                                 String(correctedStartDate.getMonth() + 1).padStart(2, '0') + '-' + 
                                                 String(correctedStartDate.getDate()).padStart(2, '0');
                            
                            const titleKey = meeting.title.toLowerCase()
                                .replace(/[^a-z0-9\s]/g, '')
                                .replace(/\s+/g, '-')
                                .replace(/^-+|-+$/g, '')
                                .substring(0, 50);
                            
                            const dateKey = formattedDate.replace(/-/g, '');
                            const timeKey = formattedTime.replace(/[^0-9]/g, '').substring(0, 4);
                            const stableId = `ics-${titleKey}-${dateKey}-${timeKey}`;
                            
                            // Check if this is an all-day or multi-day event
                            const startDate = new Date(meeting.start);
                            const endDate = meeting.end ? new Date(meeting.end) : null;
                            
                            const isAllDayEvent = !meeting.start.includes('T') || 
                                                 (startDate.getHours() === 0 && startDate.getMinutes() === 0);
                            
                            const isMultiDayEvent = endDate && 
                                                   (endDate.toDateString() !== startDate.toDateString());
                            
                            // ✅ CRITICAL FIX: Properly detect recurring status (boolean true only)
                            const isRecurringMeeting = meeting.isRecurring === true || 
                                                      !!meeting.recurringInstanceDate || 
                                                      !!(meeting.rrule && meeting.rrule.length > 0);
                            
                            const processedMeeting = {
                                id: stableId,
                                title: meeting.title,
                                date: formattedDate,
                                time: formattedTime,
                                attendees: meeting.attendees || [],
                                agenda: meeting.description || "",
                                notes: "",
                                aiSummary: "",
                                actions: [],
                                isRecurring: isRecurringMeeting,
                                source: 'custom-ics',
                                location: meeting.location || '',
                                organizer: meeting.organizer || '',
                                startDateTime: correctedStartDate,
                                end: correctedEndDate,
                                originalStart: meeting.start,
                                originalEnd: meeting.end,
                                userTimezone: userTimezone,
                                isAllDay: isAllDayEvent,
                                isMultiDay: isMultiDayEvent,
                                shouldFilter: isAllDayEvent || isMultiDayEvent,
                                recurringInstanceDate: meeting.recurringInstanceDate || null,
                                originalUid: meeting.originalUid || meeting.uid || null,
                                rrule: meeting.rrule || null
                            };
                            
                            return processedMeeting;
                        });
                        
                        const filteredMeetings = calendarMeetings.filter(meeting => {
                            if (meeting.shouldFilter) {
                                return false;
                            }
                            return true;
                        });
                        
                        performSmartSync(filteredMeetings);
                        
                        setSyncStatus(`✅ Synced ${filteredMeetings.length} meetings (${filteredMeetings.filter(m => m.isRecurring).length} recurring)`);
                    }
                    
                    setTimeout(() => {
                        setShowCalendarSync(false);
                        setSyncing(false);
                        setSyncStatus("");
                    }, 2000);
                    
                } catch (error) {
                    console.error('Calendar sync failed:', error);
                    setSyncStatus(`❌ Sync failed: ${error.message}`);
                    setTimeout(() => {
                        setSyncing(false);
                        setSyncStatus("");
                    }, 3000);
                }
            };

            // SIMPLIFIED date functions
            const formatDateForDisplay = (dateStr) => {
                const today = getToday();
                
                if (dateStr === today) {
                    return 'Today';
                }
                
                const todayDate = new Date();
                const yesterday = new Date(todayDate);
                yesterday.setDate(yesterday.getDate() - 1);
                const tomorrow = new Date(todayDate);
                tomorrow.setDate(tomorrow.getDate() + 1);
                
                const yesterdayStr = yesterday.getFullYear() + '-' + 
                                   String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + 
                                   String(yesterday.getDate()).padStart(2, '0');
                const tomorrowStr = tomorrow.getFullYear() + '-' + 
                                   String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + 
                                   String(tomorrow.getDate()).padStart(2, '0');
                
                if (dateStr === yesterdayStr) {
                    return 'Yesterday';
                }
                if (dateStr === tomorrowStr) {
                    return 'Tomorrow';
                }
                
                const date = new Date(dateStr + 'T12:00:00');
                return date.toLocaleDateString('en-AU', { 
                    weekday: 'long', 
                    month: 'short', 
                    day: 'numeric' 
                });
            };

            const goToToday = () => {
                const today = getToday();
                setSelectedDate(today);
                setViewMode('today');
            };

            const goToPreviousDay = () => {
                const currentDate = new Date(selectedDate + 'T12:00:00');
                const previousDay = new Date(currentDate);
                previousDay.setDate(previousDay.getDate() - 1);
                
                const previousDateStr = previousDay.getFullYear() + '-' + 
                                       String(previousDay.getMonth() + 1).padStart(2, '0') + '-' + 
                                       String(previousDay.getDate()).padStart(2, '0');
                
                setSelectedDate(previousDateStr);
                setViewMode('calendar');
            };

            const goToNextDay = () => {
                const currentDate = new Date(selectedDate + 'T12:00:00');
                const nextDay = new Date(currentDate);
                nextDay.setDate(nextDay.getDate() + 1);
                
                const nextDateStr = nextDay.getFullYear() + '-' + 
                                   String(nextDay.getMonth() + 1).padStart(2, '0') + '-' + 
                                   String(nextDay.getDate()).padStart(2, '0');
                
                setSelectedDate(nextDateStr);
                setViewMode('calendar');
            };

            const getFilteredMeetings = () => {
                const todayStr = getToday();
                
                let filtered;
                if (viewMode === 'today') {
                    filtered = meetings.filter(meeting => {
                        let meetingLocalDate;
                        
                        if (meeting.startDateTime) {
                            meetingLocalDate = meeting.startDateTime.getFullYear() + '-' + 
                                               String(meeting.startDateTime.getMonth() + 1).padStart(2, '0') + '-' + 
                                               String(meeting.startDateTime.getDate()).padStart(2, '0');
                        } else {
                            meetingLocalDate = meeting.date;
                        }
                        
                        return meetingLocalDate === todayStr;
                    });
                } else {
                    filtered = meetings.filter(meeting => {
                        let meetingLocalDate;
                        
                        if (meeting.startDateTime) {
                            meetingLocalDate = meeting.startDateTime.getFullYear() + '-' + 
                                               String(meeting.startDateTime.getMonth() + 1).padStart(2, '0') + '-' + 
                                               String(meeting.startDateTime.getDate()).padStart(2, '0');
                        } else {
                            meetingLocalDate = meeting.date;
                        }
                        
                        return meetingLocalDate === selectedDate;
                    });
                }
                
                // Apply suppression filters
                filtered = filtered.filter(meeting => !shouldAutoHideMeeting(meeting));
                filtered = filtered.filter(meeting => !isMeetingSuppressed(meeting.title));
                
                return filtered.sort((a, b) => {
                    const aIsCancelled = a.title.startsWith('[CANCELLED]');
                    const bIsCancelled = b.title.startsWith('[CANCELLED]');
                    
                    if (aIsCancelled && !bIsCancelled) return 1;
                    if (!aIsCancelled && bIsCancelled) return -1;
                    
                    const getTimeForSorting = (meeting) => {
                        if (meeting.startDateTime) {
                            return meeting.startDateTime.getTime();
                        }
                        const timeStr = meeting.time || '00:00';
                        const [time, period] = timeStr.split(' ');
                        const [hours, minutes] = time.split(':').map(Number);
                        let hour24 = hours;
                        
                        if (period && period.toLowerCase() === 'pm' && hours !== 12) {
                            hour24 += 12;
                        } else if (period && period.toLowerCase() === 'am' && hours === 12) {
                            hour24 = 0;
                        }
                        
                        return hour24 * 60 + (minutes || 0);
                    };
                    
                    return getTimeForSorting(a) - getTimeForSorting(b);
                });
            };

            const getMeetingCountForDate = (date) => {
                const dateStr = date.getFullYear() + '-' + 
                               String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                               String(date.getDate()).padStart(2, '0');
                               
                return meetings.filter(meeting => {
                    let dateMatches = false;
                    if (meeting.startDateTime) {
                        const meetingLocalDate = meeting.startDateTime.getFullYear() + '-' + 
                                               String(meeting.startDateTime.getMonth() + 1).padStart(2, '0') + '-' + 
                                               String(meeting.startDateTime.getDate()).padStart(2, '0');
                        dateMatches = meetingLocalDate === dateStr;
                    } else {
                        dateMatches = meeting.date === dateStr;
                    }
                    
                    return dateMatches && 
                           !isMeetingSuppressed(meeting.title) && 
                           !shouldAutoHideMeeting(meeting);
                }).length;
            };

            // Generate calendar days for the specified year/month
            const generateCalendarDays = (year, month) => {
                const firstDay = new Date(year, month, 1);
                const lastDay = new Date(year, month + 1, 0);
                const daysInMonth = lastDay.getDate();
                const startingDayOfWeek = firstDay.getDay();
                
                const days = [];
                
                for (let i = 0; i < startingDayOfWeek; i++) {
                    days.push(null);
                }
                
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(year, month, day);
                    days.push(date);
                }
                
                return days;
            };

            // Generate year options (current year ± 5 years)
            const generateYearOptions = () => {
                const currentYear = new Date().getFullYear();
                const years = [];
                for (let year = currentYear - 5; year <= currentYear + 5; year++) {
                    years.push(year);
                }
                return years;
            };

            // Month names
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];

            // Function to format time range and duration
            const formatTimeWithDuration = (meeting) => {
                if (!meeting.startDateTime) {
                    return meeting.time || 'Time not available';
                }
                
                const start = meeting.startDateTime.toLocaleTimeString('en-AU', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true,
                    timeZone: userTimezone
                });
                
                let endDateTime;
                if (meeting.end && meeting.end instanceof Date) {
                    endDateTime = meeting.end;
                } else if (meeting.end && typeof meeting.end === 'string') {
                    endDateTime = new Date(meeting.end);
                } else if (meeting.originalEnd && typeof meeting.originalEnd === 'string') {
                    endDateTime = new Date(meeting.originalEnd);
                } else if (meeting.endDateTime && meeting.endDateTime instanceof Date) {
                    endDateTime = meeting.endDateTime;
                } else if (meeting.endDateTime && typeof meeting.endDateTime === 'string') {
                    endDateTime = new Date(meeting.endDateTime);
                } else {
                    endDateTime = new Date(meeting.startDateTime.getTime() + (30 * 60 * 1000));
                }
                
                if (endDateTime <= meeting.startDateTime) {
                    endDateTime = new Date(meeting.startDateTime.getTime() + (30 * 60 * 1000));
                }
                
                const end = endDateTime.toLocaleTimeString('en-AU', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true,
                    timeZone: userTimezone
                });
                
                const durationMs = endDateTime - meeting.startDateTime;
                const durationMins = Math.round(durationMs / (1000 * 60));
                
                return `${start}-${end} (${durationMins}mins)`;
            };

            // Function to check for meeting clashes
            const hasMeetingClash = (meeting, allMeetings) => {
                if (!meeting.startDateTime) return false;
                
                const meetingStart = meeting.startDateTime.getTime();
                let meetingEnd;
                if (meeting.end && meeting.end instanceof Date) {
                    meetingEnd = meeting.end.getTime();
                } else if (meeting.end && typeof meeting.end === 'string') {
                    meetingEnd = new Date(meeting.end).getTime();
                } else {
                    meetingEnd = meetingStart + (30 * 60 * 1000);
                }
                
                return allMeetings.some(otherMeeting => {
                    if (otherMeeting.id === meeting.id) return false;
                    if (!otherMeeting.startDateTime) return false;
                    
                    const otherStart = otherMeeting.startDateTime.getTime();
                    let otherEnd;
                    if (otherMeeting.end && otherMeeting.end instanceof Date) {
                        otherEnd = otherMeeting.end.getTime();
                    } else if (otherMeeting.end && typeof otherMeeting.end === 'string') {
                        otherEnd = new Date(otherMeeting.end).getTime();
                    } else {
                        otherEnd = otherStart + (30 * 60 * 1000);
                    }
                    
                    return (meetingStart < otherEnd && meetingEnd > otherStart);
                });
            };

            // Function to get meeting status indicators
            const getMeetingStatusLines = (meeting, allMeetings) => {
                const indicators = [];
                
                if (hasMeetingClash(meeting, allMeetings)) {
                    indicators.push('bg-red-500');
                }
                
                if (meeting.title.toLowerCase().startsWith('hold')) {
                    indicators.push('bg-gray-500');
                }
                
                return indicators;
            };

            // Function to find previous instance of a recurring meeting
            const findPreviousMeetingInstance = (currentMeeting) => {
                if (!currentMeeting.isRecurring) return null;
                
                const currentDate = new Date(currentMeeting.date + 'T12:00:00');
                const cleanTitle = currentMeeting.title.replace(/^\[CANCELLED\]\s*/i, '').trim();
                
                // Find all meetings with the same title that are before the current date
                const previousInstances = meetings.filter(meeting => {
                    const meetingDate = new Date(meeting.date + 'T12:00:00');
                    const meetingTitle = meeting.title.replace(/^\[CANCELLED\]\s*/i, '').trim();
                    
                    return meetingTitle === cleanTitle && 
                           meetingDate < currentDate && 
                           meeting.notes && 
                           meeting.notes.trim().length > 0;
                }).sort((a, b) => {
                    // Sort by date descending to get the most recent previous instance
                    const dateA = new Date(a.date + 'T12:00:00');
                    const dateB = new Date(b.date + 'T12:00:00');
                    return dateB - dateA;
                });
                
                return previousInstances.length > 0 ? previousInstances[0] : null;
            };

            // Helper function to convert URLs to hyperlinks with shortened display text
            const convertUrlsToLinks = (text) => {
                if (!text) return text;
                
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const parts = text.split(urlRegex);
                
                return parts.map((part, index) => {
                    if (part.match(urlRegex)) {
                        // Shorten URL display text
                        let displayText = part;
                        try {
                            const url = new URL(part);
                            const domain = url.hostname.replace('www.', '');
                            const path = url.pathname + url.search;
                            
                            if (path.length > 20) {
                                displayText = `${domain}${path.substring(0, 20)}...`;
                            } else {
                                displayText = `${domain}${path}`;
                            }
                        } catch (e) {
                            // If URL parsing fails, just truncate
                            if (part.length > 50) {
                                displayText = part.substring(0, 50) + '...';
                            }
                        }
                        
                        return React.createElement('a', {
                            key: index,
                            href: part,
                            target: '_blank',
                            rel: 'noopener noreferrer',
                            className: 'text-blue-600 hover:text-blue-800 underline',
                            title: part // Full URL on hover
                        }, displayText);
                    }
                    return part;
                });
            };

            // AUTO-FORMATTING FUNCTIONS
            const processNotesAutoFormatting = (text) => {
                if (!text) return text;
                
                // Process line by line
                const lines = text.split('\n');
                const processedLines = lines.map(line => {
                    // Handle // for Important (red bold) - WAIT FOR SPACE
                    if (line.trim().startsWith('// ')) {
                        const content = line.trim().substring(3).trim();
                        return `[RED]**IMPORTANT:**[/RED] ${content}`;
                    }
                    
                    // Handle / for Actions - WAIT FOR SPACE AND NOT //
                    if (line.trim().startsWith('/ ') && !line.trim().startsWith('// ')) {
                        const content = line.trim().substring(2).trim();
                        return `**ACTION:** ${content}`;
                    }
                    
                    // Handle - for bullet points - WAIT FOR SPACE
                    if (line.trim().startsWith('- ')) {
                        const content = line.trim().substring(2).trim();
                        const indent = line.match(/^(\s*)/)[1];
                        return `${indent}• ${content}`;
                    }
                    
                    return line;
                });
                
                return processedLines.join('\n');
            };

            // Extract actions from notes text
            const extractActionsFromNotes = (notesText) => {
                if (!notesText) return '';
                
                const lines = notesText.split('\n');
                const actionLines = lines
                    .filter(line => {
                        // Look for ACTION: formatted lines OR original / lines
                        return line.includes('**ACTION:**') || (line.trim().startsWith('/ ') && !line.trim().startsWith('// '));
                    })
                    .map(line => {
                        let content = '';
                        if (line.includes('**ACTION:**')) {
                            // Extract from formatted ACTION line
                            content = line.replace('**ACTION:**', '').trim();
                        } else if (line.trim().startsWith('/ ')) {
                            // Extract from original / line
                            content = line.trim().substring(2).trim();
                        }
                        return content ? `• ${content}` : '';
                    })
                    .filter(line => line.trim().length > 0);
                
                return actionLines.join('\n');
            };

            // PARSE AND RENDER formatted text as HTML
            const parseColoredText = (text) => {
                if (!text) return text;
                
                // Convert color markup to HTML with proper styling
                let processedText = text
                    .replace(/\[RED\](.*?)\[\/RED\]/g, '<span style="color: #DC2626; font-weight: 600;">$1</span>')
                    .replace(/\[BLUE\](.*?)\[\/BLUE\]/g, '<span style="color: #2563EB; font-weight: 600;">$1</span>')
                    .replace(/\[GREEN\](.*?)\[\/GREEN\]/g, '<span style="color: #059669; font-weight: 600;">$1</span>')
                    .replace(/\[ORANGE\](.*?)\[\/ORANGE\]/g, '<span style="color: #EA580C; font-weight: 600;">$1</span>')
                    .replace(/\[PURPLE\](.*?)\[\/PURPLE\]/g, '<span style="color: #9333EA; font-weight: 600;">$1</span>');
                
                // Convert other formatting
                processedText = processedText
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/__(.*?)__/g, '<u>$1</u>');
                
                // Convert line breaks
                processedText = processedText.replace(/\n/g, '<br>');
                
                return processedText;
            };

            // Helper function to auto-resize textarea
            const autoResizeTextarea = (textarea) => {
                if (textarea) {
                    textarea.style.height = 'auto';
                    textarea.style.height = Math.max(textarea.scrollHeight, 150) + 'px'; // Match notes minimum height
                }
            };

            // Rich text formatting functions
            const insertFormatting = (textarea, prefix, suffix = '') => {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const selectedText = textarea.value.substring(start, end);
                const beforeText = textarea.value.substring(0, start);
                const afterText = textarea.value.substring(end);
                
                const newText = beforeText + prefix + selectedText + suffix + afterText;
                return {
                    text: newText,
                    cursorPos: start + prefix.length + selectedText.length + suffix.length
                };
            };

            // Smart continuation for lists and bullets
            const handleSmartContinuation = (textarea, newValue, onChange) => {
                const cursorPos = textarea.selectionStart;
                const textBeforeCursor = newValue.substring(0, cursorPos);
                const lines = textBeforeCursor.split('\n');
                const currentLine = lines[lines.length - 1];
                const previousLine = lines.length > 1 ? lines[lines.length - 2] : '';
                
                // Check if we just pressed Enter after an empty bullet point
                if (currentLine === '' && previousLine.trim() === '•') {
                    // Remove the empty bullet and don't continue
                    const beforeEmpty = textBeforeCursor.substring(0, textBeforeCursor.lastIndexOf('\n• \n'));
                    const afterCursor = newValue.substring(cursorPos);
                    const updatedText = beforeEmpty + '\n\n' + afterCursor;
                    
                    onChange(updatedText);
                    
                    // Set cursor position after the double newline
                    setTimeout(() => {
                        textarea.focus();
                        const newCursorPos = beforeEmpty.length + 2;
                        textarea.setSelectionRange(newCursorPos, newCursorPos);
                    }, 0);
                    
                    return true;
                }
                
                // Check if we just pressed Enter after a bullet point, number, or checkbox
                if (currentLine === '' && previousLine) {
                    let continuation = '';
                    
                    // Bullet point continuation
                    if (previousLine.match(/^(\s*)• /)) {
                        const indent = previousLine.match(/^(\s*)/)[1];
                        continuation = `${indent}• `;
                    }
                    // Numbered list continuation
                    else if (previousLine.match(/^(\s*)(\d+)\. /)) {
                        const indent = previousLine.match(/^(\s*)/)[1];
                        const currentNum = parseInt(previousLine.match(/(\d+)/)[1]);
                        continuation = `${indent}${currentNum + 1}. `;
                    }
                    
                    if (continuation) {
                        const beforeCursor = newValue.substring(0, cursorPos);
                        const afterCursor = newValue.substring(cursorPos);
                        const updatedText = beforeCursor + continuation + afterCursor;
                        
                        onChange(updatedText);
                        
                        // Set cursor position after the continuation
                        setTimeout(() => {
                            textarea.focus();
                            textarea.setSelectionRange(cursorPos + continuation.length, cursorPos + continuation.length);
                        }, 0);
                        
                        return true; // Indicates we handled the continuation
                    }
                }
                
                return false; // No continuation needed
            };

            const handleFormatting = (type, textareaRef, currentValue, onChange) => {
                if (!textareaRef.current) return;
                
                let result;
                switch (type) {
                    case 'bold':
                        result = insertFormatting(textareaRef.current, '**', '**');
                        break;
                    case 'italic':
                        result = insertFormatting(textareaRef.current, '*', '*');
                        break;
                    case 'underline':
                        result = insertFormatting(textareaRef.current, '__', '__');
                        break;
                    case 'bullet':
                        result = insertFormatting(textareaRef.current, '• ');
                        break;
                    case 'number':
                        result = insertFormatting(textareaRef.current, '1. ');
                        break;
                    case 'checkbox':
                        result = insertFormatting(textareaRef.current, '☐ ');
                        break;
                    case 'checkedbox':
                        result = insertFormatting(textareaRef.current, '☑ ');
                        break;
                    case 'red':
                        result = insertFormatting(textareaRef.current, '[RED]', '[/RED]');
                        break;
                    case 'blue':
                        result = insertFormatting(textareaRef.current, '[BLUE]', '[/BLUE]');
                        break;
                    case 'green':
                        result = insertFormatting(textareaRef.current, '[GREEN]', '[/GREEN]');
                        break;
                    case 'orange':
                        result = insertFormatting(textareaRef.current, '[ORANGE]', '[/ORANGE]');
                        break;
                    case 'purple':
                        result = insertFormatting(textareaRef.current, '[PURPLE]', '[/PURPLE]');
                        break;
                    default:
                        return;
                }
                
                onChange(result.text);
                setTimeout(() => {
                    textareaRef.current.focus();
                    textareaRef.current.setSelectionRange(result.cursorPos, result.cursorPos);
                }, 0);
            };

            // Helper function to get meeting type badge
            const getMeetingTypeBadge = (location) => {
                if (!location) return null;
                
                if (location.includes('Teams') || location.includes('teams')) {
                    return React.createElement('span', { 
                        className: "px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded ml-2" 
                    }, "🟢 Teams");
                } else if (location.trim()) {
                    return React.createElement('span', { 
                        className: "px-2 py-1 text-xs bg-green-100 text-green-800 rounded ml-2" 
                    }, "🏢 In-Person");
                }
                return null;
            };

            // Function to export meeting as PDF
            const exportMeetingAsPDF = () => {
                // Create a clean version of the meeting content for PDF (without Meeting Details)
                const printContent = `
                    <html>
                    <head>
                        <title>Meeting Notes - ${selectedMeeting.title}</title>
                        <style>
                            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
                            .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                            .section { margin-bottom: 20px; }
                            .section-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 10px; }
                            .content { background: #f9f9f9; padding: 15px; border-left: 4px solid #007bff; }
                            .notes-content { white-space: pre-wrap; }
                            .important { color: #dc2626; font-weight: bold; }
                            .action { color: #059669; font-weight: bold; }
                            ul, ol { margin: 0; padding-left: 20px; }
                            li { margin-bottom: 2px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>${selectedMeeting.title}</h1>
                            <p><strong>Date:</strong> ${selectedMeeting.date}</p>
                            <p><strong>Time:</strong> ${formatTimeWithDuration(selectedMeeting)}</p>
                            ${selectedMeeting.location ? `<p><strong>Location:</strong> ${selectedMeeting.location}</p>` : ''}
                            ${selectedMeeting.organizer ? `<p><strong>Organizer:</strong> ${selectedMeeting.organizer}</p>` : ''}
                        </div>
                        
                        ${selectedMeeting.aiSummary ? `
                        <div class="section">
                            <div class="section-title">AI Summary</div>
                            <div class="content">
                                ${selectedMeeting.aiSummary}
                            </div>
                        </div>
                        ` : ''}
                        
                        ${selectedMeeting.notes ? `
                        <div class="section">
                            <div class="section-title">Meeting Notes</div>
                            <div class="content">
                                ${(() => {
                                    let processedNotes = selectedMeeting.notes
                                        .replace(/\[RED\]\*\*IMPORTANT:\*\*\[\/RED\]/g, '<span class="important">IMPORTANT:</span>')
                                        .replace(/\*\*ACTION:\*\*/g, '<span class="action">ACTION:</span>')
                                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                        .replace(/__(.*?)__/g, '<u>$1</u>');
                                    
                                    // Convert bullet points to HTML list
                                    const lines = processedNotes.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                                    let result = '';
                                    let inList = false;
                                    
                                    for (const line of lines) {
                                        if (line.startsWith('• ')) {
                                            if (!inList) {
                                                result += '<ul>';
                                                inList = true;
                                            }
                                            result += `<li>${line.substring(2)}</li>`;
                                        } else {
                                            if (inList) {
                                                result += '</ul>';
                                                inList = false;
                                            }
                                            result += `<p>${line}</p>`;
                                        }
                                    }
                                    
                                    if (inList) {
                                        result += '</ul>';
                                    }
                                    
                                    return result;
                                })()}
                            </div>
                        </div>
                        ` : ''}
                        
                        ${selectedMeeting.actionItems ? `
                        <div class="section">
                            <div class="section-title">Action Items</div>
                            <div class="content">
                                ${selectedMeeting.actionItems}
                            </div>
                        </div>
                        ` : ''}
                        
                        <div style="margin-top: 30px; font-size: 12px; color: #666;">
                            Generated on ${new Date().toLocaleDateString('en-AU', { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                            })}
                        </div>
                    </body>
                    </html>
                `;
                
                // Open print dialog with the formatted content
                const printWindow = window.open('', '_blank');
                printWindow.document.write(printContent);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 100);
            };

            // Function to create simple email with AI summary
            const createEmail = () => {
                const subject = encodeURIComponent(`Meeting Notes: ${selectedMeeting.title}`);
                const emailBody = selectedMeeting.aiSummary ? selectedMeeting.aiSummary.trim() : 'No AI summary available for this meeting.';
                const encodedBody = encodeURIComponent(emailBody);
                const mailtoLink = `mailto:?subject=${subject}&body=${encodedBody}`;
                
                // Open email client with pre-filled content
                window.open(mailtoLink, '_blank');
            };

            if (!selectedMeeting) {
                const filteredMeetings = getFilteredMeetings();
                const displayDate = viewMode === 'today' ? 'Today' : formatDateForDisplay(selectedDate);
                
                return React.createElement('div', { className: "max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen" },
                    React.createElement('div', { className: "bg-white rounded-lg shadow-sm" },
                        React.createElement('div', { className: "p-6 border-b border-gray-200" },
                            React.createElement('div', { className: "flex items-center justify-between mb-4" },
                                React.createElement('div', null,
                                    React.createElement('h1', { className: "text-2xl font-bold text-gray-900 mb-2" }, "Meeting Manager - Claude AI Integration"),
                                    React.createElement('p', { className: "text-gray-600" }, "🤖 Enhanced with Claude AI for intelligent meeting summaries"),
                                    React.createElement('div', { className: "flex items-center gap-4 text-sm text-gray-500 mt-2" },
                                        React.createElement('span', null, `Current date: ${getCurrentDate()}`),
                                        React.createElement('span', { className: "px-2 py-1 bg-blue-100 text-blue-600 rounded text-xs" }, userTimezone),
                                        claudeApiKey && backendApiUrl && React.createElement('span', { className: "px-2 py-1 bg-green-100 text-green-600 rounded text-xs" }, "🤖 Claude AI Ready")
                                    ),
                                    lastSyncTime && React.createElement('p', { className: "text-xs text-gray-500 mt-1" }, 
                                        `Last synced: ${lastSyncTime.toLocaleString('en-AU', { 
                                            timeZone: userTimezone,
                                            year: 'numeric',
                                            month: 'short', 
                                            day: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true
                                        })}`
                                    )
                                ),
                                React.createElement('div', { className: "flex gap-2" },
                                    React.createElement('button', {
                                        onClick: () => {
                                            const htmlContent = document.documentElement.outerHTML;
                                            const blob = new Blob([htmlContent], { type: 'text/html' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = 'meeting_manager_claude_ai.html';
                                            a.type = 'text/html';
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);
                                        },
                                        className: "px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                                    }, "💾 Download HTML"),
                                    React.createElement('button', {
                                        onClick: clearAllData,
                                        className: "px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                                    }, "🧹 Clear All"),
                                    React.createElement('button', {
                                        onClick: () => setShowClaudeSettings(!showClaudeSettings),
                                        className: `px-4 py-2 rounded-lg transition-colors text-sm ${
                                            claudeApiKey && backendApiUrl
                                                ? 'bg-green-600 text-white hover:bg-green-700' 
                                                : 'bg-purple-600 text-white hover:bg-purple-700'
                                        }`
                                    }, claudeApiKey && backendApiUrl ? "🤖 Claude Ready" : "🤖 Setup Claude"),
                                    React.createElement('button', {
                                        onClick: () => setShowIcsSettings(!showIcsSettings),
                                        className: "px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                    }, "⚙️ Settings"),
                                    React.createElement('button', {
                                        onClick: () => setShowSuppressionManager(true),
                                        className: "px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                                    }, `🔇 Suppressed (${suppressedMeetings.size})`),
                                    React.createElement('button', {
                                        onClick: () => setShowCalendarSync(true),
                                        className: "px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                    }, "📅 Sync")
                                )
                            ),
                            
                            // Claude API Settings - UPDATED: Full API URL instead of domain
                            showClaudeSettings && React.createElement('div', { className: "mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg" },
                                React.createElement('h4', { className: "font-medium text-gray-900 mb-3" }, "🤖 Claude AI Configuration"),
                                React.createElement('div', { className: "space-y-3" },
                                    React.createElement('div', null,
                                        React.createElement('label', { className: "block text-sm font-medium text-gray-700 mb-1" }, "Claude API Key:"),
                                        React.createElement('input', {
                                            type: "password",
                                            value: claudeApiKey,
                                            onChange: (e) => setClaudeApiKey(e.target.value),
                                            placeholder: "sk-ant-api03-...",
                                            className: "w-full p-2 border border-gray-300 rounded text-sm font-mono"
                                        }),
                                        React.createElement('p', { className: "text-xs text-gray-500 mt-1" }, 
                                            "Get your API key from: ", 
                                            React.createElement('a', { 
                                                href: "https://console.anthropic.com/", 
                                                target: "_blank", 
                                                className: "text-blue-600 hover:underline" 
                                            }, "console.anthropic.com")
                                        )
                                    ),
                                    
                                    React.createElement('div', null,
                                        React.createElement('label', { className: "block text-sm font-medium text-gray-700 mb-1" }, "Backend API URL (complete URL):"),
                                        React.createElement('input', {
                                            type: "text",
                                            value: backendApiUrl,
                                            onChange: (e) => setBackendApiUrl(e.target.value),
                                            placeholder: "https://meeting-manager-backend-xyz.vercel.app/api/claude-summary.js",
                                            className: "w-full p-2 border border-gray-300 rounded text-sm"
                                        }),
                                        React.createElement('p', { className: "text-xs text-gray-500 mt-1" }, 
                                            "Enter your complete API endpoint URL (including https:// and .js)"
                                        )
                                    ),
                                    
                                    // Vercel Setup Instructions
                                    React.createElement('div', { className: "text-sm text-blue-700 bg-blue-50 p-3 rounded border border-blue-200" },
                                        React.createElement('strong', null, "🚀 Backend Setup Steps:"),
                                        React.createElement('ol', { className: "mt-2 ml-4 space-y-1 list-decimal text-xs" },
                                            React.createElement('li', null, "Go to your ", React.createElement('code', { className: "bg-white px-1 rounded" }, "meeting-manager-backend"), " project"),
                                            React.createElement('li', null, "Create ", React.createElement('code', { className: "bg-white px-1 rounded" }, "api/claude-summary.js"), " with the provided code"),
                                            React.createElement('li', null, "Deploy: ", React.createElement('code', { className: "bg-white px-1 rounded" }, "vercel --prod")),
                                            React.createElement('li', null, "Copy your full API URL: ", React.createElement('code', { className: "bg-white px-1 rounded" }, "https://your-backend.vercel.app/api/claude-summary.js")),
                                            React.createElement('li', null, "Paste the complete URL in the field above"),
                                            React.createElement('li', null, "Test: Visit your URL to see \"Method not allowed\" message")
                                        ),
                                        React.createElement('div', { className: "mt-2 text-xs text-blue-600" },
                                            "✅ Your API key is sent securely to your own backend endpoint."
                                        )
                                    ),
                                    
                                    // Debug info - UPDATED for full URL
                                    React.createElement('div', { className: "text-xs text-gray-600 bg-gray-50 p-2 rounded border" },
                                        React.createElement('strong', null, "Debug Info:"),
                                        React.createElement('div', null, `Frontend URL: ${window.location.href}`),
                                        React.createElement('div', null, `Backend API: ${backendApiUrl || 'Not configured'}`),
                                        React.createElement('div', null, `Status: ${backendApiUrl ? '✅ Ready' : '❌ Need API URL'}`)
                                    ),
                                    
                                    React.createElement('div', { className: "text-sm text-gray-600 bg-white p-3 rounded border" },
                                        React.createElement('strong', null, "🤖 Claude AI Features:"),
                                        React.createElement('ul', { className: "mt-1 space-y-1 ml-4 list-disc" },
                                            React.createElement('li', null, "📝 Generate intelligent meeting summaries from your notes"),
                                            React.createElement('li', null, "🎯 Extract key topics, decisions, and action items"),
                                            React.createElement('li', null, "⚡ One-click AI summary generation via Vercel"),
                                            React.createElement('li', null, "🔒 Secure API key handling through your backend"),
                                            React.createElement('li', null, "💡 Professional, structured output for easy sharing")
                                        )
                                    ),
                                    React.createElement('button', {
                                        onClick: () => setShowClaudeSettings(false),
                                        className: "px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
                                    }, "Save Claude Settings")
                                )
                            ),
                            
                            // ICS Settings
                            showIcsSettings && React.createElement('div', { className: "mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg" },
                                React.createElement('h4', { className: "font-medium text-gray-900 mb-3" }, "ICS Calendar Settings"),
                                React.createElement('div', { className: "space-y-3" },
                                    React.createElement('div', null,
                                        React.createElement('label', { className: "block text-sm font-medium text-gray-700 mb-1" }, "ICS Calendar URL:"),
                                        React.createElement('input', {
                                            type: "url",
                                            value: customIcsUrl,
                                            onChange: (e) => setCustomIcsUrl(e.target.value),
                                            placeholder: "https://outlook.office365.com/owa/calendar/.../calendar.ics",
                                            className: "w-full p-2 border border-gray-300 rounded text-sm"
                                        })
                                    ),
                                    React.createElement('div', { className: "text-sm text-gray-600 bg-white p-3 rounded border" },
                                        React.createElement('strong', null, "✨ Export Features:"),
                                        React.createElement('ul', { className: "mt-1 space-y-1 ml-4 list-disc" },
                                            React.createElement('li', null, "📄 Export meetings as PDF documents"),
                                            React.createElement('li', null, "📧 Create emails with meeting notes"),
                                            React.createElement('li', null, "✨ Type \"- \" for automatic bullet points"),
                                            React.createElement('li', null, "⚡ Type \"/ \" for actions (auto-copies to Action Items)"),
                                            React.createElement('li', null, "🚨 Type \"// \" for IMPORTANT notes (bold red)"),
                                            React.createElement('li', null, "🖱️ Improved mouse navigation in notes field")
                                        )
                                    ),
                                    React.createElement('button', {
                                        onClick: () => setShowIcsSettings(false),
                                        className: "px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
                                    }, "Save Settings")
                                )
                            ),
                            
                            customIcsUrl && React.createElement('div', { className: "bg-green-50 p-3 rounded-lg border border-green-200" },
                                React.createElement('div', { className: "flex items-center justify-between" },
                                    React.createElement('p', { className: "text-sm text-green-800" },
                                        "✅ Claude AI + Export Features Active!"
                                    ),
                                    React.createElement('div', { className: "text-xs text-green-600" },
                                        `${meetings.filter(m => m.source === 'custom-ics' && !shouldAutoHideMeeting(m)).length} ICS meetings • ${meetings.filter(m => m.isRecurring).length} recurring`
                                    )
                                )
                            )
                        ),
                        
                        // Navigation Controls with Day Navigation and Date Picker
                        React.createElement('div', { className: "p-6 border-b border-gray-200 bg-gray-50" },
                            React.createElement('div', { className: "flex items-center justify-between mb-4" },
                                React.createElement('h2', { className: "text-lg font-semibold text-gray-900" }, `Meetings for ${displayDate}`),
                                React.createElement('div', { className: "flex items-center gap-3" },
                                    React.createElement('div', { className: "flex items-center gap-1" },
                                        React.createElement('button', {
                                            onClick: goToPreviousDay,
                                            className: "px-3 py-2 text-sm rounded-l-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors",
                                            title: "Previous day"
                                        }, "← Previous"),
                                        React.createElement('button', {
                                            onClick: goToToday,
                                            className: `px-4 py-2 text-sm font-medium border-t border-b border-gray-300 transition-colors ${
                                                viewMode === 'today' 
                                                    ? 'bg-blue-600 text-white border-blue-600' 
                                                    : 'bg-white text-gray-700 hover:bg-gray-50'
                                            }`,
                                            title: "Go to today"
                                        }, "📅 Today"),
                                        React.createElement('button', {
                                            onClick: goToNextDay,
                                            className: "px-3 py-2 text-sm rounded-r-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors",
                                            title: "Next day"
                                        }, "Next →")
                                    ),
                                    React.createElement('button', {
                                        onClick: () => {
                                            setShowDatePicker(!showDatePicker);
                                            if (!showDatePicker) {
                                                const currentDate = new Date(selectedDate + 'T12:00:00');
                                                setCalendarYear(currentDate.getFullYear());
                                                setCalendarMonth(currentDate.getMonth());
                                            }
                                        },
                                        className: "px-4 py-2 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors",
                                        title: "Pick specific date"
                                    }, "🗓️ Pick Date")
                                )
                            ),
                            React.createElement('div', { className: "text-center text-sm text-gray-600" },
                                `Use ← → to navigate between days • Click "📅 Today" to return to today • Use "🗓️ Pick Date" for specific dates`
                            ),
                            
                            // Dropdown Calendar Widget
                            showDatePicker && React.createElement('div', { className: "mt-4 p-4 bg-white border rounded-lg shadow-sm" },
                                React.createElement('div', { className: "flex items-center justify-center gap-4 mb-4" },
                                    React.createElement('div', { className: "flex items-center gap-2" },
                                        React.createElement('label', { className: "text-sm font-medium text-gray-700" }, "Year:"),
                                        React.createElement('select', {
                                            value: calendarYear,
                                            onChange: (e) => setCalendarYear(parseInt(e.target.value)),
                                            className: "px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        },
                                            generateYearOptions().map(year =>
                                                React.createElement('option', { key: year, value: year }, year)
                                            )
                                        )
                                    ),
                                    React.createElement('div', { className: "flex items-center gap-2" },
                                        React.createElement('label', { className: "text-sm font-medium text-gray-700" }, "Month:"),
                                        React.createElement('select', {
                                            value: calendarMonth,
                                            onChange: (e) => setCalendarMonth(parseInt(e.target.value)),
                                            className: "px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        },
                                            monthNames.map((month, index) =>
                                                React.createElement('option', { key: index, value: index }, month)
                                            )
                                        )
                                    ),
                                    React.createElement('button', {
                                        onClick: () => {
                                            const today = new Date();
                                            setCalendarYear(today.getFullYear());
                                            setCalendarMonth(today.getMonth());
                                        },
                                        className: "px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                                    }, "Go to Current Month")
                                ),
                                
                                React.createElement('div', { className: "text-center mb-3" },
                                    React.createElement('h4', { className: "text-lg font-semibold text-gray-900" },
                                        `${monthNames[calendarMonth]} ${calendarYear}`
                                    )
                                ),
                                
                                React.createElement('div', { className: "grid grid-cols-7 gap-1 text-center text-sm" },
                                    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day =>
                                        React.createElement('div', { key: day, className: "p-2 font-medium text-gray-500 text-xs" }, day)
                                    ),
                                    generateCalendarDays(calendarYear, calendarMonth).map((date, index) => {
                                        if (!date) {
                                            return React.createElement('div', { key: `empty-${index}`, className: "p-2" });
                                        }
                                        
                                        const dateStr = date.getFullYear() + '-' + 
                                                        String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                                                        String(date.getDate()).padStart(2, '0');
                                        const meetingCount = getMeetingCountForDate(date);
                                        
                                        const todayStr = getToday();
                                        const isToday = dateStr === todayStr;
                                        const isSelected = dateStr === selectedDate;
                                        const isCurrentMonth = date.getMonth() === calendarMonth;
                                        
                                        return React.createElement('button', {
                                            key: `day-${index}`,
                                            onClick: () => {
                                                setSelectedDate(dateStr);
                                                setViewMode('calendar');
                                                setShowDatePicker(false);
                                            },
                                            disabled: !isCurrentMonth,
                                            className: `p-2 rounded text-sm relative transition-colors ${
                                                !isCurrentMonth 
                                                    ? 'text-gray-300 cursor-not-allowed'
                                                    : isSelected 
                                                    ? 'bg-blue-600 text-white font-semibold' 
                                                    : isToday 
                                                    ? 'bg-blue-100 text-blue-900 font-medium border-2 border-blue-300'
                                                    : meetingCount > 0
                                                    ? 'bg-green-50 text-green-900 hover:bg-green-100 font-medium'
                                                    : 'hover:bg-gray-100 text-gray-700'
                                            }`
                                        },
                                            date.getDate(),
                                            meetingCount > 0 && isCurrentMonth && React.createElement('div', {
                                                className: `absolute top-1 right-1 w-2 h-2 rounded-full text-xs font-bold ${
                                                    isSelected 
                                                        ? 'bg-white text-blue-600' 
                                                        : isToday
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-green-500 text-white'
                                                }`,
                                                style: { fontSize: '8px', lineHeight: '8px' }
                                            }, meetingCount > 9 ? '9+' : meetingCount)
                                        );
                                    })
                                ),
                                
                                React.createElement('div', { className: "mt-4 pt-3 border-t border-gray-200" },
                                    React.createElement('div', { className: "flex items-center justify-center gap-4 text-xs text-gray-500" },
                                        React.createElement('div', { className: "flex items-center gap-1" },
                                            React.createElement('div', { className: "w-3 h-3 bg-blue-100 border-2 border-blue-300 rounded" }),
                                            React.createElement('span', null, "Today")
                                        ),
                                        React.createElement('div', { className: "flex items-center gap-1" },
                                            React.createElement('div', { className: "w-3 h-3 bg-green-50 rounded" }),
                                            React.createElement('span', null, "Has meetings")
                                        ),
                                        React.createElement('div', { className: "flex items-center gap-1" },
                                            React.createElement('div', { className: "w-3 h-3 bg-blue-600 rounded" }),
                                            React.createElement('span', null, "Selected")
                                        )
                                    ),
                                    React.createElement('div', { className: "text-center mt-2" },
                                        React.createElement('button', {
                                            onClick: () => setShowDatePicker(false),
                                            className: "px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                                        }, "Close Calendar")
                                    )
                                )
                            )
                        ),
                        
                        React.createElement('div', { className: "p-6" },
                            React.createElement('div', { className: "space-y-3" },
                                filteredMeetings.length > 0 ? (
                                    React.createElement('div', null,
                                        // Active meetings
                                        filteredMeetings.filter(meeting => !meeting.title.startsWith('[CANCELLED]')).length > 0 && 
                                            React.createElement('div', { className: "space-y-3" },
                                                filteredMeetings.filter(meeting => !meeting.title.startsWith('[CANCELLED]')).map(meeting => {
                                                    const statusLines = getMeetingStatusLines(meeting, filteredMeetings);
                                                    const timeDisplay = formatTimeWithDuration(meeting);
                                                    
                                                    return React.createElement('div', {
                                                        key: meeting.id,
                                                        onClick: () => setSelectedMeeting(meeting),
                                                        className: "p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors relative"
                                                    },
                                                        // Status indicator lines on the LEFT
                                                        statusLines.length > 0 && React.createElement('div', {
                                                            className: "absolute top-0 left-0 bottom-0 flex"
                                                        },
                                                            statusLines.map((colorClass, index) =>
                                                                React.createElement('div', {
                                                                    key: index,
                                                                    className: `w-3 h-full ${colorClass}`
                                                                })
                                                            )
                                                        ),
                                                        
                                                        React.createElement('div', { className: "flex items-center justify-between" },
                                                            React.createElement('div', { className: `flex-1 pr-4 ${statusLines.length > 0 ? 'pl-3' : ''}` },
                                                                React.createElement('div', { className: "flex items-center gap-2 mb-2" },
                                                                    React.createElement('h3', { className: "font-medium text-gray-900" }, meeting.title),
                                                                    meeting.isRecurring && React.createElement('span', { 
                                                                        className: "text-blue-600 text-sm",
                                                                        title: "Recurring meeting"
                                                                    }, "🔄"),
                                                                    meeting.notes && meeting.notes.trim().length > 0 && 
                                                                        React.createElement('span', { 
                                                                            className: "px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full" 
                                                                        }, "📝 Has Notes"),
                                                                    meeting.aiSummary && meeting.aiSummary.trim().length > 0 && 
                                                                        React.createElement('span', { 
                                                                            className: "px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full" 
                                                                        }, "🤖 AI Summary")
                                                                ),
                                                                React.createElement('div', { className: "space-y-1" },
                                                                    React.createElement('div', { className: "text-sm text-gray-600 font-medium" }, timeDisplay),
                                                                    meeting.location && React.createElement('div', { className: "text-sm text-gray-500" }, `📍 ${meeting.location}`)
                                                                )
                                                            ),
                                                            React.createElement('div', { className: "flex items-center gap-2" },
                                                                React.createElement('button', {
                                                                    onClick: (e) => {
                                                                        e.stopPropagation();
                                                                        const actionText = meeting.isRecurring 
                                                                            ? `Hide all instances of "${meeting.title}"?\n\nThis recurring meeting will be suppressed from your calendar. You can restore it later from the Suppressed Meetings manager.`
                                                                            : `Hide "${meeting.title}"?\n\nThis meeting title will be suppressed from your calendar. You can restore it later from the Suppressed Meetings manager.`;
                                                                        
                                                                        if (confirm(actionText)) {
                                                                            suppressMeeting(meeting.title);
                                                                        }
                                                                    },
                                                                    className: "w-5 h-5 flex items-center justify-center bg-orange-100 hover:bg-orange-200 text-orange-700 rounded text-xs transition-colors",
                                                                    title: meeting.isRecurring ? "Hide all instances of this recurring meeting" : "Hide meetings with this title"
                                                                }, "✕"),
                                                                React.createElement('span', { className: "text-gray-400" }, "→")
                                                            )
                                                        )
                                                    );
                                                })
                                            ),
                                        
                                        // Cancelled meetings
                                        filteredMeetings.filter(meeting => meeting.title.startsWith('[CANCELLED]')).length > 0 && 
                                            React.createElement('div', { className: "mt-8" },
                                                React.createElement('div', { className: "flex items-center gap-2 mb-4 pb-2 border-b border-red-200" },
                                                    React.createElement('h3', { className: "text-lg font-medium text-red-700" }, "Cancelled Meetings"),
                                                    React.createElement('span', { className: "text-xs bg-red-100 text-red-600 px-2 py-1 rounded" }, 
                                                        `${filteredMeetings.filter(meeting => meeting.title.startsWith('[CANCELLED]')).length} cancelled`
                                                    ),
                                                    React.createElement('span', { className: "text-xs bg-green-100 text-green-600 px-2 py-1 rounded" }, 
                                                        "🛡️ Protected Forever"
                                                    )
                                                ),
                                                React.createElement('div', { className: "space-y-3" },
                                                    filteredMeetings.filter(meeting => meeting.title.startsWith('[CANCELLED]')).map(meeting => {
                                                        const statusLines = getMeetingStatusLines(meeting, filteredMeetings);
                                                        const timeDisplay = formatTimeWithDuration(meeting);
                                                        
                                                        return React.createElement('div', {
                                                            key: meeting.id,
                                                            onClick: () => setSelectedMeeting(meeting),
                                                            className: "p-4 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 cursor-pointer transition-colors relative"
                                                        },
                                                            statusLines.length > 0 && React.createElement('div', {
                                                                className: "absolute top-0 left-0 bottom-0 flex"
                                                            },
                                                                statusLines.map((colorClass, index) =>
                                                                    React.createElement('div', {
                                                                        key: index,
                                                                        className: `w-3 h-full ${colorClass}`
                                                                    })
                                                                )
                                                            ),
                                                            
                                                            React.createElement('div', { className: "flex items-center justify-between" },
                                                                React.createElement('div', { className: `flex-1 pr-4 ${statusLines.length > 0 ? 'pl-3' : ''}` },
                                                                    React.createElement('div', { className: "flex items-center gap-2 mb-2" },
                                                                        React.createElement('h3', { className: "font-medium text-red-700" }, meeting.title),
                                                                        meeting.isRecurring && React.createElement('span', { 
                                                                            className: "text-red-600 text-sm",
                                                                            title: "Recurring meeting"
                                                                        }, "🔄"),
                                                                        meeting.notes && meeting.notes.trim().length > 0 && 
                                                                            React.createElement('span', { 
                                                                                className: "px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full" 
                                                                            }, "📝 Has Notes"),
                                                                        meeting.aiSummary && meeting.aiSummary.trim().length > 0 && 
                                                                            React.createElement('span', { 
                                                                                className: "px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full" 
                                                                            }, "🤖 AI Summary")
                                                                    ),
                                                                    React.createElement('div', { className: "space-y-1" },
                                                                        React.createElement('div', { className: "text-sm text-red-600 font-medium" }, timeDisplay),
                                                                        React.createElement('div', { className: "text-sm text-red-500" }, "❌ Cancelled"),
                                                                        meeting.location && React.createElement('div', { className: "text-sm text-red-500" }, `📍 ${meeting.location}`)
                                                                    )
                                                                ),
                                                                React.createElement('div', { className: "flex items-center gap-2" },
                                                                    React.createElement('button', {
                                                                        onClick: (e) => {
                                                                            e.stopPropagation();
                                                                            if (confirm(`Are you sure you want to permanently delete "${meeting.title}"?${meeting.notes && meeting.notes.trim() ? '\n\nThis will also delete your notes for this meeting.' : ''}`)) {
                                                                                deleteMeeting(meeting.id);
                                                                            }
                                                                        },
                                                                        className: "px-2 py-1 text-xs bg-red-200 text-red-700 rounded hover:bg-red-300 transition-colors",
                                                                        title: "Delete permanently"
                                                                    }, "🗑️ Delete"),
                                                                    React.createElement('span', { className: "text-red-400" }, "→")
                                                                )
                                                            )
                                                        );
                                                    })
                                                )
                                            )
                                    )
                                ) : React.createElement('div', { className: "text-center py-8 text-gray-500" },
                                    React.createElement('p', null, `No meetings scheduled for ${displayDate.toLowerCase()}`),
                                    React.createElement('p', { className: "text-sm mt-1" }, "Try syncing your ICS calendar or select a different date")
                                )
                            )
                        )
                    ),
                    
                    // Suppression Manager Modal
                    showSuppressionManager && React.createElement('div', { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" },
                        React.createElement('div', { className: "bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-hidden" },
                            React.createElement('div', { className: "p-6 border-b border-gray-200" },
                                React.createElement('div', { className: "flex items-center justify-between" },
                                    React.createElement('h3', { className: "text-lg font-semibold text-gray-900" }, "Suppressed Meetings Manager"),
                                    React.createElement('button', {
                                        onClick: () => setShowSuppressionManager(false),
                                        className: "text-gray-400 hover:text-gray-600"
                                    }, "✕")
                                )
                            ),
                            
                            React.createElement('div', { className: "p-6 overflow-y-auto max-h-80" },
                                suppressedMeetings.size > 0 ? 
                                    React.createElement('div', { className: "space-y-3" },
                                        React.createElement('p', { className: "text-sm text-gray-600 mb-4" }, 
                                            `You have suppressed ${suppressedMeetings.size} recurring meeting${suppressedMeetings.size !== 1 ? 's' : ''}. These meetings are hidden from your calendar but can be restored below.`
                                        ),
                                        Array.from(suppressedMeetings).map(meetingTitle =>
                                            React.createElement('div', {
                                                key: meetingTitle,
                                                className: "flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg"
                                            },
                                                React.createElement('div', { className: "flex-1" },
                                                    React.createElement('h4', { className: "font-medium text-gray-900" }, meetingTitle),
                                                    React.createElement('p', { className: "text-sm text-orange-600" }, "🔇 Hidden from calendar")
                                                ),
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        if (confirm(`Restore "${meetingTitle}" to your calendar?`)) {
                                                            unsuppressMeeting(meetingTitle);
                                                        }
                                                    },
                                                    className: "px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                                                }, "🔊 Restore")
                                            )
                                        ),
                                        React.createElement('div', { className: "mt-4 pt-4 border-t border-gray-200" },
                                            React.createElement('button', {
                                                onClick: () => {
                                                    if (confirm(`Restore ALL ${suppressedMeetings.size} suppressed meetings?\n\nThis will show all hidden recurring meetings in your calendar again.`)) {
                                                        setSuppressedMeetings(new Set());
                                                    }
                                                },
                                                className: "w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                            }, "🔊 Restore All Meetings")
                                        )
                                    ) :
                                    React.createElement('div', { className: "text-center py-8 text-gray-500" },
                                        React.createElement('div', { className: "text-4xl mb-4" }, "🎉"),
                                        React.createElement('p', { className: "text-lg font-medium" }, "No Suppressed Meetings"),
                                        React.createElement('p', { className: "text-sm mt-1" }, "All your recurring meetings are currently visible. Use the '🔇 Hide' button next to any recurring meeting to suppress it.")
                                    )
                            )
                        )
                    ),
                    
                    showCalendarSync && React.createElement('div', { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" },
                        React.createElement('div', { className: "bg-white rounded-lg max-w-2xl w-full" },
                            React.createElement('div', { className: "p-6 border-b border-gray-200" },
                                React.createElement('div', { className: "flex items-center justify-between" },
                                    React.createElement('h3', { className: "text-lg font-semibold text-gray-900" }, "Claude AI + Export Features - Calendar Sync"),
                                    React.createElement('button', {
                                        onClick: () => setShowCalendarSync(false),
                                        className: "text-gray-400 hover:text-gray-600"
                                    }, "✕")
                                )
                            ),
                            
                            React.createElement('div', { className: "p-6" },
                                syncStatus && React.createElement('div', { className: "mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg" },
                                    React.createElement('p', { className: "text-sm text-blue-800" }, syncStatus)
                                ),
                                
                                React.createElement('div', { className: "space-y-6" },
                                    React.createElement('div', null,
                                        React.createElement('h4', { className: "font-medium text-gray-900 mb-3" }, "Custom ICS Calendar"),
                                        customIcsUrl ? 
                                            React.createElement('div', { className: "p-4 border rounded-lg bg-purple-50 border-purple-200" },
                                                React.createElement('div', { className: "text-center" },
                                                    React.createElement('div', { className: "text-2xl mb-2" }, "📅"),
                                                    React.createElement('div', { className: "font-medium" }, "ICS Calendar with Claude AI + Export Features"),
                                                    React.createElement('div', { className: "text-sm text-gray-600 mt-1 break-all" }, customIcsUrl),
                                                    React.createElement('div', { className: "text-sm text-purple-600 mt-1" }, "✅ Configured & Ready")
                                                )
                                            ) :
                                            React.createElement('div', { className: "p-4 border rounded-lg bg-gray-50 border-gray-200" },
                                                React.createElement('div', { className: "text-center text-gray-500" },
                                                    React.createElement('div', { className: "text-2xl mb-2" }, "⚙️"),
                                                    React.createElement('div', null, "No ICS URL configured"),
                                                    React.createElement('div', { className: "text-sm mt-1" }, "Click 'Settings' to add your calendar URL")
                                                )
                                            )
                                    ),
                                    
                                    React.createElement('div', null,
                                        React.createElement('h4', { className: "font-medium text-gray-900 mb-3" }, "Sync Meetings"),
                                        React.createElement('div', { className: "space-y-3" },
                                            React.createElement('select', {
                                                value: selectedCalendar,
                                                onChange: (e) => setSelectedCalendar(e.target.value),
                                                className: "w-full p-2 border border-gray-300 rounded"
                                            },
                                                React.createElement('option', { value: "" }, "Select calendar to sync"),
                                                customIcsUrl && React.createElement('option', { value: "custom-ics" }, "My ICS Calendar (Claude AI + Export Features)")
                                            ),
                                            React.createElement('button', {
                                                onClick: syncCalendarMeetings,
                                                disabled: !selectedCalendar || isSyncing || !customIcsUrl,
                                                className: "w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                                            }, isSyncing ? 'Syncing...' : 'Sync with Claude AI + Export Features')
                                        )
                                    ),
                                    
                                    React.createElement('div', { className: "bg-green-50 p-4 rounded-lg border-2 border-green-300" },
                                        React.createElement('h5', { className: "font-medium text-gray-900 mb-2" }, "🤖 Claude AI + Export Features:"),
                                        React.createElement('ul', { className: "text-sm text-gray-600 space-y-1" },
                                            React.createElement('li', null, "• 🤖 Generate intelligent AI summaries from meeting notes"),
                                            React.createElement('li', null, "• 📄 Export meetings as PDF documents"),
                                            React.createElement('li', null, "• 📧 Create emails with meeting notes"),
                                            React.createElement('li', null, "• ✨ Type \"- \" for automatic bullet points"),
                                            React.createElement('li', null, "• ⚡ Type \"/ \" for actions (auto-copies to Action Items)"),
                                            React.createElement('li', null, "• 🚨 Type \"// \" for IMPORTANT notes (bold red)"),
                                            React.createElement('li', null, "• 🖱️ Improved mouse navigation in notes field"),
                                            React.createElement('li', null, "• 🔄 Previous meeting notes for recurring meetings")
                                        )
                                    )
                                )
                            )
                        )
                    )
                );
            }

            // Meeting detail view
            return React.createElement('div', { className: "max-w-6xl mx-auto p-6 bg-gray-50 min-h-screen" },
                React.createElement('div', { className: "bg-white rounded-lg shadow-sm" },
                    React.createElement('div', { className: "p-6 border-b border-gray-200" },
                        React.createElement('button', {
                            onClick: () => setSelectedMeeting(null),
                            className: "text-blue-600 hover:text-blue-800 mb-4 text-sm"
                        }, "← Back to meetings"),
                        
                        React.createElement('div', { className: "flex items-start justify-between" },
                            React.createElement('div', { className: "flex-1" },
                                React.createElement('div', { className: "flex items-center gap-2 mb-2" },
                                    React.createElement('h1', { 
                                        className: `text-2xl font-bold ${
                                            selectedMeeting.title.startsWith('[CANCELLED]') ? 'text-red-700' : 'text-gray-900'
                                        }`
                                    }, selectedMeeting.title),
                                    selectedMeeting.isRecurring && React.createElement('span', { 
                                        className: `text-2xl ${selectedMeeting.title.startsWith('[CANCELLED]') ? 'text-red-600' : 'text-blue-600'}`,
                                        title: "Recurring meeting"
                                    }, "🔄"),
                                    selectedMeeting.title.startsWith('[CANCELLED]') && 
                                        React.createElement('span', { 
                                            className: "px-3 py-1 text-sm bg-red-100 text-red-800 rounded-full" 
                                        }, "❌ Cancelled")
                                ),
                                React.createElement('div', { className: "flex items-center gap-4 mt-1 text-sm text-gray-600" },
                                    React.createElement('span', null, selectedMeeting.date),
                                    React.createElement('span', null, formatTimeWithDuration(selectedMeeting)),
                                    React.createElement('span', { className: "text-xs bg-gray-100 px-2 py-1 rounded" }, userTimezone),
                                    selectedMeeting.location && React.createElement('span', { className: "flex items-center" }, 
                                        `📍 ${selectedMeeting.location}`,
                                        getMeetingTypeBadge(selectedMeeting.location)
                                    ),
                                    selectedMeeting.organizer && React.createElement('span', null, `🎯 ${selectedMeeting.organizer}`)
                                )
                            ),
                            
                            // Export buttons aligned with meeting title
                            React.createElement('div', { className: "flex items-start gap-2 ml-4" },
                                React.createElement('button', {
                                    onClick: exportMeetingAsPDF,
                                    className: "px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2",
                                    title: "Export meeting details as PDF"
                                }, 
                                    React.createElement('span', null, "📄"),
                                    React.createElement('span', null, "Export PDF")
                                ),
                                React.createElement('button', {
                                    onClick: createEmail,
                                    className: "px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center gap-2",
                                    title: "Create email with meeting notes and PDF attachment"
                                }, 
                                    React.createElement('span', null, "📧"),
                                    React.createElement('span', null, "Email Notes")
                                )
                            )
                        )
                    ),
                    
                    React.createElement('div', { className: "p-6" },
                        React.createElement('div', { className: "space-y-6" },
                            // Top row: Meeting Details (left) and AI Notes (right)
                            React.createElement('div', { className: "grid grid-cols-1 lg:grid-cols-2 gap-6" },
                                // Left column - Meeting Details with consistent border structure
                                React.createElement('div', null,
                                    React.createElement('h3', { className: "text-lg font-semibold text-gray-900 mb-4" }, "Meeting Details"),
                                    React.createElement('div', { 
                                        className: "bg-gray-50 rounded-lg border-2 border-gray-300 p-4",
                                        id: "meeting-description-box"
                                    },
                                        React.createElement('div', { 
                                            className: "text-gray-700 text-sm leading-relaxed whitespace-pre-wrap break-words overflow-auto h-full p-3 border-2 border-gray-300 rounded-lg bg-white",
                                            style: { 
                                                wordBreak: 'break-word', 
                                                overflowWrap: 'break-word',
                                                minHeight: '150px'
                                            }
                                        }, 
                                            selectedMeeting.agenda ? convertUrlsToLinks(selectedMeeting.agenda) : "No description provided"
                                        )
                                    )
                                ),
                                
                                // Right column - AI Notes with consistent border structure
                                React.createElement('div', null,
                                    React.createElement('div', { className: "flex items-center justify-between mb-4" },
                                        React.createElement('h3', { className: "text-lg font-semibold text-gray-900" }, "AI Summary"),
                                        React.createElement('div', { className: "flex items-center gap-2" },
                                            React.createElement('span', { className: "text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded" }, "🤖 Claude AI"),
                                            claudeApiKey && backendApiUrl ? 
                                                React.createElement('button', {
                                                    onClick: handleGenerateAISummary,
                                                    disabled: isGeneratingAI || !selectedMeeting.notes || selectedMeeting.notes.trim().length === 0,
                                                    className: `px-3 py-1 text-xs rounded transition-colors ${
                                                        isGeneratingAI || !selectedMeeting.notes || selectedMeeting.notes.trim().length === 0
                                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                            : 'bg-purple-600 text-white hover:bg-purple-700'
                                                    }`,
                                                    title: selectedMeeting.notes && selectedMeeting.notes.trim().length > 0 ? "Generate AI summary from notes" : "Add meeting notes first"
                                                }, isGeneratingAI ? "⚡ Generating..." : "⚡ Generate Summary")
                                                :
                                                React.createElement('span', { className: "text-xs text-gray-500" }, 
                                                    !claudeApiKey ? "Setup Claude API key first" : "Setup API URL first"
                                                )
                                        )
                                    ),
                                    
                                    // AI Generation Status
                                    aiGenerationStatus && React.createElement('div', { 
                                        className: `mb-3 p-2 rounded text-xs ${
                                            aiGenerationStatus.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' :
                                            aiGenerationStatus.startsWith('❌') ? 'bg-red-50 text-red-700 border border-red-200' :
                                            'bg-blue-50 text-blue-700 border border-blue-200'
                                        }`
                                    }, aiGenerationStatus),
                                    
                                    React.createElement('div', { 
                                        className: "bg-purple-50 rounded-lg border-2 border-purple-300 p-4",
                                        id: "ai-summary-container"
                                    },
                                        // AI Summary display area with formatted text and editing capability
                                        React.createElement('div', { className: "relative" },
                                            // Formatted display overlay
                                            React.createElement('div', { 
                                                id: 'ai-summary-overlay',
                                                className: "w-full p-3 border-2 border-purple-300 rounded-lg bg-white min-h-[150px] overflow-auto",
                                                style: { 
                                                    fontFamily: 'inherit',
                                                    lineHeight: '1.5'
                                                },
                                                onClick: () => {
                                                    // Focus the hidden textarea when clicking the display
                                                    const textarea = document.querySelector('#ai-summary-textarea');
                                                    if (textarea) {
                                                        textarea.focus();
                                                    }
                                                }
                                            },
                                                selectedMeeting.aiSummary && selectedMeeting.aiSummary.trim() ?
                                                    React.createElement('div', {
                                                        dangerouslySetInnerHTML: {
                                                            __html: parseColoredText(selectedMeeting.aiSummary)
                                                        }
                                                    }) :
                                                    React.createElement('div', {
                                                        className: "text-gray-400 italic"
                                                    }, claudeApiKey 
                                                        ? (selectedMeeting.notes && selectedMeeting.notes.trim().length > 0 
                                                            ? "Click 'Generate Summary' to create an AI summary from your notes above..."
                                                            : "Add meeting notes first, then click 'Generate Summary' for AI analysis...")
                                                        : "Setup Claude API key in settings to enable AI summary generation...")
                                            ),
                                            
                                            // Hidden textarea for editing - same pattern as notes
                                            React.createElement('textarea', {
                                                id: 'ai-summary-textarea',
                                                value: selectedMeeting.aiSummary || "",
                                                onChange: (e) => {
                                                    const updatedMeeting = { ...selectedMeeting, aiSummary: e.target.value };
                                                    setSelectedMeeting(updatedMeeting);
                                                    setMeetings(prev => prev.map(m => 
                                                        m.id === selectedMeeting.id ? updatedMeeting : m
                                                    ));
                                                    
                                                    // UPDATED: Auto-resize with height syncing and 20-line limit
                                                    setTimeout(() => {
                                                        const textarea = e.target;
                                                        const descBox = document.querySelector('#meeting-description-box');
                                                        const aiBox = document.querySelector('#ai-summary-container');
                                                        const overlay = document.querySelector('#ai-summary-overlay');
                                                        
                                                        if (textarea && descBox && aiBox && overlay) {
                                                            // Calculate line height and limits
                                                            const lineHeight = 21; // 14px * 1.5
                                                            const maxLines = 20;
                                                            const minLines = 7;
                                                            const maxHeight = (maxLines * lineHeight) + 32;
                                                            const minHeight = (minLines * lineHeight) + 32;
                                                            
                                                            // Auto-resize based on content
                                                            textarea.style.height = 'auto';
                                                            const aiContentHeight = Math.max(textarea.scrollHeight + 32, minHeight);
                                                            const aiLimitedHeight = Math.min(aiContentHeight, maxHeight);
                                                            
                                                            // Get description box height
                                                            const descHeight = Math.max(descBox.offsetHeight, minHeight);
                                                            const descLimitedHeight = Math.min(descHeight, maxHeight);
                                                            
                                                            // Use the larger height, but respect max limit
                                                            const finalHeight = Math.min(Math.max(aiLimitedHeight, descLimitedHeight), maxHeight);
                                                            
                                                            // Apply heights
                                                            descBox.style.height = finalHeight + 'px';
                                                            aiBox.style.height = finalHeight + 'px';
                                                            overlay.style.height = (finalHeight - 32) + 'px';
                                                            
                                                            // Adjust inner heights
                                                            const descContent = descBox.querySelector('div');
                                                            if (descContent) {
                                                                const innerHeight = finalHeight - 32;
                                                                descContent.style.height = innerHeight + 'px';
                                                                textarea.style.height = innerHeight + 'px';
                                                            }
                                                        }
                                                    }, 0);
                                                },
                                                className: "absolute inset-0 w-full p-3 border-0 rounded-lg resize-none focus:outline-none bg-transparent min-h-[150px]",
                                                style: { 
                                                    fontFamily: 'inherit', 
                                                    overflow: 'hidden',
                                                    color: 'transparent',
                                                    caretColor: '#9333EA', // Purple caret
                                                    zIndex: 10,
                                                    lineHeight: '1.5'
                                                },
                                                placeholder: ""
                                            })
                                        ),
                                        
                                        // Show AI generation timestamp if available
                                        selectedMeeting.aiGeneratedAt && React.createElement('div', { className: "text-xs text-purple-600 mt-2" },
                                            `Generated: ${new Date(selectedMeeting.aiGeneratedAt).toLocaleString('en-AU', { 
                                                timeZone: userTimezone,
                                                month: 'short', 
                                                day: 'numeric',
                                                hour: 'numeric',
                                                minute: '2-digit',
                                                hour12: true
                                            })}`
                                        )
                                    )
                                )
                            ),
                            
                            // Full width - My Notes (Always Formatted Display)
                            React.createElement('div', null,
                                React.createElement('div', { className: "flex items-center justify-between mb-4" },
                                    React.createElement('h3', { className: "text-lg font-semibold text-gray-900" }, "My Notes"),
                                    React.createElement('div', { className: "flex items-center gap-2" },
                                        React.createElement('span', { className: "text-xs text-green-600 bg-green-100 px-2 py-1 rounded" }, "🎨 Smart Formatting"),
                                        React.createElement('span', { className: "text-xs text-green-600 bg-green-100 px-2 py-1 rounded" }, "🛡️ Protected"),
                                        React.createElement('span', { className: "text-xs text-gray-500" }, "Auto-saved")
                                    )
                                ),
                                React.createElement('div', { className: "bg-green-50 p-4 rounded-lg border border-green-200" },
                                    // Rich text toolbar with help
                                    React.createElement('div', { className: "flex items-center justify-between mb-3 pb-2 border-b-2 border-green-300 flex-wrap gap-2" },
                                        React.createElement('div', { className: "flex items-center gap-2 flex-wrap" },
                                            // Text formatting
                                            React.createElement('div', { className: "flex items-center gap-1" },
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        const notesTextareaRef = { current: document.querySelector('#notes-textarea') };
                                                        handleFormatting('bold', notesTextareaRef, selectedMeeting.notes || "", (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                        });
                                                    },
                                                    className: "px-2 py-1 text-xs bg-white border-2 border-green-300 rounded hover:bg-green-100 transition-colors font-bold",
                                                    title: "Bold (**text**)"
                                                }, "B"),
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        const notesTextareaRef = { current: document.querySelector('#notes-textarea') };
                                                        handleFormatting('italic', notesTextareaRef, selectedMeeting.notes || "", (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                        });
                                                    },
                                                    className: "px-2 py-1 text-xs bg-white border-2 border-green-300 rounded hover:bg-green-100 transition-colors italic",
                                                    title: "Italic (*text*)"
                                                }, "I"),
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        const notesTextareaRef = { current: document.querySelector('#notes-textarea') };
                                                        handleFormatting('underline', notesTextareaRef, selectedMeeting.notes || "", (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                        });
                                                    },
                                                    className: "px-2 py-1 text-xs bg-white border-2 border-green-300 rounded hover:bg-green-100 transition-colors underline",
                                                    title: "Underline (__text__)"
                                                }, "U")
                                            ),
                                            
                                            // Separator
                                            React.createElement('div', { className: "w-px h-4 bg-green-300" }),
                                            
                                            // List formatting
                                            React.createElement('div', { className: "flex items-center gap-1" },
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        const notesTextareaRef = { current: document.querySelector('#notes-textarea') };
                                                        handleFormatting('bullet', notesTextareaRef, selectedMeeting.notes || "", (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                        });
                                                    },
                                                    className: "px-2 py-1 text-xs bg-white border-2 border-green-300 rounded hover:bg-green-100 transition-colors",
                                                    title: "Bullet point (auto-continues)"
                                                }, "•"),
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        const notesTextareaRef = { current: document.querySelector('#notes-textarea') };
                                                        handleFormatting('number', notesTextareaRef, selectedMeeting.notes || "", (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                        });
                                                    },
                                                    className: "px-2 py-1 text-xs bg-white border-2 border-green-300 rounded hover:bg-green-100 transition-colors",
                                                    title: "Numbered list (auto-continues)"
                                                }, "1.")
                                            ),
                                            
                                            // Separator
                                            React.createElement('div', { className: "w-px h-4 bg-green-300" }),
                                            
                                            // Color formatting
                                            React.createElement('div', { className: "flex items-center gap-1" },
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        const notesTextareaRef = { current: document.querySelector('#notes-textarea') };
                                                        handleFormatting('red', notesTextareaRef, selectedMeeting.notes || "", (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                        });
                                                    },
                                                    className: "w-6 h-6 bg-red-500 border-2 border-green-300 rounded hover:bg-red-600 transition-colors",
                                                    title: "Red text"
                                                }),
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        const notesTextareaRef = { current: document.querySelector('#notes-textarea') };
                                                        handleFormatting('blue', notesTextareaRef, selectedMeeting.notes || "", (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                        });
                                                    },
                                                    className: "w-6 h-6 bg-blue-500 border-2 border-green-300 rounded hover:bg-blue-600 transition-colors",
                                                    title: "Blue text"
                                                }),
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        const notesTextareaRef = { current: document.querySelector('#notes-textarea') };
                                                        handleFormatting('green', notesTextareaRef, selectedMeeting.notes || "", (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                        });
                                                    },
                                                    className: "w-6 h-6 bg-green-500 border-2 border-green-300 rounded hover:bg-green-600 transition-colors",
                                                    title: "Green text"
                                                }),
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        const notesTextareaRef = { current: document.querySelector('#notes-textarea') };
                                                        handleFormatting('orange', notesTextareaRef, selectedMeeting.notes || "", (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                        });
                                                    },
                                                    className: "w-6 h-6 bg-orange-500 border-2 border-green-300 rounded hover:bg-orange-600 transition-colors",
                                                    title: "Orange text"
                                                }),
                                                React.createElement('button', {
                                                    onClick: () => {
                                                        const notesTextareaRef = { current: document.querySelector('#notes-textarea') };
                                                        handleFormatting('purple', notesTextareaRef, selectedMeeting.notes || "", (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                        });
                                                    },
                                                    className: "w-6 h-6 bg-purple-500 border-2 border-green-300 rounded hover:bg-purple-600 transition-colors",
                                                    title: "Purple text"
                                                })
                                            )
                                        ),
                                        
                                        // Auto-formatting help - moved to right side
                                        React.createElement('div', { className: "flex items-center gap-3 text-xs text-gray-600" },
                                            React.createElement('span', null, "✨ ", React.createElement('code', { className: "bg-gray-100 px-1 rounded" }, "- "), "bullets"),
                                            React.createElement('span', null, "⚡ ", React.createElement('code', { className: "bg-gray-100 px-1 rounded" }, "/ "), "actions"),
                                            React.createElement('span', null, "🚨 ", React.createElement('code', { className: "bg-gray-100 px-1 rounded" }, "// "), "IMPORTANT")
                                        )
                                    ),
                                    
                                    // Notes display area with invisible typing to prevent ghost text
                                    React.createElement('div', { className: "relative" },
                                        // Formatted display overlay
                                        React.createElement('div', { 
                                            id: 'notes-overlay',
                                            className: "w-full p-3 border-2 border-green-300 rounded-lg bg-white min-h-[150px] overflow-auto",
                                            style: { 
                                                fontFamily: 'inherit',
                                                lineHeight: '1.5'
                                            },
                                            onClick: () => {
                                                // Focus the hidden textarea when clicking the display
                                                const textarea = document.querySelector('#notes-textarea');
                                                if (textarea) {
                                                    textarea.focus();
                                                }
                                            }
                                        },
                                            selectedMeeting.notes && selectedMeeting.notes.trim() ?
                                                React.createElement('div', {
                                                    dangerouslySetInnerHTML: {
                                                        __html: parseColoredText(selectedMeeting.notes)
                                                    }
                                                }) :
                                                React.createElement('div', {
                                                    className: "text-gray-400 italic"
                                                }, "Start typing your meeting notes...\n\nUse \"- \" for bullets, \"/ \" for actions, \"// \" for IMPORTANT notes (note the spaces!)")
                                        ),
                                        
                                        // Completely hidden textarea for input - no visual interference
                                        React.createElement('textarea', {
                                            id: 'notes-textarea',
                                            ref: (el) => {
                                                if (el) {
                                                    autoResizeTextarea(el);
                                                }
                                            },
                                            value: selectedMeeting.notes || "",
                                            onChange: (e) => {
                                                const processedText = processNotesAutoFormatting(e.target.value);
                                                const updatedMeeting = { 
                                                    ...selectedMeeting, 
                                                    notes: processedText,
                                                    actionItems: extractActionsFromNotes(processedText)
                                                };
                                                setSelectedMeeting(updatedMeeting);
                                                setMeetings(prev => prev.map(m => 
                                                    m.id === selectedMeeting.id ? updatedMeeting : m
                                                ));
                                                autoResizeTextarea(e.target);
                                                
                                                // Sync overlay height
                                                const overlay = document.querySelector('#notes-overlay');
                                                if (overlay) {
                                                    overlay.style.height = e.target.style.height;
                                                }
                                            },
                                            onKeyDown: (e) => {
                                                if (e.key === 'Enter') {
                                                    // Check for smart continuation after Enter is pressed
                                                    setTimeout(() => {
                                                        const textarea = e.target;
                                                        const wasHandled = handleSmartContinuation(textarea, textarea.value, (newText) => {
                                                            const processedText = processNotesAutoFormatting(newText);
                                                            const updatedMeeting = { 
                                                                ...selectedMeeting, 
                                                                notes: processedText,
                                                                actionItems: extractActionsFromNotes(processedText)
                                                            };
                                                            setSelectedMeeting(updatedMeeting);
                                                            setMeetings(prev => prev.map(m => 
                                                                m.id === selectedMeeting.id ? updatedMeeting : m
                                                            ));
                                                            autoResizeTextarea(textarea);
                                                            
                                                            // Sync overlay height
                                                            const overlay = document.querySelector('#notes-overlay');
                                                            if (overlay) {
                                                                overlay.style.height = textarea.style.height;
                                                            }
                                                        });
                                                    }, 0);
                                                }
                                            },
                                            className: "absolute inset-0 w-full p-3 border-0 rounded-lg resize-none focus:outline-none bg-transparent min-h-[150px]",
                                            style: { 
                                                fontFamily: 'inherit', 
                                                overflow: 'hidden',
                                                color: 'transparent',
                                                caretColor: '#059669',
                                                zIndex: 10
                                            },
                                            placeholder: ""
                                        })
                                    )
                                )
                            ),
                            
                            // Full width - Actions (Read-Only, Auto-Populated)
                            React.createElement('div', null,
                                React.createElement('div', { className: "flex items-center justify-between mb-4" },
                                    React.createElement('h3', { className: "text-lg font-semibold text-gray-900" }, "Action Items"),
                                    React.createElement('div', { className: "flex items-center gap-2" },
                                        React.createElement('span', { className: "text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded" }, "⚡ Auto-Generated"),
                                        React.createElement('span', { className: "text-xs text-gray-500" }, "From / lines in notes")
                                    )
                                ),
                                React.createElement('div', { className: "bg-orange-50 p-4 rounded-lg border-2 border-orange-300" },
                                    React.createElement('div', { 
                                        className: "w-full p-3 border-2 border-orange-300 rounded-lg bg-white min-h-[150px] overflow-auto",
                                        style: { 
                                            fontFamily: 'inherit',
                                            lineHeight: '1.5'
                                        }
                                    },
                                        selectedMeeting.actionItems && selectedMeeting.actionItems.trim() ?
                                            React.createElement('div', {
                                                dangerouslySetInnerHTML: {
                                                    __html: parseColoredText(selectedMeeting.actionItems)
                                                }
                                            }) :
                                            React.createElement('div', {
                                                className: "text-gray-400 italic"
                                            }, "Action items will appear here automatically when you type lines starting with / in your notes.\n\nExample: Type \"/ Follow up with John\" in notes above")
                                    )
                                )
                            ),
                            
                            // Previous Meeting Notes Section (for recurring meetings only)
                            (() => {
                                const previousMeeting = findPreviousMeetingInstance(selectedMeeting);
                                
                                if (!selectedMeeting.isRecurring || !previousMeeting) {
                                    return null;
                                }
                                
                                const previousDate = formatDateForDisplay(previousMeeting.date);
                                
                                return React.createElement('div', null,
                                    React.createElement('div', { className: "flex items-center justify-between mb-4" },
                                        React.createElement('h3', { className: "text-lg font-semibold text-gray-900" }, 
                                            `Previous Meeting Notes - ${previousDate}`
                                        ),
                                        React.createElement('span', { className: "px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded" }, 
                                            "From last occurrence"
                                        )
                                    ),
                                    React.createElement('div', { className: "bg-blue-50 border-2 border-blue-300 rounded-lg p-4" },
                                        React.createElement('div', { className: "bg-white p-4 rounded-lg" },
                                            React.createElement('div', { 
                                                className: "min-h-[100px]",
                                                style: { fontFamily: 'inherit', lineHeight: '1.5' },
                                                dangerouslySetInnerHTML: {
                                                    __html: parseColoredText(previousMeeting.notes)
                                                }
                                            })
                                        ),
                                        React.createElement('div', { className: "mt-3 text-xs text-blue-600" },
                                            `From meeting on ${previousMeeting.date} • ${formatTimeWithDuration(previousMeeting)}`
                                        )
                                    )
                                );
                            })()
                        )
                    )
                )
            );
        };

        // Render the app
        const container = document.getElementById('root');
        if (ReactDOM.createRoot) {
            const root = ReactDOM.createRoot(container);
            root.render(React.createElement(MeetingManager));
        } else {
            ReactDOM.render(React.createElement(MeetingManager), container);
        }
    </script>
</body>
</html>
