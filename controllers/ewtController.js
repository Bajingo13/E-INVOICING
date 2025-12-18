const EWT = require('../models/ewtModel');

exports.getAllEWT = async (req, res) => {
  try {
    const entries = await EWT.getAll();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createEWT = async (req, res) => {
  try {
    const id = await EWT.create(req.body);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateEWT = async (req, res) => {
  try {
    await EWT.update(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteEWT = async (req, res) => {
  try {
    await EWT.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
