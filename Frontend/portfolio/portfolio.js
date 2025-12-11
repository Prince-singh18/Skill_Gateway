// Select the Skills section
const skillsSection = document.querySelector("#skill");

// Function to animate skills
function animateSkills() {
  // Remove animation class to allow retriggering
  skillsSection.classList.remove("skills-animate");

  // Force reflow to reset animation
  void skillsSection.offsetWidth;

  // Re-add the class to trigger animation
  skillsSection.classList.add("skills-animate");
}

// 1. Scroll Trigger - Intersection Observer
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateSkills();
      }
    });
  },
  {
    threshold: 0.5, // Trigger when 50% of section is visible
  }
);

observer.observe(skillsSection);

// 2. Menu Click Trigger
document.querySelectorAll('a[href="#skill"]').forEach((link) => {
  link.addEventListener("click", () => {
    setTimeout(() => {
      animateSkills();
    }, 500); // Delay to allow scroll
  });
});

// NETWORK PARTICLE CONNECTION - THREE.JS
const netScene = new THREE.Scene();
const netCamera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
netCamera.position.z = 20;

const netRenderer = new THREE.WebGLRenderer({ alpha: true });
netRenderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("network-canvas").appendChild(netRenderer.domElement);

const PARTICLE_COUNT = 100;
const particles = [];
const lines = [];

const particleGeometry = new THREE.SphereGeometry(0.1, 16, 16);
const particleMaterial = new THREE.MeshBasicMaterial({ color: 0x00fff7 });

for (let i = 0; i < PARTICLE_COUNT; i++) {
  const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
  particle.position.set(
    THREE.MathUtils.randFloatSpread(30),
    THREE.MathUtils.randFloatSpread(20),
    THREE.MathUtils.randFloatSpread(15)
  );
  netScene.add(particle);
  particles.push(particle);
}

// Create line geometry placeholder
const lineMaterial = new THREE.LineBasicMaterial({
  color: 0x00fff7,
  transparent: true,
  opacity: 0.3,
});

function connectParticles() {
  lines.forEach((line) => netScene.remove(line));
  lines.length = 0;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    for (let j = i + 1; j < PARTICLE_COUNT; j++) {
      const p1 = particles[i].position;
      const p2 = particles[j].position;
      const dist = p1.distanceTo(p2);
      if (dist < 5) {
        const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const line = new THREE.Line(geometry, lineMaterial);
        netScene.add(line);
        lines.push(line);
      }
    }
  }
}

function animateNetwork() {
  requestAnimationFrame(animateNetwork);

  particles.forEach((p) => {
    p.position.x += Math.sin(Date.now() * 0.0009 + p.position.y) * 0.009;
    p.position.y += Math.cos(Date.now() * 0.0009 + p.position.x) * 0.009;
  });

  connectParticles();
  netRenderer.render(netScene, netCamera);
}
animateNetwork();

window.addEventListener("resize", () => {
  netCamera.aspect = window.innerWidth / window.innerHeight;
  netCamera.updateProjectionMatrix();
  netRenderer.setSize(window.innerWidth, window.innerHeight);
});

// GSAP Scroll Animation
gsap.registerPlugin(ScrollTrigger);
gsap.from("#network-canvas", {
  scrollTrigger: {
    trigger: ".network-graph",
    start: "top center",
    end: "bottom center",
    scrub: 1,
  },
  opacity: 0,
  scale: 0.9,
  ease: "power2.out",
});

// Continuous upward floating animation for timeline dots
gsap.utils.toArray(".timeline-dot").forEach((dot, index) => {
  const timeline = gsap.timeline({ repeat: -1 });

  timeline
    .fromTo(
      dot,
      { y: 0, opacity: 1 },
      {
        y: -40, // how far it floats upward
        opacity: 0.3, // fade out as it rises
        duration: 3, // control speed
        ease: "power1.inOut",
        delay: index * 0.5, // stagger effect
      }
    )
    .set(dot, { y: 0, opacity: 1 }); // reset to original position
});
document.getElementById("contactForm").addEventListener("submit", function (e) {
  e.preventDefault(); // prevent page reload

  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const phone = document.getElementById("phone").value;
  const subject = document.getElementById("subject").value;
  const message = document.getElementById("message").value;

  fetch("http://localhost:5000/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, phone, subject, message }),
  })
    .then((res) => res.text())
    .then((data) => {
      alert(data);

      // ✅ Clear the form fields after successful submission
      document.getElementById("contactForm").reset();
    })
    .catch((err) => console.error("Error:", err));
});
