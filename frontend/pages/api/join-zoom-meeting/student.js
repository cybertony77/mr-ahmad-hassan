import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';

function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, '');
          envVars[key] = value;
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.log('⚠️  Could not read env.config, using process.env as fallback');
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI;
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME;

// Parse time fields (hours, minutes, period) into a Date object for today
function parseTimeToDate(timeObj) {
  if (!timeObj || !timeObj.hours || !timeObj.minutes || !timeObj.period) return null;
  
  let hours = parseInt(timeObj.hours, 10);
  const minutes = parseInt(timeObj.minutes, 10);
  const period = timeObj.period.toUpperCase();
  
  if (isNaN(hours) || isNaN(minutes)) return null;
  
  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  return date;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const user = await authMiddleware(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const studentId = user.assistant_id || user.id;
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    // Get student data
    const student = await db.collection('students').findOne({ id: parseInt(studentId) });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get zoom meeting (only one)
    const meetings = await db.collection('join_zoom_meeting').find({}).toArray();

    if (meetings.length === 0) {
      return res.status(200).json({ success: true, meeting: null });
    }

    const meeting = meetings[0];
    const now = new Date();

    // Check course match
    const studentCourse = (student.course || '').trim().toLowerCase();
    const meetingCourse = (meeting.course || '').trim().toLowerCase();
    const courseMatch = meetingCourse === 'all' || meetingCourse === studentCourse;

    if (!courseMatch) {
      return res.status(200).json({ success: true, meeting: null });
    }

    // Check courseType match (if meeting has courseType set)
    const studentCourseType = (student.courseType || '').trim().toLowerCase();
    const meetingCourseType = (meeting.courseType || '').trim().toLowerCase();
    if (meetingCourseType && meetingCourseType !== '' && meetingCourseType !== studentCourseType) {
      return res.status(200).json({ success: true, meeting: null });
    }

    // Check if the student already attended this meeting's lesson
    const meetingLesson = meeting.lesson || null;
    const studentAlreadyAttended = meetingLesson && 
      student.lessons && 
      student.lessons[meetingLesson] && 
      student.lessons[meetingLesson].attended === true;

    // Check deadline: if deadline exists and deadline <= now, hide
    // BUT if the student already attended this lesson, don't hide (they may need to rejoin)
    if (!studentAlreadyAttended && meeting.deadline && meeting.deadline.hours && meeting.deadline.minutes && meeting.deadline.period) {
      const deadlineDate = parseTimeToDate(meeting.deadline);
      if (deadlineDate && deadlineDate <= now) {
        return res.status(200).json({ success: true, meeting: null });
      }
    }

    // Check start date: if start date exists and start date > now, hide
    if (meeting.dateOfStart && meeting.dateOfStart.hours && meeting.dateOfStart.minutes && meeting.dateOfStart.period) {
      const startDate = parseTimeToDate(meeting.dateOfStart);
      if (startDate && startDate > now) {
        return res.status(200).json({ success: true, meeting: null });
      }
    }

    // Check end date: if end date exists and end date < now, hide
    if (meeting.dateOfEnd && meeting.dateOfEnd.hours && meeting.dateOfEnd.minutes && meeting.dateOfEnd.period) {
      const endDate = parseTimeToDate(meeting.dateOfEnd);
      if (endDate && endDate < now) {
        return res.status(200).json({ success: true, meeting: null });
      }
    }

    // All checks passed - return the meeting
    return res.status(200).json({
      success: true,
      meeting: {
        _id: meeting._id.toString(),
        link: meeting.link,
        course: meeting.course,
        courseType: meeting.courseType,
        lesson: meeting.lesson || null,
        deadline: meeting.deadline,
        dateOfStart: meeting.dateOfStart,
        dateOfEnd: meeting.dateOfEnd
      }
    });
  } catch (error) {
    console.error('Error fetching student zoom meeting:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    if (client) await client.close();
  }
}
