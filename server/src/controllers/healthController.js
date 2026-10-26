// GET /api/health: confirms the API is up
exports.health = (req, res) => {
  res.status(200).json({ data: { status: 'ok' } });
};
