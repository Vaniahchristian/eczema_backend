const { MySQL } = require('../models');

// GET /api/doctors?search=smith
const searchDoctors = async (req, res) => {
  try {
    const { search } = req.query;
    const where = {
      role: 'doctor',
    };
    if (search) {
      where[MySQL.Sequelize.Op.or] = [
        { first_name: { [MySQL.Sequelize.Op.like]: `%${search}%` } },
        { last_name: { [MySQL.Sequelize.Op.like]: `%${search}%` } },
        { email: { [MySQL.Sequelize.Op.like]: `%${search}%` } }
      ];
    }
    const doctors = await MySQL.User.findAll({
      where,
      attributes: ['id', 'first_name', 'last_name', 'email', 'image_url'],
      limit: 20,
      order: [['first_name', 'ASC']]
    });
    res.json({ success: true, data: doctors });
  } catch (error) {
    console.error('Doctor search error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch doctors' });
  }
};

module.exports = { searchDoctors };
