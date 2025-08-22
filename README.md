# Simulation Data Validation

A full-stack web application for validating and reviewing PDF documents (loan contracts and payroll documents) with structured data extraction and review workflows.

## Project Overview

This application provides a systematic approach to validate PDF documents by:
- Managing PDF documents in categorized collections
- Tracking validation results with review states
- Providing a web interface for document review and validation management

## Architecture

- **Backend**: Node.js/Express server with REST API
- **Frontend**: React/TypeScript application built with Vite
- **Data Storage**: File-based system with JSON validation results

## Quick Start

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn package manager

### Installation & Setup

1. **Clone and navigate to the project**:
   ```bash
   cd sim_data_validation
   ```

2. **Install backend dependencies**:
   ```bash
   cd backend
   npm install
   ```

3. **Install frontend dependencies**:
   ```bash
   cd ../frontend
   npm install
   ```

### Running the Application

1. **Start the backend server**:
   ```bash
   cd backend
   npm start
   ```
   The backend will be available at `http://localhost:5178`

   For development mode:
   ```bash
   npm run dev
   ```

2. **Start the frontend development server** (in a new terminal):
   ```bash
   cd frontend
   npm run dev
   ```
   The frontend will be available at `http://localhost:5174`

3. **Access the application**:
   Open your browser and navigate to `http://localhost:5174`

## Project Structure

```
sim_data_validation/
├── backend/                 # Node.js/Express API server
│   ├── server.js           # Main server file
│   ├── package.json        # Backend dependencies
│   └── package-lock.json
├── frontend/               # React/TypeScript frontend
│   ├── src/
│   │   ├── main.tsx       # Entry point
│   │   ├── styles.css     # Global styles
│   │   └── ui/
│   │       └── App.tsx    # Main app component
│   ├── index.html         # HTML template
│   ├── vite.config.ts     # Vite configuration
│   ├── package.json       # Frontend dependencies
│   └── tsconfig.json      # TypeScript configuration
└── data/                  # Document storage
    ├── loan/              # Loan contract PDFs
    │   ├── *.pdf         # PDF documents
    │   ├── loan_result.json           # Unreviewed results
    │   └── loan_result_reviewed.json  # Reviewed results
    └── payroll/           # Payroll document PDFs
        ├── *.pdf         # PDF documents
        ├── payroll_result.json        # Unreviewed results
        └── payroll_result_reviewed.json # Reviewed results
```

## Features

### Document Management
- **Two document categories**: Loan contracts and payroll documents
- **PDF viewing**: Direct PDF serving and viewing capabilities
- **File organization**: Automatic categorization and listing

### Validation Workflow
- **Unreviewed results**: Initial validation results awaiting review
- **Review process**: Mark documents as reviewed or move back to unreviewed
- **Result editing**: Update and modify validation data through the web interface

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/models` | List available models with counts |
| GET | `/api/:model/files` | List files for a model with review status |
| GET | `/api/:model/pdf/*` | Serve PDF files |
| GET | `/api/:model/result?file=<filename>` | Get validation results for a file |
| POST | `/api/:model/result` | Save updated validation results |
| POST | `/api/:model/mark-reviewed` | Mark file as reviewed |
| POST | `/api/:model/mark-unreviewed` | Move file back to unreviewed |

## Data Format

### Result JSON Structure
The validation results are stored in JSON files with the following structure:
```json
{
  "filename.pdf": {
    // Validation data structure depends on document type
    // Contains extracted and validated information from PDFs
  }
}
```

## Development

### Backend Development
- Uses ES modules (`"type": "module"`)
- CORS enabled for cross-origin requests
- Express.js with JSON body parsing
- File-based data storage

### Frontend Development
- React 18 with TypeScript
- Vite for fast development and building
- Proxy configuration for API calls
- Modern React development setup

### Available Scripts

**Backend**:
- `npm start` - Start production server
- `npm run dev` - Start development server with NODE_ENV=development

**Frontend**:
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Configuration

### Ports
- Backend: `5178` (configurable via PORT environment variable)
- Frontend: `5174` (development server)

### Environment Variables
- `NODE_ENV` - Set to `development` for development mode
- `PORT` - Backend server port (default: 5178)

## Adding New Documents

1. Place PDF files in the appropriate directory:
   - Loan documents: `data/loan/`
   - Payroll documents: `data/payroll/`

2. Validation results will be automatically tracked in the corresponding JSON files

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the port in the configuration files or stop other services using the same ports

2. **CORS errors**: Ensure the backend server is running and CORS is properly configured

3. **File not found**: Check that PDF files are placed in the correct directories within the `data/` folder

4. **Dependencies**: Run `npm install` in both backend and frontend directories if you encounter missing module errors

## Contributing

1. Ensure both backend and frontend servers start without errors
2. Test document upload and validation workflows
3. Verify API endpoints are working correctly
4. Check that the frontend properly communicates with the backend

## License

This project is private and not licensed for public use.
