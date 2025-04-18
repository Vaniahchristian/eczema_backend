const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Appointment = sequelize.define('appointments', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  doctor_id: {
    type: DataTypes.STRING,
    references: {
      model: 'users',
      key: 'id'
    },
    allowNull: false
  },
  patient_id: {
    type: DataTypes.STRING,
    references: {
      model: 'users',
      key: 'id'
    },
    allowNull: false
  },
  appointment_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending',
    allowNull: false
  },
  appointment_type: {
    type: DataTypes.ENUM('first_visit', 'follow_up', 'emergency'),
    defaultValue: 'first_visit',
    allowNull: false
  },
  mode: {
    type: DataTypes.STRING,
    defaultValue: 'video',
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
    allowNull: false
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

// Add associations
Appointment.associate = (models) => {
  Appointment.belongsTo(models.User, {
    foreignKey: 'doctor_id',
    as: 'doctor',
    onDelete: 'CASCADE'
  });
  Appointment.belongsTo(models.User, {
    foreignKey: 'patient_id',
    as: 'patient',
    onDelete: 'CASCADE'
  });
};

module.exports = Appointment;
