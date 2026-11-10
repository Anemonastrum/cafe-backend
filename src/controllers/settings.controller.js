import * as settings from '../services/settings.service.js';
import { toWire } from '../utils/serialize.js';
import { requestContext } from './auth.controller.js';
export function settingsController(db, config) {
  return {
    safe: async (req,res) => res.json({ data: toWire(await settings.getSettings(db,req.actor,{safe:true})) }),
    get: async (req,res) => res.json({ data: toWire(await settings.getSettings(db,req.actor,{safe:false})) }),
    update: async (req,res) => res.json({ data: toWire(await settings.updateSettings(db,req.actor,req.input,requestContext(req))) }),
    logo: async (req,res) => res.json({ data: toWire(await settings.replaceLogo(db,req.actor,req.file,requestContext(req),config.storageDir)) }),
    remove: async (req,res) => { await settings.replaceLogo(db,req.actor,null,requestContext(req),config.storageDir); res.status(204).end(); },
  };
}
