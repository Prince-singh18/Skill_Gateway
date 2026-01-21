// src/CoursePlayer.jsx
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import "./CoursePlayer.css";

const API_BASE = "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  validateStatus: () => true,
});

export default function CoursePlayer({ courseId, onClose, onProgressUpdate }) {
  const [loading, setLoading] = useState(true);
  const [outline, setOutline] = useState(null);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [currentLessonId, setCurrentLessonId] = useState(null);
  const [savingProgress, setSavingProgress] = useState(false);

  const videoRef = useRef(null);

  // LOAD OUTLINE
  useEffect(() => {
    let cancelled = false;

    async function loadOutline() {
      setLoading(true);
      const res = await api.get(`/api/dashboard/courses/${courseId}/outline`);
      if (!cancelled) {
        if (res.status === 200) {
          setOutline(res.data);
          if (res.data.firstLessonId) {
            setCurrentLessonId(res.data.firstLessonId);
          }
        } else {
          console.error("Outline error:", res.data);
        }
        setLoading(false);
      }
    }

    loadOutline();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // LOAD LESSON
  useEffect(() => {
    if (!currentLessonId) return;
    let cancelled = false;

    async function loadLesson() {
      const res = await api.get(`/api/dashboard/lessons/${currentLessonId}`);
      if (!cancelled && res.status === 200) {
        setCurrentLesson(res.data);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.load();
            videoRef.current.play().catch(() => {});
          }
        }, 80);
      }
    }

    loadLesson();
    return () => {
      cancelled = true;
    };
  }, [currentLessonId]);

  // PROGRESS
  async function sendProgress({ completed }) {
    if (!currentLesson) return;
    setSavingProgress(true);

    try {
      const watchedSeconds = Math.floor(videoRef.current?.currentTime || 0);

      await api.post(
        `/api/dashboard/lessons/${currentLesson.id}/progress`,
        {
          watchedSeconds,
          isCompleted: completed,
        }
      );

      const outlineRes = await api.get(
        `/api/dashboard/courses/${courseId}/outline`
      );
      if (outlineRes.status === 200) setOutline(outlineRes.data);

      onProgressUpdate?.();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingProgress(false);
    }
  }

  if (loading || !outline) {
    return (
      <div className="player-overlay">
        <div className="player-card player-card-loading">
          <div className="player-skeleton-header" />
          <div className="player-skeleton-body" />
        </div>
      </div>
    );
  }

  const { course, sections } = outline;

  return (
    <div className="player-overlay">
      <div className="player-card">
        {/* HEADER */}
        <div className="player-header">
          <div>
            <div className="player-badge">Course Player</div>
            <div className="player-title">{course.title}</div>
            <div className="player-subtitle">{course.level}</div>
          </div>
          <button className="player-close-btn" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        {/* LAYOUT */}
        <div className="player-layout">
          {/* SIDEBAR */}
          <aside className="player-sidebar">
            <div className="sidebar-header">
              <span className="sidebar-dot red" />
              <span className="sidebar-dot yellow" />
              <span className="sidebar-dot green" />
              <span className="sidebar-label">Course Outline</span>
            </div>

            {sections.map((sec) => (
              <div key={sec.id} className="sidebar-section">
                <div className="sidebar-section-title">{sec.title}</div>
                <div className="sidebar-lessons">
                  {sec.lessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      className={
                        "sidebar-lesson" +
                        (lesson.id === currentLessonId
                          ? " sidebar-lesson-active"
                          : "")
                      }
                      onClick={() => setCurrentLessonId(lesson.id)}
                    >
                      <div className="sidebar-lesson-main">
                        <span className="sidebar-lesson-bullet" />
                        <span className="sidebar-lesson-title">
                          {lesson.title}
                        </span>
                      </div>
                      {lesson.isCompleted && (
                        <span className="sidebar-lesson-status">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          {/* MAIN / VIDEO */}
          <main className="player-main">
            {currentLesson && (
              <>
                <div className="player-main-header">
                  <h3 className="player-main-title">
                    {currentLesson.title}
                  </h3>
                  {savingProgress && (
                    <span className="player-saving-pill">Saving...</span>
                  )}
                </div>

                <div className="player-video-wrapper">
                  <div className="player-video-topbar">
                    <span className="player-video-dot red" />
                    <span className="player-video-dot yellow" />
                    <span className="player-video-dot green" />
                    <span className="player-video-label">Now Playing</span>
                  </div>
                  <video
                    ref={videoRef}
                    controls
                    autoPlay
                    playsInline
                    preload="auto"
                    className="player-video"
                  >
                    <source
                      src={`http://localhost:5000${currentLesson.video_url}`}
                      type="video/mp4"
                    />
                  </video>
                </div>

                <div className="player-controls-row">
                  <button
                    className="player-btn secondary"
                    onClick={() => sendProgress({ completed: false })}
                  >
                    Save Progress
                  </button>
                  <button
                    className="player-btn primary"
                    onClick={() => sendProgress({ completed: true })}
                  >
                    Mark Complete
                  </button>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
