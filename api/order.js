// BUG-02: Create Razorpay Order server-side before payment
// Client fetches order_id, opens modal, sends order_id+payment_id+signature to /api/pay for verification

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { plan, uid } = req.body;
    if (!plan || !uid) return res.status(400).json({ error: 'Missing plan or uid' });

    const amounts = { booster: 19900, rise: 49900, wise: 199900 };
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
