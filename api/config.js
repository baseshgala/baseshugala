// Vercel serverless function — /api/config
// Returns public-safe config keys to the frontend
// All values come from Vercel Environment Variables (never hardcoded)

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store'); // never cache — keys may rotate
  res.status(200).json({
    razorpay_key: process.env.RAZORPAY_KEY_ID || '',
    google_maps_key: process.env.GOOGLE_MAPS_KEY || '',
  });
}
