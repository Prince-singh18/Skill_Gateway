const express = require("express");
const PDFDocument = require("pdfkit");
const mysql = require("mysql2/promise");

const router = express.Router();

/* ============= DB CONNECTION ============= */
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "8982809968#",
  database: process.env.DB_NAME || "portfolio_db",
  port: process.env.DB_PORT || 3307,
});

/* ============= AUTH MIDDLEWARE ============= */
const requireLogin = (req, res, next) => {
  if (!req.session || !req.session.user || !req.session.user.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = req.session.user;
  next();
};

/* ============= HELPERS ============= */
const formatCurrency = (amount) => {
  return `₹ ${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (date) => {
  const d = new Date(date);
  return d.toDateString(); // e.g. "Fri Dec 05 2025"
};

/* ============= DOWNLOAD INVOICE ============= */
router.get("/invoice/:paymentId", requireLogin, async (req, res) => {
  const userId = req.user.id;
  const paymentId = req.params.paymentId;

  try {
    const [rows] = await db.query(
      `
      SELECT 
        pr.id,
        pr.amount,
        pr.status,
        pr.created_at,
        pr.utr,
        pr.course_title,
        u.username,
        u.email
      FROM payment_requests pr
      INNER JOIN users u ON u.id = pr.user_id
      WHERE pr.id = ?
        AND pr.user_id = ?
        AND pr.status = 'APPROVED'
      LIMIT 1
      `,
      [paymentId, userId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const data = rows[0];

    /* ============= PDF INIT ============= */
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice_${data.id}.pdf`
    );

    doc.pipe(res);

    /* ============= HEADER ============= */
    doc.rect(0, 0, 595, 80).fill("#111827");

    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(22)
      .text("Skill Gateway", 50, 26);

    doc.font("Helvetica").fontSize(10).text("Learn. Build. Grow.", 50, 52);

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("INVOICE", 450, 30, { align: "right" });

    /* ============= CUSTOMER + META ============= */
    doc.fillColor("#000000").fontSize(11);

    doc.font("Helvetica-Bold").text("BILL TO:", 50, 110);
    doc.font("Helvetica").text(data.username, 50, 125);
    doc.text(data.email, 50, 140);

    doc.font("Helvetica-Bold").text("Invoice ID:", 350, 110);
    doc.font("Helvetica").text(`#INV-${data.id}`, 430, 110);

    doc.font("Helvetica-Bold").text("Date:", 350, 130);
    doc.font("Helvetica").text(formatDate(data.created_at), 430, 130);

    doc.font("Helvetica-Bold").text("Status:", 350, 150);
    doc.fillColor("#16a34a").font("Helvetica-Bold").text("PAID", 430, 150);
    doc.fillColor("#000000");

    /* ============= TABLE HEADER ============= */
    const tableTop = 200;

    doc.rect(50, tableTop, 495, 26).fill("#f3f4f6");

    doc
      .fillColor("#000")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Course", 60, tableTop + 7)
      .text("Transaction ID", 330, tableTop + 7)
      .text("Amount", 450, tableTop + 7, { width: 80, align: "right" });

    doc
      .moveTo(50, tableTop + 26)
      .lineTo(545, tableTop + 26)
      .stroke();

    /* ============= TABLE ROW ============= */
    const rowTop = tableTop + 40;

    // Course
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#000000")
      .text(data.course_title, 60, rowTop, { width: 250 });

    // Transaction ID
    doc
      .fontSize(10)
      .fillColor("#6b7280")
      .text(data.utr || "-", 330, rowTop);

    // Amount – IMPORTANT: separate x position, right aligned
    doc
      .fontSize(11)
      .fillColor("#000000")
      .text(formatCurrency(data.amount), 450, rowTop, {
        width: 80,
        align: "right",
      });

    // Bottom line
    doc
      .moveTo(50, rowTop + 25)
      .lineTo(545, rowTop + 25)
      .stroke();

    /* ============= TOTAL ============= */
    const totalTop = rowTop + 60;

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#000000")
      .text("TOTAL PAID:", 350, totalTop, { width: 180, align: "right" });

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#16a34a")
      .text(formatCurrency(data.amount), 350, totalTop + 22, {
        width: 180,
        align: "right",
      });

    /* ============= FOOTER ============= */
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#6b7280")
      .text(
        "This is a system generated invoice.\nFor support contact: support@skillgateway.in",
        50,
        380,
        { align: "center", width: 495 }
      );

    doc.end();
  } catch (err) {
    console.error("❌ Invoice generation error:", err);
    res.status(500).send("Invoice generation failed");
  }
});

module.exports = router;
