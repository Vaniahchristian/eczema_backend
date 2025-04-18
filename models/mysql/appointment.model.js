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
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'cancelled'),
    defaultValue: 'pending',
    allowNull: false
  },
  appointment_type: {
    type: DataTypes.ENUM('regular', 'first_visit', 'follow_up', 'emergency'),
    defaultValue: 'regular',
    allowNull: false
  },
  mode: {
    type: DataTypes.STRING,
    defaultValue: 'In-person',
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
