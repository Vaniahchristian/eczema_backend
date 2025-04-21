const { MySQL: { User, Patient, Treatment, Appointment }, sequelize } = require('../models/index');
const Message = require('../models/mongodb/Message');
const Diagnosis = require('../models/mongodb/Diagnosis');
const analyticsService = require('../services/analyticsService');

const { logOperation, logger } = require('../middleware/logger');

const moment = require('moment');
const { Op } = require('sequelize');

// Get age distribution
exports.getAgeDistribution = async (req, res) => {
    try {
        const result = await User.findAll({
            attributes: [
                [sequelize.literal(`
                    CASE 
                        WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) < 18 THEN 'Under 18'
                        WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 18 AND 30 THEN '18-30'
                        WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 31 AND 50 THEN '31-50'
                        ELSE 'Over 50'
                    END
                `), 'age_group'],
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            group: ['age_group']
        });

        res.json({
            success: true,
            data: {
                ageGroups: result
            }
        });
    } catch (error) {
        logger.error('Error in getAgeDistribution:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching age distribution',
            error: error.message
        });
    }
};

// Get geographical distribution
exports.getGeographicalDistribution = async (req, res) => {
    try {
        const result = await Patient.findAll({
            attributes: [
                'region',
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            where: {
                region: {
                    [Op.not]: null
                }
            },
            group: ['region']
        });

        res.json({
            success: true,
            data: {
                regions: result
            }
        });
    } catch (error) {
        logger.error('Error in getGeographicalDistribution:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching geographical distribution',
            error: error.message
        });
    }
};

// Get severity distribution
exports.getSeverityDistribution = async (req, res) => {
    try {
        const result = await Diagnosis.aggregate([
            {
                $group: {
                    _id: '$severity',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                severityLevels: result
            }
        });
    } catch (error) {
        logger.error('Error in getSeverityDistribution:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching severity distribution',
            error: error.message
        });
    }
};

// Get treatment effectiveness
exports.getTreatmentEffectiveness = async (req, res) => {
    try {
        const result = await Treatment.findAll({
            attributes: [
                'treatment_type',
                [sequelize.fn('COUNT', '*'), 'total_count'],
                [sequelize.literal('COUNT(CASE WHEN outcome = "improved" THEN 1 END)'), 'success_count'],
                [sequelize.literal('(COUNT(CASE WHEN outcome = "improved" THEN 1 END) * 100.0 / COUNT(*))'), 'success_rate']
            ],
            group: ['treatment_type']
        });

        res.json({
            success: true,
            data: {
                treatments: result
            }
        });
    } catch (error) {
        logger.error('Error in getTreatmentEffectiveness:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching treatment effectiveness',
            error: error.message
        });
    }
};

// Get diagnosis trends
exports.getDiagnosisTrends = async (req, res) => {
    try {
        const result = await Diagnosis.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$created_at" } },
                    count: { $sum: 1 },
                    avg_severity: { $avg: "$severity" }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        res.json({
            success: true,
            data: {
                trends: result
            }
        });
    } catch (error) {
        logger.error('Error in getDiagnosisTrends:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching diagnosis trends',
            error: error.message
        });
    }
};

// Get survey analytics
exports.getSurveyAnalytics = async (req, res) => {
    try {
        const result = await Survey.findAll({
            attributes: [
                'question_id',
                [sequelize.fn('COUNT', '*'), 'total_responses'],
                [sequelize.fn('AVG', sequelize.col('response_value')), 'avg_response']
            ],
            group: ['question_id']
        });

        res.json({
            success: true,
            data: {
                surveyResults: result
            }
        });
    } catch (error) {
        logger.error('Error in getSurveyAnalytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching survey analytics',
            error: error.message
        });
    }
};

// Get correlation analytics
exports.getCorrelationAnalytics = async (req, res) => {
    try {
        const result = await Diagnosis.aggregate([
            {
                $group: {
                    _id: { severity: "$severity", weather_condition: "$weather_condition" },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                correlations: result
            }
        });
    } catch (error) {
        logger.error('Error in getCorrelationAnalytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching correlation analytics',
            error: error.message
        });
    }
};

// Get daily active users
exports.getDailyActiveUsers = async (req, res) => {
    try {
        const { start, end } = req.query;
        const result = await User.findAll({
            attributes: [
                [sequelize.fn('DATE', sequelize.col('last_login_at')), 'date'],
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            where: {
                last_login_at: {
                    [Op.between]: [new Date(start), new Date(end)]
                }
            },
            group: [sequelize.fn('DATE', sequelize.col('last_login_at'))],
            order: [[sequelize.fn('DATE', sequelize.col('last_login_at')), 'ASC']]
        });

        res.json(result);
    } catch (error) {
        logger.error('Error in getDailyActiveUsers:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching daily active users',
            error: error.message
        });
    }
};

// Get hourly diagnosis distribution
exports.getHourlyDiagnosisDistribution = async (req, res) => {
    try {
        const { start, end } = req.query;
        const result = await Diagnosis.aggregate([
            {
                $match: {
                    created_at: { $gte: new Date(start), $lte: new Date(end) }
                }
            },
            {
                $group: {
                    _id: { $hour: "$created_at" },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        res.json(result);
    } catch (error) {
        logger.error('Error in getHourlyDiagnosisDistribution:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching hourly diagnosis distribution',
            error: error.message
        });
    }
};

// Get user retention
exports.getUserRetention = async (req, res) => {
    try {
        const { start, end } = req.query;
        const startDate = moment(start);
        const endDate = moment(end);
        const weeks = [];

        while (startDate.isBefore(endDate)) {
            const weekStart = startDate.clone().startOf('week');
            const weekEnd = startDate.clone().endOf('week');

            const [totalUsers, retainedUsers] = await Promise.all([
                User.count({
                    where: {
                        created_at: {
                            [Op.lte]: weekEnd.toDate()
                        }
                    }
                }),
                User.count({
                    where: {
                        created_at: {
                            [Op.lte]: weekEnd.toDate()
                        },
                        last_login_at: {
                            [Op.between]: [weekStart.toDate(), weekEnd.toDate()]
                        }
                    }
                })
            ]);

            weeks.push({
                week: weekStart.format('YYYY-MM-DD'),
                total: totalUsers,
                retained: retainedUsers
            });

            startDate.add(1, 'week');
        }

        res.json(weeks);
    } catch (error) {
        logger.error('Error in getUserRetention:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user retention',
            error: error.message
        });
    }
};

// Get user activity
exports.getUserActivity = async (req, res) => {
    try {
        const { start, end } = req.query;
        const startDate = moment(start);
        const endDate = moment(end);
        const days = [];

        while (startDate.isBefore(endDate)) {
            const dayStart = startDate.clone().startOf('day');
            const dayEnd = startDate.clone().endOf('day');

            const [diagnoses, messages, appointments] = await Promise.all([
                Diagnosis.countDocuments({
                    created_at: { $gte: dayStart.toDate(), $lte: dayEnd.toDate() }
                }),
                Message.countDocuments({
                    createdAt: { $gte: dayStart.toDate(), $lte: dayEnd.toDate() }
                }),
                Appointment.count({
                    where: {
                        appointment_date: {
                            [Op.between]: [dayStart.toDate(), dayEnd.toDate()]
                        }
                    }
                })
            ]);

            days.push({
                date: dayStart.format('YYYY-MM-DD'),
                diagnoses,
                messages,
                appointments
            });

            startDate.add(1, 'day');
        }

        res.json(days);
    } catch (error) {
        logger.error('Error in getUserActivity:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user activity',
            error: error.message
        });
    }
};

// Get model confidence distribution
exports.getModelConfidence = async (req, res) => {
    try {
        const result = await Diagnosis.aggregate([
            {
                $group: {
                    _id: {
                        $cond: {
                            if: { $gte: ["$confidence", 0.9] },
                            then: "Very High",
                            else: {
                                $cond: {
                                    if: { $gte: ["$confidence", 0.7] },
                                    then: "High",
                                    else: {
                                        $cond: {
                                            if: { $gte: ["$confidence", 0.5] },
                                            then: "Moderate",
                                            else: "Low"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                confidenceLevels: result
            }
        });
    } catch (error) {
        logger.error('Error in getModelConfidence:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching model confidence distribution',
            error: error.message
        });
    }
};

// Get diagnosis history
exports.getDiagnosisHistory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const userId = req.user.id;

        const diagnoses = await Diagnosis.find({
            user_id: userId,
            ...(startDate && endDate ? {
                created_at: { $gte: new Date(startDate), $lte: new Date(endDate) }
            } : {})
        }).sort({ created_at: -1 });

        res.json({
            success: true,
            data: {
                history: diagnoses
            }
        });
    } catch (error) {
        logger.error('Error in getDiagnosisHistory:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching diagnosis history',
            error: error.message
        });
    }
};
