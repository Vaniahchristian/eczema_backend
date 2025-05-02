const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

class NotificationService {
  constructor(wss) {
    this.wss = wss;
    this.clients = new Map();
  }

  // Send notification to specific user
  async sendToUser(userId, notification) {
    try {
      const client = this.clients.get(userId);
      if (client && client.readyState === WebSocket.OPEN) {
        console.log(`[NotificationService] Sent to user ${userId}:`, notification);
        client.send(JSON.stringify({
          type: 'notification',
          payload: notification
        }));
      } else {
        console.log(`[NotificationService] User ${userId} is offline. Notification queued:`, notification);
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  // Send diagnosis result notification
  async sendDiagnosisResult(userId, diagnosisId, result) {
    await this.sendToUser(userId, {
      type: 'diagnosis_result',
      title: 'Diagnosis Result Ready',
      message: 'Your eczema diagnosis results are now available.',
      data: {
        diagnosisId,
        severity: result.severity,
        confidence: result.confidence
      },
      timestamp: new Date().toISOString()
    });
  }

  // Send appointment notification
  async sendAppointmentNotification(userId, appointment) {
    await this.sendToUser(userId, {
      type: 'appointment_update',
      title: 'Appointment Update',
      message: `Your appointment on ${appointment.date} has been ${appointment.status}`,
      data: {
        appointmentId: appointment.id,
        status: appointment.status,
        date: appointment.date
      },
      timestamp: new Date().toISOString()
    });
  }

  // Send doctor message notification
  async sendDoctorMessage(patientId, doctorName, messagePreview, title = null, message = null) {
    await this.sendToUser(patientId, {
      type: 'doctor_message',
      title: title || 'New Message from Doctor',
      message: message || `Dr. ${doctorName} has sent you a message`,
      data: {
        preview: messagePreview.substring(0, 100),
        doctorName
      },
      timestamp: new Date().toISOString()
    });
  }

  // Store notifications in database for offline users
  async storeNotification(userId, notification) {
    try {
      const { mysqlPool } = require('../config/database');
      const connection = await mysqlPool.getConnection();
      
      await connection.query(
        'INSERT INTO notifications (user_id, type, title, message, data) VALUES (?, ?, ?, ?, ?)',
        [userId, notification.type, notification.title, notification.message, JSON.stringify(notification.data)]
      );
      
      connection.release();
      console.log(`[NotificationService] Stored notification for user ${userId}:`, notification);
    } catch (error) {
      console.error('Failed to store notification:', error);
    }
  }

  // Get unread notifications for user
  async getUnreadNotifications(userId) {
    try {
      const { mysqlPool } = require('../config/database');
      const connection = await mysqlPool.getConnection();
      
      const [notifications] = await connection.query(
        'SELECT * FROM notifications WHERE user_id = ? AND read = false ORDER BY created_at DESC',
        [userId]
      );
      
      connection.release();
      return notifications;
    } catch (error) {
      console.error('Failed to get unread notifications:', error);
      return [];
    }
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    try {
      const { mysqlPool } = require('../config/database');
      const connection = await mysqlPool.getConnection();
      
      await connection.query(
        'UPDATE notifications SET read = true WHERE id = ? AND user_id = ?',
        [notificationId, userId]
      );
      
      connection.release();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }
}

module.exports = NotificationService;
