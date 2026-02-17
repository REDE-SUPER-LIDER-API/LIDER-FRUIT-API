const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const arquivoPedidos = path.join(__dirname, 'Pedidos.json');
let clientesConectados = [];

function lerPedidos() {
    if (!fs.existsSync(arquivoPedidos)) return [];
    try {
        const conteudo = fs.readFileSync(arquivoPedidos, 'utf8');
        return conteudo.trim() !== '' ? JSON.parse(conteudo) : [];
    } catch (erro) {
        console.error('Erro ao ler o arquivo de pedidos:', erro);
        return [];
    }
}

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

app.post('/api/pedidos', (req, res) => {
    const pedido = req.body;
    
    console.log('--- NOVO PEDIDO RECEBIDO ---');
    console.log(`Empresa: ${pedido.empresa}`);
    console.log(`Data: ${pedido.data}`);
    console.log(`Total de Volumes: ${pedido.totalVolumes}`);
    console.log('----------------------------\n');

    let pedidosSalvos = lerPedidos();

    const pedidoParaSalvar = {
        id: Date.now(),
        recebidoEm: new Date().toISOString(),
        ...pedido
    };

    pedidosSalvos.push(pedidoParaSalvar);
    fs.writeFileSync(arquivoPedidos, JSON.stringify(pedidosSalvos, null, 4), 'utf8');
    
    clientesConectados.forEach(cliente => {
        cliente.write(`event: novoPedido\ndata: ${JSON.stringify(pedidoParaSalvar)}\n\n`);
    });

    res.status(200).json({ success: true, message: 'Pedido recebido e armazenado com sucesso!' });
});

app.get('/api/pedidos', (req, res) => {
    res.status(200).json(lerPedidos());
});

app.delete('/api/pedidos/:id', (req, res) => {
    const idParaExcluir = parseInt(req.params.id);
    let pedidos = lerPedidos();
    const index = pedidos.findIndex(p => p.id === idParaExcluir);

    if (index !== -1) {
        pedidos.splice(index, 1);
        fs.writeFileSync(arquivoPedidos, JSON.stringify(pedidos, null, 4), 'utf8');
        
        clientesConectados.forEach(cliente => {
            cliente.write(`event: pedidoExcluido\ndata: ${idParaExcluir}\n\n`);
        });

        console.log(`--- PEDIDO EXCLUÍDO (ID: ${idParaExcluir}) ---\n`);
        res.status(200).json({ success: true, message: 'Pedido excluído com sucesso!' });
    } else {
        res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});