// 404 for unknown routes, in the standard error shape
exports.notFound = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found', details: [] },
  });
};

// Catches any error thrown in a route and returns JSON
exports.errorHandler = (err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.status ? err.message : 'Something went wrong',
      details: err.details || [],
    },
  });
};
