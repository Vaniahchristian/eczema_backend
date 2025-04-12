const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportDiagnosisData, exportAnalyticsReport } = require('../controllers/exportController');
const MySQL = require('../db/mysql'); // assuming MySQL is defined in this file
const { Op } = require('sequelize'); // assuming sequelize is installed

// All routes require authentication
router.use(protect);

// Export routes - accessible to all authenticated users
router.get('/export/diagnoses', authorize('doctor', 'admin', 'researcher', 'patient'), exportDiagnosisData);
router.get('/export/analytics', authorize('doctor', 'admin', 'researcher', 'patient'), exportAnalyticsReport);

// Analytics data routes - accessible to all authenticated users
router.get('/age-distribution', authorize('doctor', 'admin', 'researcher', 'patient'), async (req, res) => {
  try {
    const [results] = await MySQL.sequelize.query(`
      SELECT 
        CASE 
          WHEN age < 18 THEN 'Under 18'
          WHEN age BETWEEN 18 AND 30 THEN '18-30'
          WHEN age BETWEEN 31 AND 50 THEN '31-50'
          ELSE 'Over 50'
        END as age_group,
        COUNT(*) as count
      FROM (
        SELECT TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) as age
        FROM patients
      ) age_calc
      GROUP BY age_group
    `);

    res.json({
      success: true,
      data: {
        ageGroups: results
      }
    });
  } catch (error) {
    console.error('Age distribution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get age distribution'
    });
  }
});

router.get('/geographical-distribution', authorize('doctor', 'admin', 'researcher', 'patient'), async (req, res) => {
  try {
    const [results] = await MySQL.sequelize.query(`
      SELECT 
        region,
        COUNT(*) as count
      FROM patients
      GROUP BY region
    `);

    res.json({
      success: true,
      data: {
        regions: results
      }
    });
  } catch (error) {
    console.error('Geographical distribution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get geographical distribution'
    });
  }
});

router.get('/treatment-effectiveness', authorize('doctor', 'admin', 'researcher', 'patient'), async (req, res) => {
  try {
    const [results] = await MySQL.sequelize.query(`
      SELECT 
        treatment_type,
        COUNT(CASE WHEN outcome = 'improved' THEN 1 END) as success_count,
        COUNT(*) as total_count,
        (COUNT(CASE WHEN outcome = 'improved' THEN 1 END) * 100.0 / COUNT(*)) as success_rate
      FROM treatments
      GROUP BY treatment_type
    `);

    res.json({
      success: true,
      data: {
        treatments: results
      }
    });
  } catch (error) {
    console.error('Treatment effectiveness error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get treatment effectiveness'
    });
  }
});

router.get('/model-confidence', authorize('doctor', 'admin', 'researcher', 'patient'), async (req, res) => {
  try {
    const [results] = await MySQL.sequelize.query(`
      SELECT 
        CASE 
          WHEN confidence >= 0.9 THEN 'Very High'
          WHEN confidence >= 0.7 THEN 'High'
          WHEN confidence >= 0.5 THEN 'Moderate'
          ELSE 'Low'
        END as confidence_level,
        COUNT(*) as count
      FROM diagnoses
      GROUP BY confidence_level
    `);

    res.json({
      success: true,
      data: {
        confidenceLevels: results
      }
    });
  } catch (error) {
    console.error('Model confidence error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get model confidence data'
    });
  }
});

router.get('/diagnosis-history', authorize('doctor', 'admin', 'researcher', 'patient'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user.id;

    const diagnoses = await MySQL.Diagnosis.findAll({
      where: {
        user_id: userId,
        ...(startDate && endDate ? {
          created_at: {
            [Op.between]: [new Date(startDate), new Date(endDate)]
          }
        } : {})
      },
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        history: diagnoses
      }
    });
  } catch (error) {
    console.error('Diagnosis history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get diagnosis history'
    });
  }
});

module.exports = router;
