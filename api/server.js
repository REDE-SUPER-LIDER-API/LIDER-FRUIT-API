const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Carrega as variáveis de ambiente localmente
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const app = express();

app.use(cors());
app.use(express.json());

// Gerenciamento de conexão otimizado para Serverless (Vercel)
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    try {
        const db = await mongoose.connect(process.env.MONGODB_URI);
        isConnected = db.connections[0].readyState === 1;
        console.log('MongoDB conectado com sucesso');
    } catch (error) {
        console.error('Erro ao conectar no MongoDB:', error);
        throw error;
    }
};

// Middleware: Garante conexão com o banco
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: 'Falha na conexão com o banco de dados.' });
    }
});

// Schema e Model do Mongoose
const itemSchema = new mongoose.Schema({
    nome: String,
    quantidade: Number
}, { _id: false });

const pedidoSchema = new mongoose.Schema({
    id: Number,
    empresa: String,
    data: String,
    totalVolumes: Number,
    itens: [itemSchema],
    recebidoEm: { type: Date, default: Date.now },
    status: { type: String, default: 'recebido' } // 'recebido', 'separacao' ou 'finalizado'
});

const Pedido = mongoose.model('Pedido', pedidoSchema);

app.post('/api/pedidos', async (req, res) => {
    const pedidoParaSalvar = new Pedido({
        id: Date.now(),
        ...req.body
    });
    try {
        await pedidoParaSalvar.save();
        res.status(200).json({ success: true, pedido: pedidoParaSalvar });
    } catch (erro) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/pedidos', async (req, res) => {
    try {
        const pedidos = await Pedido.find().sort({ recebidoEm: 1 });
        res.status(200).json(pedidos);
    } catch (erro) {
        res.status(500).json({ success: false });
    }
});

app.patch('/api/pedidos/status', async (req, res) => {
    const { ids, status } = req.body;
    try {
        await Pedido.updateMany({ id: { $in: ids } }, { status: status });
        res.status(200).json({ success: true });
    } catch (erro) {
        res.status(500).json({ success: false });
    }
});

app.delete('/api/pedidos/:id', async (req, res) => {
    try {
        await Pedido.findOneAndDelete({ id: parseInt(req.params.id) });
        res.status(200).json({ success: true });
    } catch (erro) {
        res.status(500).json({ success: false });
    }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
}

module.exports = app;