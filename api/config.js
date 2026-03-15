export const config = { runtime: 'edge' };

export default async function handler(req) {
  return new Response(JSON.stringify({
    razorpay_key: process.env.RAZORPAY_KEY_ID || ''
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 's-maxage=3600'
    }
  });
}
