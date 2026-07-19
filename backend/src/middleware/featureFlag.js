import { isFeatureEnabled } from '../config/runtime.js';

export const requireFeature = (featureName) => (req, res, next) => {
  if (isFeatureEnabled(featureName)) return next();
  return res.status(503).json({
    success: false,
    message: `Feature is disabled: ${featureName}`,
    error: { code: 'FEATURE_DISABLED', feature: featureName },
    requestId: req.requestId,
  });
};
