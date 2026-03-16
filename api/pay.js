// BUG-02: Verify Razorpay payment signature server-side before writing subscription
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createHmac } from 'crypto';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = getFirestore();
const adminAuth = getAuth();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { order_id, payment_id, signature, plan, uid, idToken } = req.body;

    // Verify Firebase auth token
    if (!idToken) return res.status(401).json({ error: 'No auth token' });
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded.uid !== uid) return res.status(403).json({ error: 'UID mismatch' });

    // BUG-02: Verify Razorpay signature using HMAC-SHA256
    if (!order_id || !payment_id || !signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const expectedSignature = createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(`${order_id}|${payment_id}`)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error('Signature mismatch — possible payment fraud attempt', { uid, plan });
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Signature verified — safe to write subscription
    const planDurations = {
      booster: 24 * 60 * 60 * 1000,          // 24 hours
      rise:    30 * 24 * 60 * 60 * 1000,      // 30 days
      wise:    365 * 24 * 60 * 60 * 1000      // 365 days
    };

    const duration = planDurations[plan];
    if (!duration) return res.status(400).json({ error: 'Invalid plan' });

    const expiry = new Date(Date.now() + duration).toISOString();

    await db.collection('users').doc(uid).collection('profile').doc('data').set({
      subscription_astro: {
        plan,
        status: 'active',
        expiry,
        payment_id,
        order_id,
        purchased_at: new Date().toISOString()
      }
    }, { merge: true });

    return res.status(200).json({ success: true, expiry });

  } catch (e) {
    console.error('Pay API error:', e);
    return res.status(500).json({ error: e.message });
  }
}
