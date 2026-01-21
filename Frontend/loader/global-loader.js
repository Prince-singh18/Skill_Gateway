// Real-time style: jaise hi page load complete, loader gayab
window.addEventListener("load", function () {
  const loader = document.getElementById("page-loader");
  if (!loader) return;

  // Agar thoda feel-good delay chahiye to 200–300ms ka timeout laga sakta hai
  loader.classList.add("hidden");
});

// Manual controls (agar API calls ke time use karna ho)
function showLoader() {
  const loader = document.getElementById("page-loader");
  if (!loader) return;
  loader.classList.remove("hidden");
}

function hideLoader() {
  const loader = document.getElementById("page-loader");
  if (!loader) return;
  loader.classList.add("hidden");
}
