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
    if (isConnected) {
        return;
    }
    try {
        const db = await mongoose.connect(process.env.MONGODB_URI);
        isConnected = db.connections[0].readyState === 1;
        console.log('MongoDB conectado com sucesso');
    } catch (error) {
        console.error('Erro ao conectar no MongoDB:', error);
        throw error;
    }
};

// Middleware: Garante que o banco está conectado antes de processar qualquer rota
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
    status: { type: String, default: 'recebido' } // 'recebido' ou 'separacao'
});

const Pedido = mongoose.model('Pedido', pedidoSchema);

let clientesConectados = [];

app.get('/api/pedidos/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    res.write(': connected\n\n');
    
    clientesConectados.push(res);

    req.on('close', () => {
        clientesConectados = clientesConectados.filter(cliente => cliente !== res);
    });
});

app.post('/api/pedidos', async (req, res) => {
    const pedido = req.body;
    
    console.log('--- NOVO PEDIDO RECEBIDO ---');
    console.log(`Empresa: ${pedido.empresa}`);
    console.log(`Data: ${pedido.data}`);
    console.log(`Total de Volumes: ${pedido.totalVolumes}`);
    console.log('----------------------------\n');

    const pedidoParaSalvar = new Pedido({
        id: Date.now(),
        ...pedido
    });

    try {
        await pedidoParaSalvar.save();
        
        clientesConectados.forEach(cliente => {
            cliente.write(`event: novoPedido\ndata: ${JSON.stringify(pedidoParaSalvar)}\n\n`);
        });

        res.status(200).json({ success: true, message: 'Pedido recebido e armazenado com sucesso!' });
    } catch (erro) {
        console.error('Erro ao salvar no MongoDB:', erro);
        res.status(500).json({ success: false, message: 'Erro ao salvar o pedido.' });
    }
});

app.get('/api/pedidos', async (req, res) => {
    try {
        const pedidos = await Pedido.find().sort({ recebidoEm: 1 });
        res.status(200).json(pedidos);
    } catch (erro) {
        console.error('Erro ao ler do MongoDB:', erro);
        res.status(500).json({ success: false, message: 'Erro ao buscar pedidos.' });
    }
});

app.patch('/api/pedidos/status', async (req, res) => {
    const { ids, status } = req.body; // ids: array de IDs, status: novo status
    try {
        await Pedido.updateMany({ id: { $in: ids } }, { status: status });
        
        // Avisa todos os clientes conectados sobre a mudança
        clientesConectados.forEach(cliente => {
            cliente.write(`event: statusAtualizado\ndata: ${JSON.stringify({ ids, status })}\n\n`);
        });

        res.status(200).json({ success: true, message: 'Status atualizado com sucesso!' });
    } catch (erro) {
        console.error('Erro ao atualizar status no MongoDB:', erro);
        res.status(500).json({ success: false, message: 'Erro ao atualizar o status.' });
    }
});

app.delete('/api/pedidos/:id', async (req, res) => {
    const idParaExcluir = parseInt(req.params.id);
    
    try {
        const pedidoExcluido = await Pedido.findOneAndDelete({ id: idParaExcluir });

        if (pedidoExcluido) {
            clientesConectados.forEach(cliente => {
                cliente.write(`event: pedidoExcluido\ndata: ${idParaExcluir}\n\n`);
            });

            console.log(`--- PEDIDO EXCLUÍDO (ID: ${idParaExcluir}) ---\n`);
            res.status(200).json({ success: true, message: 'Pedido excluído com sucesso!' });
        } else {
            res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
        }
    } catch (erro) {
        console.error('Erro ao excluir no MongoDB:', erro);
        res.status(500).json({ success: false, message: 'Erro ao excluir o pedido.' });
    }
});

// Configuração para rodar localmente ou no Vercel
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
}

// Exporta o app para o Vercel Serverless
module.exports = app;