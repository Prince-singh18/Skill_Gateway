// src/App.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import CoursePlayer from "./CoursePlayer";

const API_BASE = "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  validateStatus: () => true,
});

function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [activity, setActivity] = useState([]);
  const [supportMessage, setSupportMessage] = useState("");
  const [supportList, setSupportList] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // 👉 active course player
  const [activeCourseId, setActiveCourseId] = useState(null);

  // Avatar popup
  const [showAvatarPopup, setShowAvatarPopup] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarError, setAvatarError] = useState("");

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // ---------- helper: format activity ----------
  const formatActivity = (rows) => {
    return (rows || []).map((a, index) => ({
      id: index + 1,
      text: a.text || a.description || "",
      time: a.time || a.created_at || "",
    }));
  };

  // helper: unread kitne hai
  const getUnreadCount = (list = []) =>
    list.filter((n) => {
      const v = n.is_read;
      return (
        v === 0 ||
        v === false ||
        v === "0" ||
        v === null ||
        typeof v === "undefined"
      );
    }).length;

  // ---------- helper: reload ONLY activity ----------
  const reloadActivity = async () => {
    try {
      const res = await api.get("/api/dashboard/activity");
      if (res.status >= 200 && res.status < 300) {
        setActivity(formatActivity(res.data));
      }
    } catch (err) {
      console.error("Activity reload error:", err);
    }
  };

  // ---------- helper: reload notifications ----------
  const reloadNotifications = async () => {
    try {
      const res = await api.get("/api/dashboard/notifications");
      if (res.status >= 200 && res.status < 300) {
        const list = res.data || [];
        setNotifications(list);
        setUnreadCount(getUnreadCount(list));
      }
    } catch (err) {
      console.error("Notifications fetch error:", err);
    }
  };

  // ---------- helper: reload overview + courses ----------
  const reloadCoursesAndStats = async () => {
    try {
      const [overviewRes, coursesRes] = await Promise.all([
        api.get("/api/dashboard/overview"),
        api.get("/api/dashboard/courses"),
      ]);

      const overviewData =
        overviewRes.status >= 200 && overviewRes.status < 300
          ? overviewRes.data
          : { total_courses: 0, hours_learned: 0, certificates: 0 };

      setStats([
        {
          id: 1,
          label: "Total Courses",
          value: overviewData.total_courses || 0,
          tag: "",
        },
        {
          id: 2,
          label: "Hours Learned",
          value: overviewData.hours_learned || 0,
          tag: "Consistency 🔥",
        },
        {
          id: 3,
          label: "Certificates",
          value: overviewData.certificates || 0,
          tag: "More coming soon",
        },
      ]);

      const coursesData =
        coursesRes.status >= 200 && coursesRes.status < 300
          ? coursesRes.data
          : [];
      const formattedCourses = (coursesData || []).map((c) => ({
        id: c.course_id,
        title: c.title,
        level: c.level || "Beginner",
        progress: c.progress || 0,
        lastLesson: c.last_lesson || "Start now",
      }));

      setCourses(formattedCourses);

      if (formattedCourses.length) {
        const stillExists = formattedCourses.find(
          (c) => c.id === selectedCourse?.id
        );
        setSelectedCourse(stillExists || formattedCourses[0]);
      } else {
        setSelectedCourse(null);
      }
    } catch (err) {
      console.error("reloadCoursesAndStats error:", err);
    }
  };

  // 👉 CoursePlayer se jab progress update aata hai
  const handleProgressUpdate = async () => {
    await reloadCoursesAndStats();
    await reloadActivity();
    await reloadNotifications();
  };

  // ------------------- MAIN DASHBOARD LOAD -------------------
  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        setErrorMsg("");

        const [
          profileRes,
          overviewRes,
          coursesRes,
          activityRes,
          ticketsRes,
          notifRes,
        ] = await Promise.all([
          api.get("/api/dashboard/profile"),
          api.get("/api/dashboard/overview"),
          api.get("/api/dashboard/courses"),
          api.get("/api/dashboard/activity"),
          api.get("/api/dashboard/support-tickets"),
          api.get("/api/dashboard/notifications"),
        ]);

        if (profileRes.status === 401) {
          setErrorMsg(
            "Not logged in (401). Please open /login.html and login."
          );
          setLoading(false);
          return;
        }

        if (
          !profileRes ||
          profileRes.status < 200 ||
          profileRes.status >= 300
        ) {
          throw new Error("Profile fetch failed");
        }

        const profileData = profileRes.data;
        const username = profileData.username || "Learner";
        const email = profileData.email || "";
        const backendAvatar = profileData.avatar_url || profileData.avatar;
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          username
        )}&background=111827&color=fff`;

        let avatarUrl;
        try {
          const emailKey = email ? `skill_user_avatar_${email}` : null;
          const storedAvatar = emailKey && localStorage.getItem(emailKey || "");
          if (storedAvatar) {
            avatarUrl = storedAvatar;
          } else {
            avatarUrl = backendAvatar || defaultAvatar;
          }
        } catch (e) {
          avatarUrl = backendAvatar || defaultAvatar;
        }

        const userObj = { name: username, email, avatar: avatarUrl };
        setUser(userObj);

        try {
          if (email) {
            localStorage.setItem(`skill_user_avatar_${email}`, avatarUrl);
            localStorage.setItem("skill_user_email", email);
          }
          localStorage.setItem("skill_user_avatar", avatarUrl);
          localStorage.setItem("skill_user_name", username);
        } catch (e) {
          console.warn("LocalStorage error:", e);
        }

        const overviewData =
          overviewRes.status >= 200 && overviewRes.status < 300
            ? overviewRes.data
            : { total_courses: 0, hours_learned: 0, certificates: 0 };

        setStats([
          {
            id: 1,
            label: "Total Courses",
            value: overviewData.total_courses || 0,
            tag: "",
          },
          {
            id: 2,
            label: "Hours Learned",
            value: overviewData.hours_learned || 0,
            tag: "Consistency 🔥",
          },
          {
            id: 3,
            label: "Certificates",
            value: overviewData.certificates || 0,
            tag: "More coming soon",
          },
        ]);

        const coursesData =
          coursesRes.status >= 200 && coursesRes.status < 300
            ? coursesRes.data
            : [];
        const formattedCourses = (coursesData || []).map((c) => ({
          id: c.course_id,
          title: c.title,
          level: c.level || "Beginner",
          progress: c.progress || 0,
          lastLesson: c.last_lesson || "Start now",
        }));
        setCourses(formattedCourses);
        setSelectedCourse(formattedCourses[0] || null);

        const activityData =
          activityRes.status >= 200 && activityRes.status < 300
            ? activityRes.data
            : [];
        setActivity(formatActivity(activityData));

        const ticketsData =
          ticketsRes.status >= 200 && ticketsRes.status < 300
            ? ticketsRes.data
            : [];
        const formattedTickets = (ticketsData || []).map((t) => ({
          id: t.id,
          text: t.message || t.text || t.body || t.content || "",
          status: t.status || "open",
          created_at: t.created_at || t.createdAt || null,
        }));
        setSupportList(formattedTickets);

        if (notifRes.status >= 200 && notifRes.status < 300) {
          const list = notifRes.data || [];
          setNotifications(list);
          setUnreadCount(getUnreadCount(list));
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
        setErrorMsg("Failed to load dashboard. Please refresh or try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // Overview / Activity tab pe aate hi latest timeline
  useEffect(() => {
    if (activeTab === "overview" || activeTab === "activity") {
      reloadActivity();
    }
  }, [activeTab]);

  const filteredCourses = courses.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  // 🔁 UPDATED FUNCTION: support ticket + admin copy
  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    if (!supportMessage.trim()) return;

    try {
      // 1) User ke liye ticket create (support_tickets table)
      const ticketRes = await api.post("/api/dashboard/support-tickets", {
        subject: "Dashboard support",
        message: supportMessage.trim(),
      });

      if (ticketRes.status === 401) {
        window.location.href = "/login.html";
        return;
      }

      if (ticketRes.status < 200 || ticketRes.status >= 300) {
        throw new Error("Support ticket submit failed");
      }

      // 2) Admin ke liye copy /api/support (support_messages table)
      try {
        await api.post("/api/support", {
          name: user?.name || "Dashboard User",
          email: user?.email || "no-email@skill.com",
          message: supportMessage.trim(),
        });
      } catch (copyErr) {
        console.warn("Admin support copy failed (ignored):", copyErr);
      }

      // 3) Local list update
      const created = ticketRes.data?.ticket || ticketRes.data?.data;
      const newTicket = created
        ? {
            id: created.id,
            text: created.message || created.text || supportMessage.trim(),
            status: created.status || "open",
            created_at:
              created.created_at ||
              created.createdAt ||
              new Date().toISOString(),
          }
        : {
            id: Date.now(),
            text: supportMessage.trim(),
            status: "open",
            created_at: new Date().toISOString(),
          };

      setSupportList((prev) => [newTicket, ...prev]);
      setSupportMessage("");
    } catch (err) {
      console.error(err);
      alert("Failed to submit support ticket. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await api.get("/logout");
    } catch (e) {
      console.error("Logout error (ignored):", e);
    } finally {
      window.location.href = "http://localhost:5000/Frontend/course/home.html";
    }
  };

  const handleLogoClick = () => {
    window.location.href = "http://localhost:5000/Frontend/course/home.html";
  };

  const firstName = user?.name?.split(" ")[0] || "Learner";

  // ------------------- AVATAR HANDLERS -------------------
  const handleAvatarClick = () => {
    setAvatarError("");
    setAvatarFile(null);
    setAvatarPreview("");
    setShowAvatarPopup((v) => !v);
  };

  const handleAvatarFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarError("Please select an image file only.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Max file size is 2 MB.");
      return;
    }

    setAvatarFile(file);
    setAvatarError("");

    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleAvatarSave = async (e) => {
    e.preventDefault();
    if (!avatarFile) {
      setAvatarError("Please choose an image first.");
      return;
    }

    try {
      setAvatarError("");

      const formData = new FormData();
      formData.append("avatar", avatarFile);

      const res = await api.post("/api/dashboard/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.status === 401) {
        window.location.href = "/login.html";
        return;
      }

      if (res.status < 200 || res.status >= 300 || !res.data.success) {
        throw new Error("Avatar upload failed");
      }

      const rawPath = res.data.avatar_url;
      const newAvatarUrl = rawPath.startsWith("http")
        ? rawPath
        : `${API_BASE}${rawPath}`;

      setUser((prev) =>
        prev
          ? {
              ...prev,
              avatar: newAvatarUrl,
            }
          : prev
      );

      try {
        if (user?.email) {
          localStorage.setItem(`skill_user_avatar_${user.email}`, newAvatarUrl);
        }
        localStorage.setItem("skill_user_avatar", newAvatarUrl);
      } catch (err) {
        console.warn("LocalStorage avatar save error:", err);
      }

      setShowAvatarPopup(false);
      setAvatarFile(null);
      setAvatarPreview("");
    } catch (err) {
      console.error(err);
      setAvatarError("Failed to upload avatar. Please try again.");
    }
  };

  // ------------------- NOTIFICATION HANDLERS -------------------
  const handleNotifClick = async () => {
    const next = !showNotif;
    setShowNotif(next);

    if (next) {
      await reloadNotifications();

      if (unreadCount > 0) {
        try {
          await api.post("/api/dashboard/notifications/read");
          setUnreadCount(0);
          setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
        } catch (err) {
          console.error("Notif read error:", err);
        }
      }
    }
  };

  // ------------------- RENDER -------------------
  return (
    <div className="dash-root">
      {/* Sidebar */}
      <aside className="dash-sidebar">
        <div
          className="dash-logo"
          onClick={handleLogoClick}
          style={{ cursor: "pointer" }}
        >
          <span className="logo-dot" />
          <span className="logo-text">Skill Gateway</span>
        </div>

        <nav className="dash-nav">
          <button
            className={
              "nav-item" + (activeTab === "overview" ? " nav-item-active" : "")
            }
            onClick={() => setActiveTab("overview")}
          >
            <span>🏠</span>
            <span>Overview</span>
          </button>
          <button
            className={
              "nav-item" + (activeTab === "courses" ? " nav-item-active" : "")
            }
            onClick={() => setActiveTab("courses")}
          >
            <span>📚</span>
            <span>My Courses</span>
          </button>
          <button
            className={
              "nav-item" + (activeTab === "activity" ? " nav-item-active" : "")
            }
            onClick={() => setActiveTab("activity")}
          >
            <span>⚡</span>
            <span>Activity</span>
          </button>
          <button
            className={
              "nav-item" + (activeTab === "support" ? " nav-item-active" : "")
            }
            onClick={() => setActiveTab("support")}
          >
            <span>💬</span>
            <span>Support</span>
          </button>
        </nav>

        <div className="dash-sidebar-footer">
          <p className="sidebar-tip-title">Today&apos;s tip</p>
          <p className="sidebar-tip-text">
            45–60 minutes of focused learning &amp; a short revision is better
            than 4 hours of scrolling. 🧠
          </p>
          <button className="sidebar-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="dash-main">
        {/* Topbar */}
        <header className="dash-topbar">
          <div className="dash-title-wrap">
            <h1 className="dash-title">Hi, {firstName} 👋</h1>
            <p className="dash-subtitle">Welcome back to your dashboard.</p>
          </div>

          <div className="dash-topbar-right">
            <div className="dash-search">
              <input
                type="text"
                placeholder="Search your courses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Notifications */}
            <div className="notif-wrapper">
              <button
                className="dash-icon-btn"
                title="Notifications"
                onClick={handleNotifClick}
              >
                <span className="bell-icon">🔔</span>
                {unreadCount > 0 && (
                  <span className="notif-dot">{unreadCount}</span>
                )}
              </button>

              {showNotif && (
                <div className="notif-popover">
                  <div className="notif-header">
                    <span>Notifications</span>
                    {!notifications.length && (
                      <span className="notif-empty">No notifications yet</span>
                    )}
                  </div>
                  <div className="notif-list">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={
                          "notif-item" + (n.is_read ? "" : " notif-item-unread")
                        }
                      >
                        <p className="notif-text">{n.message}</p>
                        <p className="notif-time">{n.time}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User / avatar */}
            <div className="dash-user">
              <div
                className="dash-user-avatar-wrapper"
                onClick={handleAvatarClick}
                title="Change profile picture"
              >
                {user && <img src={user.avatar} alt="avatar" />}
              </div>

              {/* NEW COMPACT AVATAR MODAL (app-style) */}
              {showAvatarPopup && (
                <div className="avatar-modal">
                  <div className="avatar-modal-header">
                    <span>Profile photo</span>
                    <button
                      type="button"
                      className="avatar-modal-close"
                      onClick={() => setShowAvatarPopup(false)}
                    >
                      ×
                    </button>
                  </div>

                  <div className="avatar-modal-body">
                    <div className="avatar-modal-preview">
                      <img
                        src={avatarPreview || user?.avatar}
                        alt="Avatar preview"
                      />
                    </div>

                    <div className="avatar-modal-info">
                      <div className="avatar-modal-name">
                        {user?.name || "Your account"}
                      </div>
                      <div className="avatar-modal-email">
                        {user?.email || ""}
                      </div>
                    </div>

                    <div className="avatar-modal-file">
                      <label className="avatar-modal-choose-btn">
                        Choose image
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarFileChange}
                          style={{ display: "none" }}
                        />
                      </label>
                      <span className="avatar-modal-file-name">
                        {avatarFile?.name || "No file chosen"}
                      </span>
                    </div>

                    <p className="avatar-modal-hint">PNG or JPG, max 2 MB</p>

                    {avatarError && (
                      <p className="avatar-modal-error">{avatarError}</p>
                    )}
                  </div>

                  <div className="avatar-modal-footer">
                    <button
                      type="button"
                      className="secondary-btn small"
                      onClick={() => setShowAvatarPopup(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-btn small"
                      onClick={handleAvatarSave}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              <div>
                <p className="dash-user-name">{user?.name || "Loading..."}</p>
                <p className="dash-user-email">{user?.email || ""}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <section className="dash-content">
          {loading && (
            <p style={{ padding: "12px" }}>Loading your dashboard...</p>
          )}
          {errorMsg && !loading && (
            <p style={{ padding: "12px", color: "red" }}>{errorMsg}</p>
          )}

          {!loading && !errorMsg && (
            <>
              {activeTab === "overview" && (
                <Overview
                  stats={stats || []}
                  courses={filteredCourses}
                  selectedCourse={selectedCourse}
                  setSelectedCourse={setSelectedCourse}
                  activity={activity}
                  onOpenCourse={(id) => setActiveCourseId(id)}
                />
              )}

              {activeTab === "courses" && (
                <CoursesTab
                  courses={filteredCourses}
                  selectedCourse={selectedCourse}
                  setSelectedCourse={setSelectedCourse}
                  onOpenCourse={(id) => setActiveCourseId(id)}
                />
              )}

              {activeTab === "activity" && <ActivityTab activity={activity} />}

              {activeTab === "support" && (
                <SupportTab
                  supportMessage={supportMessage}
                  setSupportMessage={setSupportMessage}
                  handleSupportSubmit={handleSupportSubmit}
                  supportList={supportList}
                />
              )}
            </>
          )}
        </section>

        {/* 👉 Course player overlay */}
        {activeCourseId && (
          <CoursePlayer
            courseId={activeCourseId}
            onClose={() => setActiveCourseId(null)}
            onProgressUpdate={handleProgressUpdate}
          />
        )}
      </main>
    </div>
  );
}

/* ---------------- Child sections ---------------- */

function Overview({
  stats,
  courses,
  selectedCourse,
  setSelectedCourse,
  activity,
  onOpenCourse,
}) {
  return (
    <div className="grid-2-1 gap-24 fade-in-up">
      {/* Left column */}
      <div className="flex-column gap-24">
        <div className="stats-row">
          {stats.map((item) => (
            <div key={item.id} className="stat-card float-card">
              <p className="stat-label">{item.label}</p>
              <p className="stat-value">{item.value}</p>
              <p className="stat-tag">{item.tag}</p>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Continue learning</h2>
            <span className="panel-chip">{courses.length} active courses</span>
          </div>
          <div className="course-list">
            {courses.map((course) => (
              <button
                key={course.id}
                className={
                  "course-item" +
                  (selectedCourse?.id === course.id
                    ? " course-item-active"
                    : "")
                }
                onClick={() => setSelectedCourse(course)}
              >
                <div>
                  <p className="course-title">{course.title}</p>
                  <p className="course-meta">
                    {course.level} • Last: {course.lastLesson}
                  </p>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                </div>
                <span className="course-progress">{course.progress}%</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="flex-column gap-24">
        <div className="panel highlight-card">
          <h2>Focused session</h2>
          {selectedCourse ? (
            <>
              <p className="highlight-title">{selectedCourse.title}</p>
              <p className="highlight-sub">
                You&apos;re just{" "}
                <strong>{100 - (selectedCourse.progress || 0)}%</strong> away
                from completion. Let&apos;s finish it today! 🚀
              </p>
              <div className="highlight-progress">
                <div
                  className="highlight-progress-fill"
                  style={{ width: `${selectedCourse.progress || 0}%` }}
                />
              </div>
              <button
                className="primary-btn"
                onClick={() => onOpenCourse(selectedCourse.id)}
              >
                Continue course
              </button>
            </>
          ) : (
            <p>No course selected yet.</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Recent activity</h2>
          </div>
          <ul className="activity-list">
            {activity.map((item) => (
              <li key={item.id} className="activity-item">
                <div className="activity-dot" />
                <div>
                  <p className="activity-text">{item.text}</p>
                  <p className="activity-time">{item.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CoursesTab({
  courses,
  selectedCourse,
  setSelectedCourse,
  onOpenCourse,
}) {
  return (
    <div className="grid-2-1 gap-24 fade-in-up">
      <div className="panel">
        <div className="panel-header">
          <h2>All your courses</h2>
        </div>
        <div className="course-grid">
          {courses.map((course) => (
            <div
              key={course.id}
              className={
                "course-card float-card" +
                (selectedCourse?.id === course.id ? " course-card-active" : "")
              }
              onClick={() => setSelectedCourse(course)}
            >
              <p className="course-title">{course.title}</p>
              <p className="course-meta">{course.level}</p>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${course.progress}%` }}
                />
              </div>
              <p className="course-meta">
                Progress: <strong>{course.progress}%</strong>
              </p>
              <button
                className="secondary-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCourse(course.id);
                }}
              >
                Open course
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Next steps</h2>
        {selectedCourse ? (
          <>
            <p className="highlight-title">{selectedCourse.title}</p>
            <ul className="bullet-list">
              <li>Complete the next 2 lessons.</li>
              <li>Take quick notes while watching the videos.</li>
              <li>Attempt the quiz to lock the concepts.</li>
            </ul>
          </>
        ) : (
          <p>Select a course to see your learning plan.</p>
        )}
      </div>
    </div>
  );
}

function ActivityTab({ activity }) {
  return (
    <div className="panel fade-in-up">
      <div className="panel-header">
        <h2>Timeline</h2>
      </div>
      <ul className="activity-list big">
        {activity.map((item) => (
          <li key={item.id} className="activity-item">
            <div className="activity-dot" />
            <div>
              <p className="activity-text">{item.text}</p>
              <p className="activity-time">{item.time}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------- Chatbot panel (AI) ------------- */

function ChatbotPanel() {
  const MAX_MESSAGES = 10;
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      from: "bot",
      text: "Hi! I'm SkillBot 🤖. Aapka issue short me batao (payment, login, course, etc.)",
      time: "now",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [sentCount, setSentCount] = useState(0);
  const [isBotTyping, setIsBotTyping] = useState(false);

  const remaining = MAX_MESSAGES - sentCount;
  const inputDisabled = remaining <= 0;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || inputDisabled) return;

    const userText = chatInput.trim();

    const userMsg = {
      id: Date.now(),
      from: "user",
      text: userText,
      time: "just now",
    };

    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setChatInput("");
    setSentCount((c) => c + 1);
    setIsBotTyping(true);

    try {
      const historyForApi = newHistory.slice(-8).map((m) => ({
        role: m.from === "user" ? "user" : "assistant",
        content: m.text,
      }));

      const res = await api.post("/api/ai/skillbot", {
        message: userText,
        history: historyForApi,
      });

      const botText = res.data?.reply || "AI reply missing, please try again.";

      const botMsg = {
        id: Date.now() + 1,
        from: "bot",
        text: botText,
        time: "just now",
      };

      setChatMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error("SkillBot error:", err);
      const errorMsg = {
        id: Date.now() + 2,
        from: "bot",
        text: "Abhi AI se connect karne me problem aa rahi hai 😅. Thodi der baad try karo ya right side ka support form use karo.",
        time: "now",
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsBotTyping(false);
    }
  };

  return (
    <div className="panel chat-panel">
      <div className="panel-header">
        <h2>SkillBot (AI)</h2>
        <span className="panel-chip">
          {remaining > 0
            ? `${remaining} message${remaining === 1 ? "" : "s"} left`
            : "Limit reached"}
        </span>
      </div>
      <p className="panel-text">
        Ye AI based helper hai. Kabhi-kabhi galat bhi ho sakta hai, isliye
        serious issues ke liye support form bhi bharo.
      </p>

      <div className="chat-window">
        {chatMessages.map((m) => (
          <div
            key={m.id}
            className={
              "chat-bubble " +
              (m.from === "user" ? "chat-bubble-user" : "chat-bubble-bot")
            }
          >
            <p className="chat-text">{m.text}</p>
            <span className="chat-time">{m.time}</span>
          </div>
        ))}

        {isBotTyping && (
          <div className="chat-bubble chat-bubble-bot">
            <p className="chat-text">SkillBot is thinking...</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="chat-input-row">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder={
            inputDisabled
              ? "Message limit finished. Please use the support form."
              : "Type your question here..."
          }
          disabled={inputDisabled}
        />
        <button type="submit" disabled={inputDisabled || !chatInput.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

/* ------------- Support tab ------------- */

function SupportTab({
  supportMessage,
  setSupportMessage,
  handleSupportSubmit,
  supportList,
}) {
  return (
    <div className="grid-2-1 gap-24 fade-in-up">
      <ChatbotPanel />

      <div className="panel">
        <div className="panel-header">
          <h2>Contact support</h2>
          <span className="panel-chip">Support form</span>
        </div>
        <p className="panel-text">
          If the chatbot doesn&apos;t fix your problem, write your full issue
          here: course name, order ID, phone/email, and what exactly went wrong.
        </p>
        <form onSubmit={handleSupportSubmit} className="support-form">
          <textarea
            rows="5"
            placeholder="Write your message here..."
            value={supportMessage}
            onChange={(e) => setSupportMessage(e.target.value)}
          />
          <button type="submit" className="primary-btn">
            Submit ticket
          </button>
        </form>

        <h2 style={{ marginTop: "14px", fontSize: "15px" }}>Your tickets</h2>
        {supportList.length === 0 ? (
          <p className="panel-text">No support tickets yet.</p>
        ) : (
          <ul className="ticket-list">
            {supportList.map((t) => (
              <li key={t.id} className="ticket-item">
                <div>
                  <p className="ticket-text">{t.text}</p>
                  <p className="ticket-meta">
                    {t.created_at
                      ? new Date(t.created_at).toLocaleString()
                      : "Just now"}
                  </p>
                </div>
                <span className="ticket-status">{t.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;
