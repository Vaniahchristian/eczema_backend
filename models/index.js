const { Sequelize, DataTypes } = require('sequelize');
const mongoose = require('mongoose');
const { sequelize } = require('../config/database');
const Diagnosis = require('./mongodb/Diagnosis');
const Analytics = require('./mongodb/Analytics');
const Advisory = require('./mongodb/Advisory');

// MongoDB Schemas
const userSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  role: {
    type: String,
    enum: ['patient', 'doctor', 'researcher', 'admin'],
    default: 'patient'
  },
  first_name: String,
  last_name: String,
  created_at: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', userSchema);

// MySQL models
const MySQL = {
  User: sequelize.define('users', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      unique: true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    reset_password_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    reset_password_expires: {
      type: DataTypes.DATE,
      allowNull: true
    },
    role: {
      type: DataTypes.ENUM('patient', 'doctor', 'researcher', 'admin'),
      defaultValue: 'patient'
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    date_of_birth: DataTypes.DATE,
    gender: DataTypes.STRING,
    image_url: DataTypes.STRING,
    last_active: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }),

  Patient: sequelize.define('patients', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.STRING,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    date_of_birth: DataTypes.DATE,
    gender: DataTypes.STRING,
    medical_history: DataTypes.TEXT,
    allergies: DataTypes.TEXT,
    region: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'patients',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }),

  DoctorProfile: sequelize.define('doctor_profiles', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.STRING,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    specialty: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'Dermatologist'
    },
    bio: DataTypes.TEXT,
    rating: {
      type: DataTypes.FLOAT,
      defaultValue: 5.0
    },
    experience_years: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    clinic_name: DataTypes.STRING,
    clinic_address: DataTypes.TEXT,
    consultation_fee: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    available_hours: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: JSON.stringify({
        monday: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
        tuesday: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
        wednesday: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
        thursday: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
        friday: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
        saturday: [],
        sunday: []
      }),
      get() {
        const rawValue = this.getDataValue('available_hours');
        return rawValue ? JSON.parse(rawValue) : null;
      },
      set(value) {
        this.setDataValue('available_hours', typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
  }, {
    tableName: 'doctor_profiles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }),

  Diagnosis: sequelize.define('diagnoses', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.STRING,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    severity: {
      type: DataTypes.ENUM('mild', 'moderate', 'severe'),
      allowNull: false
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    notes: DataTypes.TEXT,
    image_url: DataTypes.STRING
  }, {
    tableName: 'diagnoses',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }),

  Treatment: sequelize.define('treatments', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    diagnosis_id: {
      type: DataTypes.STRING,
      references: {
        model: 'diagnoses',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.STRING,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    treatment_type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: DataTypes.TEXT,
    outcome: {
      type: DataTypes.ENUM('improved', 'no_change', 'worsened'),
      defaultValue: 'no_change'
    },
    start_date: DataTypes.DATE,
    end_date: DataTypes.DATE
  }, {
    tableName: 'treatments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }),

  Appointment: sequelize.define('appointments', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    doctor_id: {
      type: DataTypes.STRING,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    patient_id: {
      type: DataTypes.STRING,
      references: {
        model: 'users',
        key: 'id'
      }
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
      type: DataTypes.ENUM('pending', 'confirmed', 'cancelled', 'completed'),
      defaultValue: 'pending'
    },
    appointment_type: {
      type: DataTypes.ENUM('regular', 'follow_up', 'emergency'),
      defaultValue: 'regular'
    },
    mode: {
      type: DataTypes.ENUM('in_person', 'video', 'phone'),
      defaultValue: 'in_person'
    },
    duration: {
      type: DataTypes.INTEGER,
      defaultValue: 30
    }
  }, {
    tableName: 'appointments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }),

  ApiStats: sequelize.define('api_stats', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    endpoint: {
      type: DataTypes.STRING,
      allowNull: false
    },
    responseTime: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'api_stats',
    timestamps: false
  }),
};

// Create associations
MySQL.User.hasOne(MySQL.Patient, {
  foreignKey: 'user_id',
  as: 'patient',
  onDelete: 'CASCADE'
});
MySQL.Patient.belongsTo(MySQL.User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'CASCADE'
});

MySQL.User.hasOne(MySQL.DoctorProfile, {
  foreignKey: 'user_id',
  as: 'doctor_profile',
  onDelete: 'CASCADE'
});
MySQL.DoctorProfile.belongsTo(MySQL.User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'CASCADE'
});

MySQL.User.hasMany(MySQL.Diagnosis, {
  foreignKey: 'user_id',
  as: 'diagnoses',
  onDelete: 'CASCADE'
});
MySQL.Diagnosis.belongsTo(MySQL.User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'CASCADE'
});

MySQL.User.hasMany(MySQL.Treatment, {
  foreignKey: 'user_id',
  as: 'treatments',
  onDelete: 'CASCADE'
});
MySQL.Treatment.belongsTo(MySQL.User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'CASCADE'
});

MySQL.Diagnosis.hasMany(MySQL.Treatment, {
  foreignKey: 'diagnosis_id',
  as: 'treatments',
  onDelete: 'CASCADE'
});
MySQL.Treatment.belongsTo(MySQL.Diagnosis, {
  foreignKey: 'diagnosis_id',
  as: 'diagnosis',
  onDelete: 'CASCADE'
});

MySQL.User.hasMany(MySQL.Appointment, {
  foreignKey: 'doctor_id',
  as: 'doctor_appointments',
  onDelete: 'CASCADE'
});

MySQL.User.hasMany(MySQL.Appointment, {
  foreignKey: 'patient_id',
  as: 'patient_appointments',
  onDelete: 'CASCADE'
});

MySQL.Appointment.belongsTo(MySQL.User, {
  foreignKey: 'doctor_id',
  as: 'doctor',
  onDelete: 'CASCADE'
});

MySQL.Appointment.belongsTo(MySQL.User, {
  foreignKey: 'patient_id',
  as: 'patient',
  onDelete: 'CASCADE'
});

module.exports = {
  MySQL,
  User,
  sequelize,
  Diagnosis,
  Analytics,
  Advisory
};