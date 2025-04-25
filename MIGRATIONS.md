# Database Migrations Guide

## Overview
This document explains how our database migration system works and how to make changes to the database schema safely.

## Table of Contents
1. [What are Migrations?](#what-are-migrations)
2. [Project Structure](#project-structure)
3. [Making Database Changes](#making-database-changes)
4. [Common Commands](#common-commands)
5. [Development vs Production](#development-vs-production)
6. [Troubleshooting](#troubleshooting)

## What are Migrations?
Migrations are like version control for your database. They allow you to:
- Track changes to your database schema
- Share these changes with other developers
- Deploy changes safely to production
- Roll back changes if something goes wrong

## Project Structure
```
backend/
├── config/
│   ├── config.json         # Database configuration for different environments
│   └── database.js         # Database connection setup
├── migrations/             # All migration files live here
│   └── YYYYMMDDHHMMSS-*.js # Migration files with timestamps
├── models/                 # Sequelize model definitions
├── start.sh               # Deployment script that runs migrations
└── .sequelizerc           # Sequelize CLI configuration
```

## Making Database Changes

### 1. Create a New Migration
```bash
npx sequelize-cli migration:generate --name what_you_are_changing
```
Example:
```bash
npx sequelize-cli migration:generate --name add_phone_to_users
```

### 2. Edit the Migration File
Every migration has two parts:
- `up`: What changes to make
- `down`: How to undo those changes

Example:
```javascript
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'phone', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'phone');
  }
};
```

### 3. Test Locally
```bash
# Apply migrations
npx sequelize-cli db:migrate

# If something goes wrong, undo
npx sequelize-cli db:migrate:undo
```

## Common Commands

### View Migration Status
```bash
npx sequelize-cli db:migrate:status
```

### Undo Last Migration
```bash
npx sequelize-cli db:migrate:undo
```

### Undo All Migrations
```bash
npx sequelize-cli db:migrate:undo:all
```

### Run Specific Migration
```bash
npx sequelize-cli db:migrate --to XXXXXXXXXXXXXX-migration-name.js
```

## Development vs Production

### Local Development
- Uses MySQL on XAMPP
- Configuration in `config/config.json` under "development"
- Can use force sync for testing (but not recommended)

### Production (Railway.app via Render)
- Uses Railway.app MySQL database
- Never uses force sync
- Migrations run automatically during deployment
- Configuration in `config/config.json` under "production"

### Environment Variables
Production requires these variables in Render:
```
MYSQL_HOST=centerbeam.proxy.rlwy.net
MYSQL_PORT=17053
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=railway
NODE_ENV=production
```

## Troubleshooting

### Common Issues

1. **Migration Failed**
   ```bash
   # Undo the failed migration
   npx sequelize-cli db:migrate:undo
   # Fix the migration file
   # Try again
   npx sequelize-cli db:migrate
   ```

2. **Foreign Key Errors**
   - Make sure tables are created/dropped in the correct order
   - Create parent tables before child tables
   - Drop child tables before parent tables

3. **Data Type Mismatches**
   - Use consistent data types across migrations
   - Common types:
     - IDs: `STRING(36)` for UUID
     - Timestamps: `DATE`
     - Text: `STRING(255)` or `TEXT`
     - Numbers: `INTEGER` or `DECIMAL(10,2)`

### Best Practices

1. **Always Include Down Migrations**
   - Make sure your `down` method properly reverses your `up` method
   - Test both `up` and `down` locally before committing

2. **Make Atomic Changes**
   - One migration should do one thing
   - Split complex changes into multiple migrations

3. **Never Edit Existing Migrations**
   - Once a migration is in production, don't change it
   - Create a new migration to fix issues

4. **Test Data Preservation**
   - Make sure your migrations don't accidentally delete data
   - Use `addColumn` instead of `dropTable` when possible

5. **Version Control**
   - Always commit migration files
   - Include both the migration and any related model changes

## Example: Complete Migration File

```javascript
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create new table
    await queryInterface.createTable('doctor_profiles', {
      id: {
        type: Sequelize.STRING(36),
        primaryKey: true
      },
      user_id: {
        type: Sequelize.STRING(36),
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      specialty: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        onUpdate: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert the changes
    await queryInterface.dropTable('doctor_profiles');
  }
};
```

## Getting Help
If you're unsure about making database changes:
1. Create a new branch
2. Test your migrations locally
3. Ask for review before merging to main
4. Always backup production data before major changes

Remember: It's better to be cautious with database changes. They can be difficult to undo if they affect user data.
