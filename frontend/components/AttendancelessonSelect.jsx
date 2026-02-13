import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../lib/axios';

export default function AttendanceLessonSelect({ 
  selectedLesson, 
  onLessonChange, 
  required = false, 
  isOpen, 
  onToggle, 
  onClose, 
  placeholder = 'Select Attendance Lesson' 
}) {
  // Fetch lessons from database
  const { data: lessonsResponse, isLoading: lessonsLoading } = useQuery({
    queryKey: ['lessons'],
    queryFn: async () => {
      const response = await apiClient.get('/api/lessons');
      return response.data.lessons || [];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false
  });

  const lessons = lessonsResponse?.map(lesson => lesson.name) || [];

  // Handle legacy props (value, onChange) for backward compatibility
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const actualIsOpen = isOpen !== undefined ? isOpen : internalIsOpen;
  const actualOnToggle = onToggle || (() => setInternalIsOpen(!internalIsOpen));
  const actualOnClose = onClose || (() => setInternalIsOpen(false));

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        actualOnClose();
      }
    };

    if (actualIsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [actualIsOpen, actualOnClose]);

  const handleLessonSelect = (lesson) => {
    onLessonChange(lesson);
    actualOnClose();
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          padding: '14px 16px',
          border: actualIsOpen ? '2px solid #1FA8DC' : '2px solid #e9ecef',
          borderRadius: '10px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: selectedLesson ? '#1FA8DC' : '#adb5bd',
          backgroundColor: selectedLesson ? '#f0f8ff' : '#ffffff',
          fontWeight: selectedLesson ? '600' : '400',
          fontSize: '1rem',
          transition: 'all 0.3s ease',
          boxShadow: actualIsOpen ? '0 0 0 3px rgba(31, 168, 220, 0.1)' : 'none'
        }}
        onClick={actualOnToggle}
      >
        <span>{selectedLesson && selectedLesson !== 'n/a' ? selectedLesson : placeholder}</span>
      </div>
      

      
      {actualIsOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: '#ffffff',
          border: '2px solid #e9ecef',
          borderRadius: '10px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          zIndex: 1000,
          maxHeight: '200px',
          overflowY: 'auto',
          marginTop: '4px'
        }}>
          {/* Clear selection option */}
          <div
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              borderBottom: '1px solid #f8f9fa',
              transition: 'background-color 0.2s ease',
              color: '#dc3545',
              fontWeight: '500'
            }}
            onClick={() => handleLessonSelect('')}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#fff5f5'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
          >
            ✕ Clear selection
          </div>
          {lessonsLoading ? (
            <div style={{
              padding: '12px 16px',
              textAlign: 'center',
              color: '#666',
              fontSize: '0.9rem'
            }}>
              Loading lessons...
            </div>
          ) : lessons.length === 0 ? (
            <div style={{
              padding: '12px 16px',
              textAlign: 'center',
              color: '#999',
              fontSize: '0.9rem'
            }}>
              No lessons available
            </div>
          ) : (
            lessons.map((lesson) => (
            <div
              key={lesson}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #f8f9fa',
                transition: 'background-color 0.2s ease',
                color: selectedLesson === lesson ? '#1FA8DC' : '#000000',
                backgroundColor: selectedLesson === lesson ? '#f0f8ff' : '#ffffff',
                fontWeight: selectedLesson === lesson ? '600' : '400'
              }}
              onClick={() => handleLessonSelect(lesson)}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
            >
              {lesson}
            </div>
            ))
          )}
        </div>
      )}
    </div>
  );
} 
