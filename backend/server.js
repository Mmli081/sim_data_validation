import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({ 
  dest: '/tmp/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Adjust this base directory to point to the data folder
const projectRoot = path.resolve(__dirname, '..');
const dataRoot = path.join(projectRoot, 'data');

function listModelDirectory(model) {
  const dir = path.join(dataRoot, model);
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir);
  const pdfs = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));
  const resultJsonFile = entries.find((f) => f.toLowerCase().endsWith('_result.json'));
  const reviewedJsonFile = entries.find((f) => f.toLowerCase().endsWith('_result_reviewed.json'));
  return { dir, pdfs, resultJsonFile, reviewedJsonFile };
}

function readResultsFiles(model) {
  const info = listModelDirectory(model);
  if (!info) return { unreviewed: {}, reviewed: {} };

  let unreviewed = {};
  let reviewed = {};

  // Read unreviewed results
  if (info.resultJsonFile) {
    const unreviewedPath = path.join(info.dir, info.resultJsonFile);
    try {
      unreviewed = JSON.parse(fs.readFileSync(unreviewedPath, 'utf-8'));
    } catch (e) {
      console.error('Failed to read unreviewed results for', model, e);
    }
  }

  // Read reviewed results
  if (info.reviewedJsonFile) {
    const reviewedPath = path.join(info.dir, info.reviewedJsonFile);
    try {
      reviewed = JSON.parse(fs.readFileSync(reviewedPath, 'utf-8'));
    } catch (e) {
      console.error('Failed to read reviewed results for', model, e);
    }
  }

  return { unreviewed, reviewed };
}

function writeResultsFiles(model, unreviewed, reviewed) {
  const info = listModelDirectory(model);
  if (!info) throw new Error('Model not found');

  if (info.resultJsonFile) {
    const unreviewedPath = path.join(info.dir, info.resultJsonFile);
    fs.writeFileSync(unreviewedPath, JSON.stringify(unreviewed, null, 4), 'utf-8');
  }

  if (info.reviewedJsonFile) {
    const reviewedPath = path.join(info.dir, info.reviewedJsonFile);
    fs.writeFileSync(reviewedPath, JSON.stringify(reviewed, null, 4), 'utf-8');
  }
}

// List models and files
app.get('/api/models', (req, res) => {
  const models = [];
  for (const model of ['payroll', 'loan']) {
    const info = listModelDirectory(model);
    if (!info) continue;
    const { unreviewed, reviewed } = readResultsFiles(model);
    models.push({
      model,
      pdfs: info.pdfs,
      unreviewedCount: Object.keys(unreviewed).length,
      reviewedCount: Object.keys(reviewed).length,
    });
  }
  res.json(models);
});

// List PDFs for a model with their review status
app.get('/api/:model/files', (req, res) => {
  const model = req.params.model;
  const info = listModelDirectory(model);
  if (!info) return res.status(404).json({ error: 'Unknown model' });
  
  const { unreviewed, reviewed } = readResultsFiles(model);
  
  const unreviewedItems = Object.keys(unreviewed).map((name) => ({
    name,
    hasResult: true,
    status: 'unreviewed'
  }));
  
  const reviewedItems = Object.keys(reviewed).map((name) => ({
    name,
    hasResult: true,
    status: 'reviewed'
  }));

  // Also include PDFs without any results
  const allResultFiles = new Set([...Object.keys(unreviewed), ...Object.keys(reviewed)]);
  const noResultItems = info.pdfs
    .filter(name => !allResultFiles.has(name))
    .map((name) => ({
      name,
      hasResult: false,
      status: 'no_result'
    }));

  res.json({ 
    model, 
    unreviewed: unreviewedItems,
    reviewed: reviewedItems,
    noResult: noResultItems
  });
});

// Serve a PDF file
app.get('/api/:model/pdf/*', (req, res) => {
  const model = req.params.model;
  const relativePath = req.params[0];
  const info = listModelDirectory(model);
  if (!info) return res.status(404).end();
  const filePath = path.join(info.dir, relativePath);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Content-Type', 'application/pdf');
  fs.createReadStream(filePath).pipe(res);
});

// Get JSON result for a file
app.get('/api/:model/result', (req, res) => {
  const model = req.params.model;
  const file = req.query.file;
  if (typeof file !== 'string') return res.status(400).json({ error: 'file query required' });
  
  const { unreviewed, reviewed } = readResultsFiles(model);
  let data = unreviewed[file];
  let status = 'unreviewed';
  
  if (!data) {
    data = reviewed[file];
    status = 'reviewed';
  }
  
  if (!data) return res.status(404).json({ error: 'No result found for file' });
  res.json({ file, data, status });
});

// Save updated JSON result
app.post('/api/:model/result', (req, res) => {
  const model = req.params.model;
  const { file, data } = req.body || {};
  if (!file || typeof data !== 'object') {
    return res.status(400).json({ error: 'file and data required' });
  }

  try {
    const { unreviewed, reviewed } = readResultsFiles(model);
    
    // Update the file in whichever group it's currently in
    if (unreviewed[file]) {
      unreviewed[file] = data;
    } else if (reviewed[file]) {
      reviewed[file] = data;
    } else {
      // New file goes to unreviewed by default
      unreviewed[file] = data;
    }
    
    writeResultsFiles(model, unreviewed, reviewed);
    res.json({ ok: true, message: 'Result updated successfully' });
  } catch (error) {
    console.error('Error saving result:', error);
    res.status(500).json({ error: 'Failed to save result' });
  }
});

// Mark a file as reviewed (move from unreviewed to reviewed)
app.post('/api/:model/mark-reviewed', (req, res) => {
  const model = req.params.model;
  const { file } = req.body || {};
  if (!file) return res.status(400).json({ error: 'file required' });

  try {
    const { unreviewed, reviewed } = readResultsFiles(model);
    
    if (!unreviewed[file]) {
      return res.status(404).json({ error: 'File not found in unreviewed list' });
    }
    
    // Move from unreviewed to reviewed
    reviewed[file] = unreviewed[file];
    delete unreviewed[file];
    
    writeResultsFiles(model, unreviewed, reviewed);
    res.json({ ok: true, message: 'File marked as reviewed' });
  } catch (error) {
    console.error('Error marking as reviewed:', error);
    res.status(500).json({ error: 'Failed to mark file as reviewed' });
  }
});

// Move a file back to unreviewed (from reviewed to unreviewed)
app.post('/api/:model/mark-unreviewed', (req, res) => {
  const model = req.params.model;
  const { file } = req.body || {};
  if (!file) return res.status(400).json({ error: 'file required' });

  try {
    const { unreviewed, reviewed } = readResultsFiles(model);
    
    if (!reviewed[file]) {
      return res.status(404).json({ error: 'File not found in reviewed list' });
    }
    
    // Move from reviewed to unreviewed
    unreviewed[file] = reviewed[file];
    delete reviewed[file];
    
    writeResultsFiles(model, unreviewed, reviewed);
    res.json({ ok: true, message: 'File moved back to unreviewed' });
  } catch (error) {
    console.error('Error moving to unreviewed:', error);
    res.status(500).json({ error: 'Failed to move file to unreviewed' });
  }
});

// Upload PDF file to data repository
app.post('/api/upload-pdf', upload.single('pdf'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { model } = req.body || {};
    if (!model || !['loan', 'payroll'].includes(model)) {
      // Clean up uploaded file if model is invalid
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Valid model (loan or payroll) is required' });
    }

    const modelDir = path.join(dataRoot, model);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    // Get original filename or use the uploaded filename
    const originalName = req.body.filename || req.file.originalname || 'uploaded.pdf';
    const sanitizedFilename = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = path.join(modelDir, sanitizedFilename);

    // Check if file already exists
    if (fs.existsSync(targetPath)) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ error: 'File with this name already exists' });
    }

    // Move file from temp location to data directory
    fs.renameSync(req.file.path, targetPath);

    res.json({ 
      ok: true, 
      message: 'PDF uploaded successfully',
      filename: sanitizedFilename,
      model: model
    });
  } catch (error) {
    console.error('Error uploading PDF:', error);
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload PDF: ' + error.message });
  }
});

// Download all result data for a model
app.get('/api/:model/download-data', (req, res) => {
  const model = req.params.model;
  
  try {
    const { unreviewed, reviewed } = readResultsFiles(model);
    
    // Combine all data
    const allData = {
      model: model,
      unreviewed: unreviewed,
      reviewed: reviewed,
      timestamp: new Date().toISOString()
    };
    
    // Set headers for file download
    const filename = `${model}_results_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.json(allData);
  } catch (error) {
    console.error('Error downloading data:', error);
    res.status(500).json({ error: 'Failed to download data' });
  }
});

// Static serving of data directory (for direct PDF linking if needed)
app.use('/data', express.static(dataRoot));

const PORT = process.env.PORT || 5178;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});


