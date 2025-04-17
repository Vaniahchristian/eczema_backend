const { Sequelize, DataTypes } = require('sequelize');
const mongoose = require('mongoose');
const { sequelize } = require('../config/database');

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
    image_url: DataTypes.STRING
  }, {
    tableName: 'users'
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
    allergies: DataTypes.TEXT
  }, {
    tableName: 'patients'
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
      allowNull: false
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
      type: DataTypes.JSON,
      defaultValue: {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: []
      }
    }
  }, {
    tableName: 'doctor_profiles'
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
    tableName: 'diagnoses'
  })
};

// Create associations
MySQL.User.hasOne(MySQL.Patient, {
  foreignKey: 'user_id',
  as: 'patient'
});
MySQL.Patient.belongsTo(MySQL.User, {
  foreignKey: 'user_id',
  as: 'user'
});

MySQL.User.hasOne(MySQL.DoctorProfile, {
  foreignKey: 'user_id',
  as: 'doctor_profile'
});
MySQL.DoctorProfile.belongsTo(MySQL.User, {
  foreignKey: 'user_id',
  as: 'user'
});

MySQL.User.hasMany(MySQL.Diagnosis, {
  foreignKey: 'user_id',
  as: 'diagnoses'
});
MySQL.Diagnosis.belongsTo(MySQL.User, {
  foreignKey: 'user_id',
  as: 'user'
});

module.exports = {
  MySQL,
  User,
  sequelize
};