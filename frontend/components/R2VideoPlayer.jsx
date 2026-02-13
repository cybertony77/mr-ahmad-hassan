import { useRef, useEffect, useState } from "react";
import apiClient from '../lib/axios';

export default function R2VideoPlayer({ r2Key, videoId, onComplete }) {
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasMarkedComplete = useRef(false);

  // Fetch signed URL on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchSignedUrl() {
      try {
        setLoading(true);
        setError(null);
        const response = await apiClient.post('/api/upload/r2-video-url', { key: r2Key });
        if (!cancelled) {
          setVideoUrl(response.data.signedUrl);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to get video URL:', err);
          setError('Failed to load video. Please try again.');
          setLoading(false);
        }
      }
    }

    if (r2Key) {
      fetchSignedUrl();
    }

    return () => {
      cancelled = true;
    };
  }, [r2Key]);

  // Track video progress and mark complete at 90%
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const handleTimeUpdate = () => {
      if (!video.duration || hasMarkedComplete.current) return;
      const percent = (video.currentTime / video.duration) * 100;

      // Mark as complete if >= 90%
      if (percent >= 90) {
        hasMarkedComplete.current = true;
        if (onComplete) {
          onComplete(videoId, percent);
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [videoUrl, videoId, onComplete]);

  // Reset completion flag when video changes
  useEffect(() => {
    hasMarkedComplete.current = false;
  }, [r2Key]);

  if (loading) {
    return (
      <div style={{
        width: '100%',
        aspectRatio: '16 / 9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        color: '#fff',
        fontSize: '1rem',
      }}>
        Loading video...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        width: '100%',
        aspectRatio: '16 / 9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        color: '#dc3545',
        fontSize: '1rem',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <div>{error}</div>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            apiClient.post('/api/upload/r2-video-url', { key: r2Key })
              .then(res => {
                setVideoUrl(res.data.signedUrl);
                setLoading(false);
              })
              .catch(() => {
                setError('Failed to load video. Please try again.');
                setLoading(false);
              });
          }}
          style={{
            padding: '8px 20px',
            backgroundColor: '#1FA8DC',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={videoUrl}
      controls
      controlsList="nodownload"
      disablePictureInPicture
      playsInline
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: '100%',
        height: 'auto',
        maxHeight: '100vh',
        aspectRatio: '16 / 9',
        backgroundColor: '#000',
        outline: 'none',
        display: 'block',
      }}
    />
  );
}
