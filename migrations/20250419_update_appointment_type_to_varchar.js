'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('appointments', 'appointment_type', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'first_visit'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('appointments', 'appointment_type', {
      type: Sequelize.ENUM('regular', 'follow_up', 'emergency'),
      allowNull: false,
      defaultValue: 'regular'
    });
  }
};
