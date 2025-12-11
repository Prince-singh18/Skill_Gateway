require("dotenv").config(); // Make sure .env is loaded first

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const fs = require("fs");
const multer = require("multer");
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const otpStore = new Map(); // email => { otp, expires }

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// Serve dashboard/admin folders if present (optional)
app.use("/dashboard", express.static(path.join(__dirname, "dashboard")));
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.use("/", express.static(path.join(__dirname, "Frontend")));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Serve complete Frontend folder
app.use(express.static(path.join(__dirname, "../Frontend")));
app.use("/Frontend", express.static(path.join(__dirname, "../Frontend")));

// ================== CORS (FIXED) ==================
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("❌ BLOCKED BY CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ================== SESSION SETUP ==================
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default-fallback-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// ================== MIDDLEWARE ==================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(passport.session());
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// root se static serve
app.use(express.static(path.join(__dirname, "../Frontend")));

// ================== BILLING PAGE ROUTE ==================
app.get("/Billing/billing.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/Billing/billing.html"));
});

// ================== MYSQL SETUP ==================
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "8982809968#", // Be careful in production
  database: process.env.DB_NAME || "portfolio_db",
  port: process.env.DB_PORT || 3307,
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL connection error:", err.message);
    process.exit(1);
  }
  console.log("✅ Connected to MySQL database!");
});

// Promise-based helper for async/await queries
const dbPromise = db.promise();

// ================== HELPER: ORDER ID GENERATOR ==================
function generateOrderId() {
  return "ORD-" + Date.now() + "-" + Math.floor(1000 + Math.random() * 9000);
}

// ================== PASSPORT (SESSION) SETUP ==================
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// ================== GOOGLE STRATEGY ==================
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:5000/auth/google/callback",
    },
    (accessToken, refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value || "";
      const username = profile.displayName || `GoogleUser_${profile.id}`;
      const provider = "google";

      if (!email) {
        return done(new Error("No email from Google"), null);
      }

      const sqlCheck = "SELECT * FROM users WHERE email = ? AND provider = ?";
      db.query(sqlCheck, [email, provider], (err, results) => {
        if (err) return done(err);

        if (results.length > 0) {
          return done(null, results[0]);
        }

        const insertSql =
          "INSERT INTO users (username, email, provider) VALUES (?, ?, ?)";
        db.query(insertSql, [username, email, provider], (err2, result) => {
          if (err2) return done(err2);
          const newUser = {
            id: result.insertId,
            username,
            email,
            provider,
          };
          return done(null, newUser);
        });
      });
    }
  )
);

// ================== JWT MIDDLEWARE (ADMIN) ==================
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(403).json({ message: "No token provided" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

// ================== SESSION AUTH (USER) ==================
function requireUserLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.user) {
    req.session.user = req.user;
    return next();
  }
  return res.status(401).json({ message: "Not logged in" });
}

// ================== SIMPLE ADMIN USER ==================
const ADMIN = {
  username: "admin",
  password: bcrypt.hashSync("Prince890", 10), // Hashed password
};

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN.username)
    return res.status(401).json({ message: "Invalid username" });

  const isValid = await bcrypt.compare(password, ADMIN.password);
  if (!isValid) return res.status(401).json({ message: "Invalid password" });

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});

// ================== ADMIN MESSAGES ==================
app.get("/admin/messages", verifyToken, (req, res) => {
  db.query("SELECT * FROM contacts ORDER BY id DESC", (err, results) => {
    if (err) {
      console.error("❌ DB Error fetching messages:", err);
      return res.status(500).json({ message: "DB Error" });
    }
    res.json(results);
  });
});

// ================== ADMIN PROJECTS ==================
app.get("/admin/projects", verifyToken, (req, res) => {
  const sql = "SELECT * FROM projects ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ DB Error fetching projects:", err);
      return res.status(500).json({ message: "DB Error fetching projects" });
    }
    res.json(results);
  });
});

// ================== CONTACT FORM ==================
app.post("/contact", (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  const sql =
    "INSERT INTO contacts (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)";
  db.query(sql, [name, email, phone, subject, message], (err) => {
    if (err) {
      console.error("❌ Error submitting contact form:", err);
      return res.status(500).json({ message: "Server Error" });
    }
    res.json({ message: "✅ Message received!" });
  });
});

// ================== AUTH PAGES (SESSION-BASED) ==================
app.get("/login.html", (req, res) => {
  if (req.session.user) {
    return res.redirect("http://localhost:5173/");
  }
  res.sendFile(path.join(__dirname, "../Frontend/login/login.html"));
});

// ================== EMAIL + PASSWORD LOGIN ==================
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.error("❌ Login DB query error:", err);
      return res.status(500).json({ message: "Server error during login" });
    }
    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ message: "Invalid email or password" });

    req.session.user = user;
    try {
      logActivity(user.id, "Logged in via email/password");
    } catch (e) {
      console.error("logActivity error (ignored):", e);
    }

    res.json({ success: true, redirect: "http://localhost:5173/" });
  });
});

// ================== REGISTER (EMAIL + PASSWORD) ==================
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const created_at = new Date();
  const sql =
    "INSERT INTO users (username, email, password, created_at) VALUES (?, ?, ?, ?)";

  db.query(sql, [username, email, hashedPassword, created_at], (err) => {
    if (err) {
      console.error("❌ Register error:", err);
      if (err.code === "ER_DUP_ENTRY") {
        return res
          .status(409)
          .json({ message: "User with this email already exists." });
      }
      return res
        .status(500)
        .json({ message: "Server error during registration" });
    }
    res.status(201).json({
      success: true,
      message: "Registration successful! Please login.",
    });
  });
});

// Disallow GET /register
app.get("/register", (req, res) => {
  res.status(405).json({ message: "GET not allowed on /register" });
});

// ================== LOGOUT ==================
app.get("/logout", (req, res) => {
  const userId = req.session.user?.id;

  if (userId) {
    try {
      logActivity(userId, "Logged out");
    } catch (e) {
      console.error("logActivity error (ignored):", e);
    }
  }

  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});

// ================== PHONE LOGIN / REGISTER ==================
app.post("/phone-login", (req, res) => {
  const { phone } = req.body;
  const username = `PhoneUser_${phone?.slice(-4) || "user"}`;

  console.log("📞 Received phone login for:", phone);

  if (!phone) {
    console.error("❌ No phone number received");
    return res.status(400).json({ message: "Phone number is required" });
  }

  db.query("SELECT * FROM users WHERE phone = ?", [phone], (err, results) => {
    if (err) {
      console.error("❌ SELECT error:", err.sqlMessage || err.message);
      return res
        .status(500)
        .json({ message: "DB error (SELECT)", error: err.sqlMessage });
    }

    if (results.length > 0) {
      console.log("✅ Existing user found:", results[0].username);
      req.session.user = results[0];
      return res.json({ success: true, message: "User logged in via phone" });
    }

    const insertSql =
      "INSERT INTO users (username, phone, provider) VALUES (?, ?, ?)";
    db.query(insertSql, [username, phone, "phone"], (err2, result) => {
      if (err2) {
        console.error("❌ INSERT FAILED:", err2.sqlMessage || err2.message);
        return res.status(500).json({
          message: "DB INSERT error",
          sqlError: err2.sqlMessage || err2.message,
        });
      }

      console.log("✅ Inserted phone user:", username);
      req.session.user = {
        id: result.insertId,
        username,
        phone,
        provider: "phone",
      };
      res.json({ success: true, message: "New user registered via phone" });
    });
  });
});

// ================== GOOGLE AUTH ROUTES ==================
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login.html" }),
  (req, res) => {
    req.session.user = req.user;
    res.redirect("http://localhost:5173/");
  }
);

// ================== UPLOAD FOLDER SETUP (PROJECTS + AVATARS) ==================
const uploadsRoot = path.join(__dirname, "uploads");
const projectsDir = path.join(uploadsRoot, "projects");
const avatarsDir = path.join(uploadsRoot, "avatars");

fs.mkdirSync(projectsDir, { recursive: true });
fs.mkdirSync(avatarsDir, { recursive: true });

// Serve all uploads (projects + avatars)
app.use("/uploads", express.static(uploadsRoot));

// ================== PROJECT FILE UPLOAD (multer) ==================
const projectStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, projectsDir); // Backend/uploads/projects
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const projectUpload = multer({
  storage: projectStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: function (req, file, cb) {
    const allowedExt = [".zip", ".pdf", ".ppt", ".pptx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.includes(ext)) {
      return cb(new Error("Only ZIP, PDF, PPT, PPTX files are allowed"));
    }
    cb(null, true);
  },
});

// ================== PROJECT SUBMIT API ==================
app.post("/api/projects", projectUpload.single("file"), (req, res) => {
  try {
    const { name, email, title, category, github, description } = req.body;
    const file = req.file;

    if (!name || !email || !title || !category) {
      return res
        .status(400)
        .json({ error: "Please fill all required fields." });
    }

    if (!file) {
      return res.status(400).json({ error: "Project file is required." });
    }

    const filePath = `/uploads/projects/${file.filename}`;

    const sql = `
      INSERT INTO projects 
      (name, email, title, category, github, description, file_name, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      name,
      email,
      title,
      category,
      github || null,
      description || null,
      file.filename,
      filePath,
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("Insert error:", err);
        return res
          .status(500)
          .json({ error: "Database error while saving project." });
      }

      return res.json({
        message: "Project submitted successfully!",
        projectId: result.insertId,
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error occurred." });
  }
});

// ================== SUPPORT BACKEND ==================
app.post("/api/support", (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const sql = `
    INSERT INTO support_messages (name, email, message, source_page)
    VALUES (?, ?, ?, ?)
  `;

  db.query(
    sql,
    [name, email, message, "support_help_center"],
    (err, result) => {
      if (err) {
        console.error("❌ Error saving support message:", err);
        return res
          .status(500)
          .json({ error: "Server error while saving support message." });
      }

      return res.status(201).json({
        message: "Support message received. We'll contact you soon.",
        id: result.insertId,
      });
    }
  );
});

// Admin: Get all support messages
app.get("/admin/support", verifyToken, (req, res) => {
  const sql = "SELECT * FROM support_messages ORDER BY id DESC";

  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ DB Error fetching support messages:", err);
      return res
        .status(500)
        .json({ message: "DB Error fetching support messages" });
    }
    res.json(results);
  });
});

// ================== PAYMENT REQUEST (UPI QR FLOW) ==================
// ✅ Payment request – ab user ke session se linked
app.post("/api/payments/create", requireUserLogin, (req, res) => {
  const userId = req.session.user.id; // logged-in user
  const { fullName, phone, email, courseTitle, courseId, amount, utr } =
    req.body;

  if (!fullName || !phone || !email || !courseTitle || !amount || !utr) {
    return res.status(400).json({
      success: false,
      message: "All fields are required",
    });
  }

  const orderId = generateOrderId();

  const sql = `
    INSERT INTO payment_requests 
      (order_id, user_id, full_name, phone, email, course_title, course_id, amount, utr) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      orderId,
      userId,
      fullName,
      phone,
      email,
      courseTitle,
      courseId || null,
      amount,
      utr,
    ],
    (err) => {
      if (err) {
        console.error("❌ Error saving payment request:", err);
        return res.status(500).json({
          success: false,
          message: "Server error, please try again later",
        });
      }

      // activity trace
      try {
        logActivity(
          userId,
          `Started payment request for "${courseTitle}" (Order ${orderId})`
        );
      } catch (e) {
        console.error("logActivity error (ignored):", e);
      }

      return res.json({
        success: true,
        message:
          "Payment details submitted successfully. We will verify and activate your course soon.",
        orderId,
      });
    }
  );
});

// ================== ADMIN: PAYMENTS LIST ==================
app.get("/admin/payments", verifyToken, (req, res) => {
  const sql = "SELECT * FROM payment_requests ORDER BY created_at DESC";

  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ DB Error fetching payments:", err);
      return res.status(500).json({ message: "DB Error fetching payments" });
    }
    res.json(results);
  });
});

// ================== ADMIN: UPDATE PAYMENT STATUS ==================
app.post("/admin/payments/update-status", verifyToken, async (req, res) => {
  const { id, status } = req.body;

  const allowed = ["PENDING", "APPROVED", "REJECTED"];
  if (!allowed.includes(status)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid status value" });
  }

  try {
    // 1) Pehle payment_request row nikaalo
    const [reqRows] = await dbPromise.query(
      "SELECT * FROM payment_requests WHERE id = ?",
      [id]
    );

    if (!reqRows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Payment request not found" });
    }

    const request = reqRows[0];

    // 2) payment_requests me status update
    await dbPromise.query(
      "UPDATE payment_requests SET status = ? WHERE id = ?",
      [status, id]
    );

    // 3) userId nikalne ka common part
    let userId = request.user_id;

    if (!userId && request.email) {
      const [userRows] = await dbPromise.query(
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [request.email]
      );
      if (userRows.length) {
        userId = userRows[0].id;
      }
    }

    // ---------- REJECTED CASE ----------
    if (status === "REJECTED") {
      if (userId) {
        await dbPromise.query(
          `INSERT INTO notifications (user_id, message, is_read)
           VALUES (?, ?, 0)`,
          [
            userId,
            `Your payment for "${request.course_title}" was rejected. Please re-check the UTR / transaction ID or contact support.`,
          ]
        );

        try {
          logActivity(
            userId,
            `Payment for "${request.course_title}" was rejected`
          );
        } catch (e) {
          console.error("logActivity error (ignored):", e);
        }
      }

      return res.json({
        success: true,
        message: "Payment marked as REJECTED",
      });
    }

    // ---------- PENDING / OTHER CASE ----------
    if (status !== "APPROVED") {
      return res.json({
        success: true,
        message: `Payment marked as ${status}`,
      });
    }

    // ---------- APPROVED CASE (purana flow same rahe) ----------
    // Course detect: pehle course_id, warna title se
    let courseId = request.course_id;

    if (!courseId) {
      const [courseRows] = await dbPromise.query(
        "SELECT id FROM courses WHERE title = ? LIMIT 1",
        [request.course_title]
      );
      if (courseRows.length) {
        courseId = courseRows[0].id;
      }
    }

    if (!courseId) {
      console.warn(
        "Approved payment but no course found for title:",
        request.course_title
      );
      return res.json({
        success: true,
        message:
          "Payment approved, but course not found by title. Please map manually.",
      });
    }

    const amount = request.amount || 0;
    const utr = request.utr || null;

    await dbPromise.query(
      `INSERT INTO payments 
         (user_id, course_id, amount, status, payment_method, transaction_id, payment_date)
       VALUES (?, ?, ?, 'SUCCESS', 'UPI', ?, NOW())`,
      [userId, courseId, amount, utr]
    );

    await dbPromise.query(
      `INSERT INTO enrollments (user_id, course_id, progress, status, enrolled_at)
       SELECT ?, ?, 0, 'active', NOW()
       FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM enrollments 
         WHERE user_id = ? AND course_id = ?
       )`,
      [userId, courseId, userId, courseId]
    );

    await dbPromise.query(
      `INSERT INTO notifications (user_id, message, is_read)
       VALUES (?, ?, 0)`,
      [
        userId,
        `Your payment for "${request.course_title}" has been approved. Course is now unlocked in your dashboard.`,
      ]
    );

    try {
      logActivity(
        userId,
        `Payment approved and enrolled in course "${request.course_title}"`
      );
    } catch (e) {
      console.error("logActivity error (ignored):", e);
    }

    return res.json({
      success: true,
      message: "Payment approved, course activated for the user.",
    });
  } catch (err) {
    console.error("❌ Error updating payment status:", err);
    return res.status(500).json({
      success: false,
      message: "DB Error while updating payment status",
    });
  }
});

// ================== AVATAR UPLOAD SETUP ==================
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarsDir);
  },
  filename: (req, file, cb) => {
    const userId = req.session.user?.id || "guest";
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `user-${userId}-${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// ================== USER DASHBOARD APIs ==================

// 1) Profile
app.get("/api/dashboard/profile", requireUserLogin, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [rows] = await dbPromise.query(
      "SELECT id, username, email, phone, created_at, avatar FROM users WHERE id = ?",
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];

    let avatarUrl = null;
    if (user.avatar) {
      avatarUrl = user.avatar.startsWith("http")
        ? user.avatar
        : `http://localhost:5000${user.avatar}`;
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at,
      avatar: avatarUrl,
    });
  } catch (err) {
    console.error("❌ /api/dashboard/profile error:", err);
    res.status(500).json({ message: "Error fetching profile" });
  }
});

// 1b) Profile update
app.put("/api/dashboard/profile", requireUserLogin, async (req, res) => {
  const userId = req.session.user.id;
  const { username, phone } = req.body;

  try {
    await dbPromise.query(
      "UPDATE users SET username = ?, phone = ? WHERE id = ?",
      [username || null, phone || null, userId]
    );

    req.session.user.username = username || req.session.user.username;
    req.session.user.phone = phone || req.session.user.phone;

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("❌ /api/dashboard/profile PUT error:", err);
    res.status(500).json({ message: "Error updating profile" });
  }
});

// 2) Overview cards data
app.get("/api/dashboard/overview", requireUserLogin, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [courseRows] = await dbPromise.query(
      "SELECT COUNT(DISTINCT course_id) AS total_courses FROM enrollments WHERE user_id = ?",
      [userId]
    );

    const [certRows] = await dbPromise.query(
      "SELECT COUNT(*) AS certificates FROM certificates WHERE user_id = ?",
      [userId]
    );

    const [pendingRows] = await dbPromise.query(
      "SELECT COUNT(*) AS pending_payments FROM payments WHERE user_id = ? AND status = 'pending'",
      [userId]
    );

    res.json({
      total_courses: courseRows[0]?.total_courses || 0,
      hours_learned: 0,
      certificates: certRows[0]?.certificates || 0,
      pending_payments: pendingRows[0]?.pending_payments || 0,
    });
  } catch (err) {
    console.error("❌ /api/dashboard/overview error:", err);
    res.status(500).json({ message: "Error fetching overview data" });
  }
});

// 3) Courses list
app.get("/api/dashboard/courses", requireUserLogin, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [rows] = await dbPromise.query(
      `SELECT 
         e.id AS enrollment_id,
         c.id AS course_id,
         c.title,
         c.description,
         c.level,
         e.progress,
         e.last_lesson,
         e.status,
         e.enrolled_at
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = ?
       ORDER BY e.enrolled_at DESC`,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ /api/dashboard/courses error:", err);
    res.status(500).json({ message: "Error fetching courses" });
  }
});

// 4) Payment history
app.get("/api/dashboard/payments", requireUserLogin, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [rows] = await dbPromise.query(
      `SELECT 
         p.id,
         p.amount,
         p.payment_method,
         p.status,
         p.transaction_id,
         p.payment_date,
         c.title AS course_title
       FROM payments p
       JOIN courses c ON p.course_id = c.id
       WHERE p.user_id = ?
       ORDER BY p.payment_date DESC`,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ /api/dashboard/payments error:", err);
    res.status(500).json({ message: "Error fetching payments" });
  }
});

// 5) Support tickets (list)
app.get(
  "/api/dashboard/support-tickets",
  requireUserLogin,
  async (req, res) => {
    const userId = req.session.user.id;

    try {
      const [rows] = await dbPromise.query(
        `SELECT id, subject, message, status, created_at, updated_at
         FROM support_tickets
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [userId]
      );

      res.json(rows);
    } catch (err) {
      console.error("❌ /api/dashboard/support-tickets GET error:", err);
      res.status(500).json({ message: "Error fetching support tickets" });
    }
  }
);

// 6) Create support ticket
app.post(
  "/api/dashboard/support-tickets",
  requireUserLogin,
  async (req, res) => {
    const userId = req.session.user.id;
    const { subject, message } = req.body;

    if (!message) {
      return res
        .status(400)
        .json({ message: "Message is required for support ticket" });
    }

    const finalSubject = subject || "General issue";

    try {
      await dbPromise.query(
        `INSERT INTO support_tickets (user_id, subject, message)
         VALUES (?, ?, ?)`,
        [userId, finalSubject, message]
      );

      res.status(201).json({ message: "Support ticket created successfully" });
    } catch (err) {
      console.error("❌ /api/dashboard/support-tickets POST error:", err);
      res.status(500).json({ message: "Error creating support ticket" });
    }
  }
);

// NOTE: Old activity API removed here – we use user_activity system below.

// ================== SIMPLE "WHO AM I" API FOR HOME PAGE ==================
app.get("/api/me", (req, res) => {
  const user = req.session.user;

  if (!user || !user.id) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  const sql = "SELECT id, username, email, avatar FROM users WHERE id = ?";
  db.query(sql, [user.id], (err, rows) => {
    if (err) {
      console.error("api/me DB error:", err);
      return res
        .status(500)
        .json({ success: false, message: "DB error", user: null });
    }

    if (!rows || rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found", user: null });
    }

    const u = rows[0];

    let avatarUrl = null;
    if (u.avatar) {
      avatarUrl = u.avatar.startsWith("http")
        ? u.avatar
        : `http://localhost:5000${u.avatar}`;
    } else {
      const username = u.username || "User";
      avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
        username
      )}&background=111827&color=fff`;
    }

    res.json({
      success: true,
      user: {
        id: u.id,
        username: u.username,
        email: u.email,
        avatar: avatarUrl,
      },
    });
  });
});

// ================== ROOT ROUTE ==================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/portfolio/index.html"));
});

// ================== UPDATE AVATAR (from dashboard) ==================
app.post(
  "/api/dashboard/avatar",
  requireUserLogin,
  avatarUpload.single("avatar"),
  (req, res) => {
    try {
      const userId = req.session.user.id;

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }

      const avatarPath = `/uploads/avatars/${req.file.filename}`;

      const sql = "UPDATE users SET avatar = ? WHERE id = ?";
      db.query(sql, [avatarPath, userId], (err) => {
        if (err) {
          console.error("Avatar update DB error:", err);
          return res
            .status(500)
            .json({ success: false, message: "DB error updating avatar" });
        }

        req.session.user.avatar = avatarPath;

        return res.json({
          success: true,
          avatar_url: avatarPath,
        });
      });
    } catch (e) {
      console.error("Avatar upload error:", e);
      res
        .status(500)
        .json({ success: false, message: "Server error uploading avatar" });
    }
  }
);

//////////////////  Ai bot ///////////////////////////

// 🔵 AI SkillBot route
app.post("/api/ai/skillbot", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "message required",
        reply: "Please type your message.",
      });
    }

    // history safe bana lo
    const safeHistory = Array.isArray(history) ? history : [];

    const messages = [
      {
        role: "system",
        content:
          "You are SkillBot, a friendly AI support assistant for the Skill Gateway course platform. " +
          "Answer in short, clear sentences. You can use simple Hinglish. " +
          "Help with payment issues, login/OTP/password, course access, certificates. " +
          "If kuch bhi account-specific lagta hai, user ko bolo ki right side wala support form bhi fill kare.",
      },
      ...safeHistory,
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini", // yahi use karo
      messages,
      temperature: 0.6,
      max_tokens: 200,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim();

    // agar kisi reason se reply empty aa jaye
    if (!reply) {
      return res.status(500).json({
        error: "no_reply",
        reply:
          "Abhi mujhe proper reply generate nahi hua 😅. Thodi der baad fir try karo ya support form use karo.",
      });
    }

    return res.json({ reply });
  } catch (err) {
    console.error(
      "SkillBot AI error:",
      err.response?.data || err.message || err
    );

    return res.status(500).json({
      error: "ai_error",
      reply:
        "Abhi AI se connect karne me problem aa rahi hai 😅. Please thodi der baad try karo ya right side wala support form use karo.",
    });
  }
});

// ================== USER ACTIVITY SYSTEM ==================
app.get("/api/dashboard/activity", requireUserLogin, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [rows] = await dbPromise.query(
      `SELECT action AS text, 
              DATE_FORMAT(created_at, '%d %b, %h:%i %p') AS time
       FROM user_activity 
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Activity fetch error:", err);
    res.status(500).json({ message: "Error loading activity" });
  }
});

// Helper to log activity
function logActivity(userId, action) {
  db.query(
    "INSERT INTO user_activity (user_id, action) VALUES (?, ?)",
    [userId, action],
    (err) => {
      if (err) console.error("Activity log error:", err);
    }
  );
}

// ================== DASHBOARD SUPPORT TICKETS (ALT FORMAT) ==================
app.post(
  "/api/dashboard/support-tickets-alt",
  requireUserLogin,
  async (req, res) => {
    const userId = req.session.user.id;
    const { subject, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    try {
      await dbPromise.query(
        "INSERT INTO support_tickets (user_id, subject, message) VALUES (?, ?, ?)",
        [userId, subject || "General", message]
      );

      logActivity(userId, "Submitted a support ticket");

      res.json({ success: true, message: "Ticket submitted" });
    } catch (err) {
      console.error("❌ Support ticket error:", err);
      res.status(500).json({ error: "Ticket submit failed" });
    }
  }
);

app.get(
  "/api/dashboard/support-tickets-alt",
  requireUserLogin,
  async (req, res) => {
    const userId = req.session.user.id;

    try {
      const [rows] = await dbPromise.query(
        `SELECT id, message, status, 
              DATE_FORMAT(created_at, '%d %b, %h:%i %p') AS created_at
       FROM support_tickets 
       WHERE user_id = ?
       ORDER BY created_at DESC`,
        [userId]
      );

      res.json(rows);
    } catch (err) {
      console.error("❌ Support tickets fetch error:", err);
      res.status(500).json({ error: "Error loading support tickets" });
    }
  }
);

// ================== USER NOTIFICATIONS ==================
app.get("/api/dashboard/notifications", requireUserLogin, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [rows] = await dbPromise.query(
      `SELECT id, message, is_read,
              DATE_FORMAT(created_at, '%d %b, %h:%i %p') AS time
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Notification fetch error:", err);
    res.status(500).json({ message: "Error loading notifications" });
  }
});

app.post(
  "/api/dashboard/notifications/read",
  requireUserLogin,
  async (req, res) => {
    const userId = req.session.user.id;

    try {
      await dbPromise.query(
        "UPDATE notifications SET is_read = 1 WHERE user_id = ?",
        [userId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("❌ Notification read error:", err);
      res.status(500).json({ message: "Error marking notifications as read" });
    }
  }
);

// ================== COURSE PLAYER: OUTLINE ==================
app.get(
  "/api/dashboard/courses/:courseId/outline",
  requireUserLogin,
  async (req, res) => {
    const userId = req.session.user.id;
    const courseId = parseInt(req.params.courseId, 10);

    if (!courseId) {
      return res.status(400).json({ message: "Invalid course id" });
    }

    try {
      // ✅ Check: kya user is course me enrolled hai?
      const [enrollRows] = await dbPromise.query(
        "SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1",
        [userId, courseId]
      );

      if (!enrollRows.length) {
        return res
          .status(403)
          .json({ message: "You are not enrolled in this course" });
      }

      // Course info
      const [courseRows] = await dbPromise.query(
        "SELECT id, title, description, level FROM courses WHERE id = ?",
        [courseId]
      );
      if (!courseRows.length) {
        return res.status(404).json({ message: "Course not found" });
      }

      // Sections + lessons
      const [rows] = await dbPromise.query(
        `SELECT 
           s.id AS section_id,
           s.title AS section_title,
           s.sort_order AS section_order,
           l.id AS lesson_id,
           l.title AS lesson_title,
           l.duration_seconds,
           l.sort_order AS lesson_order
         FROM course_sections s
         LEFT JOIN lessons l 
           ON l.section_id = s.id
         WHERE s.course_id = ?
         ORDER BY s.sort_order ASC, l.sort_order ASC`,
        [courseId]
      );

      // User ke complete lessons
      const [progressRows] = await dbPromise.query(
        `SELECT lesson_id, is_completed 
         FROM lesson_progress 
         WHERE user_id = ?`,
        [userId]
      );

      const completedMap = {};
      progressRows.forEach((p) => {
        completedMap[p.lesson_id] = !!p.is_completed;
      });

      // Group by sections
      const sectionsMap = {};
      rows.forEach((r) => {
        if (!sectionsMap[r.section_id]) {
          sectionsMap[r.section_id] = {
            id: r.section_id,
            title: r.section_title,
            order: r.section_order,
            lessons: [],
          };
        }
        if (r.lesson_id) {
          sectionsMap[r.section_id].lessons.push({
            id: r.lesson_id,
            title: r.lesson_title,
            duration_seconds: r.duration_seconds,
            order: r.lesson_order,
            isCompleted: !!completedMap[r.lesson_id],
          });
        }
      });

      const sections = Object.values(sectionsMap).sort(
        (a, b) => a.order - b.order
      );

      // First playable lesson
      let firstLessonId = null;
      for (const sec of sections) {
        if (sec.lessons.length) {
          firstLessonId = sec.lessons[0].id;
          break;
        }
      }

      return res.json({
        course: courseRows[0],
        sections,
        firstLessonId,
      });
    } catch (err) {
      console.error("❌ /api/dashboard/courses/:courseId/outline error:", err);
      res.status(500).json({ message: "Error loading course outline" });
    }
  }
);

// --------------------------------------------
// ✅ FIXED CHECK PURCHASE API
// --------------------------------------------
app.get("/api/check-purchase/:courseId", (req, res) => {
  const userId = req.session?.user?.id || req.user?.id || null;
  const courseId = parseInt(req.params.courseId, 10);

  // Agar courseId hi galat hai
  if (!courseId) {
    return res.json({ purchased: false });
  }

  // User logged in nahi hai → purchased: false
  if (!userId) {
    return res.json({ purchased: false });
  }

  const sql = `
    SELECT id 
    FROM enrollments
    WHERE user_id = ? 
      AND course_id = ? 
      AND status IN ('active', 'completed')
    LIMIT 1
  `;

  db.query(sql, [userId, courseId], (err, rows) => {
    if (err) {
      console.log("Purchase check error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (rows.length > 0) {
      return res.json({ purchased: true });
    }

    return res.json({ purchased: false });
  });
});

// ================== COURSE PLAYER: LESSON DETAIL ==================
app.get(
  "/api/dashboard/lessons/:lessonId",
  requireUserLogin,
  async (req, res) => {
    const userId = req.session.user.id;
    const lessonId = parseInt(req.params.lessonId, 10);

    if (!lessonId) {
      return res.status(400).json({ message: "Invalid lesson id" });
    }

    try {
      const [rows] = await dbPromise.query(
        `SELECT 
           l.id,
           l.title,
           l.video_url,
           l.duration_seconds,
           l.course_id,
           c.title AS course_title
         FROM lessons l
         JOIN courses c ON c.id = l.course_id
         WHERE l.id = ?`,
        [lessonId]
      );

      if (!rows.length) {
        return res.status(404).json({ message: "Lesson not found" });
      }

      const lesson = rows[0];

      // Check enrollment
      const [enrollRows] = await dbPromise.query(
        "SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1",
        [userId, lesson.course_id]
      );

      if (!enrollRows.length) {
        return res
          .status(403)
          .json({ message: "You are not enrolled in this course" });
      }

      res.json(lesson);
    } catch (err) {
      console.error("❌ /api/dashboard/lessons/:lessonId error:", err);
      res.status(500).json({ message: "Error loading lesson" });
    }
  }
);

// ================== COURSE PLAYER: LESSON PROGRESS UPDATE ==================
app.post(
  "/api/dashboard/lessons/:lessonId/progress",
  requireUserLogin,
  async (req, res) => {
    const userId = req.session.user.id;
    const lessonId = parseInt(req.params.lessonId, 10);
    const { watchedSeconds, isCompleted } = req.body;

    if (!lessonId) {
      return res.status(400).json({ message: "Invalid lesson id" });
    }

    try {
      // Lesson + course info
      const [lessonRows] = await dbPromise.query(
        "SELECT id, course_id FROM lessons WHERE id = ?",
        [lessonId]
      );
      if (!lessonRows.length) {
        return res.status(404).json({ message: "Lesson not found" });
      }
      const courseId = lessonRows[0].course_id;

      // Enrollment check
      const [enrollRows] = await dbPromise.query(
        "SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1",
        [userId, courseId]
      );
      if (!enrollRows.length) {
        return res
          .status(403)
          .json({ message: "You are not enrolled in this course" });
      }
      const enrollmentId = enrollRows[0].id;

      // Progress row insert/update
      const [progRows] = await dbPromise.query(
        "SELECT id FROM lesson_progress WHERE user_id = ? AND lesson_id = ?",
        [userId, lessonId]
      );

      const completedFlag = isCompleted ? 1 : 0;
      const safeWatched = watchedSeconds || 0;

      if (!progRows.length) {
        await dbPromise.query(
          `INSERT INTO lesson_progress 
             (user_id, lesson_id, watched_seconds, is_completed)
           VALUES (?, ?, ?, ?)`,
          [userId, lessonId, safeWatched, completedFlag]
        );
      } else {
        await dbPromise.query(
          `UPDATE lesson_progress 
           SET watched_seconds = GREATEST(watched_seconds, ?),
               is_completed = GREATEST(is_completed, ?)
           WHERE user_id = ? AND lesson_id = ?`,
          [safeWatched, completedFlag, userId, lessonId]
        );
      }

      // Recalculate course progress
      const [[totalRow]] = await dbPromise.query(
        "SELECT COUNT(*) AS total_lessons FROM lessons WHERE course_id = ?",
        [courseId]
      );
      const totalLessons = totalRow.total_lessons || 0;

      let progressPercent = 0;
      if (totalLessons > 0) {
        const [[doneRow]] = await dbPromise.query(
          `SELECT COUNT(*) AS completed_lessons
           FROM lesson_progress 
           WHERE user_id = ? 
             AND is_completed = 1 
             AND lesson_id IN (SELECT id FROM lessons WHERE course_id = ?)`,
          [userId, courseId]
        );
        const completedLessons = doneRow.completed_lessons || 0;
        progressPercent = Math.round((completedLessons / totalLessons) * 100);
      }

      await dbPromise.query(
        `UPDATE enrollments
         SET progress = ?, 
             last_lesson = ?, 
             status = CASE WHEN ? >= 100 THEN 'completed' ELSE 'active' END
         WHERE id = ?`,
        [progressPercent, lessonId.toString(), progressPercent, enrollmentId]
      );

      try {
        logActivity(
          userId,
          `Updated progress in course ${courseId} (lesson ${lessonId})`
        );
      } catch (e) {
        console.error("logActivity error (ignored):", e);
      }

      res.json({ success: true, progress: progressPercent });
    } catch (err) {
      console.error("❌ lesson progress update error:", err);
      res.status(500).json({ message: "Error updating progress" });
    }
  }
);

// Route: POST /api/hire
app.post("/api/hire", async (req, res) => {
  try {
    const { name, email, phone, org, subject, message } = req.body;

    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, Email and Message are required.",
      });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    const sql = `
      INSERT INTO hire_requests (name, email, phone, org, subject, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [
      name,
      email,
      phone || null,
      org || null,
      subject || null,
      message,
    ];

    const [result] = await dbPromise.query(sql, params);

    return res.status(201).json({
      success: true,
      message: "Your request has been submitted successfully.",
      id: result.insertId,
    });
  } catch (err) {
    console.error("Error in /api/hire:", err);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
});
// Admin: Hire Us requests
app.get("/admin/hire-requests", verifyToken, (req, res) => {
  const sql = "SELECT * FROM hire_requests ORDER BY created_at DESC";

  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ DB Error fetching hire requests:", err);
      return res
        .status(500)
        .json({ message: "DB Error fetching hire requests" });
    }
    res.json(results);
  });
});

// ================== USER ACTIVITY SYSTEM ==================
app.get("/api/dashboard/activity", requireUserLogin, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [rows] = await dbPromise.query(
      `SELECT action AS text, 
              DATE_FORMAT(created_at, '%d %b, %h:%i %p') AS time
       FROM user_activity 
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Activity fetch error:", err);
    res.status(500).json({ message: "Error loading activity" });
  }
});

// Helper to log activity
function logActivity(userId, action) {
  db.query(
    "INSERT INTO user_activity (user_id, action) VALUES (?, ?)",
    [userId, action],
    (err) => {
      if (err) console.error("Activity log error:", err);
    }
  );
}

// ================== ADMIN: USER ACTIVITY (ALL USERS) ==================
app.get("/admin/user-activity", verifyToken, async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT 
          ua.id,
          ua.user_id,
          u.username,
          u.email,
          ua.action,
          ua.created_at,
          DATE_FORMAT(ua.created_at, '%d %b, %h:%i %p') AS time
       FROM user_activity ua
       LEFT JOIN users u ON ua.user_id = u.id
       ORDER BY ua.created_at DESC
       LIMIT 200`
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Admin user activity fetch error:", err);
    res.status(500).json({ message: "Error loading user activity for admin" });
  }
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
