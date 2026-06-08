// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Importamos os padrões de segurança da OpenZeppelin diretamente do GitHub
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AeroToken is ERC20, Ownable {
    
    // Variável para guardar o endereço do seu contrato DePIN (AeroNodeV3)
    address public depinContract;

    // Construtor: Define o Nome e a Sigla da sua moeda
    // "Ownable(msg.sender)" define que você (quem publicou) é o dono inicial
    constructor() ERC20("AeroNode Token", "AERO") Ownable(msg.sender) {
        
        // Opcional: Fabrica ("Minta") 1 Milhão de tokens iniciais para a sua carteira
        // O "decimals()" padrão é 18 (igual ao Bitcoin e Ethereum)
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    // Passo 1 de Segurança: Você avisa para a moeda quem é o Contrato DePIN
    function setDePINContract(address _depinContract) external onlyOwner {
        depinContract = _depinContract;
    }

    // Passo 2 de Segurança: A função que o seu AeroNodeV3 vai chamar para pagar os nós
    function mintReward(address to, uint256 amount) external {
        // Trava: Ninguém pode fabricar dinheiro do nada, a não ser o próprio contrato DePIN
        require(msg.sender == depinContract, "Acesso Negado: Apenas o Engine DePIN pode cunhar recompensas");
        _mint(to, amount);
    }
}