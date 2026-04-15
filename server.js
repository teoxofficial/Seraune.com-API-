require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
// Resimler büyük veriler olduğu için limitleri artırıyoruz (50MB)
app.use(express.json({ limit: '50mb' })); 
app.use(express.static('public'));

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model } = req.body;
        const selectedModel = model || "claude-sonnet-4-6";

        const response = await fetch("https://ai.seraune.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.SERAUNE_API_KEY}`
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messages
            })
        });

        const data = await response.json();

        if (response.ok) {
            const aiReply = data.choices[0].message.content;
            res.json({ reply: aiReply });
        } else {
            res.status(500).json({ error: "API'den hata döndü", details: data });
        }

    } catch (error) {
        console.error("Sunucu Hatası:", error);
        res.status(500).json({ error: "Sunucuda bir hata oluştu." });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu aktif! http://localhost:${PORT}`);
});