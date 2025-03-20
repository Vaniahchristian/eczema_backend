const { mysqlPool } = require('../../config/database');

class ParentChild {
    static async linkParentToChild(parentId, childId) {
        const connection = await mysqlPool.getConnection();
        try {
            // Verify both users exist and child is under 18
            const [childData] = await connection.query(
                'SELECT date_of_birth FROM users WHERE id = ? AND role = "patient"',
                [childId]
            );

            if (!childData.length) {
                throw new Error('Child account not found');
            }

            const childAge = this.calculateAge(childData[0].date_of_birth);
            if (childAge >= 18) {
                throw new Error('Cannot link parent to an adult patient');
            }

            // Create parent-child relationship
            await connection.query(
                'INSERT INTO parent_child_relations (parent_id, child_id) VALUES (?, ?)',
                [parentId, childId]
            );

            return true;
        } catch (error) {
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getChildrenForParent(parentId) {
        const connection = await mysqlPool.getConnection();
        try {
            const [children] = await connection.query(`
                SELECT u.*, pcr.created_at as linked_date
                FROM users u
                JOIN parent_child_relations pcr ON u.id = pcr.child_id
                WHERE pcr.parent_id = ?
            `, [parentId]);

            return children;
        } finally {
            connection.release();
        }
    }

    static async getParentsForChild(childId) {
        const connection = await mysqlPool.getConnection();
        try {
            const [parents] = await connection.query(`
                SELECT u.*, pcr.created_at as linked_date
                FROM users u
                JOIN parent_child_relations pcr ON u.id = pcr.parent_id
                WHERE pcr.child_id = ?
            `, [childId]);

            return parents;
        } finally {
            connection.release();
        }
    }

    static async unlinkParentFromChild(parentId, childId) {
        const connection = await mysqlPool.getConnection();
        try {
            await connection.query(
                'DELETE FROM parent_child_relations WHERE parent_id = ? AND child_id = ?',
                [parentId, childId]
            );
            return true;
        } finally {
            connection.release();
        }
    }

    static calculateAge(dateOfBirth) {
        const today = new Date();
        const birthDate = new Date(dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        
        return age;
    }
}

module.exports = ParentChild;
