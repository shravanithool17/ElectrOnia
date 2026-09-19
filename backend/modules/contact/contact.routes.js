// modules/contact/contact.routes.js — Support message submission & retrieval
import { Router } from 'express';
import { z } from 'zod';
import Contact from '../../model/contact.model.js';
import { validate } from '../../middleware/validate.js';
import { logger } from '../../config/logger.js';

const router = Router();

const contactSchema = {
  body: z.object({
    name: z.string().trim().min(2, 'Name is required').max(120),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    subject: z.string().trim().min(2, 'Subject is required').max(200),
    message: z.string().trim().min(5, 'Message must be at least 5 characters').max(5000),
  }),
};

// Public: Submit a customer support inquiry
router.post('/', validate(contactSchema), async (req, res) => {
  const { name, email, subject, message } = req.body;

  const inquiry = await Contact.create({
    name,
    email,
    subject,
    message,
  });

  logger.info({ id: inquiry._id, email, subject }, 'Support inquiry received');

  res.status(201).json({
    success: true,
    message: 'Your inquiry has been received. Our support team will get back to you shortly.',
    data: {
      id: inquiry._id,
      createdAt: inquiry.createdAt,
    },
  });
});

// Admin/Internal: Retrieve recent inquiries
router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Contact.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Contact.countDocuments(),
  ]);

  res.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

export const contactRoutes = router;
