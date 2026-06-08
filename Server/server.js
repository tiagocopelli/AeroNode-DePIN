const express = require('express');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
app.use(express.json());

const RPC_URL = "https://sepolia.drpc.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY; 
const CONTRACT_ADDRESS = "0xD3C2641088b9d677ae8Daa90BaA23206440B7d1E"; // Contrato

// ABI Atualizada com o parâmetro _ownerWallet
const CONTRACT_ABI = [
  "function registrarLeitura(string _nomeNode, address _ownerWallet, int256 _temperatura, uint256 _umidade, uint256 _co2, uint256 _aqi, string _gps) public"
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

app.post('/registrar-dados', async (req, res) => {
    try {
        // Extrai a carteira do dono junto com os dados ambientais
        const { nomeNode, carteiraDono, temperatura, umidade, co2, aqi, gps } = req.body;
        
        console.log(`📡 Recebido de ${nomeNode} (Dono: ${carteiraDono}). Gravando na Sepolia...`);

        // Envia para a Blockchain (agora com a carteira inclusa)
        const tx = await contract.registrarLeitura(nomeNode, carteiraDono, temperatura, umidade, co2, aqi, gps);
        await tx.wait(); // Aguarda minerar

        console.log(`✅ Sucesso! Hash: ${tx.hash}`);
        res.status(200).send({ success: true, hash: tx.hash });
    } catch (error) {
        console.error("❌ Erro ao gravar na Blockchain:", error);
        res.status(500).send({ error: error.message });
    }
});

app.listen(3000, '0.0.0.0', () => {
    console.log("🚀 Servidor Relayer DePIN rodando na porta 3000!");
});