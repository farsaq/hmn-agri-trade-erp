import { Warehouse } from '../models/enterprise.js';
import { StockReconciliation, StockRequest } from '../models/operations.js';
import { hasPermission } from './auth.js';

const actionPermission = {
  view: 'inventory.view',
  create: 'inventory.create',
  update: 'inventory.update',
  delete: 'inventory.delete',
};
const isGlobalUser = (user) => user?.role === 'admin' || hasPermission(user, 'inventory.all');
export function canAccessWarehouse(user, warehouse, action = 'view') {
  if (isGlobalUser(user)) return true;
  const assignment = (warehouse?.assignedUsers || []).find((x) => String(x.user?._id || x.user) === String(user?._id));
  if (!assignment) return false;
  const permissions = assignment.permissions || [];
  const required = actionPermission[action] || action;
  return (
    permissions.length === 0 ||
    permissions.includes('*') ||
    permissions.includes(action) ||
    permissions.includes(required)
  );
}
export const requireWarehouseAccess =
  (action = 'view') =>
  async (req, res, next) => {
    try {
      if (isGlobalUser(req.user)) return next();
      const id = req.params.id || req.body.warehouse || req.body.fromWarehouse || req.query.warehouse;
      if (!id)
        return res.status(422).json({
          success: false,
          message: 'Warehouse is required',
          error: { code: 'WAREHOUSE_REQUIRED' },
          requestId: req.requestId,
        });
      const warehouse = await Warehouse.findOne({ _id: id, isDeleted: false }).select('assignedUsers');
      if (!warehouse)
        return res.status(404).json({
          success: false,
          message: 'Warehouse not found',
          error: { code: 'WAREHOUSE_NOT_FOUND' },
          requestId: req.requestId,
        });
      if (!canAccessWarehouse(req.user, warehouse, action))
        return res.status(403).json({
          success: false,
          message: 'Warehouse access denied',
          error: { code: 'WAREHOUSE_ACCESS_DENIED' },
          requestId: req.requestId,
        });
      req.warehouseAccess = warehouse;
      next();
    } catch (error) {
      next(error);
    }
  };
export { isGlobalUser };

export const attachWarehouseScope = async (req, res, next) => {
  try {
    if (isGlobalUser(req.user)) {
      req.allowedWarehouseIds = null;
      return next();
    }
    const rows = await Warehouse.find({ isDeleted: false, 'assignedUsers.user': req.user._id }).select('_id');
    req.allowedWarehouseIds = rows.map((x) => x._id);
    next();
  } catch (error) {
    next(error);
  }
};
export const requireWarehouseBodyAccess =
  (fields, action = 'view') =>
  async (req, res, next) => {
    try {
      if (isGlobalUser(req.user)) return next();
      for (const field of fields) {
        const id = req.body?.[field];
        if (!id) continue;
        const warehouse = await Warehouse.findOne({ _id: id, isDeleted: false }).select('assignedUsers');
        if (!warehouse || !canAccessWarehouse(req.user, warehouse, action))
          return res.status(403).json({
            success: false,
            message: `Warehouse access denied: ${field}`,
            error: { code: 'WAREHOUSE_ACCESS_DENIED' },
            requestId: req.requestId,
          });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
export const requireWarehouseResourceAccess =
  (resource, action = 'view') =>
  async (req, res, next) => {
    try {
      if (isGlobalUser(req.user)) return next();
      const Model = resource === 'reconciliation' ? StockReconciliation : StockRequest;
      const record = await Model.findById(req.params.id).select('warehouse');
      if (!record)
        return res.status(404).json({
          success: false,
          message: 'Inventory record not found',
          error: { code: 'INVENTORY_RECORD_NOT_FOUND' },
          requestId: req.requestId,
        });
      const warehouse = await Warehouse.findOne({ _id: record.warehouse, isDeleted: false }).select('assignedUsers');
      if (!warehouse || !canAccessWarehouse(req.user, warehouse, action))
        return res.status(403).json({
          success: false,
          message: 'Warehouse access denied',
          error: { code: 'WAREHOUSE_ACCESS_DENIED' },
          requestId: req.requestId,
        });
      next();
    } catch (error) {
      next(error);
    }
  };
