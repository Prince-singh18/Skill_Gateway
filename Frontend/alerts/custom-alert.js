(function () {
  const overlay = document.getElementById("ps-alert-overlay");
  const boxMessage = document.getElementById("ps-alert-message");
  const boxTitle = document.getElementById("ps-alert-title");
  const okBtn = document.getElementById("ps-alert-btn");

  if (!overlay || !boxMessage || !okBtn) return;

  let resolveFn = null;

  function showCustomAlert(message, title = "Notification") {
    return new Promise((resolve) => {
      resolveFn = resolve;
      boxTitle.textContent = title;
      boxMessage.textContent = message;
      overlay.classList.remove("ps-alert-hidden");
      okBtn.focus();
    });
  }

  okBtn.addEventListener("click", () => {
    overlay.classList.add("ps-alert-hidden");
    if (resolveFn) resolveFn();
  });

  // Escape key se close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("ps-alert-hidden")) {
      overlay.classList.add("ps-alert-hidden");
      if (resolveFn) resolveFn();
    }
  });

  // 1) New function for manual use
  window.niceAlert = showCustomAlert;

  // 2) Override default window.alert so OLD code bhi yahi use kare
  const nativeAlert = window.alert;
  window.alert = function (msg) {
    // Agar kisi reason se fail ho jaye to normal alert
    if (!overlay) {
      nativeAlert(msg);
      return;
    }
    showCustomAlert(String(msg));
  };
})();
