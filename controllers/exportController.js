const { mysqlPool } = require('../config/database');
const mongoose = require('mongoose');
const Diagnosis = require('../models/mongodb/Diagnosis');
const json2csv = require('json2csv').parse;
const ExcelJS = require('exceljs');
const moment = require('moment');

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

    // Export diagnosis data in Excel format
    async exportDiagnosisData(req, res) {
        try {
            const diagnoses = await Diagnosis.find()
                .populate('patientId', 'firstName lastName')
                .sort('-createdAt');

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Diagnoses');

            // Define columns
            worksheet.columns = [
                { header: 'Patient Name', key: 'patientName', width: 20 },
                { header: 'Diagnosis Date', key: 'diagnosisDate', width: 15 },
                { header: 'Severity', key: 'severity', width: 10 },
                { header: 'Confidence Score', key: 'confidence', width: 15 },
                { header: 'Affected Areas', key: 'areas', width: 20 },
                { header: 'Treatment Plan', key: 'treatment', width: 30 }
            ];

            // Add data
            diagnoses.forEach(diagnosis => {
                worksheet.addRow({
                    patientName: `${diagnosis.patientId.firstName} ${diagnosis.patientId.lastName}`,
                    diagnosisDate: moment(diagnosis.createdAt).format('YYYY-MM-DD'),
                    severity: diagnosis.severity,
                    confidence: diagnosis.confidenceScore,
                    areas: diagnosis.affectedAreas.join(', '),
                    treatment: diagnosis.treatmentPlan
                });
            });

            // Style the header row
            worksheet.getRow(1).font = { bold: true };

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=diagnosis_data.xlsx');

            await workbook.xlsx.write(res);
            return res.end();
        } catch (error) {
            console.error('Export error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to export diagnosis data'
            });
        }
    },

    // Export analytics report
    async exportAnalyticsReport(req, res) {
        try {
            const workbook = new ExcelJS.Workbook();
            
            // Age distribution sheet
            const ageSheet = workbook.addWorksheet('Age Distribution');
            const [ageData] = await mysqlPool.query(`
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

            ageSheet.columns = [
                { header: 'Age Group', key: 'ageGroup', width: 15 },
                { header: 'Patient Count', key: 'count', width: 15 }
            ];
            ageData.forEach(row => {
                ageSheet.addRow({
                    ageGroup: row.age_group,
                    count: row.count
                });
            });

            // Treatment effectiveness sheet
            const treatmentSheet = workbook.addWorksheet('Treatment Effectiveness');
            const treatments = await Diagnosis.aggregate([
                {
                    $group: {
                        _id: '$treatmentPlan',
                        successCount: {
                            $sum: { $cond: [{ $eq: ['$outcome', 'improved'] }, 1, 0] }
                        },
                        totalCount: { $sum: 1 }
                    }
                }
            ]);

            treatmentSheet.columns = [
                { header: 'Treatment Plan', key: 'treatment', width: 30 },
                { header: 'Success Rate', key: 'successRate', width: 15 },
                { header: 'Total Cases', key: 'totalCases', width: 15 }
            ];

            treatments.forEach(treatment => {
                treatmentSheet.addRow({
                    treatment: treatment._id,
                    successRate: ((treatment.successCount / treatment.totalCount) * 100).toFixed(2) + '%',
                    totalCases: treatment.totalCount
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=analytics_report.xlsx');

            await workbook.xlsx.write(res);
            return res.end();
        } catch (error) {
            console.error('Export error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to export analytics report'
            });
        }
    }
};

module.exports = exportController;
