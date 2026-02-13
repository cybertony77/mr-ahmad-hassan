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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    // Verify authentication - allow students
    const user = await authMiddleware(req);
    if (!['student', 'admin', 'developer', 'assistant'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    // Get student's course and courseType from students collection
    let studentCourse = null;
    let studentCourseType = null;
    if (user.role === 'student') {
      // JWT contains assistant_id, use that to find student
      const studentId = user.assistant_id || user.id;
      console.log('🔍 Sessions API - User from JWT:', { role: user.role, assistant_id: user.assistant_id, id: user.id, studentId });
      if (studentId) {
        const student = await db.collection('students').findOne({ id: studentId });
        console.log('🔍 Student found:', student ? { id: student.id, course: student.course, courseType: student.courseType } : 'NOT FOUND');
        if (student) {
          studentCourse = student.course;
          studentCourseType = student.courseType;
          console.log('✅ Using student course:', studentCourse, 'courseType:', studentCourseType);
        }
      }
    }

    // Build query filter - ALWAYS filter by course and courseType for students
    if (studentCourse) {
      // Get all sessions and filter by course and courseType in JavaScript
      const allSessions = await db.collection('online_sessions').find({}).toArray();
      
      // Filter sessions by course and courseType
      console.log('🔍 Filtering sessions. Student course:', studentCourse, 'courseType:', studentCourseType);
      console.log('🔍 Total sessions before filter:', allSessions.length);
      const filteredSessions = allSessions.filter(session => {
        if (!session.course) {
          console.log('⚠️ Session has no course:', session._id);
          return false;
        }
        
        // Check course match: if session course is "All", it matches any student course
        const courseMatch = session.course.toLowerCase() === 'all' || 
                           session.course.toLowerCase() === studentCourse.toLowerCase();
        
        // Check courseType match: if session has no courseType, it matches any student courseType
        // If session has courseType, it must match student's courseType (case-insensitive)
        const courseTypeMatch = !session.courseType || 
                               !studentCourseType ||
                               session.courseType.toLowerCase() === studentCourseType.toLowerCase();
        
        const matches = courseMatch && courseTypeMatch;
        console.log(`🔍 Session course: "${session.course}", courseType: "${session.courseType || 'none'}" | Matches: ${matches}`);
        return matches;
      });
      console.log('✅ Filtered sessions count:', filteredSessions.length);
      
      // Sort by course, courseType, lesson, then date
      const sortedSessions = filteredSessions.sort((a, b) => {
        // Sort by course
        if (a.course !== b.course) {
          return a.course.localeCompare(b.course);
        }
        // Sort by courseType
        const aCourseType = (a.courseType || '').toLowerCase();
        const bCourseType = (b.courseType || '').toLowerCase();
        if (aCourseType !== bCourseType) {
          return aCourseType.localeCompare(bCourseType);
        }
        // Sort by lesson
        if (a.lesson !== b.lesson) {
          return (a.lesson || '').localeCompare(b.lesson || '');
        }
        // Sort by date (newest first)
        return new Date(b.date) - new Date(a.date);
      });
      
      res.json({ success: true, sessions: sortedSessions });
    } else {
      // If student has no course, return empty array (don't show any sessions)
      return res.json({ success: true, sessions: [] });
    }
  } catch (error) {
    console.error('❌ Error in online_sessions/student API:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
}

