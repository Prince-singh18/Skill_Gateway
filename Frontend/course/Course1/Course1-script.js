// === Accordion Functionality ===
function setupAccordion() {
  // Selects all elements with the class 'accordion-title'
  document.querySelectorAll(".accordion-title").forEach((title) => {
    // Attach a click event listener to each title
    title.addEventListener("click", () => {
      // The parent element is the .accordion-item
      const item = title.parentElement;

      // Toggle the 'active' class on the accordion item
      item.classList.toggle("active");

      // Find the arrow element within the title
      const arrow = title.querySelector(".arrow");

      if (arrow) {
        // Update the arrow text based on the 'active' state
        if (item.classList.contains("active")) {
          arrow.textContent = "Collapse ▲";
        } else {
          arrow.textContent = "Expand ▼";
        }
      }
    });
  });
}

// === Floating Buttons Visibility (Intersection Observer) ===
function setupFloatingButtons() {
  const placedSection = document.querySelector(".placed-section");
  const buttonsContainer = document.querySelector(".buttons-container");

  // Only proceed if both elements exist
  if (!placedSection || !buttonsContainer) {
    return;
  }

  // Create an Intersection Observer instance
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // If the placedSection is visible (intersecting)
        if (entry.isIntersecting) {
          // Show the floating buttons by adding the 'show' class
          buttonsContainer.classList.add("show");
        } else {
          // Hide the floating buttons
          buttonsContainer.classList.remove("show");
        }
      });
    },
    {
      // The buttons will appear when 50% of the placed-section is visible
      threshold: 0.5,
      // Use the document's viewport as the root element (default behavior)
    }
  );

  // Start observing the placedSection element
  observer.observe(placedSection);
}

// === Initialization ===
// Run all setup functions once the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  setupAccordion();
  setupFloatingButtons();
});
