// src/CoursePlayer.jsx
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";

const API_BASE = "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  validateStatus: () => true,
});

export default function CoursePlayer({ courseId, onClose, onProgressUpdate }) {
  const [loading, setLoading] = useState(true);
  const [outline, setOutline] = useState(null); // { course, sections, firstLessonId }
  const [currentLesson, setCurrentLesson] = useState(null);
  const [currentLessonId, setCurrentLessonId] = useState(null);
  const [savingProgress, setSavingProgress] = useState(false);

  const videoRef = useRef(null);

  // Outline load
  useEffect(() => {
    let cancelled = false;

    async function loadOutline() {
      setLoading(true);
      const res = await api.get(`/api/dashboard/courses/${courseId}/outline`);
      if (!cancelled) {
        if (res.status === 200) {
          setOutline(res.data);
          const initialLessonId = res.data.firstLessonId;
          if (initialLessonId) {
            setCurrentLessonId(initialLessonId);
          }
        } else {
          console.error("Outline load error:", res.data);
        }
        setLoading(false);
      }
    }

    loadOutline();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // Current lesson load
  useEffect(() => {
    if (!currentLessonId) return;

    let cancelled = false;

    async function loadLesson() {
      const res = await api.get(`/api/dashboard/lessons/${currentLessonId}`);
      if (!cancelled) {
        if (res.status === 200) {
          setCurrentLesson(res.data);
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            setTimeout(() => {
              try {
                videoRef.current.play().catch(() => {});
              } catch (e) {}
            }, 50);
          }
        } else {
          console.error("Lesson load error:", res.data);
        }
      }
    }

    loadLesson();
    return () => {
      cancelled = true;
    };
  }, [currentLessonId]);

  // Progress helper
  async function sendProgress({ completed }) {
    if (!currentLesson) return;
    setSavingProgress(true);
    try {
      const watchedSeconds =
        (videoRef.current && Math.floor(videoRef.current.currentTime)) || 0;

      const res = await api.post(
        `/api/dashboard/lessons/${currentLesson.id}/progress`,
        {
          watchedSeconds,
          isCompleted: completed,
        }
      );

      if (res.status !== 200) {
        console.error("Progress update error:", res.data);
      } else {
        const outlineRes = await api.get(
          `/api/dashboard/courses/${courseId}/outline`
        );
        if (outlineRes.status === 200) {
          setOutline(outlineRes.data);
        }

        if (typeof onProgressUpdate === "function") {
          onProgressUpdate();
        }
      }
    } catch (err) {
      console.error("Progress update error:", err);
    } finally {
      setSavingProgress(false);
    }
  }

  function handleEnded() {
    sendProgress({ completed: true });
  }

  if (loading || !outline) {
    return (
      <div className="player-overlay">
        <div className="player-card">
          <div className="player-header">
            <span className="player-title">Loading course...</span>
          </div>
          <div className="player-body">Please wait...</div>
        </div>
      </div>
    );
  }

  const { course, sections } = outline;

  return (
    <div className="player-overlay">
      <div className="player-card">
        {/* Header */}
        <div className="player-header">
          <div>
            <div className="player-badge">Course player</div>
            <div className="player-title">{course.title}</div>
            <div className="player-subtitle">
              {course.level || "All levels"}
            </div>
          </div>
          <button className="player-close-btn" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        {/* Layout */}
        <div className="player-layout">
          {/* LEFT: LESSON LIST */}
          <aside className="player-sidebar">
            <div className="sidebar-title">Chapters</div>
            <div className="sidebar-list">
              {sections.map((sec) => (
                <div key={sec.id} className="sidebar-section">
                  <div className="sidebar-section-title">{sec.title}</div>
                  {sec.lessons.map((lesson) => {
                    const isActive = lesson.id === currentLessonId;
                    return (
                      <button
                        key={lesson.id}
                        className={
                          "sidebar-lesson" +
                          (isActive ? " sidebar-lesson-active" : "") +
                          (lesson.isCompleted ? " sidebar-lesson-done" : "")
                        }
                        onClick={() => setCurrentLessonId(lesson.id)}
                      >
                        <div className="sidebar-lesson-main">
                          <span className="lesson-title">{lesson.title}</span>
                          {lesson.isCompleted && (
                            <span className="lesson-chip">Done</span>
                          )}
                        </div>
                        <div className="lesson-meta">
                          {lesson.duration_seconds
                            ? Math.round(lesson.duration_seconds / 60) + " min"
                            : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>

          {/* CENTER: VIDEO */}
          <main className="player-main">
            {currentLesson ? (
              <>
                <div className="current-lesson-title">
                  {currentLesson.title}
                </div>
                <div className="video-wrapper">
                  <video
                    ref={videoRef}
                    key={currentLesson.id}
                    src={currentLesson.video_url}
                    controls
                    autoPlay
                    muted
                    className="player-video"
                    onEnded={handleEnded}
                  />
                </div>

                <div className="player-controls-row">
                  <button
                    className="primary-btn"
                    disabled={savingProgress}
                    onClick={() => sendProgress({ completed: false })}
                  >
                    {savingProgress ? "Saving..." : "Save progress"}
                  </button>
                  <button
                    className="secondary-btn"
                    disabled={savingProgress}
                    onClick={() => sendProgress({ completed: true })}
                  >
                    Mark as complete
                  </button>
                </div>
              </>
            ) : (
              <div>No lesson selected</div>
            )}
          </main>
        </div>
      </div>

      {/* Inline CSS for player */}
      <style jsx>{`
        .player-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
        }
        .player-card {
          width: 96%;
          max-width: 1200px;
          max-height: 90vh;
          background: #f9fafb;
          border-radius: 24px;
          box-shadow: 0 30px 80px rgba(15, 23, 42, 0.35);
          display: flex;
          flex-direction: column;
          padding: 18px 20px 20px;
        }
        .player-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .player-badge {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
        }
        .player-title {
          font-size: 20px;
          font-weight: 600;
          color: #111827;
        }
        .player-subtitle {
          font-size: 13px;
          color: #6b7280;
        }
        .player-close-btn {
          border: none;
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 13px;
          background: #fee2e2;
          color: #b91c1c;
          cursor: pointer;
        }
        .player-layout {
          display: grid;
          grid-template-columns: 260px minmax(0, 1fr);
          gap: 16px;
          flex: 1;
          min-height: 0;
        }
        .player-sidebar {
          background: #f3f4f6;
          border-radius: 18px;
          padding: 10px 10px 12px;
          overflow-y: auto;
        }
        .sidebar-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 6px;
          color: #4b5563;
        }
        .sidebar-section {
          margin-bottom: 8px;
        }
        .sidebar-section-title {
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 4px;
        }
        .sidebar-lesson {
          width: 100%;
          border: none;
          text-align: left;
          border-radius: 10px;
          padding: 6px 8px;
          margin-bottom: 4px;
          background: #ffffff;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sidebar-lesson-active {
          border: 1px solid #4f46e5;
          box-shadow: 0 0 0 1px rgba(79, 70, 229, 0.15);
        }
        .sidebar-lesson-done {
          background: #ecfdf5;
        }
        .sidebar-lesson-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .lesson-title {
          font-size: 12px;
          color: #111827;
        }
        .lesson-chip {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 999px;
          background: #bbf7d0;
          color: #166534;
        }
        .lesson-meta {
          font-size: 11px;
          color: #9ca3af;
        }
        .player-main {
          background: #ffffff;
          border-radius: 18px;
          padding: 10px 12px 14px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .current-lesson-title {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .video-wrapper {
          border-radius: 14px;
          overflow: hidden;
          background: #000;
          flex: 1;
          display: flex;
        }
        .player-video {
          width: 100%;
          height: 100%;
          max-height: 420px;
          object-fit: contain;
          background: #000;
        }
        .player-controls-row {
          margin-top: 10px;
          display: flex;
          gap: 10px;
        }
        @media (max-width: 900px) {
          .player-card {
            padding: 12px 12px 14px;
          }
          .player-layout {
            grid-template-columns: 1fr;
          }
          .player-sidebar {
            max-height: 200px;
          }
        }
      `}</style>
    </div>
  );
}
