const ACCESS_TOKEN = '16207ce8d8754eeaaccdc81afc601aad'; // นำโทเค็นของคุณมาวางตรงนี้

// ตัวอย่างการแนบ Token ไปกับ Header เวลาส่งข้อมูลออร์เดอร์
const response = await fetch('https://api.loyverse.com/v1.order', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ACCESS_TOKEN}` // วาง Token ตรงส่วนนี้
  },
  body: JSON.stringify(orderData)
});