import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { payment_id, plan, uid, email } = req.body;

    if (!payment_id || !plan || !uid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Calculate expiry
    const now = new Date();
    let expiry;
    if (plan === 'booster') {
      expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    } else if (plan === 'rise') {
      expiry = new Date(now.setMonth(now.getMonth() + 1)); // 1 month
    } else if (plan === 'wise') {
      expiry = new Date(now.setFullYear(now.getFullYear() + 1)); // 1 year
    }

    // Update Firestore subscription
    await db.collection('users').doc(uid).collection('profile').doc('data').set({
      subscription_astro: {
        plan,
        status: 'active',
        payment_id,
        expiry: expiry.toISOString(),
        activated_at: new Date().toISOString()
      }
    }, { merge: true });

    // Save invoice
    const amounts = { 'booster': 199, 'rise': 499, 'wise': 1999 };
    const baseAmounts = { 'booster': 168.64, 'rise': 422.88, 'wise': 1694.07 };
    const gst = { 'booster': 30.36, 'rise': 76.12, 'wise': 304.93 };
    const planNames = { 'booster': 'Booster 24hr', 'rise': 'Rise Monthly', 'wise': 'Wise Annual' };

    const invoiceNo = `BB-${new Date().getFullYear()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

    await db.collection('users').doc(uid).collection('invoices').add({
      invoice_no: invoiceNo,
      payment_id,
      plan,
      plan_name: planNames[plan],
      email,
      total: amounts[plan],
      base_amount: baseAmounts[plan],
      cgst: gst[plan] / 2,
      sgst: gst[plan] / 2,
      date: new Date().toISOString(),
      status: 'paid'
    });

    // Check for referral reward
    const userDoc = await db.collection('users').doc(uid).collection('profile').doc('data').get();
    if (userDoc.exists) {
      const referredBy = userDoc.data().referred_by;
      if (referredBy) {
        // Find referrer by ref_code and give coins
        const referrers = await db.collectionGroup('profile').where('ref_code', '==', referredBy).get();
        for (const refDoc of referrers.docs) {
          const refUid = refDoc.ref.parent.parent.id;
          await db.collection('users').doc(refUid).collection('profile').doc('data').update({
            coins_balance: (refDoc.data().coins_balance || 0) + 199,
            coins_lifetime_earned: (refDoc.data().coins_lifetime_earned || 0) + 199
          });
          await db.collection('users').doc(refUid).collection('coins_ledger').add({
            type: 'earned', amount: 199, reason: 'referral',
            referred_uid: uid,
            expiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date()
          });
        }
      }
    }

    return res.status(200).json({ success: true, invoice_no: invoiceNo });

  } catch (e) {
    console.error('Payment handler error:', e);
    return res.status(500).json({ error: e.message });
  }
}
