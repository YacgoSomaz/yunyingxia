"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const style_engine_1 = require("../services/style-engine");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
router.get('/presets', async (req, res) => {
    try {
        const { module } = req.query;
        if (!module)
            return res.status(400).json(fail('module query required'));
        res.json(ok(await style_engine_1.styleEngine.listPresets(module)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/presets/:id', async (req, res) => {
    try {
        res.json(ok(await style_engine_1.styleEngine.getPreset(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/presets', async (req, res) => {
    try {
        res.json(ok(await style_engine_1.styleEngine.createPreset(req.body)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.patch('/presets/:id', async (req, res) => {
    try {
        res.json(ok(await style_engine_1.styleEngine.updatePreset(Number(req.params.id), req.body)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/presets/:id', async (req, res) => {
    try {
        await style_engine_1.styleEngine.deletePreset(Number(req.params.id));
        res.json(ok({ removed: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=style.js.map