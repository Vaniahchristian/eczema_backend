const { mysqlPool } = require('../config/database');
const mongoose = require('mongoose');
const Diagnosis = require('../models/mongodb/Diagnosis');
const json2csv = require('json2csv').parse;
const ExcelJS = require('exceljs');
const moment = require('moment');
const { MySQL, User } = require('../models');
const { createObjectCsvStringifier } = require('csv-writer');
const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');

// Helper to format data for export
const formatPatientData = (data) => {
    return data.map(record => ({
        patientId: record.patient_id,
        name: `${record.first_name} ${record.last_name}`,
        dateOfBirth: moment(record.date_of_birth).format('YYYY-MM-DD'),
        diagnosisCount: record.diagnosis_count,
        lastVisit: moment(record.last_visit).format('YYYY-MM-DD HH:mm:ss'),
        severity: record.severity,
        treatmentStatus: record.treatment_status
    }));
};

const exportController = {
    // Export patient records in CSV format
    async exportPatientRecords(req, res) {
        try {
            const connection = await mysqlPool.getConnection();
            const [patients] = await connection.query(`
                SELECT 
                    p.patient_id,
                    p.first_name,
                    p.last_name,
                    p.date_of_birth,
                    COUNT(d.diagnosis_id) as diagnosis_count,
                    MAX(d.created_at) as last_visit,
                    d.severity,
                    t.status as treatment_status
                FROM patients p
                LEFT JOIN diagnoses d ON p.patient_id = d.patient_id
                LEFT JOIN treatments t ON d.diagnosis_id = t.diagnosis_id
                GROUP BY p.patient_id
            `);
            connection.release();

            const formattedData = formatPatientData(patients);
            const csv = json2csv(formattedData);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=patient_records.csv');
            return res.status(200).send(csv);
        } catch (error) {
            console.error('Export error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to export patient records'
            });
        }
    },

    // Export diagnosis data in CSV format
    async exportDiagnosisData(req, res) {
        try {
            const { startDate, endDate } = req.query;
            const userId = req.user.id;

            // Get diagnoses from MySQL
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

            // Create CSV even if no diagnoses found
            const csvStringifier = createObjectCsvStringifier({
                header: [
                    { id: 'date', title: 'Date' },
                    { id: 'severity', title: 'Severity' },
                    { id: 'confidence', title: 'Confidence' },
                    { id: 'notes', title: 'Notes' }
                ]
            });

            const records = diagnoses.map(d => ({
                date: moment(d.created_at).format('YYYY-MM-DD'),
                severity: d.severity,
                confidence: d.confidence ? d.confidence.toFixed(2) : 'N/A',
                notes: d.notes || ''
            }));

            const csvString = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=diagnoses-${moment().format('YYYY-MM-DD')}.csv`);
            res.send(csvString);

        } catch (error) {
            console.error('Export error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export diagnosis data'
            });
        }
    },

    // Export analytics report as PDF
    async exportAnalyticsReport(req, res) {
        try {
            const { startDate, endDate } = req.query;
            const userId = req.user.id;

            // Get user with patient data
            const user = await MySQL.User.findOne({
                where: { id: userId },
                include: [{
                    model: MySQL.Patient,
                    as: 'patient'
                }]
            });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Create PDF document
            const doc = new PDFDocument();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=analytics-${moment().format('YYYY-MM-DD')}.pdf`);
            doc.pipe(res);

            // Add title
            doc.fontSize(20).text('Analytics Report', { align: 'center' });
            doc.moveDown();

            // Add date range
            if (startDate && endDate) {
                doc.fontSize(12).text(`Date Range: ${moment(startDate).format('YYYY-MM-DD')} - ${moment(endDate).format('YYYY-MM-DD')}`);
                doc.moveDown();
            }

            // Add user information
            doc.fontSize(14).text('User Information');
            doc.fontSize(12).text(`Name: ${user.first_name} ${user.last_name}`);
            doc.fontSize(12).text(`Email: ${user.email}`);
            doc.moveDown();

            // Add patient information if available
            if (user.patient) {
                doc.fontSize(14).text('Patient Information');
                doc.fontSize(12).text(`Date of Birth: ${user.patient.date_of_birth ? moment(user.patient.date_of_birth).format('YYYY-MM-DD') : 'Not provided'}`);
                doc.fontSize(12).text(`Gender: ${user.patient.gender || 'Not provided'}`);
                doc.fontSize(12).text(`Region: ${user.patient.region || 'Not provided'}`);
                doc.moveDown();
            }

            // Get diagnoses summary
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

            doc.fontSize(14).text('Diagnosis Summary');
            if (diagnoses.length > 0) {
                // Calculate severity distribution
                const severityCount = diagnoses.reduce((acc, d) => {
                    acc[d.severity] = (acc[d.severity] || 0) + 1;
                    return acc;
                }, {});

                Object.entries(severityCount).forEach(([severity, count]) => {
                    doc.fontSize(12).text(`${severity}: ${count} diagnoses`);
                });
                
                // Calculate average confidence
                const avgConfidence = diagnoses.reduce((sum, d) => sum + (d.confidence || 0), 0) / diagnoses.length;
                doc.fontSize(12).text(`Average Confidence: ${avgConfidence.toFixed(2)}`);
            } else {
                doc.fontSize(12).text('No diagnoses found for the selected period');
            }
            doc.moveDown();

            // Add treatments summary if available
            const treatments = await MySQL.Treatment.findAll({
                where: {
                    user_id: userId,
                    ...(startDate && endDate ? {
                        created_at: {
                            [Op.between]: [new Date(startDate), new Date(endDate)]
                        }
                    } : {})
                }
            });

            if (treatments.length > 0) {
                doc.fontSize(14).text('Treatment Summary');
                const treatmentsByType = treatments.reduce((acc, t) => {
                    acc[t.treatment_type] = (acc[t.treatment_type] || 0) + 1;
                    return acc;
                }, {});

                Object.entries(treatmentsByType).forEach(([type, count]) => {
                    doc.fontSize(12).text(`${type}: ${count} treatments`);
                });
            }

            // Finalize PDF
            doc.end();

        } catch (error) {
            console.error('Export error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export analytics report'
            });
        }
    }
};

module.exports = exportController;
