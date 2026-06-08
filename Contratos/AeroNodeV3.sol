// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Importamos a trava de segurança de "Dono"
import "@openzeppelin/contracts/access/Ownable.sol";

// Interface para conversar com o seu AeroToken
interface IAeroToken {
    function mintReward(address to, uint256 amount) external;
}

contract AeroNodeV3 is Ownable {
    address public tokenAddress;
    uint256 public constant RECOMPENSA_POR_BLOCO = 1 * 10**18; // 1 Token por envio válido

    struct NodeInfo {
        address owner;
        uint256 saldoRecompensa;
        uint256 ultimoTimestamp;
    }

    struct Leitura {
        uint256 timestamp;
        string nomeNode;
        int256 temperatura;
        uint256 umidade;
        uint256 co2;
        uint256 aqi;
        string gps;
    }

    mapping(string => NodeInfo) public infosDosNos;
    Leitura[] public historico;

    // Define que quem publicar o contrato é o dono inicial
    constructor() Ownable(msg.sender) {}

    // ⬅️ AQUI ESTÁ A FUNÇÃO CORRIGIDA! Agora com 'onlyOwner'
    function setTokenAddress(address _token) external onlyOwner {
        tokenAddress = _token;
    }

    function registrarLeitura(
        string memory _nomeNode,
        address _ownerWallet,
        int256 _temperatura,
        uint256 _umidade,
        uint256 _co2,
        uint256 _aqi,
        string memory _gps
    ) public {
        
        if (infosDosNos[_nomeNode].owner == address(0)) {
            infosDosNos[_nomeNode].owner = _ownerWallet;
        }

        if (block.timestamp - infosDosNos[_nomeNode].ultimoTimestamp >= 45) {
            infosDosNos[_nomeNode].saldoRecompensa += RECOMPENSA_POR_BLOCO;
            infosDosNos[_nomeNode].ultimoTimestamp = block.timestamp;
        }

        historico.push(Leitura(block.timestamp, _nomeNode, _temperatura, _umidade, _co2, _aqi, _gps));
    }

    function totalLeituras() public view returns (uint256) { return historico.length; }

    function historicoLeituras(uint256 index) public view returns (Leitura memory) {
        return historico[index];
    }

    function sacarRecompensas(string memory _nomeNode) public {
        NodeInfo storage no = infosDosNos[_nomeNode];
        require(msg.sender == no.owner, "Acesso Negado: Apenas o dono pode sacar!");
        require(no.saldoRecompensa > 0, "Saldo zerado!");

        uint256 valorSaque = no.saldoRecompensa;
        no.saldoRecompensa = 0; 
        
        IAeroToken(tokenAddress).mintReward(no.owner, valorSaque);
    }
}