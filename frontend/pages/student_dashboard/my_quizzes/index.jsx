import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Image from 'next/image';
import Title from '../../../components/Title';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../../lib/axios';
import { useProfile } from '../../../lib/api/auth';
import { useSystemConfig } from '../../../lib/api/system';
import NeedHelp from '../../../components/NeedHelp';
import QuizPerformanceChart from '../../../components/QuizPerformanceChart';
import StudentLessonSelect from '../../../components/StudentLessonSelect';
import { TextInput, ActionIcon, useMantineTheme } from '@mantine/core';
import { IconSearch, IconArrowRight } from '@tabler/icons-react';

// Input with Button Component (matching manage online system style)
function InputWithButton(props) {
  const theme = useMantineTheme();
  return (
    <TextInput
      radius="xl"
      size="md"
      placeholder="Search by lesson name..."
      rightSectionWidth={42}
      leftSection={<IconSearch size={18} stroke={1.5} />}
      rightSection={
        <ActionIcon size={32} radius="xl" color={theme.primaryColor} variant="filled" onClick={props.onButtonClick}>
          <IconArrowRight size={18} stroke={1.5} />
        </ActionIcon>
      }
      {...props}
    />
  );
}


export default function MyQuizzes() {
  const { data: systemConfig } = useSystemConfig();
  const isScoringEnabled = systemConfig?.scoring_system === true || systemConfig?.scoring_system === 'true';
  const isQuizzesEnabled = systemConfig?.quizzes === true || systemConfig?.quizzes === 'true';
  
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Redirect if feature is disabled
  useEffect(() => {
    if (systemConfig && !isQuizzesEnabled) {
      router.push('/student_dashboard');
    }
  }, [systemConfig, isQuizzesEnabled, router]);
  
  // Don't render if feature is disabled
  if (systemConfig && !isQuizzesEnabled) {
    return null;
  }
  const { data: profile } = useProfile();
  const [completedQuizzes, setCompletedQuizzes] = useState(new Set());
  const [errorMessage, setErrorMessage] = useState('');
  const [onlineQuizzes, setOnlineQuizzes] = useState([]);
  
  // Check for error message in URL query
  useEffect(() => {
    if (router.query.error) {
      setErrorMessage(router.query.error);
      // Clear error from URL
      router.replace('/student_dashboard/my_quizzes', undefined, { shallow: true });
    }
  }, [router.query.error]);

  // Fetch quizzes
  const { data: quizzesData, isLoading } = useQuery({
    queryKey: ['quizzes-student'],
    queryFn: async () => {
      const response = await apiClient.get('/api/quizzes/student');
      return response.data;
    },
    refetchInterval: 10 * 60 * 1000, // Auto-refresh every 10 minutes
    refetchIntervalInBackground: false, // Don't refetch when tab is not active
    refetchOnWindowFocus: true, // Refetch on window focus
    refetchOnMount: true, // Refetch on mount
    refetchOnReconnect: true, // Refetch on reconnect
  });

  const quizzes = quizzesData?.quizzes || [];

  // Search and filter states
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLesson, setFilterLesson] = useState('');
  const [filterLessonDropdownOpen, setFilterLessonDropdownOpen] = useState(false);

  // Get available lessons from quizzes (only lessons that exist in quizzes and match student's course/courseType)
  const getAvailableLessons = () => {
    const lessonSet = new Set();
    const studentCourse = (profile?.course || '').trim();
    const studentCourseType = (profile?.courseType || '').trim();
    
    quizzes.forEach(quiz => {
      if (quiz.lesson && quiz.lesson.trim()) {
        // Check if quiz matches student's course and courseType
        const quizCourse = (quiz.course || '').trim();
        const quizCourseType = (quiz.courseType || '').trim();
        
        // Course match: if quiz course is "All", it matches any student course
        const courseMatch = quizCourse.toLowerCase() === 'all' || 
                           quizCourse.toLowerCase() === studentCourse.toLowerCase();
        
        // CourseType match: if quiz has no courseType, it matches any student courseType
        // If quiz has courseType, it must match student's courseType (case-insensitive)
        const courseTypeMatch = !quizCourseType || 
                               !studentCourseType ||
                               quizCourseType.toLowerCase() === studentCourseType.toLowerCase();
        
        if (courseMatch && courseTypeMatch) {
          lessonSet.add(quiz.lesson);
        }
      }
    });
    return Array.from(lessonSet).sort();
  };

  const availableLessons = getAvailableLessons();

  // Filter quizzes based on search and filters
  const filteredQuizzes = quizzes.filter(quiz => {
    // Search filter (by lesson name - case-insensitive)
    if (searchTerm.trim()) {
      const lessonName = quiz.lesson_name || '';
      if (!lessonName.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
    }

    // Lesson filter
    if (filterLesson) {
      if (quiz.lesson !== filterLesson) {
        return false;
      }
    }

    return true;
  });

  // Automatically reset search when search input is cleared
  useEffect(() => {
    if (searchInput.trim() === "" && searchTerm !== "") {
      setSearchTerm("");
    }
  }, [searchInput, searchTerm]);

  // Handle search
  const handleSearch = () => {
    const trimmedSearch = searchInput.trim();
    setSearchTerm(trimmedSearch);
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  // Fetch quiz performance chart data - always fetch even if no quizzes
  const { data: performanceData, isLoading: isChartLoading, refetch: refetchChart } = useQuery({
    queryKey: ['quiz-performance', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return { chartData: [] };
      try {
        const response = await apiClient.get(`/api/students/${profile.id}/quiz-performance`);
        return response.data || { chartData: [] };
      } catch (error) {
        console.error('Error fetching quiz performance:', error);
        return { chartData: [] }; // Return empty array on error
      }
    },
    enabled: !!profile?.id,
    refetchInterval: 10 * 60 * 1000, // Auto-refresh every 10 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    retry: 1, // Retry once on failure
  });

  const chartData = performanceData?.chartData || [];

  // Refetch chart data when returning to this page
  useEffect(() => {
    const handleRouteChange = () => {
      // Invalidate and refetch chart data when route changes
      if (profile?.id) {
        queryClient.invalidateQueries({ queryKey: ['quiz-performance', profile.id] });
        queryClient.invalidateQueries({ queryKey: ['quizzes-student'] });
      }
    };

    const handleVisibilityChange = () => {
      // Refetch when page becomes visible
      if (document.visibilityState === 'visible' && profile?.id) {
        refetchChart();
        queryClient.invalidateQueries({ queryKey: ['quizzes-student'] });
      }
    };

    // Refetch when component mounts (user returns to page)
    if (profile?.id) {
      queryClient.invalidateQueries({ queryKey: ['quiz-performance', profile.id] });
      queryClient.invalidateQueries({ queryKey: ['quizzes-student'] });
    }

    // Listen for route changes
    router.events.on('routeChangeComplete', handleRouteChange);
    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router, queryClient, profile?.id, refetchChart]);

  // Fetch student's weeks data and online_quizzes to check quizDegree
  useEffect(() => {
    if (!profile?.id) return;

    const fetchStudentData = async () => {
      try {
        const response = await apiClient.get(`/api/students/${profile.id}`);
        if (response.data) {
          if (Array.isArray(response.data.online_quizzes)) {
            setOnlineQuizzes(response.data.online_quizzes);
          }
        }
      } catch (err) {
        console.error('Error fetching student data:', err);
      }
    };

    fetchStudentData();
  }, [profile?.id]);

  // Check which quizzes exist in online_quizzes array
  useEffect(() => {
    if (!profile?.id || quizzes.length === 0 || !Array.isArray(onlineQuizzes)) return;

    const checkCompletions = () => {
      const completed = new Set();
      for (const quiz of quizzes) {
        // Check if quiz exists in online_quizzes array
        const exists = onlineQuizzes.some(oqz => {
          const qzId = oqz.quiz_id?.toString();
          const targetId = quiz._id?.toString();
          return qzId === targetId;
        });
        if (exists) {
          completed.add(quiz._id);
        }
      }
      setCompletedQuizzes(completed);
    };

    checkCompletions();
  }, [profile?.id, quizzes, onlineQuizzes]);

  // Helper function to get quizDegree for a given week and quiz_id
  const getQuizDegree = (lessonName, quizId = null) => {
    // First, try to get from lessons object
    if (lessonName && profile?.lessons) {
      const lessonData = profile.lessons[lessonName];
      if (lessonData?.quizDegree) {
        return lessonData.quizDegree;
      }
    }
    
    // If not found in weeks, try online_quizzes
    if (quizId && Array.isArray(onlineQuizzes)) {
      const quizResult = onlineQuizzes.find(qz => {
        const qzId = qz.quiz_id?.toString();
        const targetId = quizId.toString();
        return qzId === targetId;
      });
      
      if (quizResult?.result) {
        return quizResult.result; // Format: "1 / 1" or "8 / 10"
      }
    }
    
    return null;
  };

  // Helper function to check if deadline has passed
  const isDeadlinePassed = (deadlineDate) => {
    if (!deadlineDate) return false;
    
    try {
      // Parse date in local timezone to avoid timezone shift
      let deadline;
      if (typeof deadlineDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) {
        // If it's a string in YYYY-MM-DD format, parse it in local timezone
        const [year, month, day] = deadlineDate.split('-').map(Number);
        deadline = new Date(year, month - 1, day);
      } else if (deadlineDate instanceof Date) {
        deadline = new Date(deadlineDate);
      } else {
        deadline = new Date(deadlineDate);
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      deadline.setHours(0, 0, 0, 0);
      
      return deadline <= today; // Deadline passed if deadline <= today
    } catch (e) {
      return false;
    }
  };

  // Track which quizzes have already had deadline penalties applied (to prevent duplicate scoring)
  const deadlinePenaltiesAppliedRef = useRef(new Set());
  
  // Check deadlines and update student lessons if needed
  useEffect(() => {
    if (!profile?.id || quizzes.length === 0) return;
    // Wait for profile lessons to be loaded before checking deadlines
    if (!profile?.lessons) return;

    const checkDeadlines = async () => {
      for (const quiz of quizzes) {
        // Only check if quiz has deadline and is not completed
        if (
          quiz.deadline_type === 'with_deadline' &&
          quiz.deadline_date &&
          !completedQuizzes.has(quiz._id) &&
          quiz.lesson &&
          quiz.lesson.trim()
        ) {
          if (isDeadlinePassed(quiz.deadline_date)) {
            const lessonName = quiz.lesson.trim();
            // Check current lesson data to see if we need to update
            const lessonData = profile?.lessons?.[lessonName];
            
            // Create unique key for this quiz deadline check
            const deadlineKey = `quiz_${quiz._id}_lesson_${lessonName}`;
            
            // Only update and apply scoring if:
            // 1. We haven't already applied penalty for this quiz (tracked in ref)
            // 2. quizDegree is NOT already "Didn't Attend The Quiz"
            const shouldApplyDeadlinePenalty = !deadlinePenaltiesAppliedRef.current.has(deadlineKey) &&
                                               (!lessonData || 
                                                lessonData.quizDegree === null || 
                                                lessonData.quizDegree === undefined ||
                                                lessonData.quizDegree !== "Didn't Attend The Quiz");
            
            if (shouldApplyDeadlinePenalty) {
              try {
                // Check history first to see if deadline penalty was already applied (only if scoring is enabled)
                let alreadyApplied = false;
                if (isScoringEnabled) {
                  try {
                    const historyResponse = await apiClient.post('/api/scoring/get-last-history', {
                      studentId: profile.id,
                      type: 'quiz',
                      lesson: lessonName
                    });
                    
                    if (historyResponse.data.found && historyResponse.data.history) {
                      const lastHistory = historyResponse.data.history;
                      // Check if this is already a deadline penalty (0%) for this lesson
                      if (lastHistory.data?.percentage === 0 && lastHistory.process_lesson === lessonName) {
                        // Check if it was applied recently (within last hour) to avoid duplicates
                        const historyTime = new Date(lastHistory.timestamp);
                        const now = new Date();
                        const timeDiff = now - historyTime;
                        if (timeDiff < 3600000) { // 1 hour
                          alreadyApplied = true;
                          console.log(`[DEADLINE] Deadline penalty already applied for quiz ${quiz._id}, lesson ${lessonName}`);
                        }
                      }
                    }
                  } catch (historyErr) {
                    console.error('Error checking history for deadline penalty:', historyErr);
                  }
                }
                
                if (!alreadyApplied) {
                // Mark as applied immediately to prevent duplicate calls
                deadlinePenaltiesAppliedRef.current.add(deadlineKey);
                
                // Get previous percentage ONLY from online_quizzes (actual submissions)
                let previousPercentage = null;
                  if (isScoringEnabled) {
                const studentResponseBefore = await apiClient.get(`/api/students/${profile.id}`);
                
                // Only check online_quizzes for previous result (actual quiz submission)
                if (studentResponseBefore.data && studentResponseBefore.data.online_quizzes) {
                  const previousResult = studentResponseBefore.data.online_quizzes.find(
                    oqz => {
                      const qzIdStr = oqz.quiz_id ? String(oqz.quiz_id) : null;
                      const targetIdStr = quiz._id.toString();
                      return qzIdStr === targetIdStr;
                    }
                  );
                  if (previousResult && previousResult.percentage) {
                    // Extract percentage from "X%" format
                    const prevPercentageStr = String(previousResult.percentage).replace('%', '');
                    previousPercentage = parseInt(prevPercentageStr, 10);
                      }
                  }
                }
                
                console.log(`[DEADLINE] Applying quiz deadline penalty for quiz ${quiz._id}, lesson ${lessonName}, previousPercentage: ${previousPercentage}`);
                
                  // Update lesson first (always apply this, regardless of scoring system)
                await apiClient.put(`/api/students/${profile.id}/quiz_degree`, {
                    lesson: lessonName,
                    quizDegree: "Didn't Attend The Quiz"
                  });
                  
                    // Apply scoring: 0% = -25 points (only if scoring is enabled)
                    if (isScoringEnabled) {
                      // Get previous percentage from history (for this lesson)
                      let actualPreviousPercentage = previousPercentage;
                      try {
                        const historyResponse = await apiClient.post('/api/scoring/get-last-history', {
                          studentId: profile.id,
                          type: 'quiz',
                          lesson: lessonName
                        });
                        
                        if (historyResponse.data.found && historyResponse.data.history) {
                          const lastHistory = historyResponse.data.history;
                          if (lastHistory.data?.percentage !== undefined) {
                            actualPreviousPercentage = lastHistory.data.percentage;
                          }
                        }
                      } catch (historyErr) {
                        console.error('Error getting quiz history, using provided previousPercentage:', historyErr);
                      }
                      
                  // If previousPercentage is null (no previous submission), it will just apply -25
                  // If previousPercentage exists, it will reverse those points and apply -25
                  try {
                    const scoringResponse = await apiClient.post('/api/scoring/calculate', {
                      studentId: profile.id,
                      type: 'quiz',
                          lesson: lessonName,
                          data: { percentage: 0, previousPercentage: actualPreviousPercentage }
                    });
                    console.log(`[DEADLINE] Scoring response:`, scoringResponse.data);
                  } catch (scoreErr) {
                    console.error('Error calculating quiz score:', scoreErr);
                    // Remove from ref if scoring failed so it can be retried
                    deadlinePenaltiesAppliedRef.current.delete(deadlineKey);
                      }
                  }
                  
                  // Refetch student data to update state
                  queryClient.invalidateQueries(['profile']);
                  }
              } catch (err) {
                console.error('Error updating student lessons:', err);
                // Remove from ref if update failed so it can be retried
                deadlinePenaltiesAppliedRef.current.delete(deadlineKey);
              }
            }
          }
        }
      }
    };

    checkDeadlines();
  }, [profile?.id, profile?.lessons, quizzes, completedQuizzes, isScoringEnabled, queryClient]); // Updated deps for lessons

  if (isLoading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        padding: "20px 5px 20px 5px"
      }}>
        <div style={{ maxWidth: 800, margin: "40px auto", padding: "20px 5px 20px 5px" }}>
          <Title backText="Back" href="/student_dashboard">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Image src="/notepad.svg" alt="Notepad" width={32} height={32} />
              My Quizzes
            </div>
          </Title>
          
          {/* Error Message */}
          {errorMessage && (
            <div style={{
              background: '#f8d7da',
              color: '#721c24',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid #f5c6cb',
              textAlign: 'center',
              fontWeight: '500'
            }}>
              {errorMessage}
            </div>
          )}
          
          {/* White Background Container */}
          <div className="quizzes-container" style={{
            background: 'white',
            borderRadius: '16px',
            padding: '40px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{
              width: "50px",
              height: "50px",
              border: "4px solid rgba(31, 168, 220, 0.2)",
              borderTop: "4px solid #1FA8DC",
              borderRadius: "50%",
              margin: "0 auto 20px",
              animation: "spin 1s linear infinite"
            }} />
            <p style={{ color: "#6c757d", fontSize: "1rem" }}>Loading quizzes...</p>
            <style jsx>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper" style={{ 
      minHeight: "100vh", 
      padding: "20px 5px 20px 5px" 
    }}>
      <div className="page-content" style={{ maxWidth: 800, margin: "40px auto", padding: "20px 5px 20px 5px" }}>
        <Title backText="Back" href="/student_dashboard">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Image src="/notepad.svg" alt="Notepad" width={32} height={32} />
            My Quizzes
          </div>
        </Title>

        {/* Quiz Performance Chart - Outside container, under Title */}
        <div style={{
          marginBottom: '24px',
          padding: '24px',
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            margin: '0 0 20px 0',
            fontSize: '1.3rem',
            fontWeight: '700',
            color: '#212529'
          }}>
            Quiz Performance by Week
          </h2>
          {isChartLoading ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#6c757d',
              fontSize: '1.1rem',
              fontWeight: '500'
            }}>
              Loading chart data...
            </div>
          ) : (
            <QuizPerformanceChart chartData={chartData} height={400} />
          )}
        </div>

        {/* Search Bar */}
        <div className="search-bar-container" style={{ marginBottom: 20, width: '100%' }}>
          <InputWithButton
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyPress}
            onButtonClick={handleSearch}
          />
        </div>

        {/* Filters */}
        {quizzes.length > 0 && (
          <div className="filters-container" style={{
            background: 'white',
            borderRadius: 16,
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            marginBottom: 24,
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <div className="filter-row" style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap'
            }}>
              <div className="filter-group" style={{ flex: 1, minWidth: 180 }}>
                <label className="filter-label" style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#495057', fontSize: '0.95rem' }}>
                  Filter by Lesson
                </label>
                <StudentLessonSelect
                  availableLessons={availableLessons}
                  selectedLesson={filterLesson}
                  onLessonChange={(lesson) => {
                    setFilterLesson(lesson);
                  }}
                  isOpen={filterLessonDropdownOpen}
                  onToggle={() => {
                    setFilterLessonDropdownOpen(!filterLessonDropdownOpen);
                  }}
                  onClose={() => setFilterLessonDropdownOpen(false)}
                  placeholder="Select Lesson"
                />
              </div>
            </div>
          </div>
        )}

        {/* White Background Container */}
        <div className="quizzes-container" style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
        }}>
          {/* Quizzes List */}
          {filteredQuizzes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>
              {quizzes.length === 0 ? 'No quizzes available.' : 'No quizzes match your filters.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredQuizzes.map((quiz) => (
                <div
                  key={quiz._id}
                  className="quiz-item"
                  style={{
                    border: '2px solid #e9ecef',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#1FA8DC';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(31, 168, 220, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e9ecef';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '8px' }}>
                      {[quiz.lesson, quiz.lesson_name].filter(Boolean).join(' • ')}
                    </div>
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: '#ffffff',
                      border: '2px solid #e9ecef',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                      color: '#495057',
                      textAlign: 'left',
                      display: 'inline-block',
                      maxWidth: '350px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>{quiz.questions?.length || 0} Question{quiz.questions?.length !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Image src="/clock.svg" alt="Timer" width={18} height={18} />
                          {quiz.timer ? `Timer ${quiz.timer} minute${quiz.timer !== 1 ? 's' : ''}` : 'No Timer'}
                        </span>
                        {quiz.deadline_type === 'with_deadline' && quiz.deadline_date && (
                          <>
                            <span>•</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Image src="/clock.svg" alt="Deadline" width={18} height={18} />
                              {quiz.deadline_date ? (() => {
                                try {
                                  // Parse date in local timezone
                                  let deadline;
                                  if (typeof quiz.deadline_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(quiz.deadline_date)) {
                                    const [year, month, day] = quiz.deadline_date.split('-').map(Number);
                                    deadline = new Date(year, month - 1, day);
                                  } else {
                                    deadline = new Date(quiz.deadline_date);
                                  }
                                  return `With deadline date : ${deadline.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}`;
                                } catch (e) {
                                  return `With deadline date : ${quiz.deadline_date}`;
                                }
                              })() : 'With no deadline date'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="quiz-buttons" style={{ display: 'flex', gap: '12px' }}>
                    {(() => {
                      // Get quizDegree from weeks database (for display purposes only)
                      const quizDegree = getQuizDegree(quiz.lesson, quiz._id);
                      
                      // IMPORTANT: Only hide Start button if quiz exists in online_quizzes
                      // Don't hide Start button just because weeks array has quizDegree
                      // If quiz is in online_quizzes, show Details and Done buttons
                      if (completedQuizzes.has(quiz._id)) {
                        return (
                          <>
                            {(quiz.show_details_after_submitting === true || quiz.show_details_after_submitting === 'true') && (
                              <button
                                onClick={() => router.push(`/student_dashboard/my_quizzes/details?id=${quiz._id}`)}
                                style={{
                                  padding: '8px 16px',
                                  backgroundColor: '#1FA8DC',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  fontSize: '0.9rem',
                                  fontWeight: '600',
                                  transition: 'all 0.2s ease',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.backgroundColor = '#0d5a7a';
                                  e.target.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.backgroundColor = '#1FA8DC';
                                  e.target.style.transform = 'translateY(0)';
                                }}
                              >
                                <Image src="/details.svg" alt="Details" width={18} height={18} />
                                Details
                              </button>
                            )}
                            <button
                              style={{
                                padding: '8px 16px',
                                backgroundColor: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '20px',
                                cursor: 'default',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              ✅ Done{quizDegree ? ` (${quizDegree})` : ''}
                            </button>
                          </>
                        );
                      }
                      
                      // If quizDegree is "Didn't Attend The Quiz" or "No Quiz", show that status
                      // (but still allow Start button if not in online_quizzes)
                      if (quizDegree === "Didn't Attend The Quiz" || quizDegree === "No Quiz") {
                        return (
                          <button
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '20px',
                              cursor: 'default',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            {quizDegree === "No Quiz" ? '🚫 No Quiz' : "❌ Didn't Attend The Quiz"}
                          </button>
                        );
                      }
                      
                      // Check if deadline has passed and quiz not submitted
                      if (quiz.deadline_type === 'with_deadline' && 
                          quiz.deadline_date && 
                          isDeadlinePassed(quiz.deadline_date)) {
                        return (
                          <button
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '20px',
                              cursor: 'default',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            ❌ Didn't Attend The Quiz
                          </button>
                        );
                      }
                      
                      // Default: show Start button
                      // (Even if weeks array has quizDegree, if not in online_quizzes, show Start)
                      return (
                        <button
                          onClick={() => router.push(`/student_dashboard/my_quizzes/start?id=${quiz._id}`)}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#218838';
                            e.target.style.transform = 'translateY(-1px)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = '#28a745';
                            e.target.style.transform = 'translateY(0)';
                          }}
                        >
                          <Image src="/play.svg" alt="Play" width={16} height={16} />
                          Start
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Help Text */}
          <NeedHelp style={{ padding: "20px", borderTop: "1px solid #e9ecef" }} />
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          .page-wrapper {
            padding: 10px 5px;
          }
          .page-content {
            margin: 20px auto;
            padding: 8px;
          }
          .quizzes-container {
            padding: 16px;
          }
          .quiz-item {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px;
          }
          .quiz-buttons {
            width: 100%;
          }
          .quiz-buttons button {
            width: 100%;
            justify-content: center;
          }
          /* Chart container responsive */
          .page-content > div:first-of-type {
            padding: 16px !important;
            margin-bottom: 16px !important;
          }
          .page-content > div:first-of-type h2 {
            font-size: 1.3rem !important;
            margin-bottom: 16px !important;
          }
        }
        @media (max-width: 480px) {
          .page-wrapper {
            padding: 5px;
          }
          .page-content {
            margin: 10px auto;
            padding: 5px;
          }
          .quizzes-container {
            padding: 12px;
          }
          /* Chart container responsive */
          .page-content > div:first-of-type {
            padding: 12px !important;
            margin-bottom: 12px !important;
          }
          .page-content > div:first-of-type h2 {
            font-size: 1.3rem !important;
            margin-bottom: 12px !important;
          }
        }
        @media (max-width: 360px) {
          .quizzes-container {
            padding: 10px;
          }
          /* Chart container responsive */
          .page-content > div:first-of-type {
            padding: 10px !important;
          }
          .page-content > div:first-of-type h2 {
            font-size: 1.3rem !important;
          }
        }
      `}</style>
    </div>
  );
}

