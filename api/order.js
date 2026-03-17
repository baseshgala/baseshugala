// BUG-02: Create Razorpay Order server-side before payment
// FIX-C3: Added idToken verification — prevents unauthorized order creation

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getFirebaseAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getAuth();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { plan, uid, idToken } = req.body;
    if (!plan || !uid) return res.status(400).json({ error: 'Missing plan or uid' });

    // FIX-C3: Verify Firebase idToken — uid must match token
    if (!idToken) return res.status(401).json({ error: 'Missing auth token' });
    try {
      const adminAuth = getFirebaseAdmin();
      const decoded = await adminAuth.verifyIdToken(idToken);
      if (decoded.uid !== uid) return res.status(403).json({ error: 'Token mismatch' });
    } catch (authErr) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    const amounts = { booster: 9900, rise: 49900, wise: 199900 }; // SA14: Booster ₹99
    const amount = amounts[plan];
    if (!amount) return res.status(400).json({ error: 'Invalid plan' });

    // Create order via Razorpay API
    const credentials = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_SECRET}`
    ).toString('base64');

    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: `bg_${uid.slice(-8)}_${plan.slice(0,3)}_${Date.now().toString().slice(-8)}`,
        notes: { plan, uid }
      })
    });

    if (!orderRes.ok) {
      const err = await orderRes.text();
      return res.status(500).json({ error: 'Failed to create order: ' + err });
    }

    const order = await orderRes.json();
    return res.status(200).json({ order_id: order.id, amount: order.amount, currency: order.currency });

  } catch (e) {
    console.error('Order creation error:', e);
    return res.status(500).json({ error: e.message });
  }
}
