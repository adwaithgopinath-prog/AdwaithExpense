require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const passport = require("passport");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret_session",
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/auth_system_db")
  .then(() => console.log("MongoDB Connected"))
  .catch((err) =>
    console.log(
      "MongoDB connection error. Please make sure MongoDB is running!",
      err,
    ),
  );

// Routes
const authRoutes = require("./routes/auth");
const expenseRoutes = require('./routes/expenses');
const incomeRoutes = require('./routes/income');
const insightRoutes = require('./routes/insights');
app.use("/api/auth", authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/insights', insightRoutes);

// Frontend Route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
