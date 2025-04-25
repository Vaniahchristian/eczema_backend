const mongoose = require('mongoose');
const { MySQL } = require('../models');

const Message = require('../models/mongodb/Message');
const Diagnosis = require('../models/mongodb/Diagnosis');
const { logOperation, logger } = require('../middleware/logger');
const moment = require('moment');

// Input validation helper
const validateTimeRange = (timeRange) => {
    if (!timeRange?.start || !timeRange?.end || !(timeRange.start instanceof Date) || !(timeRange.end instanceof Date)) {
        throw new Error('Invalid time range');
    }
    if (timeRange.start > timeRange.end) {
        throw new Error('Start date must be before end date');
    }
};

// User Analytics
const getUserDemographics = async () => {
    try {
        logOperation('getUserDemographics', 'Fetching user demographics data');
        const result = await MySQL.User.aggregate([
            {
                $group: {
                    _id: null,
                    ageDistribution: {
                        $push: {
                            age: {
                                $dateDiff: {
                                    startDate: "$dateOfBirth",
                                    endDate: new Date(),
                                    unit: "year"
                                }
                            },
                            count: { $sum: 1 }
                        }
                    },
                    genderDistribution: {
                        $push: {
                            gender: "$gender",
                            count: { $sum: 1 }
                        }
                    },
                    totalUsers: { $sum: 1 }
                }
            }
        ]);
        logOperation('getUserDemographics', { success: true, resultCount: result.length });
        return result;
    } catch (error) {
        logger.error('Error in getUserDemographics:', error);
        throw new Error('Error fetching user demographics: ' + error.message);
    }
};

const getDiagnosisPatterns = async (timeRange) => {
    try {
        logOperation('getDiagnosisPatterns', { timeRange });
        validateTimeRange(timeRange);
        const result = await Diagnosis.aggregate([
            {
                $match: {
                    createdAt: { $gte: timeRange.start, $lte: timeRange.end }
                }
            },
            {
                $group: {
                    _id: {
                        severity: "$severity",
                        month: { $month: "$createdAt" }
                    },
                    count: { $sum: 1 },
                    avgConfidenceScore: { $avg: "$mlConfidenceScore" }
                }
            }
        ]);
        logOperation('getDiagnosisPatterns', { success: true, resultCount: result.length });
        return result;
    } catch (error) {
        logger.error('Error in getDiagnosisPatterns:', error);
        throw new Error('Error fetching diagnosis patterns: ' + error.message);
    }
};

const getTreatmentAnalytics = async () => {
    try {
        logOperation('getTreatmentAnalytics', 'Fetching treatment analytics data');
        const result = await Diagnosis.aggregate([
            {
                $lookup: {
                    from: "treatments",
                    localField: "treatmentId",
                    foreignField: "_id",
                    as: "treatment"
                }
            },
            {
                $group: {
                    _id: "$treatment.type",
                    successRate: {
                        $avg: { $cond: [{ $eq: ["$outcome", "successful"] }, 1, 0] }
                    },
                    averageRecoveryTime: { $avg: "$recoveryTime" },
                    totalCases: { $sum: 1 }
                }
            }
        ]);
        logOperation('getTreatmentAnalytics', { success: true, resultCount: result.length });
        return result;
    } catch (error) {
        logger.error('Error in getTreatmentAnalytics:', error);
        throw new Error('Error fetching treatment analytics: ' + error.message);
    }
};

const getDailyActiveUsers = async (timeRange) => {
    try {
        logOperation('getDailyActiveUsers', { timeRange });
        validateTimeRange(timeRange);
        const result = await MySQL.User.aggregate([
            {
                $match: {
                    lastLoginAt: { $gte: timeRange.start, $lte: timeRange.end }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$lastLoginAt" } },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    date: '$_id',
                    count: 1
                }
            }
        ]);
        logOperation('getDailyActiveUsers', { success: true, resultCount: result.length });
        return result;
    } catch (error) {
        logger.error('Error in getDailyActiveUsers:', error);
        throw new Error('Error fetching daily active users: ' + error.message);
    }
};

const getHourlyDiagnosisDistribution = async (timeRange) => {
    try {
        logOperation('getHourlyDiagnosisDistribution', { timeRange });
        validateTimeRange(timeRange);
        const result = await Diagnosis.aggregate([
            {
                $match: {
                    createdAt: { $gte: timeRange.start, $lte: timeRange.end }
                }
            },
            {
                $group: {
                    _id: { $hour: "$createdAt" },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    hour: '$_id',
                    count: 1
                }
            }
        ]);
        logOperation('getHourlyDiagnosisDistribution', { success: true, resultCount: result.length });
        return result;
    } catch (error) {
        logger.error('Error in getHourlyDiagnosisDistribution:', error);
        throw new Error('Error fetching hourly diagnosis distribution: ' + error.message);
    }
};

const getUserRetention = async (timeRange) => {
    try {
        logOperation('getUserRetention', { timeRange });
        validateTimeRange(timeRange);
        const weeks = [];
        const startDate = moment(timeRange.start);
        const endDate = moment(timeRange.end);

        while (startDate.isBefore(endDate)) {
            const weekStart = startDate.clone().startOf('week');
            const weekEnd = startDate.clone().endOf('week');

            const [totalUsers, retainedUsers] = await Promise.all([
                MySQL.User.countDocuments({
                    createdAt: { $lte: weekEnd }
                }),
                MySQL.User.countDocuments({
                    createdAt: { $lte: weekEnd },
                    lastLoginAt: { $gte: weekStart, $lte: weekEnd }
                })
            ]);

            weeks.push({
                week: weekStart.format('YYYY-MM-DD'),
                total: totalUsers,
                retained: retainedUsers
            });

            startDate.add(1, 'week');
        }

        logOperation('getUserRetention', { success: true, resultCount: weeks.length });
        return weeks;
    } catch (error) {
        logger.error('Error in getUserRetention:', error);
        throw new Error('Error fetching user retention: ' + error.message);
    }
};

const getUserActivity = async (timeRange) => {
    try {
        logOperation('getUserActivity', { timeRange });
        validateTimeRange(timeRange);
        const days = [];
        const startDate = moment(timeRange.start);
        const endDate = moment(timeRange.end);

        while (startDate.isBefore(endDate)) {
            const dayStart = startDate.clone().startOf('day');
            const dayEnd = startDate.clone().endOf('day');

            const [diagnoses, messages, appointments] = await Promise.all([
                Diagnosis.countDocuments({
                    createdAt: {
                        $gte: dayStart.toDate(),
                        $lte: dayEnd.toDate()
                    }
                }),
                Message.countDocuments({
                    createdAt: {
                        $gte: dayStart.toDate(),
                        $lte: dayEnd.toDate()
                    }
                }),
                MySQL.Appointment.count({
                    where: {
                        appointment_date: {
                            [MySQL.sequelize.Op.between]: [dayStart.toDate(), dayEnd.toDate()]
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

        logOperation('getUserActivity', { success: true, resultCount: days.length });
        return days;
    } catch (error) {
        logger.error('Error in getUserActivity:', error);
        throw new Error('Error fetching user activity: ' + error.message);
    }
};

// Doctor Analytics
const getDoctorPerformance = async (doctorId, timeRange) => {
    try {
        logOperation('getDoctorPerformance', { doctorId, timeRange });
        validateTimeRange(timeRange);
        const result = await Diagnosis.aggregate([
            {
                $match: {
                    doctorId: mongoose.Types.ObjectId(doctorId),
                    createdAt: { $gte: timeRange.start, $lte: timeRange.end }
                }
            },
            {
                $group: {
                    _id: "$doctorId",
                    totalDiagnoses: { $sum: 1 },
                    avgResponseTime: { $avg: "$responseTime" },
                    accuracyRate: {
                        $avg: { 
                            $cond: [
                                { $eq: ["$doctorDiagnosis", "$mlDiagnosis"] },
                                1,
                                0
                            ]
                        }
                    },
                    patientSatisfaction: { $avg: "$satisfactionScore" }
                }
            }
        ]);
        logOperation('getDoctorPerformance', { success: true, resultCount: result.length });
        return result;
    } catch (error) {
        logger.error('Error in getDoctorPerformance:', error);
        throw new Error('Error fetching doctor performance: ' + error.message);
    }
};

const getAppointmentAnalytics = async (doctorId) => {
    try {
        logOperation('getAppointmentAnalytics', { doctorId });
        const result = await MySQL.Appointment.findAll({
            where: {
                doctor_id: doctorId
            },
            attributes: [
                [MySQL.sequelize.fn('COUNT', MySQL.sequelize.col('status')), 'count'],
                [MySQL.sequelize.fn('AVG', MySQL.sequelize.col('duration')), 'avgDuration'],
                [MySQL.sequelize.fn('AVG', MySQL.sequelize.col('status')), 'completionRate']
            ],
            group: ['status']
        });
        logOperation('getAppointmentAnalytics', { success: true, resultCount: result.length });
        return result;
    } catch (error) {
        logger.error('Error in getAppointmentAnalytics:', error);
        throw new Error('Error fetching appointment analytics: ' + error.message);
    }
};

const getClinicalInsights = async (doctorId) => {
    try {
        logOperation('getClinicalInsights', { doctorId });
        const result = await Diagnosis.aggregate([
            {
                $match: { doctorId: mongoose.Types.ObjectId(doctorId) }
            },
            {
                $lookup: {
                    from: "treatments",
                    localField: "treatmentId",
                    foreignField: "_id",
                    as: "treatment"
                }
            },
            {
                $group: {
                    _id: "$treatment.type",
                    prescriptionCount: { $sum: 1 },
                    successRate: {
                        $avg: { $cond: [{ $eq: ["$outcome", "successful"] }, 1, 0] }
                    },
                    avgReviewTime: { $avg: "$reviewTime" },
                    secondOpinionRate: {
                        $avg: { $cond: [{ $eq: ["$requiresSecondOpinion", true] }, 1, 0] }
                    }
                }
            }
        ]);
        logOperation('getClinicalInsights', { success: true, resultCount: result.length });
        return result;
    } catch (error) {
        logger.error('Error in getClinicalInsights:', error);
        throw new Error('Error fetching clinical insights: ' + error.message);
    }
};

const getSurveyAnalytics = async (timeRange) => {
    try {
        logOperation('getSurveyAnalytics', { timeRange });
        validateTimeRange(timeRange);
        
        // Pre-diagnosis survey analytics
        const preDiagnosisStats = await Diagnosis.aggregate([
            {
                $match: {
                    createdAt: { $gte: timeRange.start, $lte: timeRange.end },
                    'preDiagnosisSurvey': { $exists: true }
                }
            },
            {
                $group: {
                    _id: null,
                    totalResponses: { $sum: 1 },
                    eczemaHistoryDistribution: {
                        $addToSet: {
                            history: "$preDiagnosisSurvey.eczemaHistory",
                            count: { $sum: 1 }
                        }
                    },
                    commonTriggers: {
                        $addToSet: {
                            trigger: "$preDiagnosisSurvey.flareupTriggers",
                            count: { $sum: 1 }
                        }
                    },
                    severityDistribution: {
                        $addToSet: {
                            severity: "$preDiagnosisSurvey.severity",
                            count: { $sum: 1 }
                        }
                    }
                }
            }
        ]);

        // Post-diagnosis survey analytics
        const postDiagnosisStats = await Diagnosis.aggregate([
            {
                $match: {
                    createdAt: { $gte: timeRange.start, $lte: timeRange.end },
                    'postDiagnosisSurvey': { $exists: true }
                }
            },
            {
                $group: {
                    _id: null,
                    totalFeedbacks: { $sum: 1 },
                    avgDiagnosisAccuracy: { $avg: '$postDiagnosisSurvey.diagnosisAccuracy' },
                    avgHelpfulness: { $avg: '$postDiagnosisSurvey.diagnosisHelpfulness' },
                    avgTreatmentClarity: { $avg: '$postDiagnosisSurvey.treatmentClarity' },
                    avgUserConfidence: { $avg: '$postDiagnosisSurvey.userConfidence' },
                    recommendationRate: {
                        $avg: { $cond: ['$postDiagnosisSurvey.wouldRecommend', 1, 0] }
                    },
                    feedbackSentiments: { $push: '$postDiagnosisSurvey.feedback' }
                }
            }
        ]);

        const result = {
            preDiagnosisAnalytics: preDiagnosisStats[0] || {
                totalResponses: 0,
                eczemaHistoryDistribution: [],
                commonTriggers: [],
                severityDistribution: []
            },
            postDiagnosisAnalytics: postDiagnosisStats[0] || {
                totalFeedbacks: 0,
                avgDiagnosisAccuracy: 0,
                avgHelpfulness: 0,
                avgTreatmentClarity: 0,
                avgUserConfidence: 0,
                recommendationRate: 0,
                feedbackSentiments: []
            }
        };

        logOperation('getSurveyAnalytics', {
            success: true,
            preDiagnosisCount: result.preDiagnosisAnalytics.totalResponses,
            postDiagnosisCount: result.postDiagnosisAnalytics.totalFeedbacks
        });

        return result;
    } catch (error) {
        logger.error('Error in getSurveyAnalytics:', error);
        throw new Error('Error fetching survey analytics: ' + error.message);
    }
};

const getCorrelationAnalytics = async (timeRange) => {
    try {
        logOperation('getCorrelationAnalytics', { timeRange });
        validateTimeRange(timeRange);
        const correlations = await Diagnosis.aggregate([
            {
                $match: {
                    createdAt: { $gte: timeRange.start, $lte: timeRange.end },
                    'preDiagnosisSurvey': { $exists: true },
                    'postDiagnosisSurvey': { $exists: true }
                }
            },
            {
                $group: {
                    _id: '$preDiagnosisSurvey.severity',
                    avgAccuracy: { $avg: '$postDiagnosisSurvey.diagnosisAccuracy' },
                    avgConfidence: { $avg: '$postDiagnosisSurvey.userConfidence' },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    severity: '$_id',
                    avgAccuracy: { $round: ['$avgAccuracy', 2] },
                    avgConfidence: { $round: ['$avgConfidence', 2] },
                    count: 1
                }
            }
        ]);

        logOperation('getCorrelationAnalytics', { success: true, resultCount: correlations.length });
        return correlations;
    } catch (error) {
        logger.error('Error in getCorrelationAnalytics:', error);
        throw new Error('Error fetching correlation analytics: ' + error.message);
    }
};

module.exports = {
    // User Analytics
    getUserDemographics,
    getDiagnosisPatterns,
    getTreatmentAnalytics,
    getDailyActiveUsers,
    getHourlyDiagnosisDistribution,
    getUserRetention,
    getUserActivity,
    // Survey Analytics
    getSurveyAnalytics,
    getCorrelationAnalytics,
    // Doctor Analytics
    getDoctorPerformance,
    getAppointmentAnalytics,
    getClinicalInsights
};
