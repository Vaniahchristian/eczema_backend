# Eczema Diagnosis System - API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication Endpoints

### Register User
```http
POST /auth/register
```
**Request Body:**
```json
{
  "email": "string",
  "password": "string",
  "firstName": "string",
  "lastName": "string",
  "role": "patient|doctor|researcher",
  "dateOfBirth": "YYYY-MM-DD",
  "gender": "male|female|other"
}
```

### Login
```http
POST /auth/login
```
**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

## Diagnosis Endpoints

### Upload Image for Diagnosis
```http
POST /eczema/diagnose
Content-Type: multipart/form-data
```
**Request Body:**
- `image`: File (JPG/PNG, max 5MB)

**Response:**
```json
{
  "success": true,
  "data": {
    "diagnosisId": "string",
    "severity": "mild|moderate|severe",
    "confidence": "number",
    "recommendations": ["string"],
    "needsDoctorReview": "boolean",
    "imageUrl": "string"
  }
}
```

### Get Patient Diagnoses
```http
GET /eczema/diagnoses
```

### Get Specific Diagnosis
```http
GET /eczema/diagnoses/:diagnosisId
```

### Add Doctor Review
```http
POST /eczema/diagnoses/:diagnosisId/review
```
**Request Body:**
```json
{
  "review": "string",
  "updatedSeverity": "mild|moderate|severe",
  "treatmentPlan": "string"
}
```

## Appointment Endpoints

### Get Doctor Availability
```http
GET /doctors/:doctorId/availability
Query: date=YYYY-MM-DD
```

### Book Appointment
```http
POST /appointments
```
**Request Body:**
```json
{
  "doctorId": "string",
  "appointmentDate": "YYYY-MM-DD HH:mm:ss",
  "notes": "string"
}
```

### Get User Appointments
```http
GET /appointments
Query: status=scheduled|completed|cancelled|no_show
```

## Research Endpoints

### Get Diagnosis Data
```http
GET /research/diagnosis-data
Authorization: Researcher only
```

### Get Treatment Effectiveness
```http
GET /research/treatment-data
Authorization: Researcher only
```

### Get Research Insights
```http
GET /research/insights
Authorization: Researcher only
```

## Analytics Endpoints

### Export Patient Records
```http
GET /analytics/export/patients
Query: format=csv|excel
Authorization: Doctor/Researcher only
```

### Export Analytics Report
```http
GET /analytics/export/analytics
Query: type=age|treatment|demographic
Authorization: Doctor/Researcher only
```

## WebSocket Events

### Connection
```javascript
const socket = new WebSocket('ws://localhost:3000');
```

### Event Types
1. **Diagnosis Updates**
```json
{
  "type": "diagnosis_result",
  "data": {
    "diagnosisId": "string",
    "status": "string",
    "results": {}
  }
}
```

2. **Appointment Updates**
```json
{
  "type": "appointment_update",
  "data": {
    "appointmentId": "string",
    "status": "string",
    "message": "string"
  }
}
```

3. **Doctor Reviews**
```json
{
  "type": "doctor_review",
  "data": {
    "diagnosisId": "string",
    "review": {},
    "message": "string"
  }
}
```

## Error Responses
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error (development only)"
}
```

## Status Codes
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error

## Rate Limiting
- 100 requests per minute per IP
- WebSocket: 60 messages per minute per connection

## Security
- All endpoints require JWT authentication except /auth/*
- Token format: Bearer {token}
- Role-based access control
- HTTPS required in production
