# Eczema Diagnosis and Advisory System - Application Flow

## 1. Authentication Flow
- User registration/login with role-based access (patient, doctor, researcher)
- JWT token generation and validation
- Role-based route protection
- Session management

## 2. Diagnosis Flow
### 2.1 Image Upload and Processing
1. Patient uploads skin image
2. Image processing middleware:
   - Format validation (JPG, PNG)
   - Size limit check (5MB)
   - Quality assessment
   - Resizing to 224x224 pixels
   - Metadata extraction

### 2.2 ML Analysis
1. TensorFlow.js model processes image
2. Generates:
   - Eczema probability
   - Severity classification
   - Confidence score
   - Treatment recommendations
3. Automated doctor review triggers based on:
   - High severity cases
   - Low confidence scores

### 2.3 Results and Notifications
1. Real-time diagnosis results via WebSocket
2. Notification types:
   - Diagnosis completion
   - Doctor review requests
   - Appointment updates
   - Treatment reminders

## 3. Doctor Interaction Flow
### 3.1 Appointment Management
1. Patient books appointment
2. Doctor availability check
3. Confirmation notifications
4. Status updates (scheduled, completed, cancelled)

### 3.2 Diagnosis Review
1. Doctor receives review requests
2. Reviews ML analysis results
3. Provides professional assessment
4. Updates treatment recommendations
5. Patient notification of review completion

## 4. Research and Analytics Flow
### 4.1 Data Collection
1. Anonymized data gathering
2. Consent management
3. HIPAA/GDPR compliance checks
4. Data categorization:
   - Diagnosis patterns
   - Treatment effectiveness
   - Demographic information

### 4.2 Analytics Generation
1. Statistical analysis:
   - Age distribution
   - Regional patterns
   - Treatment success rates
   - Demographic correlations
2. Report generation:
   - CSV exports
   - Excel reports
   - Visual analytics

## 5. Data Storage Architecture
### 5.1 MySQL Tables
- Users (authentication, profiles)
- Doctor profiles
- Patient profiles
- Appointments
- Research consent

### 5.2 MongoDB Collections
- Diagnoses
- Treatment plans
- Notifications
- Analytics data

## 6. Security and Compliance
1. Authentication:
   - JWT token validation
   - Role-based access control
2. Data Protection:
   - Encryption at rest
   - Secure transmission
   - Data anonymization
3. Compliance:
   - HIPAA standards
   - GDPR requirements
   - Data retention policies

## 7. API Structure
### 7.1 Core Endpoints
- `/api/auth/*`: Authentication routes
- `/api/eczema/*`: Diagnosis routes
- `/api/doctors/*`: Doctor management
- `/api/appointments/*`: Appointment handling
- `/api/research/*`: Research data access
- `/api/analytics/*`: Analytics and exports

### 7.2 WebSocket Events
- Diagnosis updates
- Appointment notifications
- Doctor review alerts
- System notifications

## 8. Error Handling
1. Input validation
2. Error categorization
3. Client-friendly error messages
4. Error logging and monitoring
5. Automatic retry mechanisms

## 9. Performance Optimization
1. Image processing optimization
2. ML model caching
3. Database query optimization
4. WebSocket connection management
5. Rate limiting and throttling
