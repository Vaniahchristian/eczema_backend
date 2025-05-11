# Chapter 2: System Specifications

The Eczema Diagnosis and Management System represents a sophisticated distributed architecture comprising three distinct yet interconnected components, each serving a specific purpose in the delivery of comprehensive healthcare services. This chapter delves into the technical specifications and architectural decisions that form the foundation of our system.

## 2.1 System Architecture and Version Management

At the heart of our system lies a modern, distributed architecture that combines the power of web technologies, cloud computing, and machine learning. The frontend dashboard, built with Next.js and TypeScript (version 0.1.0), provides a responsive and intuitive interface for healthcare providers and patients. It leverages Radix UI components for consistent design patterns and implements Progressive Web App (PWA) capabilities for enhanced accessibility. Real-time updates are facilitated through Socket.IO, ensuring immediate communication between users and the system.

The backend API (version 0.1.0) serves as the system's central nervous system, built on Node.js with Express. It implements a sophisticated dual database architecture, combining MySQL for structured patient and user data with MongoDB for flexible document storage. This hybrid approach allows for both rigid data integrity and flexible schema evolution. The API layer provides RESTful endpoints for data access and manipulation, while WebSocket connections enable real-time updates and notifications.

The machine learning service (version 0.1.0) represents the system's diagnostic intelligence. Built with Flask and TensorFlow, it employs a VGG19-based architecture for feature extraction and a specialized TensorFlow Lite model for body part classification. This service processes medical images and provides automated eczema diagnosis with severity assessment and treatment recommendations.

## 2.2 Data Flow and Processing

The system handles various types of input data, each processed through specialized validation and security measures. User authentication employs a robust JWT-based system with role-based access control, supporting four distinct user roles: patients, doctors, researchers, and administrators. Each role has carefully defined permissions and access levels to ensure data security and appropriate feature access.

Patient data management encompasses comprehensive personal information, including medical history and regional data. The appointment system facilitates scheduling and management of medical consultations, while the image analysis pipeline processes skin condition photographs with specific technical requirements (maximum size 50MB, JPEG/PNG formats) and performs sophisticated preprocessing for machine learning analysis.

The system generates several types of outputs, from analytical data tracking user engagement and system performance to detailed diagnostic results. The analytics module provides insights into daily active users, diagnosis distributions, and user retention metrics. Diagnostic outputs include eczema predictions with confidence scores, severity assessments, and personalized treatment recommendations.

## 2.3 Core Functionality and Features

The system's functionality spans multiple domains, from security and authentication to machine learning and real-time communication. The authentication system uses JWT tokens with secure cookie management, while real-time features leverage Socket.IO for instant updates and notifications. The data management layer handles CRUD operations across both databases, with specialized handling for file uploads and medical images.

The machine learning pipeline implements sophisticated image analysis, using VGG19 for feature extraction and custom models for eczema classification and body part detection. This is complemented by a comprehensive API layer providing endpoints for authentication, patient management, appointments, analytics, and research data access.

## 2.4 System Constraints and Security

While powerful, the system operates within defined technical constraints. It requires a stable internet connection and WebSocket support for full functionality. Processing limitations include maximum image sizes and variable model inference times. These constraints are balanced against robust security measures, including Helmet security headers, CORS configuration, and rate limiting on API endpoints.

## 2.5 Configuration and Error Management

The system employs carefully tuned default configurations across all components. The backend operates on port 5000 with configurable settings for file uploads and caching. WebSocket communications are optimized with a 30-second ping timeout and 25-second ping interval. The ML service runs on port 8080 with specific model paths and input size requirements for different analysis types.

Error handling and system health monitoring are implemented comprehensively across all components. The backend utilizes Morgan for request logging and custom middleware for error tracking. The ML service implements detailed validation and error handling for model loading and image processing. Health monitoring endpoints provide real-time status information about database connections, WebSocket clients, and overall system health.

Through this architectural design and implementation, the system delivers a robust, secure, and efficient platform for eczema diagnosis and management, serving the needs of healthcare providers and patients while maintaining high standards of performance and reliability.
