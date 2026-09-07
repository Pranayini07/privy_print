# PrivyTech (Privy Print)

**Privy Print** is an Enterprise-Grade Secure Document Platform that enables users to securely drop, share, and print documents with highly customizable access controls. Built for robust security, the platform provides features like time-limited access, print limits, and secure view modes to prevent unauthorized downloading or distribution.

## 🌟 Key Features

- **Secure Document Drop**: Upload multiple files (PDFs, images, etc.) seamlessly using a drag-and-drop interface.
- **Expiry Configuration**: Set custom or preset expiration times (e.g., 5, 10, 15, 30, 60 minutes). After the window expires, files are permanently wiped from the secure buffer.
- **Access Modes**:
  - **Secure Print Only**: Users can view the document in a secure frame. Downloads are disabled, and right-click is restricted.
  - **Share File**: Standard sharing mode allowing downloads. Secure prints are disabled in this mode.
- **Print Locks**: Limit the maximum number of prints allowed (up to 10 prints).
- **Download Limits**: Restrict the number of times each shared file can be downloaded.
- **Nearby Secure Print Centers**: Integrated with Leaflet maps to locate nearby printing centers/shops.
- **Time Extension**: Extend the document expiry window seamlessly.
- **Auditable History**: Keeps track of file uploads, expiration times, and statuses locally on your browser.

## 💻 Tech Stack

### Frontend
- **React 19**
- **Vite**
- **Tailwind CSS 4**
- **Framer Motion** (for smooth animations and UI interactions)
- **Leaflet & React-Leaflet** (for map integrations)
- **PDF.js** (for rendering PDFs in secure mode)
- **Axios** (for API communication)
- **Lucide React** (for modern icons)

### Backend
- **Node.js & Express 5.x**
- **Google Cloud Storage** (for secure file storage)
- **Google Cloud Firestore** (for metadata, document status, limits tracking)
- **Formidable** (for multi-part file parsing under the hood)
- **Helmet & CORS** (for enterprise-grade security headers and cross-origin handling)
- **Crypto & UUID** (for generating secure document codes and unique identifiers)

## 📋 Prerequisites

Before running the application locally, make sure you have the following installed:
- Node.js (v18 or higher recommended)
- npm (Node Package Manager)
- A Google Cloud Platform (GCP) account with **Cloud Storage** and **Firestore** APIs enabled.

## 🚀 Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/AyyappaSwamy121/PrivyTech.git
cd PrivyTech
```

### 2. Backend Setup
Navigate to the backend directory and install dependencies:
```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory. An example configuration looks like this:
```env
PORT=5000
GCP_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=privy-print-uploads
# Uncomment below and point to your Google Cloud service account JSON file if running locally
# GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

Be sure to place your `service-account.json` in the backend root (or whatever path you specified above) to connect properly with GCP.

### 3. Frontend Setup
Navigate to the frontend directory and install dependencies:
```bash
cd ../frontend
npm install
```

Note: If your backend is running on a port other than 5000, you can update the API Base URL inside `frontend/src/config.js` or through environment variables.

## ▶️ Running the Application

### Start the Backend Server
```bash
cd backend
npm start
```
*(The server will start on `http://localhost:5000`)*

### Start the Frontend Development Server
```bash
cd frontend
npm run dev
```
*(The Vite dev server will typically start on `http://localhost:5173`)*

## 🔒 Security Best Practices Implemented
- **Rate Limiting**: Prevent abuse on search endpoints, print limits, and extension attempts to ensure resilience.
- **No Store Headers**: Secure document retrieval is done without storing caches in the browser.
- **Content Security Policy (CSP)**: Specifically curated rules lock down embedded iframes and allow executions securely.
- **Time-Decay Architecture**: Files and URLs are forcefully expired natively, treating data as ephemeral to mitigate stale active codes.

---
*Created for PrivyTech Hackathon*
