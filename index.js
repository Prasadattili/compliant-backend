// server.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Atlas connected'))
  .catch(err => console.error('❌ MongoDB connection failed:', err.message));

// --- Sub-schema for Status History ---
const StatusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true,
  },
  time: {
    type: Date,
    default: Date.now,
  },
}, { _id: false }); // Disable _id for subdocuments

// --- Main Complaint Schema (Improved) ---
const ComplaintSchema = new mongoose.Schema({
  // 'title' removed to match frontend
  trackId : {type : String, required : true, unique: true}, // Unique identifier for tracking
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'In Review', 'Resolved', 'Escalated', 'Unnecessary'], // Enforces valid status values
    default: 'Pending',
  },
  createdAt: { // Renamed from 'date' for clarity
    type: Date,
    default: Date.now,
  },
  evidence: { // Added evidence field
    type: String, // Assumes URL or base64 string
    default: null,
  },
  comments: { // Added comments array
    type: [{ type: String }],
    default: [],
  },
  statusHistory: { // Added status history tracking
    type: [StatusHistorySchema],
    default: [],
  }
}, {
  // Schema options to transform the output
  toJSON: {
    virtuals: true, // Ensure virtuals are included
    transform: (doc, ret) => {
      ret.id = ret._id; // Map _id to id
      delete ret._id;
      delete ret.__v;
    }
  },
  toObject: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
    }
  }
});

const Complaint = mongoose.model('Complaint', ComplaintSchema);

// --- API Routes ---

// POST a new complaint
app.post('/api/complaints', async (req, res) => {
  try {
    const newComplaint = new Complaint(req.body);

    // Automatically create the first status history entry
    newComplaint.statusHistory.push({
      status: newComplaint.status,
      time: newComplaint.createdAt,
    });

    await newComplaint.save();
    res.status(201).json({ success: true, data: newComplaint });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET all complaints
app.get('/api/complaints', async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 }); // Sort by createdAt
    res.json({ success: true, data: complaints });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/complaints/:id/status', async (req, res) => {
  try {
    const { status, comment } = req.body;
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({ success: false, error: 'Complaint not found' });
    }

    // If a new comment is provided, add it to the array
    if (comment) {
      complaint.comments.push(comment);
    }

    // If status is updated, change it and log the change to history
    if (status && complaint.status !== status) {
      complaint.status = status;
      complaint.statusHistory.push({ status: status, time: new Date() });
    }

    const updatedComplaint = await complaint.save();
    res.json({ success: true, data: updatedComplaint });

  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// admin login 
app.post('/api/admin/login', (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if email and password are provided
    if (!email || !password) {
      console.log('Missing credentials');
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Remove any whitespace from credentials
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    
    // Temporary hardcoded credentials for testing
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'prasad@gmail.com';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'prasad123';
    
    console.log('Login attempt details:', { 
      attemptedEmail: cleanEmail,
      actualEmail: ADMIN_EMAIL,
      emailMatch: cleanEmail === ADMIN_EMAIL,
      attemptedPassword: cleanPassword,
      actualPassword: ADMIN_PASSWORD,
      passwordLength: cleanPassword.length,
      expectedPasswordLength: ADMIN_PASSWORD.length,
      passwordMatch: cleanPassword === ADMIN_PASSWORD
    });

    // Simple hardcoded admin check (replace with real authentication in production)
    if (cleanEmail === ADMIN_EMAIL && cleanPassword === ADMIN_PASSWORD) {
    // Generate JWT token
    const token = jwt.sign(
      { email, role: 'admin' },
      process.env.JWT_SECRET || 'prasad123',
      { expiresIn: '24h' } // Token expires in 24 hours
    );

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      email: cleanEmail,
    });
  }

  res.status(401).json({ success: false, message: 'Invalid credentials' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});


// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));