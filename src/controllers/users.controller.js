import * as users from '../services/users.service.js';
import { toWire } from '../utils/serialize.js';
import { requestContext } from './auth.controller.js';
export function usersController(db) {
  return {
    list: async (req, res) => res.json(toWire(await users.listUsers(db, req.actor, req.input))),
    get: async (req, res) => res.json({ data: toWire(await users.getUser(db, req.actor, req.entityId)) }),
    create: async (req, res) => res.status(201).json({ data: toWire(await users.createUser(db, req.actor, req.input, requestContext(req))) }),
    update: async (req, res) => res.json({ data: toWire(await users.updateUser(db, req.actor, { id: req.entityId, patch: req.input }, requestContext(req))) }),
    status: async (req, res) => res.json({ data: toWire(await users.setUserStatus(db, req.actor, { id: req.entityId, ...req.input }, requestContext(req))) }),
    reset: async (req, res) => res.json({ data: toWire(await users.resetUserPassword(db, req.actor, { id: req.entityId, ...req.input }, requestContext(req))) }),
  };
}
