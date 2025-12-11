// home-auth.js
// -----------------------------------
const BASE_URL = "http://localhost:5000";

// ✅ Login status + navbar + dropdown + logout
async function checkUser() {
  const authBtn = document.getElementById("auth-btn");
  const profileMenu = document.getElementById("profile-menu");
  const dropdownMenu = document.getElementById("dropdown-menu");
  const logoutBtn = document.getElementById("logout-btn");
  const profileIcon = document.getElementById("profile-icon");

  // 👉 Dropdown open/close – listener ONLY ONCE
  if (profileIcon && dropdownMenu) {
    profileIcon.addEventListener("click", () => {
      dropdownMenu.style.display =
        dropdownMenu.style.display === "flex" ? "none" : "flex";
    });
  }

  // 👉 Logout – listener ONLY ONCE
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch(`${BASE_URL}/logout`, {
          method: "GET",
          credentials: "include",
        });
      } catch (err) {
        console.error("Logout error", err);
      }

      // logout ke baad home page
      window.location.href = "http://localhost:5000/Frontend/course/home.html";
    });
  }

  try {
    const res = await fetch(`${BASE_URL}/api/me`, {
      credentials: "include",
      cache: "no-store",
    });

    const data = await res.json();

    if (res.ok && data && data.success && data.user) {
      // ✅ Logged in

      // Hide SIGNING button
      if (authBtn) authBtn.classList.add("hidden");

      // Show profile menu
      if (profileMenu) profileMenu.classList.remove("hidden");

      // Profile icon avatar
      if (profileIcon) {
        const backendAvatar = data.user.avatar;

        if (backendAvatar) {
          // backend ne avatar diya hai
          profileIcon.src = backendAvatar;
        } else {
          // warna localStorage se try karo (dashboard ne save kiya hoga)
          try {
            const lsAvatar = localStorage.getItem("skill_user_avatar");
            if (lsAvatar) {
              profileIcon.src = lsAvatar;
            }
          } catch (e) {
            console.warn("localStorage read error", e);
          }
        }
      }
    } else {
      // ❌ Not logged in: profile hide, auth button show
      if (profileMenu) profileMenu.classList.add("hidden");
      if (authBtn) authBtn.classList.remove("hidden");
    }
  } catch (err) {
    console.log("User not logged in", err);
    if (profileMenu) profileMenu.classList.add("hidden");
    if (authBtn) authBtn.classList.remove("hidden");
  }
}

// ✅ Course View Details protection
function protectCourseViewDetails() {
  // yahi class tumhare cards me use ho rahi hai:
  // <div class="view-btn2">
  //   <a href="/Frontend/course/Course1/course1.html"> ...
  // </div>
  const protectedLinks = document.querySelectorAll(".view-btn2 a");

  protectedLinks.forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const targetUrl = link.getAttribute("href") || "#";

      try {
        const res = await fetch(`${BASE_URL}/api/me`, {
          credentials: "include",
          cache: "no-store",
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.user) {
            // ✅ user logged in -> allow navigation
            window.location.href = targetUrl;
            return;
          }
        }
      } catch (err) {
        console.error("Login check failed", err);
      }

      // ❌ yahan aaya matlab user login NHI hai
      showToast("Please login first to view course details.", "warning");
      window.location.href = "http://localhost:5000/login.html";
    });
  });
}

// 🔁 Run when page DOM ready
document.addEventListener("DOMContentLoaded", () => {
  checkUser();
  protectCourseViewDetails();
});
