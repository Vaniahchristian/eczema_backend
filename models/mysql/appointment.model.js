const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Appointment = sequelize.define('appointments', {
  appointment_id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  doctor_id: {
    type: DataTypes.STRING,
    references: {
      model: 'doctor_profiles',
      key: 'doctor_id'
    },
    allowNull: false
  },
  patient_id: {
    type: DataTypes.STRING,
    references: {
      model: 'users',
      key: 'user_id'
    },
    allowNull: false
  },
  appointment_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  reason_for_visit: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending'
  },
  appointment_type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'first_visit'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'appointments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Appointment;
