# Chapter 5: Installation and System Acceptance Test

The successful deployment of the Eczema Diagnosis and Management System hinges on a carefully orchestrated installation process that ensures all components work harmoniously in the target environment. This chapter details our comprehensive approach to system installation, validation, and acceptance testing, highlighting the critical steps and considerations necessary for a successful deployment.

## 5.1 Input Files

The following files are essential for system installation. Each file serves a specific purpose in the application:

### Web Application Files

1. **Main Application Files**
   - `app.bundle.js`: Compiled application code containing the core functionality for eczema diagnosis and patient management
   - `styles.bundle.css`: Compiled styles for the application UI, including responsive design for mobile devices
   - `index.html`: Entry point of the application, loads required scripts and styles

2. **PWA Support Files**
   - `manifest.json`: Defines how the app appears when installed on a device
     ```json
     {
       "name": "Eczema Diagnosis System",
       "short_name": "EczemaApp",
       "start_url": "/",
       "display": "standalone",
       "background_color": "#ffffff",
       "theme_color": "#2196f3",
       "icons": [...]
     }
     ```
   - `service-worker.js`: Enables offline functionality by caching:
     - Essential application files
     - Previously viewed patient records
     - Diagnosis results
     - Static assets

3. **Application Icons**
   - `icons/icon-192.png`: Standard icon for Android devices
   - `icons/icon-512.png`: High-resolution icon for larger screens
   - `icons/apple-touch-icon.png`: Icon for iOS home screen
   - `icons/favicon.ico`: Browser tab icon

### Backend Server Files

1. **API Server**
   - `server.js`: Main entry point that initializes Express server and middleware
   - `routes/`: Directory containing API endpoint implementations:
     - `auth.js`: Authentication and user management endpoints
     - `eczema.js`: Diagnosis and image analysis endpoints
     - `analytics.js`: Patient data analysis endpoints
   - `models/`: Database schemas and data models
     - `user.model.js`: User account and profile management
     - `patient.model.js`: Patient records and history
     - `diagnosis.model.js`: Eczema diagnosis results

2. **Configuration Files**
   - `config.js`: Server configuration including:
     ```javascript
     module.exports = {
       port: process.env.PORT || 5000,
       dbUri: process.env.MONGODB_URI,
       jwtSecret: process.env.JWT_SECRET,
       uploadDir: './uploads'
     }
     ```
   - `.env`: Environment variables template
     ```plaintext
     PORT=5000
     MONGODB_URI=mongodb://localhost:27017/eczema
     JWT_SECRET=your-secret-key
     ML_SERVICE_URL=http://localhost:5001
     ```

### Database Files

1. **Schema Setup**
   - `init-db.js`: Database initialization script that:
     - Creates required collections
     - Sets up indexes for performance
     - Configures access controls

2. **Data Migration**
   - `migrations/`: Version-specific database updates
     - `001-add-patient-history.js`: Adds patient history tracking
     - `002-update-diagnosis-schema.js`: Updates diagnosis model

### Machine Learning Models

1. **Core Models**
   - `eczema-classifier.h5`: TensorFlow model for eczema classification
     - Input: 224x224 RGB images
     - Output: Severity score (0-5) and condition type
   - `bodypart-detector.tflite`: Optimized model for body part detection
     - Lightweight model for mobile devices
     - Identifies 12 different body regions

2. **Model Support Files**
   - `labels.json`: Classification categories and descriptions
   - `model-metadata.json`: Version info and training parameters
   - `checksum.sha256`: File integrity verification

## 5.2 Supplementary Files

### API Documentation
```
postman/
├── Admin Dashboard API.postman_collection.json    # Admin endpoints
├── Eczema_API.postman_collection.json          # Core diagnosis API
├── Eczema_Diagnosis_System.postman_collection.json
├── Eczema_Messaging_API.postman_collection.json  # Messaging service
└── eczema-messaging.postman_collection.json
```

### Test Collections
```
tests/
├── Eczema_Diagnosis_API.postman_collection.json  # API tests
├── Eczema_Messaging.postman_collection.json     # Messaging tests
├── Patient_Analytics.postman_collection.json    # Analytics tests
└── postman/
    └── system-monitoring.postman_collection.json
```

### ML Service Requirements
```
ml_api/
└── requirements.txt    # Python package dependencies
```

## 5.3 Installation Qualification

### 1. Backend API Service Verification
```bash
# 1. Dependency Installation
npm install

# 2. Environment Setup
cp .env.example .env

# 3. Database Migration
npm run migrate

# 4. Service Health Check
curl http://localhost:5000/api/health
```

### 2. ML Service Verification
```bash
# 1. Python Environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# 2. Dependencies
pip install -r requirements.txt

# 3. Model Verification
python -c "import tensorflow as tf; print(tf.__version__)"

# 4. Service Check
curl http://localhost:5001/health
```

### 3. Frontend Verification
```bash
# 1. Install Dependencies
npm install

# 2. Build Check
npm run build

# 3. Type Check
npm run type-check

# 4. Component Test
npm run test
```

### 4. Integration Verification
```bash
# 1. Run Integration Tests
newman run tests/Eczema_Diagnosis_API.postman_collection.json

# 2. Verify Cross-Service Communication
curl http://localhost:5000/api/eczema/analyze
```

Each step must be documented with timestamps, version information, and test results in the installation log. The installation qualification process ensures that:

1. All required files are present and correctly placed
2. Dependencies are installed with correct versions
3. Services can communicate with each other
4. Security configurations are properly applied
5. Database migrations complete successfully

Only after all verification steps pass should the system be considered ready for use.

Our installation verification process is documented through two primary tracking mechanisms. The first, our Installation Summary Checklist, provides a comprehensive overview of the installation method, media sources, and file inventory.

| Topics | Installation summary |
|-------------------|---------------------------|
| Installation method
*Platform-specific installation...* | **Desktop (Windows/Mac/Linux)**
☒ Chrome/Edge: Click three dots menu → 'Install EczemaAI'
☒ Firefox: Click + icon in address bar

**Android**
☒ Chrome: Tap 'Add to Home screen' banner
☒ Samsung Browser: Tap menu → 'Add page to'

**iOS/iPadOS**
☒ Safari: Tap share button → 'Add to Home Screen'

Comments: PWA features: offline mode, push notifications (except iOS), camera access |
| System Requirements
*Platform-specific requirements...* | **Desktop**
- Chrome 80+, Edge 80+, Firefox 75+
- 200MB storage space

**Android**
- Chrome 80+ or Samsung Browser
- 100MB storage space
- Camera permission

**iOS 14.0+**
- Safari browser
- 100MB storage space
- Camera permission

Comments: First launch requires internet connection, works offline after |
| Installed files
*List of (relevant) installed files, e.g. user data files, cached images, and offline storage* | • `.jpg/.png` - Skin condition images
• `.json` - Diagnosis history
• `.db` - Offline data cache
• `.pdf` - Generated reports
• `.manifest` - PWA settings
• `.sw.js` - Service worker
• `.cache` - Browser cache files

Comments: Files stored in encrypted browser storage |

### Installation Verification Steps

1. **Browser Compatibility Check**
   - Chrome 80+ or Firefox 75+
   - Safari 14+ on iOS
   - Chromium-based browsers (Edge, Opera)

2. **Device Requirements**
   - Camera permission for skin analysis
   - 100MB free storage space
   - Stable internet for first installation

3. **Installation Steps**
   1. Visit application website
   2. Click 'Install' when prompted
   3. Grant required permissions
   4. Create user account
   5. Complete initial setup

4. **Verification Checks**
   - App icon appears on home screen
   - Offline mode works
   - Camera access functions
   - Data syncs when online

## 5.5 Post-Installation Monitoring and Maintenance

# Chapter 5: Installation Guide

## 5.1 Prerequisites

### Backend API Server
- Node.js v18 or higher
- MongoDB v8.x
- MySQL v8.x

Required environment variables:
```env
JWT_SECRET=your_jwt_secret
MONGODB_URI=mongodb://localhost:27017/eczema
MYSQL_URI=mysql://user:pass@localhost:3306/eczema
```

### ML Service
- Python 3.8 or higher
- Required packages:
  ```txt
  flask==2.3.3
  tensorflow==2.17.0
  pillow==10.0.0
  numpy==1.24.0
  flask-cors==4.0.0
  gunicorn>=19.2.0
  opencv-python-headless>=4.8.0
  ```

### Frontend Dashboard
- Node.js v18 or higher
- npm or pnpm package manager

## 5.2 Installation Steps

### 1. Backend API Setup
```bash
# Clone repository
git clone <backend-repo>
cd backend

# Install dependencies
npm install

# Initialize database
npm run init-db
npm run seed

# Start server
npm run dev
```

### 2. ML Service Setup
```bash
# Clone repository
git clone <ml-repo>
cd ml_api

# Install dependencies
pip install -r requirements.txt

# Start service
python main.py
```

### 3. Frontend Setup
```bash
# Clone repository
git clone <frontend-repo>
cd eczema-dashboard

# Install dependencies
npm install

# Start development server
npm run dev
```

## 5.3 Verification

1. Backend Health Check:
   ```bash
   curl http://localhost:5000/health
   ```

2. ML Service Health Check:
   ```bash
   curl http://localhost:8080/health
   ```

3. Frontend Access:
   - Open http://localhost:3000 in a browser
   - Verify login functionality
   - Test image upload and diagnosis

## 5.4 Monitoring

The system includes built-in monitoring through:

1. Winston logging for backend operations
2. Performance timing for ML model inference
3. MongoDB and MySQL query monitoring

All components include health check endpoints for uptime monitoring.
