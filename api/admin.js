import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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

const ADMIN_EMAIL = 'basesh.gala@39solutions.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, idToken, targetUid, hours, note, previousPlan } = req.body;

    // ── Verify caller is admin ──
    if (!idToken) return res.status(401).json({ error: 'No token provided' });
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Not authorized' });

    // ── Grant Pro Max ──
    if (action === 'grant_promax') {
      const h = parseInt(hours) || 72;
      const expiry = new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

      await db.collection('users').doc(targetUid).collection('profile').doc('data').set({
        subscription_astro: {
          plan: 'promax',
          status: 'active',
          expiry,
          previous_plan: previousPlan || 'seeker',
          granted_by: 'admin',
          note: note || '',
          hours: h,
          granted_at: new Date().toISOString()
        }
      }, { merge: true });

      return res.status(200).json({ success: true, expiry });
    }

    // ── Revoke Pro Max ──
    if (action === 'revoke_promax') {
      const revertTo = previousPlan || 'seeker';
      await db.collection('users').doc(targetUid).collection('profile').doc('data').update({
        'subscription_astro.plan': revertTo,
        'subscription_astro.status': 'revoked'
      });
      return res.status(200).json({ success: true });
    }

    // ── Get all users (collectionGroup query) ──
    if (action === 'get_users') {
      const snap = await db.collectionGroup('profile').where('email', '!=', '').get();
      const users = [];
      snap.forEach(doc => {
        users.push({ uid: doc.ref.parent.parent.id, ...doc.data() });
      });
      return res.status(200).json({ users });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (e) {
    console.error('Admin API error:', e);
    return res.status(500).json({ error: e.message });
  }
}
