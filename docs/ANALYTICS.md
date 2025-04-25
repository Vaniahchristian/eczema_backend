# Eczema Analytics System Documentation

## Overview
The Eczema Analytics System provides comprehensive insights into user behavior, diagnosis patterns, and treatment effectiveness. The system uses a dual-database architecture (MySQL + MongoDB) to store and process analytics data efficiently.

## Data Sources

### 1. User Analytics
- **Source**: MySQL `users` table
- **Key Fields**:
  - `id`: Unique user identifier
  - `lastLoginAt`: Timestamp of last login
  - `createdAt`: Account creation timestamp
  - `role`: User role (patient, doctor, researcher, admin)

### 2. Diagnosis Analytics
- **Source**: MongoDB `diagnoses` collection
- **Key Fields**:
  - `patientId`: Reference to user
  - `createdAt`: Diagnosis timestamp
  - `severity`: Eczema severity score
  - `confidence`: Model confidence score
  - `preDiagnosisSurvey`: Pre-diagnosis survey responses
  - `postDiagnosisSurvey`: Post-diagnosis survey responses

### 3. Engagement Analytics
- **Sources**: 
  - MongoDB `messages` collection
  - MongoDB `appointments` collection
  - MongoDB `diagnoses` collection
- **Key Fields**:
  - `createdAt`: Activity timestamp
  - `userId`: Reference to user
  - `type`: Activity type

## Analytics Categories

### 1. Overview Metrics

#### Demographics
```javascript
// MongoDB Aggregation
{
  $group: {
    _id: {
      ageGroup: {
        $switch: {
          branches: [
            { case: { $lt: ["$age", 18] }, then: "Under 18" },
            { case: { $lt: ["$age", 30] }, then: "18-30" },
            { case: { $lt: ["$age", 50] }, then: "31-50" }
          ],
          default: "Over 50"
        }
      }
    },
    count: { $sum: 1 }
  }
}
```

#### Diagnosis Patterns
```javascript
// MongoDB Aggregation
{
  $group: {
    _id: {
      month: { $month: "$createdAt" },
      year: { $year: "$createdAt" }
    },
    avgSeverity: { $avg: "$severity" },
    count: { $sum: 1 }
  }
}
```

### 2. Engagement Analytics

#### Daily Active Users
```javascript
// MongoDB Aggregation
{
  $match: {
    lastLoginAt: { $gte: startDate, $lte: endDate }
  },
  $group: {
    _id: { $dateToString: { format: "%Y-%m-%d", date: "$lastLoginAt" } },
    count: { $sum: 1 }
  }
}
```

#### Hourly Diagnosis Distribution
```javascript
// MongoDB Aggregation
{
  $group: {
    _id: { $hour: "$createdAt" },
    count: { $sum: 1 }
  }
}
```

#### User Retention
- Weekly cohort analysis
- Tracks users who return after initial registration
- Calculated using MongoDB's `$lookup` and `$group` operations

#### User Activity
- Tracks daily:
  - Number of diagnoses
  - Messages sent
  - Appointments scheduled

### 3. Survey Analytics

#### Pre-Diagnosis Survey
- Symptoms severity
- Duration of symptoms
- Previous treatments
- Trigger factors

#### Post-Diagnosis Survey
- Treatment effectiveness
- Side effects
- Satisfaction score
- Recovery time

#### Correlation Analytics
```javascript
// MongoDB Aggregation
{
  $match: {
    'preDiagnosisSurvey': { $exists: true },
    'postDiagnosisSurvey': { $exists: true }
  },
  $project: {
    correlation: {
      $multiply: [
        { $subtract: ['$preDiagnosisSurvey.severity', '$postDiagnosisSurvey.severity'] },
        100
      ]
    }
  }
}
```

## Data Flow

1. **Data Collection**
   - User actions are logged in respective collections
   - Timestamps are stored in UTC
   - Automated cleanup of old analytics data (>1 year)

2. **Data Processing**
   - Real-time aggregation for current metrics
   - Daily batch processing for historical trends
   - Weekly data consolidation for long-term analytics

3. **Data Access**
   - RESTful API endpoints
   - Authentication required for all analytics
   - Role-based access control
   - Rate limiting applied

## API Endpoints

### Overview Analytics
```
GET /api/analytics/age-distribution
GET /api/analytics/geographical-distribution
GET /api/analytics/severity-distribution
GET /api/analytics/treatment-effectiveness
GET /api/analytics/diagnosis-trends
```

### Engagement Analytics
```
GET /api/analytics/daily-active-users
GET /api/analytics/hourly-diagnoses
GET /api/analytics/user-retention
GET /api/analytics/user-activity
```

### Survey Analytics
```
GET /api/analytics/survey-analytics
GET /api/analytics/correlation-analytics
```

## Data Retention & Privacy

1. **Data Anonymization**
   - Personal identifiers removed from analytics
   - Aggregated data only in reports
   - Individual records accessible only to authorized roles

2. **Retention Policy**
   - Raw analytics data: 12 months
   - Aggregated data: 5 years
   - User activity logs: 6 months

3. **Access Control**
   - JWT-based authentication
   - Role-based permissions
   - IP-based rate limiting

## Performance Considerations

1. **Indexing**
   - Timestamp fields indexed
   - User ID fields indexed
   - Compound indexes for common queries

2. **Caching**
   - Redis caching for frequently accessed metrics
   - 5-minute cache invalidation
   - Cache bypass for real-time data

3. **Query Optimization**
   - Aggregation pipeline optimization
   - Batch processing for heavy queries
   - Parallel processing for large datasets

## Error Handling

1. **Data Validation**
   - Input validation for date ranges
   - Data type checking
   - Boundary validation

2. **Error Logging**
   - Structured error logging
   - Error categorization
   - Alert system for critical errors

3. **Recovery Procedures**
   - Automatic retry for failed operations
   - Fallback to cached data
   - Manual intervention protocols

## Monitoring

1. **System Health**
   - Query performance monitoring
   - Database load monitoring
   - API response times

2. **Data Quality**
   - Data completeness checks
   - Anomaly detection
   - Consistency validation

3. **Usage Metrics**
   - Endpoint usage statistics
   - User engagement patterns
   - Error rate tracking
