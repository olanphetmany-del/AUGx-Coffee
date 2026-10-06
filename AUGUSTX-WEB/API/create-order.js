export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const orderData = req.body;
        const loyverseToken = process.env.LOYVERSE_TOKEN;

        if (!loyverseToken) {
            return res.status(500).json({ error: 'Loyverse token not found' });
        }

        const loyversePayload = {
            sold_at: new Date().toISOString(),
            receipt_type: 1,
            line_items: orderData.line_items.map(item => ({
                item_name: item.item_name,
                quantity: item.quantity,
                price: item.price
            })),
            payments: [
                {
                    payment_type_id: "1",
                    amount: orderData.total_money
                }
            ],
            note: orderData.note
        };

        const response = await fetch("https://api.loyverse.com/v1.0/receipts", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${loyverseToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(loyversePayload)
        });

        const result = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: result });
        }

        return res.status(200).json({ success: true, data: result });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}