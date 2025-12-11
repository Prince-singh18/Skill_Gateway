// 1. Get references to the button and the section
const watchThisButton = document.querySelector(".btn-signing-main");
const videoSection = document.getElementById("video-link-section");

// 2. Add the click event listener
if (watchThisButton && videoSection) {
  watchThisButton.addEventListener("click", function (event) {
    // Prevent the default anchor link behavior (i.e., instant jump)
    event.preventDefault();

    // Scroll smoothly to the video section
    videoSection.scrollIntoView({
      behavior: "smooth", // Makes the scroll animation smooth
    });
  });
}

// --- Code for 'Check the courses' Button ---

// 1. Get references to the button and the section
const checkCoursesButton = document.querySelector(".btn-get-started");
const coursesSection = document.getElementById("courses-section-link");

// 2. Add the click event listener
if (checkCoursesButton && coursesSection) {
  checkCoursesButton.addEventListener("click", function (event) {
    // Prevent the default anchor link behavior
    event.preventDefault();

    // Scroll smoothly to the courses section
    coursesSection.scrollIntoView({
      behavior: "smooth", // Makes the scroll animation smooth
    });
  });
}

// --- NAVBAR USER AVATAR + NAME + EMAIL ---

// --- NAVBAR USER AVATAR + NAME + EMAIL ---

// same circle image use karo jo header me hai
const avatarImg = document.getElementById("profile-icon");
const nameSpan = document.getElementById("nav-user-name");
const emailSpan = document.getElementById("nav-user-email");

try {
  const avatar = localStorage.getItem("skill_user_avatar");
  const name = localStorage.getItem("skill_user_name");
  const email = localStorage.getItem("skill_user_email");

  if (avatar && avatarImg) avatarImg.src = avatar;
  if (name && nameSpan) nameSpan.textContent = name;
  if (email && emailSpan) emailSpan.textContent = email;
} catch (e) {
  console.warn("localStorage read error", e);
}

const profileIcon = document.getElementById("profile-icon");

// inside if (res.ok && data && data.success && data.user) { ... }

if (profileIcon) {
  const backendAvatar = data.user.avatar; // ab full URL aa rahi hai

  if (backendAvatar) {
    profileIcon.src = backendAvatar;
  } else {
    // fallback (UI avatar ya kuch default)
    const lsAvatar = localStorage.getItem("skill_user_avatar");
    if (lsAvatar) profileIcon.src = lsAvatar;
  }
}
