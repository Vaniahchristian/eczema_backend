# Patient Analytics Testing Guide

## Setup Instructions

1. Import the `Patient_Analytics.postman_collection.json` into Postman
2. Create a Postman Environment with these variables:
   - `patientToken`: JWT token for a patient user
   - `doctorToken`: JWT token for a doctor/admin user
   - `patientId`: ID of a patient to test with

## Getting Started

1. First, use the Auth requests to get tokens:
   - Use "Login as Patient" to get a patient token
   - Use "Login as Doctor" to get a doctor token
2. Copy the tokens from the responses into your environment variables

## Available Test Endpoints

### Patient View (`/me/` endpoints)
These endpoints use the `patientToken`:
- Summary Cards: `/me/summary`
- Severity Distribution: `/me/severity-distribution`
- Body Part Frequency: `/me/body-part-frequency`
- Model Confidence Trend: `/me/model-confidence-trend`
- Diagnosis Count Trend: `/me/diagnosis-count-trend`
- Doctor Review Impact: `/me/doctor-review-impact`
- Average Confidence by Severity: `/me/avg-confidence-by-severity`
- Recent Diagnoses: `/me/recent-diagnoses`

### Doctor/Admin View (`/patient/:patientId/` endpoints)
These endpoints use the `doctorToken`:
- Same endpoints as above but with `/patient/:patientId/` prefix

## Expected Responses

### Summary
```json
{
  "success": true,
  "data": {
    "totalDiagnoses": 42,
    "averageModelConfidence": 0.89,
    "mostCommonSeverity": "mild"
  }
}
```

### Severity Distribution
```json
{
  "success": true,
  "data": [
    { "_id": "mild", "count": 20 },
    { "_id": "moderate", "count": 15 },
    { "_id": "severe", "count": 7 }
  ]
}
```

### Body Part Frequency
```json
{
  "success": true,
  "data": [
    { "bodyPart": "arm", "count": 12 },
    { "bodyPart": "leg", "count": 8 }
  ]
}
```

### Recent Diagnoses
```json
{
  "success": true,
  "data": [
    {
      "severity": "mild",
      "confidence": 0.92,
      "bodyPart": "arm",
      "recommendations": ["..."],
      "needsDoctorReview": false,
      "imageUrl": "...",
      "status": "completed",
      "createdAt": "2025-04-26T...",
      "doctorReview": {
        "updatedSeverity": "moderate"
      }
    }
  ]
}
```

## Troubleshooting

1. 401 Unauthorized
   - Check if your token is valid and not expired
   - Make sure you're using the correct token (patient vs doctor)

2. 403 Forbidden
   - Check if you have the right role for the endpoint
   - Patient tokens only work with `/me/` endpoints
   - Doctor tokens are required for `/patient/:patientId/` endpoints

3. 404 Not Found
   - Verify the patient ID exists in the database
   - Check the URL path is correct

4. Empty Results
   - Verify the patient has diagnoses in the database
   - Check the date range if applicable
