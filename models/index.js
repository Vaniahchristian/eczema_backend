const { Sequelize } = require('sequelize');
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

// Register MongoDB models
const User = mongoose.model('User', userSchema);

// MySQL models
const MySQL = {
  User: sequelize.define('users', {
    id: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    email: {
      type: Sequelize.STRING,
      unique: true
    },
    password: Sequelize.STRING,
    role: {
      type: Sequelize.ENUM('patient', 'doctor', 'researcher', 'admin'),
      defaultValue: 'patient'
    },
    first_name: Sequelize.STRING,
    last_name: Sequelize.STRING,
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    }
  }, {
    // Model methods
    classMethods: {
      async findByEmail(email) {
        return await this.findOne({ where: { email } });
      }
    }
  }),
  Patient: sequelize.define('patients', {
    id: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    user_id: {
      type: Sequelize.STRING,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    date_of_birth: Sequelize.DATE,
    gender: Sequelize.STRING,
    medical_history: Sequelize.TEXT,
    allergies: Sequelize.TEXT,
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    }
  }),
  Diagnosis: sequelize.define('diagnoses', {
    id: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    user_id: {
      type: Sequelize.STRING,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    severity: {
      type: Sequelize.ENUM('mild', 'moderate', 'severe'),
      allowNull: false
    },
    confidence: {
      type: Sequelize.FLOAT,
      allowNull: false
    },
    notes: Sequelize.TEXT,
    image_url: Sequelize.STRING,
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    }
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
  User // Export MongoDB User model
};
