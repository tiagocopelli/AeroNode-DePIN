import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Activity, Server, ShieldCheck, MapPin, Radio, WifiOff, Globe, Wallet, Coins, ExternalLink } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './App.css'; 

const CONTRACT_ADDRESS = "0xD3C2641088b9d677ae8Daa90BaA23206440B7d1E"; // Contrato
const RPC_URL = "https://sepolia.drpc.org";
const EXPLORER_URL = `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`;

// ABI V3 com chamada nativa estável do array público
const CONTRACT_ABI = [
  "function totalLeituras() public view returns (uint256)",
  "function historico(uint256) public view returns (uint256 timestamp, string nomeNode, int256 temperatura, uint256 umidade, uint256 co2, uint256 aqi, string gps)",
  "function infosDosNos(string) public view returns (address owner, uint256 saldoRecompensa, uint256 ultimoTimestamp)",
  "function sacarRecompensas(string _nomeNode) public"
];

// Controlador do Mapa Global (Mantém a câmera enquadrando todos os nós)
function MapBounds({ nodes }) {
  const map = useMap();
  useEffect(() => {
    if (nodes.length > 0) {
      const validNodes = nodes.filter(n => !isNaN(n.lat) && !isNaN(n.lng));
      if (validNodes.length > 0) {
        const bounds = L.latLngBounds(validNodes.map(n => [n.lat, n.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      }
    }
  }, [nodes, map]);
  return null;
}

const getMarkerIcon = (isOffline, aqi) => {
  const color = isOffline ? '#9ca3af' : (aqi <= 100 ? '#10b981' : '#ef4444');
  return L.divIcon({
    className: 'custom-node-marker',
    html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 10px ${color}; opacity: ${isOffline ? 0.5 : 1};"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8]
  });
};

function App() {
  const [historicoBruto, setHistoricoBruto] = useState([]);
  const [nossAtivos, setNossAtivos] = useState({}); 
  const [selectedNodeId, setSelectedNodeId] = useState(""); 
  const [userWallet, setUserWallet] = useState(""); 
  const [saldoNodeInfos, setSaldoNodeInfos] = useState({}); 

  const conectarCarteira = async () => {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      setUserWallet(await signer.getAddress());
    } else {
      alert("Instale a MetaMask para sacar recompensas!");
    }
  };

  const sacarTokens = async (nomeNode) => {
    if (!window.ethereum) return alert("Conecte a MetaMask!");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      const tx = await contract.sacarRecompensas(nomeNode);
      alert(`Transação de saque enviada! Aguarde a mineração. Hash: ${tx.hash}`);
      await tx.wait();
      alert("Saque concluído com sucesso!");
    } catch (error) {
      console.error(error);
      alert("Erro ao sacar. Verifique se você é o dono deste nó e se há saldo disponível.");
    }
  };

  const fetchBlockchainData = async () => {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      const total = await contract.totalLeituras();
      const totalNum = Number(total);
      
      const listaHistorico = [];
      const mapaNos = {}; 

      const limite = totalNum > 150 ? totalNum - 150 : 0;
      
      for (let i = limite; i < totalNum; i++) {
        const dado = await contract.historico(i);
        
        const rawTimestamp = Number(dado[0]) * 1000;
        const nomeNode = dado[1];
        const gpsString = dado[6];

        let lat = -27.1474; let lng = -48.5161;
        if (gpsString && gpsString !== "Sem Sinal") {
          const partes = gpsString.includes(":") ? gpsString.split(":") : gpsString.split(",");
          if(partes.length === 2) {
            lat = parseFloat(partes[0].trim().replace(',', '.'));
            lng = parseFloat(partes[1].trim().replace(',', '.'));
          }
        }

        const payloadItem = {
          id: i,
          rawTimestamp, 
          timestamp: new Date(rawTimestamp).toLocaleString('pt-BR'),
          node: nomeNode,
          temp: Number(dado[2]),
          umid: Number(dado[3]),
          co2: Number(dado[4]),
          aqi: Number(dado[5]),
          gpsStr: gpsString,
          lat, lng
        };

        listaHistorico.unshift(payloadItem);
        mapaNos[nomeNode] = payloadItem;
      }

      setHistoricoBruto(listaHistorico);
      setNossAtivos(mapaNos);
      
      console.log("Nós ativos enviados para o Mapa:", Object.values(mapaNos));

      if (Object.keys(mapaNos).length > 0 && !selectedNodeId) setSelectedNodeId(Object.keys(mapaNos)[0]);

      const infosFinanceiras = {};
      for (const nome of Object.keys(mapaNos)) {
        const info = await contract.infosDosNos(nome);
        infosFinanceiras[nome] = {
            owner: info[0],
            saldo: ethers.formatEther(info[1]) 
        };
      }
      setSaldoNodeInfos(infosFinanceiras);

    } catch (error) {
      console.error("Erro na busca DePIN:", error);
    }
  };

  useEffect(() => {
    fetchBlockchainData();
    const interval = setInterval(fetchBlockchainData, 30000);
    return () => clearInterval(interval);
  }, [selectedNodeId]);

  const nodeInspecionado = nossAtivos[selectedNodeId] || null;
  const saldoInspecionado = saldoNodeInfos[selectedNodeId] || { saldo: "0.0", owner: "Carregando..." };
  const isSelectedOffline = nodeInspecionado && (Date.now() - nodeInspecionado.rawTimestamp > 10 * 60 * 1000);
  const listaNosGlobal = Object.values(nossAtivos);

  return (
    <div style={{ padding: '2rem', maxWidth: '1440px', margin: '0 auto', minHeight: '100vh' }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1.5rem 2rem', background: '#111827', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', border: '1px solid #1f2937' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#f9fafb', margin: '0 0 5px 0', fontSize: '1.8rem' }}>
            <Activity size={32} color="#10b981" /> AeroNode DePIN Engine
          </h1>
          <p style={{ color: '#9ca3af', margin: '0', fontSize: '0.95rem' }}>Monitoramento e Recompensas Web3</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={conectarWallet => conectarCarteira()} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: userWallet ? '#10b981' : '#3b82f6', color: '#fff', padding: '10px 18px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700', border: 'none', cursor: 'pointer' }}>
            <Wallet size={18} /> {userWallet ? `${userWallet.substring(0, 6)}...${userWallet.substring(38)}` : "Conectar MetaMask"}
            </button>
            <a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1f2937', color: '#d1d5db', padding: '10px 18px', borderRadius: '12px', fontSize: '0.85rem', textDecoration: 'none', fontWeight: '600', border: '1px solid #374151' }}>
            <ShieldCheck size={18} color="#10b981" /> Ledger
            </a>
        </div>
      </header>

      {/* MAPA GLOBAL DA REDE (Macro - Mantém a visão de todos os nós) */}
      <div style={{ background: '#111827', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: '1px solid #1f2937', marginBottom: '1.5rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '0', marginBottom: '1rem', fontSize: '1.2rem', color: '#f9fafb' }}>
          <Globe size={22} color="#3b82f6" /> Cobertura Global da Rede
        </h2>
        <div style={{ width: '100%', height: '400px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #374151', zIndex: 0, position: 'relative' }}>
          {listaNosGlobal.length > 0 ? (
            <MapContainer center={[listaNosGlobal[0].lat, listaNosGlobal[0].lng]} zoom={10} style={{ height: '400px', width: '100%', zIndex: 0 }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; OSM &copy; CARTO' />
              <MapBounds nodes={listaNosGlobal} />
              {listaNosGlobal.map((no) => (
                <Marker key={no.node} position={[no.lat, no.lng]} icon={getMarkerIcon((Date.now() - no.rawTimestamp) > (10 * 60 * 1000), no.aqi)}>
                  <Popup>
                    <div style={{ color: '#111827', fontWeight: 'bold' }}>{no.node}</div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>AQI: {no.aqi} | CO2: {no.co2}</div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          ) : (<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#9ca3af' }}>Sincronizando infraestrutura com a blockchain...</div>)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* COLUNA 1: NÓS CONECTADOS */}
        <div style={{ background: '#111827', padding: '1.2rem', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: '1px solid #1f2937' }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#9ca3af', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Radio size={16} color="#3b82f6" /> NÓS ({Object.keys(nossAtivos).length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.keys(nossAtivos).map((nodeName) => {
              const info = nossAtivos[nodeName];
              const isSelected = nodeName === selectedNodeId;
              const isOffline = (Date.now() - info.rawTimestamp) > (10 * 60 * 1000);

              return (
                <button key={nodeName} onClick={() => setSelectedNodeId(nodeName)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: isSelected ? '2px solid #3b82f6' : '1px solid #374151', background: isSelected ? '#1e3a8a' : '#1f2937', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s', opacity: isOffline && !isSelected ? 0.6 : 1 }}>
                  <div style={{ fontWeight: '700', color: isOffline ? '#9ca3af' : '#f9fafb', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {nodeName} {isOffline && <WifiOff size={14} color="#ef4444" />}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>AQI: {info.aqi}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* COLUNA 2: DADOS AMBIENTAIS E HISTÓRICO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Cartões de Leitura */}
          {nodeInspecionado && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', opacity: isSelectedOffline ? 0.5 : 1 }}>
              <div style={{ background: '#111827', padding: '1.2rem', borderRadius: '14px', border: '1px solid #1f2937' }}>
                <div style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: '600' }}>🌡️ TEMPERATURA</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f9fafb' }}>{nodeInspecionado.temp}°C</div>
              </div>
              <div style={{ background: '#111827', padding: '1.2rem', borderRadius: '14px', border: '1px solid #1f2937' }}>
                <div style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: '600' }}>💧 UMIDADE</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f9fafb' }}>{nodeInspecionado.umid}%</div>
              </div>
              <div style={{ background: '#111827', padding: '1.2rem', borderRadius: '14px', border: '1px solid #1f2937' }}>
                <div style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: '600' }}>☁️ DIÓXIDO DE CARBONO</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f9fafb' }}>{nodeInspecionado.co2} ppm</div>
              </div>
              <div style={{ background: '#111827', padding: '1.2rem', borderRadius: '14px', border: '1px solid #1f2937', borderRight: `4px solid ${nodeInspecionado.aqi <= 100 ? '#10b981' : '#ef4444'}` }}>
                <div style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: '600' }}>😷 ÍNDICE DE QUALIDADE (AQI)</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f9fafb' }}>{nodeInspecionado.aqi}</div>
              </div>
            </div>
          )}

          {/* Sequência Linear de Blocos Gravados (Últimos 30) */}
          <div style={{ background: '#111827', borderRadius: '16px', padding: '1.2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: '1px solid #1f2937' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#f9fafb', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={18} color="#9ca3af" /> Sequência Linear de Blocos Gravados
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#1f2937', color: '#d1d5db', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', borderRadius: '6px 0 0 6px' }}>Timestamp</th>
                    <th style={{ padding: '10px 12px' }}>Origem</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Métricas Combinadas</th>
                    <th style={{ padding: '10px 12px', borderRadius: '0 6px 6px 0', textAlign: 'right' }}>Validação</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoBruto.slice(0, 30).map((leitura) => (
                    <tr key={leitura.id} style={{ borderBottom: '1px solid #1f2937' }}>
                      <td style={{ padding: '12px', color: '#f3f4f6', fontWeight: '500' }}>{leitura.timestamp.split(' ')[1]}</td>
                      <td style={{ padding: '12px', fontWeight: '700', color: '#3b82f6' }}>{leitura.node}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#d1d5db' }}>
                        T:{leitura.temp}°C | U:{leitura.umid}% | CO2:{leitura.co2} | AQI:{leitura.aqi}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <a 
                          href={EXPLORER_URL} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          style={{ color: '#10b981', fontWeight: '700', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: 'transparent', borderRadius: '6px', border: '1px solid #10b981', transition: 'all 0.2s' }}
                        >
                          Link <ExternalLink size={14} />
                        </a>
                      </td>
                    </tr>
                  ))}
                  {historicoBruto.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
                        Nenhum bloco registrado ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* COLUNA 3: TESOURARIA DO NÓ (Com Mini Mapa e Botão de Saque Integrados) */}
        <div style={{ background: '#111827', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: '1px solid #1f2937', position: 'sticky', top: '2rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '0', marginBottom: '1.2rem', fontSize: '1.1rem', color: '#f9fafb' }}>
            <Coins size={20} color="#eab308" /> Tesouraria do Nó
          </h2>
          
          <div style={{ background: '#0b0f19', padding: '1rem', borderRadius: '12px', border: '1px solid #1f2937', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: '600' }}>SALDO ACUMULADO A MINERAR</div>
            <div style={{ fontSize: '2rem', color: '#eab308', fontWeight: '800', marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              {saldoInspecionado.saldo} <span style={{ fontSize: '1rem', color: '#9ca3af' }}>$AERO</span>
            </div>
            
            {/* 🗺️ MINI MAPA: Focado localmente no Nó Selecionado */}
            {nodeInspecionado ? (
              <div style={{ width: '100%', height: '160px', borderRadius: '8px', overflow: 'hidden', marginTop: '15px', border: '1px solid #374151', position: 'relative', zIndex: 0 }}>
                <MapContainer key={`mini-${nodeInspecionado.node}-${nodeInspecionado.lat}`} center={[nodeInspecionado.lat, nodeInspecionado.lng]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                  <Marker position={[nodeInspecionado.lat, nodeInspecionado.lng]} icon={getMarkerIcon(isSelectedOffline, nodeInspecionado.aqi)} />
                </MapContainer>
              </div>
            ) : (
              <div style={{ height: '160px', marginTop: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1f2937', borderRadius: '8px', color: '#9ca3af', fontSize: '0.8rem' }}>
                Sincronizando coordenadas...
              </div>
            )}
            
            <button onClick={() => sacarTokens(selectedNodeId)} style={{ marginTop: '15px', width: '100%', padding: '12px', background: '#eab308', color: '#422006', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s' }}>
              Sacar Recompensas
            </button>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#64748b', wordBreak: 'break-all', marginBottom: '10px' }}>
            <strong>Dono Registrado:</strong><br/> {saldoInspecionado.owner}
          </div>

          <div style={{ fontSize: '0.75rem', color: '#9ca3af', wordBreak: 'break-all', paddingTop: '10px', borderTop: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#3b82f6', fontWeight: '700' }}>
              <MapPin size={14} /> COORDENADAS DO HARDWARE
            </span>
            <span style={{ color: '#f3f4f6', fontFamily: 'monospace' }}>
              {nodeInspecionado ? nodeInspecionado.gpsStr : "Carregando..."}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;